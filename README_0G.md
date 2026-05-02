# 0G Integration — LoveClaw

LoveClaw uses **0G** across two distinct product tiers:

| Tier | Technology | What it stores |
|---|---|---|
| **0G Memory (EverMemOS)** | `memory_router.py` → EverMemOS → `zgs_kv` → 0G testnet | Diary entries, breach episodes, together moments, AXL handshakes — structured, searchable, on-chain |
| **0G Storage** | `@0gfoundation/0g-ts-sdk` (`Indexer`, `MemData`) | Full diary snapshots with images — permanent, content-addressed files on Galileo testnet |
| **0G Compute** | AI provider option in settings | Inference endpoint for diary generation and breach analysis |

---

## 0G Memory (EverMemOS)

### Architecture

```
loveclaw-app.html  ──┐
                     │  HTTP
prototype/relay/ ────┼──▶  memory_router.py :9091
                     │         │
                     │         ▼
                     │     EverMemOS :1995
                     │       ├── MongoDB  :27017  (memory documents)
                     │       ├── Elasticsearch :19200  (keyword index)
                     │       ├── Milvus  :19530  (vector embeddings)
                     │       ├── Redis   :6379   (cache)
                     │       └── zgs_kv  ──────▶ 0G testnet (permanent)
```

### Python HTTP Client — [`prototype/relay/memory_client.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py)

Every relay module goes through this file — nothing talks to EverMemOS directly.

| Code | Purpose |
|---|---|
| [`L8` — `MEMORY_ROUTER`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L8) | Points to `memory_router.py` at `localhost:9091` |
| [`L11` — `_router_post(path, body)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L11) | POST helper — sends JSON to the router |
| [`L25` — `_router_get(path, params)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L25) | GET helper — query params appended as URL string |
| [`L39` — `mem_write(group_id, sender_id, ...)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L39) | Writes a raw text memory to EverMemOS under a `group_id` |
| [`L54` — `mem_search(group_id, query)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L54) | Hybrid semantic + keyword search across stored memories |
| [`L68` — `mem_episode(ep_type, data, group_id)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L68) | Writes a typed episode (`breach`, `diary`, `together`, `axl_handshake`, …) |

### Configuration — [`prototype/relay/config.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/config.py)

