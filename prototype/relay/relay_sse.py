"""Server-Sent Events stream for live signal console."""
import json
import queue

from . import store

def run_sse_loop(handler):
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("Connection", "keep-alive")
    handler.send_header("X-Accel-Buffering", "no")
    handler.cors_headers()
    handler.end_headers()

    q = queue.Queue()

    with store.lock:
        store.clients.append(q)
        replay = list(store.signals[-50:])

    for sig in replay:
        try:
            handler.wfile.write(f"data: {json.dumps(sig)}\n\n".encode())
            handler.wfile.flush()
        except Exception:
            return

    while True:
        try:
            data = q.get(timeout=25)
            handler.wfile.write(data.encode())
            handler.wfile.flush()
        except queue.Empty:
            try:
                handler.wfile.write(b": ping\n\n")
                handler.wfile.flush()
            except Exception:
                break
        except Exception:
            break

    with store.lock:
        try:
            store.clients.remove(q)
        except ValueError:
            pass
