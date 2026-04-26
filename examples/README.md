# LoveClaw × AXL — Examples

Self-contained demos: P2P over [AXL](https://github.com/gensyn-ai/axl), plus a
separate **0G Storage** memory upload/download sample for onchain AI hackathon
workflows.

---

## Signal relay (`prototype/`)

`prototype/signal-relay.py` starts the relay (implementation in `prototype/relay/`). It exposes **POST /signal**, **GET /stream** (SSE), and serves static files under `/examples/` and `/prototype/` so the signal console loads from the same origin on port **9090**.

**Quick start:**
```bash
cd ..   # repo root
python3 prototype/signal-relay.py
# open http://127.0.0.1:9090/  → redirects to prototype/console/signal-console.html
```

Optional: `pip install cryptography` for Android attestation verification. Optional memory and image features expect `memory_router.py` / `image_gen.py` (not included in this repo) on their usual ports.

---

## `0g-storage-memory/` — 0G Storage (chat / pact memory)

Bun + TypeScript CLI: builds a JSON **pact memory snapshot**, uploads it with
`MemData` + [`@0gfoundation/0g-ts-sdk`](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk),
downloads by `rootHash` with proof verification. See `0g-storage-memory/README.md`.

**Quick start:**
```bash
cd 0g-storage-memory
cp .env.local.example .env.local   # add PRIVATE_KEY; OG_NETWORK=testnet (default) or mainnet
bun install
bun run demo
# optional: bun run ui → http://127.0.0.1:4789/ (store/retrieve in browser)
```

---

## `axl-demo/` — Python orchestrated demo

Spawns two AXL nodes on the same machine, exchanges keys automatically, and
runs LoveClaw conversation showing every message type.

**Quick start:**
```bash
cd axl-demo
./setup.sh              # builds AXL binary, generates alice-key.pem + boris-key.pem
python3 a2a.py          # start nodes → live UI at http://localhost:8090
python3 a2a.py --test   # start nodes + run test sequence first
```

**Nodes already running?**
```bash
python3 a2a.py --nodes-up
```

**Architecture:**
```
a2a.py
  ├── start_node('node-alice.json')   → AXL node  HTTP :9002  TLS :9001
  ├── start_node('node-boris.json')     → AXL node  HTTP :9012  TLS :7001
  │                                       (Boris peers with Alice at tls://127.0.0.1:9001)
  ├── Agent('Alice', 9002)            ← polls /recv every 400ms
  ├── Agent('Boris',   9012)            ← polls /recv every 400ms
  └── built-in HTTP server :8090
        GET  /         → ui.html (split-panel log viewer)
        GET  /events   → SSE stream of all agent logs
        POST /send     → trigger a message from Alice or Boris
```

The browser never touches AXL directly — it talks only to `a2a.py`'s built-in
server. No CORS proxy needed. AXL does all P2P; the browser watches and controls
via the same-origin SSE + REST interface.

---

## `axl-rust/` — Rust agent example

Shows how the same AXL HTTP API works from Rust — directly applicable to
the Tauri desktop app in `loveclaw-hack/src-tauri/`.

**Quick start:**
```bash
cd axl-rust
cargo run                                   # show node identity
cargo run -- --recv                         # receive one message
cargo run -- --poll                         # poll continuously
cargo run -- --send <peer_key> "hello"      # send a message
cargo run -- --demo <peer_key>              # scripted exchange
cargo run -- --port 9012                    # use Boris's node (default: 9002)
```

**Integration into Tauri:**

The `AxlClient` struct in `src/main.rs` can be dropped directly into a Tauri
command handler:

```rust
#[tauri::command]
async fn axl_send(peer_key: String, text: String) -> Result<usize, String> {
    let axl = AxlClient::new(9002);
    let msg = Msg::diary("me", &text);
    axl.send(&peer_key, &msg).await.map_err(|e| e.to_string())
}
```

---

## AXL message protocol

All messages are JSON sent over `POST /send` and received via `GET /recv`.

| Type | Direction | Purpose |
|---|---|---|
| `axl_handshake` | bidirectional | bootstrap — exchange names and keys |
| `score` | both → partner | current trust score (0-100) |
| `diary` | both → partner | AI diary entry |
| `breach_candidate` | both → partner | "I see something — vote?" |
| `breach_vote` | both → partner | agree/disagree on candidate |
| `agent_state` | both → partner | periodic full state broadcast |

See [`../../AXL.md`](../../loveclaw/AXL.md) for the complete protocol spec.

---

## AXL HTTP API reference

All calls go to `http://127.0.0.1:<port>` where port is 9002 (Alice) or 9012 (Boris).

```bash
# Identity
curl http://127.0.0.1:9002/topology

# Send a message
curl -X POST http://127.0.0.1:9002/send \
  -H "X-Destination-Peer-Id: <64-char-hex-key>" \
  -d '{"type":"score","score":95}'

# Receive
curl http://127.0.0.1:9002/recv
# → 200 + X-From-Peer-Id header + body  (message available)
# → 204 No Content                       (empty queue)
```