"""HTTP GET routes."""
import json
import os
import urllib.parse

from . import config
from . import memory_client
from . import relay_sse
from . import static_files
from . import store
from . import together

def handle_get(handler):
    """Return True if request was handled (including errors)."""
    path = handler.path.split("?")[0]

    if path == "/vapid-public-key":
        keys_path = os.path.join(os.path.dirname(__file__), "vapid_keys.json")
        try:
            with open(keys_path) as f:
                data = json.load(f)
            body = json.dumps({"publicKey": data["public_key"]}).encode()
            handler.send_response(200)
            handler.send_header("Content-Type", "application/json")
            handler.cors_headers()
            handler.end_headers()
            handler.wfile.write(body)
        except Exception as e:
            handler.send_error(500, str(e))
        return True

    if path == "/signals":
        body = json.dumps(store.signals).encode()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler.cors_headers()
        handler.end_headers()
        handler.wfile.write(body)
        return True

    if path == "/stream":
        relay_sse.run_sse_loop(handler)
        return True

    if path == "/memories/context":
        qs_raw = urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)
        query = qs_raw.get("q", ["recent activity couple diary"])[0]
        group_id = qs_raw.get("group_id", [config.runtime["couple_id"] or "loveclaw"])[0]
        top_k = int(qs_raw.get("top_k", ["15"])[0])
        mems = memory_client.mem_search(group_id, query, top_k)
        body = json.dumps({"memories": mems, "group_id": group_id}).encode()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler.cors_headers()
        handler.end_headers()
        handler.wfile.write(body)
        return True

    if path == "/local-ip":
        import socket

        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
        except Exception:
            ip = "127.0.0.1"
        body = json.dumps({"ip": ip}).encode()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler.cors_headers()
        handler.end_headers()
        handler.wfile.write(body)
        return True

    if path == "/status":
        body = json.dumps(
            {
                "ok": True,
                "together": together.together_state["active"],
                "scene": together.together_state["scene"],
                "location": together.together_state["location"],
                "ts": together.together_state["ts"],
                "signals": len(store.signals),
                "couple_id": config.runtime["couple_id"],
            }
        ).encode()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler.cors_headers()
        handler.end_headers()
        handler.wfile.write(body)
        return True

    if path == "/config":
        body = json.dumps(
            {"couple_id": config.runtime["couple_id"], "memory_base": config.MEMORY_BASE}
        ).encode()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler.cors_headers()
        handler.end_headers()
        handler.wfile.write(body)
        return True

    if path == "/":
        proto_console = os.path.join(
            config.REPO_ROOT, "prototype", "console", "signal-console.html"
        )
        if os.path.isfile(proto_console):
            handler.send_response(302)
            handler.send_header("Location", "/prototype/console/")
            handler.cors_headers()
            handler.end_headers()
            return True
        html = static_files.resolve_console_html()
        if html:
            with open(html, "rb") as f:
                body = f.read()
            handler.send_response(200)
            handler.send_header("Content-Type", "text/html; charset=utf-8")
            handler.cors_headers()
            handler.end_headers()
            handler.wfile.write(body)
            return True
        handler.send_error(404, "signal-console.html not found")
        return True

    if path == "/prototype/console":
        handler.send_response(302)
        handler.send_header("Location", "/prototype/console/")
        handler.cors_headers()
        handler.end_headers()
        return True

    if path in (
        "/console",
        "/signal-console.html",
        "/prototype/console/signal-console.html",
        "/prototype/console/",
    ):
        html = static_files.resolve_console_html()
        if html:
            with open(html, "rb") as f:
                body = f.read()
            handler.send_response(200)
            handler.send_header("Content-Type", "text/html; charset=utf-8")
            handler.cors_headers()
            handler.end_headers()
            handler.wfile.write(body)
            return True
        handler.send_error(404, "signal-console.html not found")
        return True

    static = static_files.static_file_path(path)
    if static:
        with open(static, "rb") as f:
            body = f.read()
        handler.send_response(200)
        handler.send_header("Content-Type", static_files.static_content_type(static))
        handler.cors_headers()
        handler.end_headers()
        handler.wfile.write(body)
        return True

    return False
