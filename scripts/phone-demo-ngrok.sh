#!/usr/bin/env bash
# Start local AXL (9002 / 9012), Vite on 1420, and ngrok so two phones can pair over HTTPS.
# Prereqs: bun, ngrok (`ngrok config add-authtoken …` once), openssl optional for keys.
#
# Optional: use your own hostname (subdomain of loveclaw.app) instead of *.ngrok-free.app:
#   1) In ngrok dashboard: add a custom endpoint / DNS instructions for e.g. dev.loveclaw.app
#   2) At your DNS (wherever loveclaw.app is managed): add the CNAME ngrok shows
#   3) NGROK_URL=https://dev.loveclaw.app bun run phone-demo
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AXL_DEMO="$ROOT/examples/axl-demo"
VITE_PORT="${VITE_PORT:-1420}"
NGROK_API="http://127.0.0.1:4040"

say() { printf "\n\033[1;36m%s\033[0m\n" "$*"; }

if ! command -v ngrok &>/dev/null; then
    echo "ngrok not found. Install: https://ngrok.com/download"
    exit 1
fi
if ! command -v bun &>/dev/null; then
    echo "bun not found. Install: https://bun.sh"
    exit 1
fi

if [[ ! -x "$AXL_DEMO/axl/node" ]]; then
    say "Building AXL (one-time)…"
    (cd "$AXL_DEMO" && chmod +x setup.sh 2>/dev/null; ./setup.sh)
fi

start_axl_nodes() {
    if curl -sf "http://127.0.0.1:9002/topology" >/dev/null 2>&1 && curl -sf "http://127.0.0.1:9012/topology" >/dev/null 2>&1; then
        say "AXL nodes already listening on 9002 and 9012."
        return
    fi
    say "Starting AXL nodes (Alice :9002, Boris :9012)…"
    pkill -f "axl/node -config node-alice" 2>/dev/null || true
    pkill -f "axl/node -config node-boris" 2>/dev/null || true
    sleep 0.4
    (cd "$AXL_DEMO" && ./axl/node -config node-alice.json >>/tmp/loveclaw-alice.log 2>&1 &)
    sleep 1
    (cd "$AXL_DEMO" && ./axl/node -config node-boris.json >>/tmp/loveclaw-boris.log 2>&1 &)
    sleep 2
    if ! curl -sf "http://127.0.0.1:9002/topology" >/dev/null; then
        echo "Alice node failed to start. Check /tmp/loveclaw-alice.log"
        exit 1
    fi
    if ! curl -sf "http://127.0.0.1:9012/topology" >/dev/null; then
        echo "Boris node failed to start. Check /tmp/loveclaw-boris.log"
        exit 1
    fi
    say "AXL nodes are up."
}

cleanup() {
    if [[ -n "${VITE_PID:-}" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
        kill "$VITE_PID" 2>/dev/null || true
    fi
    if [[ -n "${NGROK_PID:-}" ]] && kill -0 "$NGROK_PID" 2>/dev/null; then
        kill "$NGROK_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

start_axl_nodes

if lsof -i ":$VITE_PORT" -sTCP:LISTEN -Pn 2>/dev/null | grep -q .; then
    say "Port $VITE_PORT is already in use (Vite or another app)."
    echo "Use that server, or stop it and re-run this script."
    echo "If Vite is already running with AXL proxy, start ngrok only:"
    echo "  ngrok http $VITE_PORT --host-header=rewrite"
    VITE_PID=""
else
    say "Starting Vite on http://0.0.0.0:$VITE_PORT …"
    cd "$ROOT"
    bun run dev -- --host 0.0.0.0 --port "$VITE_PORT" &
    VITE_PID=$!
    sleep 2
fi

say "Starting ngrok tunnel → localhost:$VITE_PORT …"
NGROK_URL="${NGROK_URL:-}"
if [[ -n "$NGROK_URL" ]]; then
    echo "  (using NGROK_URL=$NGROK_URL — need DNS + ngrok custom domain configured)"
    ngrok http "$VITE_PORT" --url "$NGROK_URL" --log=stdout >/tmp/loveclaw-ngrok.log 2>&1 &
else
    # Host header stays the ngrok hostname so Vite allowedHosts match.
    ngrok http "$VITE_PORT" --log=stdout >/tmp/loveclaw-ngrok.log 2>&1 &
fi
NGROK_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 40); do
    if curl -sf "$NGROK_API/api/tunnels" >/dev/null 2>&1; then
        PUBLIC_URL=$(curl -sf "$NGROK_API/api/tunnels" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for t in d.get('tunnels', []):
        u = t.get('public_url', '')
        if u.startswith('https://'):
            print(u)
            break
except Exception:
    pass
" 2>/dev/null || true)
    fi
    if [[ -n "$PUBLIC_URL" ]]; then
        break
    fi
    sleep 0.25
done

if [[ -z "$PUBLIC_URL" && -n "${NGROK_URL:-}" ]]; then
    PUBLIC_URL="${NGROK_URL%/}"
fi
if [[ -z "$PUBLIC_URL" ]]; then
    echo "Could not read ngrok URL from $NGROK_API (is ngrok authtoken set?). Log: /tmp/loveclaw-ngrok.log"
    exit 1
fi

say "Phones can open (HTTPS):"
echo ""
echo "  Inviter:  ${PUBLIC_URL}/alice   (any /tag, e.g. /you /judge — or ?role=alice)"
echo "  Partner:  ${PUBLIC_URL}/boris   (or ?role=boris)"
echo ""
echo "Flow: Alice tab → Create → Generate invite. Boris tab → Join → paste code."
echo "ngrok web inspect: $NGROK_API"
echo ""
echo "Press Ctrl+C here to stop ngrok (and Vite if this script started it)."

wait "$NGROK_PID" 2>/dev/null || wait
