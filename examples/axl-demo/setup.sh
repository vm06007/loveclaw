#!/usr/bin/env bash
# LoveClaw + AXL Two-Agent A2A Demo = one-time setup
# Builds the AXL node binary and generates Ed25519 identity keys for Alice and Boris.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "=== LoveClaw × AXL Demo Setup ==="
echo ""

# ── 1. Build AXL ──────────────────────────────────────────────────────────────
if [ -f "./axl/node" ]; then
    echo "✓ AXL binary already built (./axl/node)"
else
    if ! command -v go &>/dev/null; then
        echo "✗ Go not found. Install from https://go.dev/dl/ (need Go 1.25.x)"
        exit 1
    fi
    GO_VER=$(go version | awk '{print $3}' | sed 's/go//')
    echo "  Go $GO_VER found"

    if [ -d "./axl" ]; then
        echo "  AXL repo already cloned, building..."
    else
        echo "  Cloning AXL..."
        git clone --depth 1 https://github.com/gensyn-ai/axl axl
    fi

    echo "  Building AXL node binary..."
    cd axl
    # Go 1.26+ requires GOTOOLCHAIN override
    GOTOOLCHAIN=go1.25.5 go build -o node ./cmd/node/ 2>/dev/null || \
        go build -o node ./cmd/node/
    cd ..
    echo "✓ AXL built → ./axl/node"
fi

# ── 2. Generate identity keys ─────────────────────────────────────────────────
# macOS default OpenSSL may lack ed25519 — prefer Homebrew's if available
OPENSSL_BIN="openssl"
if [[ "$(uname)" == "Darwin" ]]; then
    for p in /opt/homebrew/opt/openssl/bin/openssl /usr/local/opt/openssl/bin/openssl; do
        [ -f "$p" ] && OPENSSL_BIN="$p" && break
    done
fi

for name in alice boris; do
    KEY_FILE="${name}-key.pem"
    if [ -f "$KEY_FILE" ]; then
        echo "✓ ${KEY_FILE} exists"
    else
        "$OPENSSL_BIN" genpkey -algorithm ed25519 -out "$KEY_FILE" 2>/dev/null
        echo "✓ Generated ${KEY_FILE}"
    fi
done

echo ""
echo "Setup complete."
echo ""
echo "Run the demo:"
echo "  cd $(pwd)"
echo "  python3 demo.py"
echo ""
