"""HTTP POST routes."""
import json
from datetime import datetime

from . import config
from . import signal_ingest
from . import store

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

    return False
