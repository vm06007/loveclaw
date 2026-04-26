"""Detect when both partners are near the same place (together episode)."""
import json
import math
import threading
import urllib.request
from datetime import datetime

from . import config
from .memory_client import mem_episode
from .ssl_ctx import get_ssl_ctx
from . import store

_last_locations: dict = {}

SCENE_KEYWORDS = {
    "beachparty": ["beach", "sea", "ocean", "bay", "coast", "shore", "surf", "tropical", "island"],
    "diving": ["dive", "diving", "snorkel", "reef", "aqua", "lake", "river", "pool"],
    "carcamping": [
        "mountain",
        "trail",
        "camp",
        "forest",
        "woods",
        "jungle",
        "hill",
        "alpine",
        "national park",
        "nature reserve",
        "park",
        "garden",
    ],
    "driving": ["motorway", "highway", "freeway", "road", "route", "bypass", "expressway"],
    "citymotor": ["ring road", "coastal road", "seafront", "promenade", "waterfront"],
    "citywalk": [
        "mall",
        "market",
        "restaurant",
        "cafe",
        "bar",
        "street",
        "avenue",
        "city",
        "town",
        "district",
        "station",
        "terminal",
        "downtown",
        "urban",
    ],
    "working": ["office", "workplace", "coworking", "business", "tower", "building", "plaza", "studio"],
    "movie": [
        "cinema",
        "theater",
        "theatre",
        "imax",
        "multiplex",
        "home",
        "apartment",
        "condo",
        "flat",
        "house",
        "residence",
    ],
    "sleep": ["bedroom", "cabin", "cottage", "chalet"],
    "adventure": [
        "stadium",
        "sport",
        "gym",
        "climbing",
        "festival",
        "amusement",
        "theme park",
        "zoo",
        "museum",
        "gallery",
        "rooftop",
        "viewpoint",
    ],
}

together_state = {"active": False, "scene": None, "location": None, "ts": None}

def _classify_scene(sig):
    haystack = " ".join(
        [
            sig.get("label", ""),
            sig.get("area", ""),
            sig.get("street", ""),
            sig.get("suburb", ""),
            sig.get("district", ""),
            sig.get("city", ""),
            sig.get("display", ""),
        ]
    ).lower()
    for scene, kws in SCENE_KEYWORDS.items():
        if any(kw in haystack for kw in kws):
            return scene
    return "citywalk"

def _haversine_m(lat1, lon1, lat2, lon2):
    r_earth = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    return r_earth * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def check_together_episode(role, sig, group_id, broadcast_fn, signals_list, counter_ref):
    """If both partners within ~500 m, emit together_episode and memorize."""
    _last_locations[role] = sig

    other = "partner" if role == "self" else "self"
    other_sig = _last_locations.get(other)
    if not other_sig:
        return

    try:
        lat1 = float(sig.get("lat") or sig.get("latitude", 0))
        lon1 = float(sig.get("lon") or sig.get("lng") or sig.get("longitude", 0))
        lat2 = float(other_sig.get("lat") or other_sig.get("latitude", 0))
        lon2 = float(other_sig.get("lon") or other_sig.get("lng") or other_sig.get("longitude", 0))
    except (TypeError, ValueError):
        return

    if not (lat1 and lon1 and lat2 and lon2):
        return

    dist = _haversine_m(lat1, lon1, lat2, lon2)
    if dist > 500:
        return

    scene = _classify_scene(sig)
    label = sig.get("label") or sig.get("area") or f"{lat1:.3f},{lon1:.3f}"

    episode = {
        "type": "together_episode",
        "scene": scene,
        "location": label,
        "distance": round(dist),
        "note": f"Both partners at {label} — {scene} scene",
        "_ts": datetime.now().isoformat(),
        "_id": counter_ref[0],
    }
    counter_ref[0] += 1

    with store.lock:
        signals_list.append(episode)

    together_state.update({"active": True, "scene": scene, "location": label, "ts": episode["_ts"]})
    print(
        f"\n  {config.G + config.BOLD}TOGETHER · {scene} · {label} · {round(dist)}m apart{config.RESET}\n"
    )
    broadcast_fn(episode)

    mem_episode(
        "together",
        {
            "location": label,
            "scene": scene,
            "distance": round(dist),
            "_id": episode["_id"],
            "_ts": episode["_ts"],
        },
        group_id or "loveclaw",
    )

    def _request_image():
        try:
            payload = json.dumps(
                {"signals_a": sig, "together": True, "scene": scene}
            ).encode()
            req = urllib.request.Request(
                "http://localhost:9093/generate",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=120, context=get_ssl_ctx()) as r:
                result = json.loads(r.read())
            img_event = {
                "type": "generated_image",
                "scene": scene,
                "url": result.get("url", ""),
                "cached": result.get("cached", False),
                "_ts": episode["_ts"],
            }
            broadcast_fn(img_event)
            print(f'  {config.G}[image_gen] scene image ready → {result.get("url", "")}{config.RESET}')
        except Exception as e:
            print(f"  {config.Y}[image_gen] skipped (generator not running or no API key): {e}{config.RESET}")

    threading.Thread(target=_request_image, daemon=True).start()
