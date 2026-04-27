#!/usr/bin/env python3
"""
Send a Web Push notification directly to Alice or Boris (no relay needed).

Usage:
    python3 scripts/notify.py <target> "<title>" ["<body>"]

Examples:
    python3 scripts/notify.py alice "Breach detected 🚨" "Tinder was opened on Boris's phone"
    python3 scripts/notify.py boris "Your partner checked in" "Alice arrived home"
    python3 scripts/notify.py all "System alert" "relay restarted"

Requirements:
    - push-server.py must have run at least once so the phone could subscribe
    - pywebpush installed: pip3 install pywebpush
"""

import json
import pathlib
import sys

REPO = pathlib.Path(__file__).parent.parent
PRIV = REPO / "prototype" / "relay" / "vapid_private.pem"
SUBS = REPO / "prototype" / "relay" / "push_subs.json"


def send(target: str, title: str, body: str = "") -> None:
    from pywebpush import webpush, WebPushException
    from py_vapid import Vapid

    if not PRIV.exists():
        print("ERROR: VAPID private key not found at", PRIV)
        sys.exit(1)
    if not SUBS.exists():
        print("ERROR: No subscriptions yet. Open the app on the phone first.")
        sys.exit(1)

    vapid = Vapid.from_pem(PRIV.read_bytes())
    subs = json.loads(SUBS.read_text())

    target = target.strip().lower()
    matched = {k: v for k, v in subs.items() if target == "all" or k == target}

    if not matched:
        print(f"No subscription found for '{target}'. Known: {list(subs.keys()) or 'none'}")
        sys.exit(1)

    payload = json.dumps({"title": title, "body": body})

    for name, sub in matched.items():
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=vapid,
                vapid_claims={"sub": "mailto:test@loveclaw.app"},
            )
            print(f"[push] sent → {name}")
        except WebPushException as e:
            print(f"[push] ERROR for {name}: {e}")
            if e.response is not None:
                print(f"       status={e.response.status_code}  body={e.response.text[:200]}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2:
        print("usage: notify.py <target> <title> [body]")
        sys.exit(1)

    send(target=args[0], title=args[1], body=args[2] if len(args) > 2 else "")
