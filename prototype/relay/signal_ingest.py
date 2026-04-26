"""POST /signal: parse, enrich, persist, broadcast, spawn side-effects."""
import threading
from datetime import datetime

from . import attestation
from . import breach_ai
from . import config
from . import geo
from . import memory_client
from . import store
from . import together

def ingest_signal(sig):
    """
    Process one decoded signal dict (already has _ts, _id).
    Mutates sig in place; appends to store.signals under lock.
    """
    if sig.get("type") == "location":
        geo.enrich_location(sig)

    with store.lock:
        store.signals.append(sig)
        if len(store.signals) > 2000:
            store.signals.pop(0)

    attest_result = attestation.verify_signal_attestation(sig)
    sig["_verified"] = attest_result["ok"]
    sig["_hw"] = attest_result["hw"]
    sig["_attest_fp"] = attest_result["fingerprint"]

    col = config.G if attest_result["ok"] else (config.Y if attest_result["ok"] is None else config.R)
    if attest_result["ok"] is not None:
        print(
            f'  {col}[attest] {attest_result["reason"]}'
            f'{" · hw=" + str(attest_result["hw"]) if attest_result["ok"] else ""}'
            f"{config.RESET}"
        )

    store.log_to_terminal(sig)
    store.broadcast(sig)

    sig_type = sig.get("type", "")
    cid = config.runtime["couple_id"]

    if sig_type == "location":
        threading.Thread(
            target=together.check_together_episode,
            args=("self", sig, cid, store.broadcast, store.signals, store.signal_counter_ref),
            daemon=True,
        ).start()

    if sig_type == "diary":
        if sig.get("scene"):
            sig["_scene_vibe"] = {
                "beachparty": "beach sunset, guitar, dancing, cocktails",
                "diving": "coral reef, weightless, colourful fish",
                "carcamping": "mountain ridge, jeep roof, orange sky",
                "driving": "sunlit forest road, just the two of you",
                "citymotor": "night coast road, city lights, wind",
                "citywalk": "neon streets, full moon, wandering together",
                "working": "two desks, focused, city at night",
                "movie": "couch, city glow, curled up together",
                "sleep": "winter cabin, fireplace, snow outside",
                "adventure": "rooftop, city skyline at dusk, a cat nearby",
            }.get(sig["scene"], "")
        memory_client.mem_episode("diary", sig, cid or "loveclaw")
    elif sig_type == "axl_handshake":
        memory_client.mem_episode("axl_handshake", sig, cid or "loveclaw")
    elif sig_type == "partner_location":
        geo.enrich_location(sig)
        threading.Thread(
            target=together.check_together_episode,
            args=("partner", sig, cid, store.broadcast, store.signals, store.signal_counter_ref),
            daemon=True,
        ).start()

    threading.Thread(
        target=breach_ai.analyse_async,
        args=(sig, store.broadcast, store.signals, store.signal_counter_ref),
        daemon=True,
    ).start()
