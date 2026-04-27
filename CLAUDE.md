# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LoveClaw is a relationship trust monitoring app — a hackathon 2026 project. Two partners install it on their devices, pair via an invite link, and their devices communicate directly peer-to-peer over AXL (no server).

## Running

```bash
# 1. Serve the web app (required for service worker)
python3 -m http.server 8080
open http://localhost:8080/loveclaw-app.html

# 2. Signal relay — receives signals, breach analysis, SSE console (prototype/relay/)
python3 prototype/signal-relay.py
# → http://localhost:9090/  (serves prototype/console + static /examples, /prototype)

# 3. Memory router — wraps 0G Memory / EverMemOS (optional, needs Docker)
python3 memory_router.py serve
# → http://localhost:9091/

# 4. Start 0G Memory Docker stack (one-time setup, then leave running)
#    First: git clone https://github.com/0gfoundation/0g-memory ~/0g-memory
#           cp ~/0g-memory/env.template.0g.example ~/0g-memory/.env
#           # fill in LLM_API_KEY, VECTORIZE_API_KEY, RERANK_API_KEY, ZEROG_WALLET_KEY
python3 memory_router.py docker-up
```

## Architecture

The app has four local services, all on `localhost`:

```
Browser (loveclaw-app.html)
    ├── LoveClaw        localhost:18789  — reads device signals (apps, notifs, location, motion)
    ├── AXL             localhost:9002   — P2P mesh to partner's device (breach, score, diary)
    ├── Signal Relay    localhost:9090   — AI breach engine + SSE signal console
    └── Memory Router   localhost:9091   — 0G Memory wrapper (persists episodes on-chain)

Memory Router (memory_router.py)
    └── EverMemOS       localhost:1995   — started via Docker (docker compose in ~/0g-memory)
            ├── MongoDB        :27017    — memory document store
            ├── Elasticsearch  :19200    — keyword search index
            ├── Milvus         :19530    — vector embeddings
            ├── Redis          :6379     — cache layer
            └── zgs_kv binary            → 0G testnet blockchain (encrypted, permanent)
```

### Modules inside the HTML

**`LoveClaw` object** (`/api/invoke`, `/api/status`)
Calls the LoveClaw local agent to read device signals. Used by `runHeartbeat()` and `generateDiaryEntry()`. Falls back to demo mode if offline.

**`AXL` object** (`/topology`, `/send`, `/recv`)
Handles all partner communication. See `AXL.md` for protocol details and message types. Key methods: `init()`, `send(peerKey, data)`, `recv()`, `startPolling()`.

**`handleAxlMessage(msg)`**
Dispatches inbound AXL messages by `type`: `axl_handshake`, `breach`, `score`, `diary`.

### Screens

`screen-home` → `screen-create` → `screen-code` (shows QR + invite link)
`screen-join` (joiner enters name + code)
`screen-paired` → `screen-dashboard` (tabs: today / signals / diary / pact)
`screen-LoveClaw` (setup for both LoveClaw and AXL)

### State

All state lives in a single `state` object, persisted to `localStorage` as `loveclaw-state`.

```javascript
{
  myName, partnerName, coupleId, code,
  triggers,        // agreed breach triggers
  createdAt,
  paired,          // bool — drives auto-redirect to dashboard on load
  myAxlKey,        // own AXL public key (64-char hex)
  partnerAxlKey    // partner's AXL public key
}
```

### Pairing flow

1. Creator generates invite URL — AXL key is embedded in the base64 pact
2. Joiner clicks link — extracts creator's AXL key from URL, sends back handshake over AXL
3. Both sides store each other's keys; polling starts; all subsequent messages are P2P

### Breach detection

Rule engine in `LoveClaw.checkBreachSignals()`. Checks installed apps and notifications for dating app package names (`tinder`, `bumble`, `hinge`, `grindr`, `badoo`, `okcupid`, `match`). Score ≥ 100 triggers the breach overlay and sends a `breach` message to partner over AXL.

## Design Language

