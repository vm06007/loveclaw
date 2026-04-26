#!/usr/bin/env python3
"""
LoveClaw Signal Relay (entry point)

Receives signals from LoveClaw, streams them via SSE to the signal console.

Usage (from repository root):
    python3 prototype/signal-relay.py

"""
import os
import sys

_PROTOTYPE_DIR = os.path.dirname(os.path.abspath(__file__))
if _PROTOTYPE_DIR not in sys.path:
    sys.path.insert(0, _PROTOTYPE_DIR)

from relay.server import main  # noqa: E402

if __name__ == "__main__":
    main()
