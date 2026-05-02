#!/usr/bin/env bash
# Run Tauri dev with LOVECLAW_ROLE (and optional fixed port). Safe to run multiple instances:
#   bun run dev:tauri -- alice          # first → 1420 if free
#   bun run dev:tauri -- boris          # second → bumps to next free (e.g. 1421) automatically
#   LOVECLAW_DEV_PORT=1422 bun run dev:tauri -- yiying
#   LOVECLAW_DEV_SKIP_PORT_PROBE=1 bun run dev:tauri -- alice 1420   # do not bump; fail if busy
# Optional: LOVECLAW_HMR_PORT when TAURI_DEV_HOST is set (vite defaults to dev port + 1).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ROLE="${LOVECLAW_ROLE:-alice}"
PORT="${LOVECLAW_DEV_PORT:-1420}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --)
            shift
            break
            ;;
        *)
            if [[ "$1" =~ ^[0-9]+$ ]]; then
                PORT="$1"
            else
                ROLE="$1"
            fi
            shift
            ;;
    esac
done

# True if something is listening on 127.0.0.1:port (so we can start another Tauri on the next free port).
port_in_use() {
    local p="$1"
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi
    if (echo >/dev/tcp/127.0.0.1/"$p") >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Advance PORT until free (or cap), so a second `tauri dev` does not collide with the first.
pick_free_listen_port() {
    local p="${1:-1420}"
    local max=$((p + 400))
    while [[ "$p" -le "$max" ]]; do
        if ! port_in_use "$p"; then
            echo "$p"
            return 0
        fi
        p=$((p + 1))
    done
    echo "no free TCP port found starting at ${1:-1420} (tried up to $max)" >&2
    return 1
}

if [[ "${LOVECLAW_DEV_SKIP_PORT_PROBE:-}" != "1" ]]; then
    PORT="$(pick_free_listen_port "$PORT")"
fi

export LOVECLAW_ROLE="$ROLE"
export LOVECLAW_DEV_PORT="$PORT"
export LOVECLAW_DEV_STRICT_PORT="${LOVECLAW_DEV_STRICT_PORT:-1}"
export LOVECLAW_TAURI_DEV="${LOVECLAW_TAURI_DEV:-1}"

EXTRA="$(printf '{"build":{"devUrl":"http://127.0.0.1:%s"}}' "$PORT")"

exec bunx tauri dev -c "$EXTRA" "$@"
