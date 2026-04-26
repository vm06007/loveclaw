#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/examples/axl-demo"

# Build binary if missing
if [ ! -f axl/node ]; then
  echo "Building AXL binary..."
  cd axl && GOTOOLCHAIN=go1.25.5 go build -o node ./cmd/node/ && cd ..
fi

# Generate keys if missing
[ -f alice-key.pem ] || openssl genpkey -algorithm ed25519 -out alice-key.pem
[ -f boris-key.pem ] || openssl genpkey -algorithm ed25519 -out boris-key.pem

# Write node configs
cat > node-alice.json <<'EOF'
{"PrivateKeyPath":"alice-key.pem","Peers":[],"Listen":["tls://0.0.0.0:9001"],"api_port":9002,"router_port":9003,"a2a_port":9004}
EOF
cat > node-boris.json <<'EOF'
{"PrivateKeyPath":"boris-key.pem","Peers":["tls://127.0.0.1:9001"],"Listen":["tls://0.0.0.0:7001"],"api_port":9012,"tcp_port":7000,"router_port":9013,"a2a_port":9014}
EOF

# Kill any leftover nodes
pkill -f "axl/node" 2>/dev/null || true
sleep 0.5

# Start nodes
./axl/node -config node-alice.json > /tmp/loveclaw-alice.log 2>&1 &
sleep 1
./axl/node -config node-boris.json > /tmp/loveclaw-boris.log 2>&1 &
echo "AXL nodes starting..."

# Wait for both to be ready
for i in $(seq 20); do
  curl -sf http://127.0.0.1:9002/topology > /dev/null 2>&1 && \
  curl -sf http://127.0.0.1:9012/topology > /dev/null 2>&1 && break
  sleep 0.5
done
echo "Nodes ready."

# Start Vite dev server from repo root
cd "$(dirname "$0")"
npm run dev &
VITE_PID=$!
sleep 2

# Open two browser tabs
open "http://localhost:1420/?role=alice"
sleep 0.3
open "http://localhost:1420/?role=boris"

echo ""
echo "Alice: http://localhost:1420/?role=alice"
echo "Boris: http://localhost:1420/?role=boris"
echo ""
echo "Logs: /tmp/loveclaw-alice.log  /tmp/loveclaw-boris.log"
echo "Press Ctrl+C to stop."
wait $VITE_PID