| Code | Purpose |
|---|---|
| [`L12` — `MEMORY_ROUTER`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/config.py#L12) | `os.environ.get("MEMORY_ROUTER_URL", "http://localhost:9091")` |
| [`L13` — `MEMORY_BASE`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/config.py#L13) | Alias used by the relay server for all memory calls |

---

### Episode Types Written Automatically

#### Breach episode — [`prototype/relay/breach_ai.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/breach_ai.py)

| Code | Purpose |
|---|---|
| [`L11` — `from .memory_client import mem_episode`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/breach_ai.py#L11) | Imports episode writer |
| [`L259` — `mem_episode("breach", …)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/breach_ai.py#L259) | Writes a `breach` episode to 0G Memory when a dating app is detected (score ≥ 100) |

#### Diary & handshake episodes — [`prototype/relay/signal_ingest.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/signal_ingest.py)

| Code | Purpose |
|---|---|
| [`L66` — `mem_episode("diary", sig, cid)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/signal_ingest.py#L66) | Writes a `diary` episode when a diary signal is received from the app |
| [`L68` — `mem_episode("axl_handshake", sig, cid)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/signal_ingest.py#L68) | Writes an `axl_handshake` episode when partner first connects |

#### Together episode — [`prototype/relay/together.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/together.py)

| Code | Purpose |
|---|---|
| [`L9` — `from .memory_client import mem_episode`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/together.py#L9) | Imports episode writer |
| [`L158` — `mem_episode("together", …)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/together.py#L158) | Writes a `together` episode when both partners are detected in the same location |

---

## 0G Storage (File Upload)

### Network Constants — [`src/dashboard/zg-store.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js)

| Code | Value |
|---|---|
| [`L11` — `ZG_RPC`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L11) | `https://evmrpc-testnet.0g.ai` — 0G Galileo EVM RPC |
| [`L12` — `ZG_INDEXER`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L12) | `https://indexer-storage-testnet-turbo.0g.ai` — storage indexer |
| [`L13` — `ZG_CHAIN`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L13) | `https://chainscan-galileo.0g.ai` — block explorer |
| [`L14` — `ZG_STORAGE`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L14) | `https://storagescan-galileo.0g.ai` — file/submission explorer |

### Upload Flow — [`src/dashboard/zg-store.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js)

| Code | Step |
|---|---|
| [`L346` — `onDiaryStoreClick(btn)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L346) | Entry point — triggered by the "Store on 0G" button in the diary tab |
| [`L411` — `_zgUpload(imgBytes, key)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L411) | Uploads diary cover image to 0G Storage |
| [`L436` — `_zgUpload(JSON.stringify(snapshot))`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L436) | Uploads full diary JSON snapshot to 0G Storage |

### `_zgUpload()` — [`src/dashboard/zg-store.js L453–L486`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L453-L486)

| Code | SDK call |
|---|---|
| [`L455` — dynamic import](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L455) | `import("https://esm.sh/@0gfoundation/0g-ts-sdk@1.2.6/browser")` |
| [`L458` — destructure SDK](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L458) | `const [{ Indexer, MemData }, { ethers }] = deps` |
| [`L460` — RPC provider](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L460) | `new ethers.JsonRpcProvider(ZG_RPC)` — connects to 0G Galileo testnet |
| [`L462` — indexer](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L462) | `new Indexer(ZG_INDEXER)` — 0G storage indexer client |
| [`L464` — `MemData`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L464) | `new MemData(bytes)` — wraps file bytes for 0G upload |
| [`L469` — upload](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L469) | `indexer.upload(mem, ZG_RPC, signer)` — submits file to 0G, returns `rootHash` + `txHash` |

---

### CLI Upload Script — [`prototype/relay/zg_upload.ts`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts)

Standalone Bun script for uploading arbitrary text to 0G from the terminal. Uses the identical SDK pattern.

| Code | SDK call |
|---|---|
| [`L8` — import](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts#L8) | `import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk"` |
| [`L30` — indexer](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts#L30) | `new Indexer(INDEXER)` |
| [`L32` — `MemData`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts#L32) | `new MemData(bytes)` |
| [`L37` — upload](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts#L37) | `indexer.upload(mem, RPC, signer)` → returns `rootHash`, `txHash`, `txSeq`, explorer URLs |

```bash
PRIVATE_KEY=0x... ZG_TEXT="diary content" \
  bun run prototype/relay/zg_upload.ts
```

---

## 0G Compute (AI Provider)

In `src/app/ai-settings.js`, **0G Compute** is offered as an AI provider option alongside OpenAI and Anthropic. Users supply a 0G Compute endpoint URL and secret key. When selected, diary generation and breach analysis calls are routed to 0G inference instead of a centralised API.

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `EVERMEMOS_URL` | `http://localhost:1995` | EverMemOS backend URL (set in `memory_router.py`) |
| `MEMORY_ROUTER_PORT` | `9091` | Port the router listens on |
| `MEMORY_ROUTER_URL` | `http://localhost:9091` | Used by [`memory_client.py L8`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L8) |
| `LOVECLAW_COUPLE_ID` | `loveclaw` | Default `group_id` scope for all memory writes |
| `ZEROG_DIR` | `~/0g-memory` | Path to cloned 0g-memory repo (for docker-up/down) |
| `VITE_ZG_PRIVATE_KEY` | — | Wallet key for 0G Storage uploads (browser) |

---

## Docker Setup (0G Memory stack)

```bash
git clone https://github.com/0gfoundation/0g-memory ~/0g-memory
cp ~/0g-memory/env.template.0g.example ~/0g-memory/.env
# Fill in: LLM_API_KEY, VECTORIZE_API_KEY, RERANK_API_KEY, ZEROG_WALLET_KEY

python3 memory_router.py docker-up   # starts MongoDB, Elasticsearch, Milvus, Redis, zgs_kv
python3 memory_router.py serve       # starts the HTTP router on :9091
```
