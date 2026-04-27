#!/usr/bin/env python3
"""
Minimal push-subscription server.

Endpoints:
    GET  /vapid-public-key   — returns the VAPID public key
    POST /push-subscribe     — registers a device subscription to push_subs.json
    POST /debug              — logs debug info from the app (permission state etc.)
    GET  /stream             — stub SSE (silences 404 noise from relay-notify.js)
"""

import http.server
import json
import pathlib

PORT = 9095
REPO = pathlib.Path(__file__).parent.parent
KEYS = REPO / "prototype" / "relay" / "vapid_keys.json"
SUBS = REPO / "prototype" / "relay" / "push_subs.json"


class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else ""
        if self.path.split("?")[0] == "/stream":
            return  # silence SSE keepalive noise
        print(f"  [{self.command}] {self.path}  {status}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/vapid-public-key":
            data = json.loads(KEYS.read_text())
            body = json.dumps({"publicKey": data["public_key"]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        elif path == "/stream":
            # Stub SSE — keeps connection open so the app doesn't spam retries
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self._cors()
            self.end_headers()
            try:
                while True:
                    import time
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    time.sleep(25)
            except Exception:
                pass

        else:
            self.send_error(404)

    def do_POST(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)

        if path == "/push-subscribe":
            body = json.loads(raw)
            name = body.get("name", "").strip().lower()
            sub  = body.get("subscription")
            if not name or not sub:
                self.send_error(400, "name and subscription required")
                return
            subs = json.loads(SUBS.read_text()) if SUBS.exists() else {}
            subs[name] = sub
            SUBS.write_text(json.dumps(subs, indent=2))
            print(f"\n  ✅ [push] subscription saved for '{name}'")
            resp = json.dumps({"ok": True, "name": name}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(resp)

        elif path == "/debug":
            try:
                info = json.loads(raw)
            except Exception:
                info = {"raw": raw.decode(errors="replace")}
            print(f"\n  📱 [debug] {json.dumps(info, indent=4)}")
            self.send_response(200)
            self._cors()
            self.end_headers()
            self.wfile.write(b"ok")

        else:
            self.send_error(404)


if __name__ == "__main__":
    print(f"\nLoveClaw push-server  →  http://0.0.0.0:{PORT}")
    print(f"  VAPID key  →  GET  /vapid-public-key")
    print(f"  Subscribe  →  POST /push-subscribe")
    print(f"  Debug      →  POST /debug")
    print(f"  Subs file  →  {SUBS}")
    print(f"\n  Ctrl-C to stop\n")
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as srv:
        srv.serve_forever()
