"""HTTP DELETE /signals."""
import json
from datetime import datetime
from urllib.parse import parse_qs, urlparse

from . import store


def handle_delete(handler):
    if handler.path.split("?")[0] != "/signals":
        return False

    qs = parse_qs(urlparse(handler.path).query)
    type_filter = qs.get("type", [None])[0]

    with store.lock:
        if type_filter:
            before = len(store.signals)
            store.signals[:] = [
                s for s in store.signals if type_filter not in (s.get("type") or "")
            ]
            removed = before - len(store.signals)
            msg = f"removed {removed} signals of type ~{type_filter}".encode()
        else:
            store.signals.clear()
            msg = b"cleared"

    store.broadcast(
        {"type": "_clear", "filter": type_filter, "_ts": datetime.now().isoformat(), "_id": -1}
    )
    handler.send_response(200)
    handler.cors_headers()
    handler.end_headers()
    handler.wfile.write(msg)
    return True
