"""Reverse geocode location signals via Nominatim."""
import json
import urllib.request

from . import config
from .ssl_ctx import get_ssl_ctx

_geo_cache: dict = {}


def reverse_geocode(lat, lon):
    """Enrich a lat/lon with street-level address. Cached to 3 decimal places."""
    try:
        lat_f, lon_f = round(float(lat), 3), round(float(lon), 3)
    except (TypeError, ValueError):
        return {}

    key = (lat_f, lon_f)
    if key in _geo_cache:
        return _geo_cache[key]

    url = (
        f"https://nominatim.openstreetmap.org/reverse"
        f"?lat={lat_f}&lon={lon_f}&format=json&zoom=18&addressdetails=1&accept-language=en"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "LoveClaw/1.0 (relationship-trust-app)"})
    try:
        with urllib.request.urlopen(req, timeout=6, context=get_ssl_ctx()) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"  {config.Y}[geo] {e}{config.RESET}")
        return {}

    addr = data.get("address", {})
    result = {
        "street": addr.get("road") or addr.get("pedestrian") or addr.get("path", ""),
        "house_number": addr.get("house_number", ""),
        "suburb": addr.get("suburb") or addr.get("neighbourhood", ""),
        "district": addr.get("city_district") or addr.get("county", ""),
        "city": addr.get("city") or addr.get("town") or addr.get("village", ""),
        "postcode": addr.get("postcode", ""),
        "country": addr.get("country", ""),
        "display": data.get("display_name", ""),
    }
    parts = [
        p
        for p in [
            (result["house_number"] + " " + result["street"]).strip(),
            result["suburb"],
            result["district"],
            result["city"],
        ]
        if p
    ]
    result["label"] = ", ".join(parts[:3])

    _geo_cache[key] = result
    return result


def enrich_location(sig):
    """Add street-level fields to a location signal in-place."""
    lat = sig.get("lat") or sig.get("latitude")
    lon = sig.get("lon") or sig.get("lng") or sig.get("longitude")
    if not lat or not lon:
        return
    geo = reverse_geocode(lat, lon)
    if not geo:
        return
    sig.update(
        {
            "street": geo["street"],
            "suburb": geo["suburb"],
            "district": geo["district"],
            "city": geo["city"],
            "postcode": geo["postcode"],
            "label": geo["label"],
            "display": geo["display"],
        }
    )
    if geo["label"]:
        sig["area"] = geo["label"]
