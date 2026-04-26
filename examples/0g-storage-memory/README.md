# 0G Storage - pact / chat memory (example)

Minimal **Bun + TypeScript** demo: serialize a small “pact memory” JSON snapshot, upload it with [`@0gfoundation/0g-ts-sdk`](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk) + `MemData`, then download with Merkle proof verification.

**Default network is testnet.** Switch with `OG_NETWORK` (`testnet` / `galileo` or `mainnet` / `aristotle`). Endpoints follow [testnet](https://docs.0g.ai/developer-hub/testnet/testnet-overview) and [mainnet](https://docs.0g.ai/developer-hub/mainnet/mainnet-overview) docs; you can still override `RPC_URL` and `INDEXER_RPC` entirely.

This is the same flow you would use later in LoveClaw to treat **0G Storage Log-style** blobs as append-only chat archives (new snapshot → new root hash), while keeping **hot pointers** (latest root per `coupleId`, per-agent cursors) in app state or eventually **0G KV**.

## Prereqs

- [Bun](https://bun.sh/)
- **Testnet:** claim tokens ([faucet.0g.ai](https://faucet.0g.ai)), see [Builder Hub quickstart](https://build.0g.ai/storage/#quickstart)
- **Mainnet:** fund with 0G for gas - [mainnet overview](https://docs.0g.ai/developer-hub/mainnet/mainnet-overview)

## Setup

Use **`.env.local`** for secrets (gitignored). Optional **`.env`** for shared defaults; `.env.local` overrides `.env` for the same key.

```bash
cd examples/0g-storage-memory
cp .env.local.example .env.local
# edit .env.local - set PRIVATE_KEY (0x…)
bun install
```

Committed template: **`.env.local.example`** only (no `.env.example`).

## Run

```bash
# upload sample snapshot → prints rootHash
bun run demo

# download by root hash (from previous step)
bun run src/demo.ts download <rootHash>
```

### Web UI (store / retrieve any UTF-8 text)

Local-only server on **127.0.0.1** (default port **4789**). The browser never sees your private key; the Bun server signs using `.env.local`.

```bash
bun run ui
# open http://127.0.0.1:4789/
# optional 200% preview: top bar 1x / 2x or http://127.0.0.1:4789/?scale=2
```

Start **already at 2x** (server injects a one-line script so `sessionStorage` is set before `app.js` loads):

```bash
UI_START_SCALE=2 bun run ui
# or pass a flag (same process):
bun run ui -- --scale=2
# or npm-style shortcut:
bun run ui:2
```

Use **`UI_START_SCALE=1`** or **`--scale=1`** to prime **1x** on first load (overrides a previously saved 2x in `sessionStorage`). **`?scale=1`** or **`?scale=2`** in the URL still wins over both when you open that URL.

Optional: `UI_PORT=8080 bun run ui` (only that port is tried).

If you omit `UI_PORT` and **4789 is busy** (e.g. another `bun run ui`), the server tries **4790, 4791, …** and prints the URL it bound. To free 4789 on macOS: `lsof -iTCP:4789 -sTCP:LISTEN` then stop that PID.

The UI shows a **spinner** while upload/download run. If **no L1 `tx` hash** appears, the SDK often returned an **empty hash** because the file was **already finalized** on chain (deduplication); the **root hash** and **Storage submission** link (when `txSeq > 0`) still identify the blob. Optional **`WALLET_ADDRESS`** (or derive from `PRIVATE_KEY`) powers **ChainScan → this wallet** (`…/address/0x…`) and **StorageScan → this wallet** ([example on Galileo](https://storagescan-galileo.0g.ai/address/0x1E3542F0Bb496e9eE1d6C0894c690DD91C31705C)) links.

Confirm on storage explorer: **testnet** [storagescan-galileo.0g.ai](https://storagescan-galileo.0g.ai), **mainnet** [storagescan.0g.ai](https://storagescan.0g.ai).

## Network switch

| Variable | Default | Meaning |
|----------|---------|---------|
| `UI_START_SCALE` | _(unset)_ | Optional `1` or `2`: first paint at 1x or 2x UI zoom (same as top bar). Also available as **`bun run ui -- --scale=2`**. |
| `OG_NETWORK` | `testnet` | `testnet` / `galileo` → Galileo testnet; `mainnet` / `aristotle` → 0G Mainnet |
| `RPC_URL` | _(from network)_ | Optional full override |
| `INDEXER_RPC` | _(from network)_ | Optional full override |

Built-in turbo indexer pairs:

- **testnet:** `https://evmrpc-testnet.0g.ai` + `https://indexer-storage-testnet-turbo.0g.ai`
- **mainnet:** `https://evmrpc.0g.ai` + `https://indexer-storage-turbo.0g.ai`

Turbo vs standard indexers are separate deployments; see [Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk).

## Typecheck

```bash
bun run typecheck
```

## Mapping to LoveClaw / hackathon tracks

| 0G piece | Role for “memory” |
|----------|-------------------|
| **Storage (Log)** | Append-only JSON (or JSONL) snapshots of `diary` + `chat` + agent turns; cheap audit trail. |
| **Storage (KV)** | Mutable keys: `pact:<id>:head`, `agent:<id>:state` for mention routing and pact proposals. |
| **Compute** | Optional: summarize / reflect on stored transcripts with sealed inference. |
| **Chain / Agentic ID** | Pact membership, agent registry, ERC-7857 later for agent identity. |

Concept pages: [0G Storage](https://docs.0g.ai/concepts/storage), [INFT](https://docs.0g.ai/concepts/inft). Builder stack overview: [build.0g.ai](https://build.0g.ai/).

## Files

- `src/env.ts` - `.env` / `.env.local` loading and network endpoints.
- `src/storage.ts` - `uploadUtf8Text` / `downloadUtf8Text` (proof on download).
- `src/memory.ts` - `PactMemorySnapshot` shape (CLI sample payload).
- `src/demo.ts` - CLI upload/download.
- `src/server.ts` - local web UI + JSON API.
- `src/wallet.ts` - optional `WALLET_ADDRESS` / derive signer address for explorer links.
- `public/index.html` - browser UI shell.
- `public/app.js` - browser UI logic (loaded by `index.html`).

## Note on AI Alignment nodes

Alignment nodes are for **license holders / NAAS / operators**, not required to use the Storage SDK for uploads. See the [AI Alignment Node guide](https://docs.0g.ai/node-sale/ai-alignment-node-user-guide) if you run or delegate a node.
