"""In-memory signal log, SSE client queues, broadcast."""
import json
import threading

from . import config

signals: list = []
clients: list = []
lock = threading.Lock()
signal_counter_ref = [0]

def color_for(t):
    for k, v in config.TYPE_COLORS.items():
        if k in t:
            return v
    return config.RESET

def broadcast(sig):
    data = f"data: {json.dumps(sig)}\n\n"
    with lock:
        dead = []
        for q in clients:
            try:
                q.put_nowait(data)
            except Exception:
                dead.append(q)
        for q in dead:
            clients.remove(q)

def log_to_terminal(sig):
    t = sig.get("type", "signal")
    ts = sig.get("_ts", "")[-8:]
    pkg = sig.get("package", sig.get("app", sig.get("area", sig.get("text", ""))))
    score = f"  score={sig['score']}" if "score" in sig else ""
    col = color_for(t)
    print(f"  {config.DIM}{ts}{config.RESET}  {col}{t:<22}{config.RESET}  {pkg}{score}")
