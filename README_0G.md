# 0G Integration

LoveClaw integrates **0G** across three layers. Every partner gets an **AI agent minted as an ERC-7857 NFT on 0G Galileo testnet**. That agent wallet then signs 0G Storage uploads and is recorded on the LoveClawPact smart contract as the authorised breach-filing address. On top of that, **0G Memory** (powered by EverMemOS) stores every relationship event as a structured, searchable memory that also persists on the 0G testnet. There is also a **0G Compute** option in the AI settings for routing inference through 0G instead of a centralised provider.

Repo, live demos, team, deployed contracts, and full stack overview: [README.md](./README.md) (**Sponsors and integrations**, **Smart contract: LoveClawPact**, **Running locally**, **Architecture overview**).

---

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

## 0G Agentic ID: minting an AI agent as an NFT

File: [`src/lib/agentic-id.js`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js)

Each partner mints a personal AI agent on the 0G Galileo testnet using the **ERC-7857 Agentic ID** standard. The NFT represents the agent's identity. After minting, the app generates a fresh Ethereum wallet for that agent and authorises it on-chain so it can sign transactions and file breach evidence on the partner's behalf.

### Contract and network

| Line | Detail |
|---|---|
| [L1 file header](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L1) | Identifies the file as "0G Agentic ID (ERC-7857) on 0G Galileo testnet" |
| [L3 `CONTRACT_ADDRESS`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L3) | `0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F` — the ERC-7857 contract on 0G Galileo |
| [L4 `ZG_CHAIN_ID = 16602`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L4) | 0G Galileo testnet chain ID |

### Contract ABI functions used

| Line | Function |
|---|---|
| [L25 `mintFee`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L25) | Reads the current minting fee from the contract before calling `iMint` |
| [L32 `iMint`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L32) | Mints the ERC-7857 NFT, receiving the agent's name, model, capabilities, and system prompt as data hashes |
| [L66 `authorizeUsage`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L66) | Authorises a wallet address to act on behalf of the NFT |
| [L11 `delegateAccess`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L11) | Delegates signing rights to the agent wallet so it can transact on the owner's behalf |

### Minting and agent wallet setup: `registerAgenticId()`

| Line | What it does |
|---|---|
| [L138 function entry](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L138) | `registerAgenticId(agentName, onStatus)` — the main registration flow |
| [L154 contract setup](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L154) | Creates an ethers `Contract` instance pointed at the ERC-7857 contract on 0G Galileo |
| [L156 read mint fee](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L156) | Calls `contract.mintFee()` to get the required payment |
| [L167 mint NFT](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L167) | Calls `contract.iMint(walletAddress, datas, { value: mintFee })` — mints the agent NFT and pays the fee |
| [L188 generate agent wallet](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L188) | `ethers.Wallet.createRandom()` — creates a fresh throwaway wallet to act as the agent |
| [L190 authorize agent](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L190) | `contract.authorizeUsage(tokenId, agentWallet.address)` — links the agent wallet to the NFT on-chain |
| [L195 delegate agent](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L195) | `contract.delegateAccess(agentWallet.address)` — grants the agent wallet signing rights |

### Setting up an agent wallet for an existing NFT: `setupAgentWallet()`

If a user already owns the NFT but has not yet authorised an agent wallet (for example after switching devices), this function handles it.

| Line | What it does |
|---|---|
| [L208 function entry](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L208) | `setupAgentWallet(tokenId, onStatus)` |
| [L225 authorize](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L225) | `contract.authorizeUsage(tokenId, agentWallet.address)` |
| [L229 delegate](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L229) | `contract.delegateAccess(agentWallet.address)` |

### Silent lookup and explorer links

