"""HTTP POST routes."""
import base64
import json
import os
import pathlib
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime

from . import config
from . import push_notify
from . import signal_ingest
from . import store

_RELAY_DIR     = pathlib.Path(__file__).parent
_UPLOAD_SCRIPT = _RELAY_DIR / "zg_upload.ts"


def _json_resp(handler, data: dict, status: int = 200):
    body = json.dumps(data).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.cors_headers()
    handler.end_headers()
    handler.wfile.write(body)

def handle_post(handler):
    path = handler.path.split("?")[0]

    if path == "/signal":
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length).decode("utf-8", errors="replace")
        try:
            sig = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            sig = {}
            for part in raw.strip().split():
                if ":" in part:
                    k, v = part.split(":", 1)
                    sig[k] = v
            if not sig:
                sig = {"type": "raw", "data": raw[:200]}

        sig["_ts"] = datetime.now().isoformat()
        sig["_id"] = store.signal_counter_ref[0]
        store.signal_counter_ref[0] += 1

        signal_ingest.ingest_signal(sig)

        handler.send_response(200)
        handler.send_header("Content-Type", "text/plain")
        handler.cors_headers()
        handler.end_headers()
        handler.wfile.write(b"ok")
        return True

    if path == "/config":
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length).decode("utf-8", errors="replace")
        try:
            cfg = json.loads(raw)
            if "couple_id" in cfg:
                config.runtime["couple_id"] = cfg["couple_id"]
                print(f'  {config.G}[config] couple_id set → {config.runtime["couple_id"]}{config.RESET}')
            handler.send_response(200)
            handler.cors_headers()
            handler.end_headers()
            handler.wfile.write(json.dumps({"couple_id": config.runtime["couple_id"]}).encode())
        except Exception as e:
            handler.send_error(400, str(e))
        return True

    if path == "/push-subscribe":
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length).decode("utf-8", errors="replace")
        try:
            body = json.loads(raw)
            name = body.get("name", "").strip().lower()
            sub  = body.get("subscription")
            if not name or not sub:
                handler.send_error(400, "name and subscription required")
                return True
            with store.lock:
                store.push_subscriptions[name] = sub
            subs = push_notify._load_subs()
            subs[name] = sub
            push_notify._SUBS.write_text(__import__('json').dumps(subs, indent=2))
            print(f"  {config.G}[push] registered subscription for {name!r}{config.RESET}")
            handler.send_response(200)
            handler.send_header("Content-Type", "application/json")
            handler.cors_headers()
            handler.end_headers()
            handler.wfile.write(json.dumps({"ok": True, "name": name}).encode())
        except Exception as e:
            handler.send_error(400, str(e))
        return True

    if path == "/notify":
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length).decode("utf-8", errors="replace")
        try:
            body = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            handler.send_error(400, "invalid JSON")
            return True

        target = body.get("target", "all").strip().lower()
        title  = body.get("title", "LoveClaw")[:120]
        text   = body.get("body", body.get("message", ""))[:300]

        sig = {
            "type":   "notify",
            "target": target,
            "title":  title,
            "body":   text,
            "_ts":    datetime.now().isoformat(),
            "_id":    store.signal_counter_ref[0],
        }
        store.signal_counter_ref[0] += 1

        with store.lock:
            store.signals.append(sig)
            subs_to_push = {
                k: v for k, v in store.push_subscriptions.items()
                if target == "all" or k == target
            }
        store.log_to_terminal(sig)
        store.broadcast(sig)

        print(f"  {config.G}[notify] → {target!r}  {title!r}  ({len(subs_to_push)} push sub(s)){config.RESET}")

        push_notify.send_to(target, title, text)

        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler.cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({"ok": True, "target": target, "pushed": len(subs_to_push)}).encode())
        return True

    if path == "/signals/batch":
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length).decode("utf-8", errors="replace")
        try:
            batch = json.loads(raw)
            if not isinstance(batch, list):
                batch = [batch]
            for sig in batch:
                sig["_ts"] = datetime.now().isoformat()
                sig["_id"] = store.signal_counter_ref[0]
                store.signal_counter_ref[0] += 1
                with store.lock:
                    store.signals.append(sig)
                store.log_to_terminal(sig)
                store.broadcast(sig)
            handler.send_response(200)
            handler.cors_headers()
            handler.end_headers()
            handler.wfile.write(f"{len(batch)} signals received".encode())
        except Exception as e:
            handler.send_error(400, str(e))
        return True

    if path == "/api/save-agent-key":
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length).decode("utf-8", errors="replace")
        try:
            body = json.loads(raw)
        except Exception:
            _json_resp(handler, {"error": "Invalid JSON"}, 400)
            return True

        private_key = str(body.get("privateKey", "")).strip()
        if not private_key or len(private_key) < 32:
            _json_resp(handler, {"error": "privateKey required"}, 400)
            return True

        env_file = _EXAMPLE_DIR / ".env.local"
        try:
            # Read existing .env.local if present, preserve other vars
            existing = {}
            if env_file.exists():
                for line in env_file.read_text().splitlines():
                    if "=" in line and not line.startswith("#"):
                        k, _, v = line.partition("=")
                        existing[k.strip()] = v.strip()

            existing["PRIVATE_KEY"] = private_key

            lines = [f"{k}={v}" for k, v in existing.items()]
            env_file.write_text("\n".join(lines) + "\n")
            print(f"  {config.G}[agent-key] wrote PRIVATE_KEY to {env_file}{config.RESET}")
            _json_resp(handler, {"ok": True, "path": str(env_file)})
        except Exception as e:
            _json_resp(handler, {"error": str(e)}, 500)
        return True

    if path == "/api/store-diary":
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length).decode("utf-8", errors="replace")
        try:
            body = json.loads(raw)
        except Exception:
            _json_resp(handler, {"error": "Invalid JSON"}, 400)
            return True

        private_key = str(body.get("privateKey", "")).strip()
        text        = str(body.get("text", "")).strip()

        if not private_key:
            _json_resp(handler, {"error": "privateKey required"}, 400)
            return True
        if not text:
            _json_resp(handler, {"error": "text required"}, 400)
            return True
        if len(text) > 512 * 1024:
            _json_resp(handler, {"error": "text too large (max 512 KiB)"}, 400)
            return True

        try:
            env = {**os.environ, "PRIVATE_KEY": private_key, "ZG_TEXT": text}
            result = subprocess.run(
                ["bun", "run", str(_UPLOAD_SCRIPT)],
                env=env,
                cwd=str(_RELAY_DIR),
                capture_output=True,
                text=True,
                timeout=120,
            )
            # Find last JSON object line in stdout
            json_lines = [l.strip() for l in result.stdout.splitlines() if l.strip().startswith("{")]
            if not json_lines:
                err = (result.stderr or result.stdout or "bun produced no output").strip()
                print(f"  {config.R}[0g-store] error: {err[:200]}{config.RESET}")
                _json_resp(handler, {"error": err[:400]}, 502)
                return True

            parsed = json.loads(json_lines[-1])
            if "error" in parsed:
                print(f"  {config.R}[0g-store] upload error: {parsed['error'][:200]}{config.RESET}")
                _json_resp(handler, {"error": parsed["error"]}, 502)
                return True

            print(f"  {config.G}[0g-store] stored → rootHash={parsed.get('rootHash','?')[:20]}...{config.RESET}")
            _json_resp(handler, parsed)
        except subprocess.TimeoutExpired:
            _json_resp(handler, {"error": "0G upload timed out (120s)"}, 504)
        except FileNotFoundError:
            _json_resp(handler, {"error": "bun not found — install Bun to use 0G storage"}, 500)
        except Exception as e:
            _json_resp(handler, {"error": str(e)}, 502)
        return True

    if path == "/image/generate":
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length).decode("utf-8", errors="replace")
        try:
            body = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            _json_resp(handler, {"error": "invalid JSON"}, 400)
            return True

        prompt = str(body.get("prompt", "")).strip()
        seed   = int(body.get("seed", 42))
        if not prompt:
            _json_resp(handler, {"error": "prompt required"}, 400)
            return True

        encoded = urllib.parse.quote(prompt, safe="")
        url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&model=flux&seed={seed}"
        print(f"  {config.G}[image-gen] fetching: {url[:120]}...{config.RESET}")
        try:
            import ssl
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, headers={"User-Agent": "LoveClaw/1.0"})
            with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
                img_bytes = resp.read()
                content_type = resp.headers.get_content_type() or "image/jpeg"
            b64 = base64.b64encode(img_bytes).decode()
            data_url = f"data:{content_type};base64,{b64}"
            print(f"  {config.G}[image-gen] done — {len(img_bytes)//1024} KB{config.RESET}")
            _json_resp(handler, {"ok": True, "dataUrl": data_url})
        except Exception as e:
            print(f"  {config.R}[image-gen] failed: {e}{config.RESET}")
            _json_resp(handler, {"error": str(e)}, 502)
        return True

    return False
