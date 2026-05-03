"""Claude + keyword fallback breach classification."""
import json
import os
import urllib.request
from datetime import datetime

from . import config
from . import penalty
from . import push_notify
from . import store
from .memory_client import mem_episode
from .ssl_ctx import get_ssl_ctx

SKIP_TYPES = {
    "location",
    "heartbeat",
    "score",
    "diary",
    "axl_handshake",
    "_clear",
    "call",
    "test",
}

DATING_PACKAGES = {
    "com.tinder",
    "com.bumble.app",
    "co.hinge.app",
    "com.grindr.android",
    "com.okcupid.okcupid",
    "com.badoo.mobile",
    "com.happn.app",
    "com.zoosk.zoosk",
    "com.match.android",
    "com.pof.android",
    "com.plenty.of.fish",
    "com.meetic.android",
    "com.taimi",
    "com.feeld.dating",
    "com.scruff",
    "com.scruff.android",
    "com.grindr.mobile",
    "net.muyaho",
    "com.muzz",
    "com.kippo",
    "com.chispa.app",
    "com.coffee.meets.bagel",
    "com.clover.android",
    "com.woo.dating",
    "com.hily.app",
    "com.skout",
    "com.zenly.app",
    "com.lovoo.android",
}

DATING_KEYWORDS = {
    "tinder",
    "bumble",
    "hinge",
    "grindr",
    "badoo",
    "happn",
    "okcupid",
    "zoosk",
    "match.com",
    "plentyoffish",
    "pof",
    "meetic",
    "taimi",
    "feeld",
    "scruff",
    "muzz",
    "chispa",
    "coffee meets bagel",
    "woo dating",
    "hily",
    "skout",
    "lovoo",
    "dating app",
    "hookup",
    "fling",
}


def keyword_classify(sig):
    pkg = (sig.get("package") or sig.get("app") or "").lower()
    name = (sig.get("name") or sig.get("app_name") or sig.get("label") or "").lower()
    text = (sig.get("text") or sig.get("title") or "").lower()
    haystack = f"{pkg} {name} {text}"

    if pkg in DATING_PACKAGES:
        app_name = name.title() or pkg.split(".")[-1].title()
        return {
            "is_breach": True,
            "confidence": "high",
            "category": "dating",
            "app_name": app_name,
            "reason": f"Package name {pkg} is a known dating app.",
            "narrative": (
                f'{app_name} was detected on the device '
                f'({sig.get("type", "installed")}). '
                f"This matches a breach trigger in the pact."
            ),
        }

    for kw in DATING_KEYWORDS:
        if kw in haystack:
            app_name = name.title() or kw.title()
            return {
                "is_breach": True,
                "confidence": "medium",
                "category": "dating",
                "app_name": app_name,
                "reason": f'Signal contains dating keyword "{kw}".',
                "narrative": (
                    f'{app_name} was detected on the device '
                    f'({sig.get("type", "event")}). '
                    f"This matches a breach trigger in the pact."
                ),
            }

    return None


def call_claude(messages, max_tokens=300):
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    payload = json.dumps(
        {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": max_tokens,
            "messages": messages,
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15, context=get_ssl_ctx()) as resp:
            result = json.loads(resp.read())
            return result["content"][0]["text"]
    except Exception as e:
        print(f"  {config.Y}[claude error] {e}{config.RESET}")
        return None


def ai_classify(sig):
    clean = {k: v for k, v in sig.items() if not k.startswith("_")}

    prompt = f"""You are the breach-detection engine for a relationship trust app called LoveClaw.

A partner's device just sent this signal:

{json.dumps(clean, indent=2)}

Your job: decide whether this signal indicates the person installed, opened, or received a notification from a dating app, hookup app, or any app primarily used to meet romantic or sexual partners (Tinder, Bumble, Hinge, Grindr, Badoo, Happn, OkCupid, Feeld, Scruff, etc. — but also lesser-known or regional apps).

Use all available context: package name, app display name, notification title/text, any other fields.

Respond with valid JSON only — no markdown, no explanation outside the JSON:

{{
  "is_breach": true or false,
  "confidence": "high" or "medium" or "low",
  "category": "dating" or "hookup" or "social_meetup" or "unrelated",
  "app_name": "human-readable app name if identifiable, else null",
  "reason": "one sentence explaining your classification",
  "narrative": "if is_breach is true: two neutral factual sentences for the partner notification. If false: empty string."
}}"""

    raw = call_claude([{"role": "user", "content": prompt}], max_tokens=350)
    if not raw:
        return None
    try:
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        print(f"  {config.Y}[claude parse error] {e} — raw: {raw[:200]}{config.RESET}")
        return None


def analyse_async(sig, broadcast_fn, signals_list, counter_ref):
    if sig.get("type") in SKIP_TYPES:
        return

    result = ai_classify(sig)

    if result is None:
        result = keyword_classify(sig)
        if result is None:
            return
        print(f"  {config.Y}[AI] no key — keyword fallback used{config.RESET}")

    confidence = result.get("confidence", "low")
    is_breach = result.get("is_breach", False) and confidence in ("high", "medium")

    col = config.G if not is_breach else config.R + config.BOLD
    print(
        f"  {col}[AI] {result.get('category', '?')} · "
        f"breach={is_breach} · {confidence} · {result.get('reason', '')}{config.RESET}"
    )

    if not is_breach:
        return

    app_name = result.get("app_name") or sig.get("app") or sig.get("name") or "?"
    narrative = result.get("narrative") or (
        f"{app_name} was detected on the device at "
        f'{sig.get("_ts", "")[11:19]}. '
        f"This matches a breach trigger in the pact."
    )

    breach = {
        "type": "breach",
        "app": app_name,
        "category": result.get("category"),
        "confidence": confidence,
        "reason": result.get("reason"),
        "score": 80 if confidence == "high" else 50,
        "narrative": narrative,
        "source_id": sig.get("_id"),
        "_ts": datetime.now().isoformat(),
        "_id": counter_ref[0],
    }
    counter_ref[0] += 1
    with store.lock:
        signals_list.append(breach)

    print(f'\n  {config.R + config.BOLD}{"─" * 60}{config.RESET}')
    print(f"  {config.R + config.BOLD}BREACH · {app_name.upper()} · {confidence.upper()} CONFIDENCE{config.RESET}")
    print(f"  {config.R}{narrative}{config.RESET}")
    print(f'  {config.R + config.BOLD}{"─" * 60}{config.RESET}\n')

    def _on_penalty(tx_hash, err):
        if tx_hash:
            breach["tx_hash"] = tx_hash
            with store.lock:
                for s in signals_list:
                    if s.get("_id") == breach["_id"]:
                        s["tx_hash"] = tx_hash
                        break
        broadcast_fn(breach)
        push_body = f"{narrative}\nPenalty applied: {tx_hash}" if tx_hash else narrative
        push_notify.send_to("all", f"🚨 Breach detected — {app_name}", push_body)

    penalty.apply_penalty_async(_on_penalty)

    mem_episode(
        "breach",
        {
            "app": app_name,
            "category": result.get("category"),
            "confidence": confidence,
            "narrative": narrative,
            "_id": breach["_id"],
            "_ts": breach["_ts"],
        },
        config.runtime["couple_id"] or "loveclaw",
    )