| Line | What it does |
|---|---|
| [L239 `silentLookup()`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L239) | Checks MetaMask silently (no user prompt) to see if the connected wallet already owns an agent NFT |
| [L254 `lookupAgenticTokenId(walletAddress)`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L254) | Read-only lookup on the 0G RPC to find a token ID for any wallet address |
| [L269 `agenticExplorerUrl(tokenId)`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agentic-id.js#L269) | Returns a direct link to the NFT on the 0G Chainscan explorer |

## 0G Agentic ID: agent key encryption

File: [`src/lib/agent-key-store.js`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agent-key-store.js)

After the agent wallet is generated, its private key is encrypted with a PIN and stored in localStorage so the user never has to paste it again. The same module handles the couple's shared vault key.

| Line | What it does |
|---|---|
| [L8-L10 constants](https://github.com/vm06007/loveclaw/blob/master/src/lib/agent-key-store.js#L8-L10) | `PBKDF2_ITERATIONS = 150_000`, storage keys for agent and vault |
| [L20 `_deriveKey(pin, salt)`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agent-key-store.js#L20) | Derives an AES-GCM key from the user's PIN using PBKDF2 with SHA-256 |
| [L38 `encryptAndStoreKey(privateKey, pin)`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agent-key-store.js#L38) | Encrypts the agent private key with AES-GCM and saves it to localStorage |
| [L55 `decryptStoredKey(pin)`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agent-key-store.js#L55) | Decrypts and returns the agent private key; throws if the PIN is wrong |
| [L69 `hasEncryptedKey()`](https://github.com/vm06007/loveclaw/blob/master/src/lib/agent-key-store.js#L69) | Returns true if an encrypted key exists in localStorage |

## 0G Agentic ID: profile display and agent registration UI

File: [`src/app/coop-profile.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js)

The profile screen is where users mint their agent NFT, see their "OG Agent Address NFT ID", and view their partner's agent identity.

| Line | What it does |
|---|---|
| [L3 imports](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L3) | Imports `registerAgenticId`, `setupAgentWallet`, `silentLookup`, `CONTRACT_ADDRESS`, and explorer URL helpers from `agentic-id.js` |
| [L290 register button](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L290) | Calls `registerAgenticId(agentName, ...)` when the user taps the register button |
| [L296 save token ID](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L296) | Stores `agenticTokenId` in the user's profile after minting |
| [L298 save wallet address](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L298) | Stores `agentWalletAddress` in the user's profile |
| [L203 setup existing NFT](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L203) | Calls `setupAgentWallet(tokenId, ...)` if the user has an NFT but no agent wallet yet |
| [L208 save wallet after setup](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L208) | Saves the newly created `agentWalletAddress` to the profile |
| [L670 "OG Agent Address" label](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L670) | Renders the "OG Agent Address" label in the profile UI |
| [L673 NFT ID link](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L673) | Shows `NFT ID #X` as a clickable link to the 0G Chainscan explorer |
| [L689 existing NFT display](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L689) | Renders `NFT ID #X` for users who already have an agent registered |
| [L701 silent lookup on load](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L701) | Calls `silentLookup()` when the profile opens to auto-fill the NFT ID if MetaMask is already connected |
| [L710 auto-fill label](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L710) | Updates the label to show `OG Agent Address NFT ID #X` after a successful silent lookup |
| [L815-L825 partner's agent](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L815-L825) | Reads the partner's `agenticTokenId` from their synced profile and shows their NFT ID with an explorer link |

Both `agenticTokenId` and `agentWalletAddress` are part of the app's state schema, so they sync to the partner over AXL when profiles are shared. Their empty defaults live in [`src/lib/state.js L14-L15`](https://github.com/vm06007/loveclaw/blob/master/src/lib/state.js#L14-L15) (own profile) and [`L26-L27`](https://github.com/vm06007/loveclaw/blob/master/src/lib/state.js#L26-L27) (partner profile).

## 0G Agentic ID: agent address flows into the smart contract

File: [`src/lib/pact-contract.js`](https://github.com/vm06007/loveclaw/blob/master/src/lib/pact-contract.js)

When creating a LoveClawPact on Ethereum, the agent addresses are derived deterministically from each partner's wallet. These are the on-chain addresses that the smart contract will accept breach filings from.

| Line | What it does |
|---|---|
| [L147 `deriveContractAddresses(walletAddress)`](https://github.com/vm06007/loveclaw/blob/master/src/lib/pact-contract.js#L147) | Derives `agentA` and `agentB` addresses by hashing the wallet address with a fixed salt |
| [L153 `agentA`](https://github.com/vm06007/loveclaw/blob/master/src/lib/pact-contract.js#L153) | `keccak256(walletAddress + ":lc:agentA")` |
| [L154 `agentB`](https://github.com/vm06007/loveclaw/blob/master/src/lib/pact-contract.js#L154) | `keccak256(walletAddress + ":lc:agentB")` |
| [L60 `callCreatePact(...)`](https://github.com/vm06007/loveclaw/blob/master/src/lib/pact-contract.js#L60) | Accepts `agentA` and `agentB` as parameters |
| [L86 on-chain call](https://github.com/vm06007/loveclaw/blob/master/src/lib/pact-contract.js#L86) | `contract.createPact(partnerB, agentA, agentB, bits, { value })` — commits both agent addresses permanently to Ethereum |

In [`src/screens/create.js`](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js), [L226](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L226) calls `deriveContractAddresses(wallet)` and [L242-L243](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L242-L243) passes the result into `callCreatePact`.

## 0G Agentic ID: agent wallet signs 0G Storage uploads

File: [`src/dashboard/zg-store.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js)

When a partner taps "Store on 0G", the agent wallet private key is decrypted and used as the signer for the 0G Storage upload. The diary snapshot also includes the agent wallet address in its metadata so the stored file is permanently linked to the on-chain agent identity.

| Line | What it does |
|---|---|
| [L352 agent wallet check](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L352) | Blocks the upload if no `agentWalletAddress` is registered yet |
| [L423 include in snapshot](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L423) | Adds `agentWalletAddress` to the diary JSON snapshot that gets stored on 0G |
| [L438 set agent address](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/zg-store.js#L438) | Sets `data.agentAddress` so the upload carries the agent's identity |

The agent wallet also serves as the swapper identity in [`src/app/lovclaw-ai.js L464`](https://github.com/vm06007/loveclaw/blob/master/src/app/lovclaw-ai.js#L464), where `agentWalletAddress` is used as the `swapper` parameter for on-chain operations.

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

**Hackathon uploads:** all diary **Store on 0G** files from the hackathon demo are visible on [0G StorageScan for `0xD319693b334FBAb00aA455a119C36763F00Ca3bB`](https://storagescan-galileo.0g.ai/address/0xD319693b334FBAb00aA455a119C36763F00Ca3bB) (Galileo testnet).

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
