# 0G Integration

LoveClaw integrates **0G** at two levels. The first is **0G Memory** (powered by EverMemOS), which stores every relationship event as a structured, searchable memory that persists on the 0G testnet. The second is **0G Storage**, which lets partners archive complete diary snapshots as permanent, content-addressed files on the Galileo testnet using the `@0gfoundation/0g-ts-sdk`. There is also a **0G Compute** option in the AI settings for routing inference through 0G instead of a centralised provider.

## How the pieces fit together

```
loveclaw-app.html
prototype/relay/  ----HTTP---->  memory_router.py  (port 9091)
                                       |
                                       v
                                  EverMemOS  (port 1995)
                                    MongoDB       :27017
                                    Elasticsearch :19200
                                    Milvus        :19530
                                    Redis         :6379
                                    zgs_kv  ---------> 0G testnet
```

Nothing in the app or relay talks to EverMemOS directly. Everything goes through `memory_router.py`, which acts as a thin HTTP wrapper.

## 0G Memory: the Python client

File: [`prototype/relay/memory_client.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py)

This is the single file every relay module imports to read and write memories. It wraps the router's REST API into three clean functions.

| Line | What it does |
|---|---|
| [L8 `MEMORY_ROUTER`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L8) | Points to `memory_router.py` at `localhost:9091` |
| [L11 `_router_post(path, body)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L11) | Internal POST helper that serialises JSON and sends it to the router |
| [L25 `_router_get(path, params)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L25) | Internal GET helper that appends query params and reads the response |
| [L39 `mem_write(group_id, sender_id, ...)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L39) | Writes a raw text memory scoped to a `group_id` (the couple's shared ID) |
| [L54 `mem_search(group_id, query)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L54) | Runs a hybrid semantic and keyword search across all stored memories |
| [L68 `mem_episode(ep_type, data, group_id)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L68) | Writes a typed episode such as `breach`, `diary`, `together`, or `axl_handshake` |

## 0G Memory: configuration

File: [`prototype/relay/config.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/config.py)

| Line | What it does |
|---|---|
| [L12 `MEMORY_ROUTER`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/config.py#L12) | Reads `MEMORY_ROUTER_URL` from env, defaulting to `http://localhost:9091` |
| [L13 `MEMORY_BASE`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/config.py#L13) | Alias referenced throughout the relay server |

## 0G Memory: episodes written automatically

### Breach detection

File: [`prototype/relay/breach_ai.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/breach_ai.py)

When the AI engine detects a dating app on a partner's device (trust score reaches 100), it immediately writes a permanent breach record to 0G Memory.

| Line | What it does |
|---|---|
| [L11 import `mem_episode`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/breach_ai.py#L11) | Pulls in the episode writer from `memory_client` |
| [L259 `mem_episode("breach", ...)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/breach_ai.py#L259) | Writes a `breach` episode to 0G Memory with evidence and timestamp |

### Diary entries and AXL handshakes

File: [`prototype/relay/signal_ingest.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/signal_ingest.py)

Every diary entry the app generates and every time a partner first connects get written to 0G Memory as typed episodes.

| Line | What it does |
|---|---|
| [L66 `mem_episode("diary", sig, cid)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/signal_ingest.py#L66) | Writes a `diary` episode when a diary signal arrives from the app |
| [L68 `mem_episode("axl_handshake", sig, cid)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/signal_ingest.py#L68) | Writes an `axl_handshake` episode the first time a partner connects |

### Together moments

File: [`prototype/relay/together.py`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/together.py)

When the relay detects that both partners are in the same place at the same time, it writes a together moment to 0G Memory automatically.

| Line | What it does |
|---|---|
| [L9 import `mem_episode`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/together.py#L9) | Pulls in the episode writer from `memory_client` |
| [L158 `mem_episode("together", ...)`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/together.py#L158) | Writes a `together` episode when both partners are detected at the same location |

## 0G Storage: uploading diary snapshots from the browser

File: [`src/dashboard/zg-store.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js)

When a partner taps the "Store on 0G" button in the diary tab, the app uploads both a cover image and a full JSON snapshot to the 0G Galileo testnet using the official TypeScript SDK.

### Network endpoints

| Line | Endpoint |
|---|---|
| [L11 `ZG_RPC`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L11) | `https://evmrpc-testnet.0g.ai` — 0G Galileo EVM RPC |
| [L12 `ZG_INDEXER`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L12) | `https://indexer-storage-testnet-turbo.0g.ai` — storage indexer |
| [L13 `ZG_CHAIN`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L13) | `https://chainscan-galileo.0g.ai` — block explorer |
| [L14 `ZG_STORAGE`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L14) | `https://storagescan-galileo.0g.ai` — file and submission explorer |

### Upload flow

| Line | What it does |
|---|---|
| [L346 `onDiaryStoreClick(btn)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L346) | Entry point triggered by the "Store on 0G" button |
| [L411 `_zgUpload(imgBytes, key)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L411) | Uploads the diary cover image to 0G Storage |
| [L436 `_zgUpload(JSON.stringify(snapshot))`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L436) | Uploads the full diary JSON snapshot to 0G Storage |

### SDK calls inside `_zgUpload()` (lines [L453 to L486](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L453-L486))

| Line | SDK call |
|---|---|
| [L455 dynamic import](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L455) | `import("https://esm.sh/@0gfoundation/0g-ts-sdk@1.2.6/browser")` |
| [L458 destructure SDK](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L458) | `const [{ Indexer, MemData }, { ethers }] = deps` |
| [L460 RPC provider](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L460) | `new ethers.JsonRpcProvider(ZG_RPC)` — connects to 0G Galileo testnet |
| [L462 indexer client](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L462) | `new Indexer(ZG_INDEXER)` — creates the 0G storage indexer client |
| [L464 `MemData`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L464) | `new MemData(bytes)` — wraps the file bytes for upload |
| [L469 upload](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L469) | `indexer.upload(mem, ZG_RPC, signer)` — submits the file to 0G and returns a `rootHash` and `txHash` |

## 0G Storage: CLI upload script

File: [`prototype/relay/zg_upload.ts`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts)

A standalone Bun script that uploads arbitrary text to 0G from the terminal using the same SDK pattern as the browser.

| Line | SDK call |
|---|---|
| [L8 import](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts#L8) | `import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk"` |
| [L30 indexer](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts#L30) | `new Indexer(INDEXER)` |
| [L32 `MemData`](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts#L32) | `new MemData(bytes)` |
| [L37 upload](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/zg_upload.ts#L37) | `indexer.upload(mem, RPC, signer)` returns `rootHash`, `txHash`, `txSeq`, and explorer URLs |

```bash
PRIVATE_KEY=0x... ZG_TEXT="diary content" \
  bun run prototype/relay/zg_upload.ts
```

## 0G Compute

In `src/app/ai-settings.js`, **0G Compute** is available as an AI provider option alongside OpenAI and Anthropic. Users can supply a 0G Compute endpoint URL and secret key. When selected, diary generation and breach analysis are routed through 0G inference instead of a centralised API.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `EVERMEMOS_URL` | `http://localhost:1995` | EverMemOS backend URL used by `memory_router.py` |
| `MEMORY_ROUTER_PORT` | `9091` | Port the router listens on |
| `MEMORY_ROUTER_URL` | `http://localhost:9091` | Used by [memory_client.py L8](https://github.com/vm06007/loveclaw/blob/master/prototype/relay/memory_client.py#L8) |
| `LOVECLAW_COUPLE_ID` | `loveclaw` | Default `group_id` scope for all memory writes |
| `ZEROG_DIR` | `~/0g-memory` | Path to the cloned 0g-memory repo, used by docker-up/down |
| `VITE_ZG_PRIVATE_KEY` | (none) | Wallet key for 0G Storage uploads from the browser |

## Docker setup

```bash
git clone https://github.com/0gfoundation/0g-memory ~/0g-memory
cp ~/0g-memory/env.template.0g.example ~/0g-memory/.env
# Fill in: LLM_API_KEY, VECTORIZE_API_KEY, RERANK_API_KEY, ZEROG_WALLET_KEY

python3 memory_router.py docker-up   # starts MongoDB, Elasticsearch, Milvus, Redis, zgs_kv
python3 memory_router.py serve       # starts the HTTP router on port 9091
```