Dark cyberpunk / 8-bit retro. CSS variables in `:root`:
- Teal: `--teal: #5DCAA5` / `--teal-d: #1D9E75`
- Purple: `--purple: #534AB7` / `--purple-l: #AFA9EC`
- Pink: `--pink: #D4537E` / `--pink-l: #ED93B1`
- Amber: `--amber: #FAC775`
- Red: `--red: #E24B4A`
- Background: `--bg: #07070f` / `--bg2: #0d0d1e`
- Font: `'Press Start 2P'` (Google Fonts, 8-bit pixel)

## Memory Router (`memory_router.py`)

Thin HTTP wrapper around EverMemOS (the 0G Memory backend). Runs at port 9091.
`prototype/signal-relay.py` (code in `prototype/relay/`) and `loveclaw-app.html` both call this — never talk to EverMemOS directly.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Router + backend health check |
| GET | `/status` | Full status: counts, recent memories, docker ps |
| GET/POST | `/config` | Get/set couple_id (group scope for all writes) |
| POST | `/write` | Write a raw memory `{ group_id, sender, content }` |
| POST | `/episode` | Write a typed episode — breach / together / diary / score / axl_handshake / location |
| GET | `/search?q=...&group_id=...` | Semantic search (hybrid by default) |
| GET | `/recent?group_id=...&n=20` | Fetch most recent N memories |
| DELETE | `/memories?group_id=...` | Delete all memories for a group |

### Episode types written automatically

| Trigger | Written by |
|---|---|
| Breach detected (dating app) | `prototype/relay/breach_ai.py → analyse_async()` |
| Together episode (both in same location) | `prototype/relay/together.py → check_together_episode()` |
| Diary entry generated | `prototype/relay/signal_ingest.py` (receives diary signal from app) |
| AXL handshake (partner connects) | `prototype/relay/signal_ingest.py` |
| Diary context for generation | `loveclaw-app.html → generateDiaryEntry()` queries `/search` |

### Docker setup (one-time)

```bash
# 1. Clone and configure
git clone https://github.com/0gfoundation/0g-memory ~/0g-memory
cp ~/0g-memory/env.template.0g.example ~/0g-memory/.env
# Edit ~/0g-memory/.env — required keys:
#   LLM_API_KEY        any OpenAI-compatible key (OpenRouter, OpenAI, etc.)
#   VECTORIZE_API_KEY  same as LLM_API_KEY if using OpenAI
#   RERANK_API_KEY     DeepInfra key (deepinfra.com — free tier available)
#   ZEROG_WALLET_KEY   EVM wallet private key with 0G testnet tokens
#                      (email team@0g.ai for testnet tokens — see their README Appendix C)

# 2. Install (sets up Python deps + zgs_kv binary, skips Claude Code hooks if not wanted)
cd ~/0g-memory && ./install.sh

# 3. Start stack (first run pulls ~4 GB Docker images)
./start_service.sh

# 4. Or use the router CLI helper:
python3 memory_router.py docker-up
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `EVERMEMOS_URL` | `http://localhost:1995` | EverMemOS backend URL |
| `MEMORY_ROUTER_PORT` | `9091` | Port this router listens on |
| `ZEROG_DIR` | `~/0g-memory` | Path to cloned 0g-memory repo (for docker-up/down) |
| `LOVECLAW_COUPLE_ID` | `loveclaw` | Default group_id for all memory writes |
| `MEMORY_ROUTER_URL` | `http://localhost:9091` | Used by `prototype/relay/memory_client.py` to reach the router |

### CLI

```bash
python3 memory_router.py serve                    # start the router server
python3 memory_router.py status                   # health + memory counts
python3 memory_router.py write "text" -g mycouple # write one memory
python3 memory_router.py search "query"           # search memories
python3 memory_router.py recent -n 30             # list recent memories
python3 memory_router.py docker-up                # start 0g-memory Docker stack
python3 memory_router.py docker-down              # stop  0g-memory Docker stack
python3 memory_router.py docker-logs              # tail EverMemOS logs
```

## Allowed WebFetch Domains

Per `.claude/settings.local.json`:
- `openclaw.ai`
- `en.wikipedia.org`
- `github.com`
