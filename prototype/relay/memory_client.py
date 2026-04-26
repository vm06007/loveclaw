"""HTTP client for memory_router.py on port 9091."""
import json
import urllib.parse
import urllib.request

from . import config

MEMORY_ROUTER = config.MEMORY_ROUTER


def _router_post(path, body):
    try:
        payload = json.dumps(body).encode()
        req = urllib.request.Request(
            MEMORY_ROUTER + path,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def _router_get(path, params=None):
    try:
        qs = (
            "?" + "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
            if params
            else ""
        )
        req = urllib.request.Request(MEMORY_ROUTER + path + qs)
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def mem_write(group_id, sender_id, sender_name, content, msg_id=None):
    if not content:
        return
    _router_post(
        "/write",
        {
            "group_id": group_id or config.runtime["couple_id"],
            "sender": sender_id,
            "sender_name": sender_name,
            "content": content,
            "message_id": msg_id,
        },
    )


def mem_search(group_id, query, top_k=15):
    data = _router_get(
        "/search",
        {
            "q": query,
            "group_id": group_id or config.runtime["couple_id"],
            "top_k": top_k,
        },
    )
    if not data:
        return []
    return data.get("memories", [])


def mem_episode(ep_type, data, group_id=None):
    _router_post(
        "/episode",
        {**data, "type": ep_type, "group_id": group_id or config.runtime["couple_id"]},
    )
