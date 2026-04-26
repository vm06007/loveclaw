"""Ports, paths, runtime config, and terminal color codes."""
import os

# .../prototype/relay/config.py -> repo root is two levels up
_PKG_DIR = os.path.dirname(os.path.abspath(__file__))  # prototype/relay
PROTOTYPE_ROOT = os.path.dirname(_PKG_DIR)  # prototype
REPO_ROOT = os.path.dirname(PROTOTYPE_ROOT)  # loveclaw-hack root

PORT = 9090
HOST = "0.0.0.0"

MEMORY_ROUTER = os.environ.get("MEMORY_ROUTER_URL", "http://localhost:9091")
MEMORY_BASE = MEMORY_ROUTER

runtime = {"couple_id": os.environ.get("LOVECLAW_COUPLE_ID", "")}

R = "\033[91m"
G = "\033[92m"
Y = "\033[93m"
B = "\033[94m"
M = "\033[95m"
C = "\033[96m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"

TYPE_COLORS = {
    "breach": R + BOLD,
    "app_installed": Y,
    "app_opened": M,
    "notification": C,
    "location": B,
    "call": G,
    "heartbeat": DIM,
    "score": G,
    "diary": M,
    "axl_handshake": G + BOLD,
}
