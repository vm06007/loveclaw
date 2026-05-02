# LoveClaw — Trust & Accountability System

> *The A.I. Arbiter for Connected Couples*

Built for **AgentHack 2026**.

---

## 1. Product overview

LoveClaw is a **relationship pact app** for two people who **opt in** to mutual accountability: local agents read **consented** device signals, a **pact** defines what counts as a breach, and the two phones sync **peer-to-peer over AXL** — not through a central “couples server.” Optional pieces add **AI diary**, **signal relay analysis**, **0G-backed memory**, and **vault / Uniswap** demos.

**Disclaimer:** hackathon **prototype** — not production security, custody, or legal advice.

---

## 2. Conceptual diagram

```
Phone A                                    Phone B
┌─────────────────┐                       ┌─────────────────┐
│ Local Agent     │◄──── AXL P2P mesh ───►│ Local Agent     │
│  · App usage    │                       │  · App usage    │
│  · Location     │   Mutual Rules        │  · Location     │
│  · Signals      │◄── Evaluation  ──────►│  · Signals      │
└────────┬────────┘                       └────────┬────────┘
         │                                         │
         └──────────────┬──────────────────────────┘
                        ▼
              ┌──────────────────┐
              │  Breach detected?│
              └──────┬─────┬────┘
                   NO│     │YES
                     │     ▼
                     │  Smart Contract
                     │  (ETH Collateral Locked)
                     │        │
                     │  ┌─────┴──────────────┐
                     │  │ Breach Alert Sent! │
                     │  │ Penalty Applied /  │
                     │  │ Funds Released     │
                     │  └────────────────────┘
                     ▼
             Monitoring continues
```

---

## 3. Device agent & consent

| Topic | Content |
|-------|---------|
| **Role** | A **LoveClaw agent** on each device reads signals the product exposes and the user consents to. |
| **In scope** | App usage **metadata**, GPS / network location, battery & charging, foreground app / package focus, **notification categories** (not message bodies), screen-on / unlock patterns, optional heartbeat-style presence. |
| **Out of scope** | Private DM text, keystrokes, notification bodies — not part of the stated model. |

---

## 4. Pairing two devices

| Step | Who | What happens |
|------|-----|----------------|
| 1 | Creator | Builds a pact, generates **invite** (QR / link). Payload includes agreed triggers, optional stake, custom rules, and **creator AXL public key**. |
| 2 | Joiner | Opens invite, finishes join UI, sends **`axl_handshake`** over AXL with name / couple id / optional instance tag. |
| 3 | Both | Store each other’s keys; polling starts; ongoing sync is **P2P over AXL** (in dev, still localhost mesh endpoints). |

---

## 5. AXL — peer-to-peer mesh

**Scope:** transport and identity **only**. Business rules live in **§6 Pacts** and **§7 Signals**; storage in **§12 0G**; swaps in **§11 Uniswap**.

| Topic | Detail |
|-------|--------|
| **Purpose** | Partner messages do not require a central LoveClaw couple backend. |
| **API** | HTTP to mesh nodes: `topology`, `send`, `recv`. |
| **Dev ports** | Typically **:9002** and **:9012** (two-node Alice/Boris layout) via Vite proxy; Tauri release uses `127.0.0.1:9002` / `9012`. |
| **Keys** | Ed25519 public keys from topology; invite binds joiner to creator key. |
| **Handshake** | Message type `axl_handshake` (names, couple id, optional **instance tag** for cohort / replay hygiene). |
| **Post-pair message families** | Includes `breach`, `score`, `diary`, diary notes, `pact_changes_propose` / accept flow, pings, optional location-share handshakes for the map. |

**Run two nodes:** `examples/axl-demo/` (Go `axl/node`). From repo root, `bash run.sh` can start nodes + open two browser roles; for daily dev use **`bun run dev`** after nodes are up (see **§14**).

**If AXL is down:** pairing and live sync degrade; the web app may still run in demo/offline modes.

---

## 6. Pacts & rules

**Scope:** what the couple agrees to and how **agents + UI** update the pact. **Not** mesh wire format (that is **§5**); **not** relay implementation (**§8**).

### 6.1 Built-in pact rows

| Id | Role |
|----|------|
| `dating_app` | Dating-oriented installs from app metadata / relay-assisted signals. |
| `location` | Movement vs routine — stops, routes, timing. |
| `contact` | Long unexplained offline while battery suggests the phone could be on. |
| `diary` | **Automation** — AI daily diary from shared context (not a breach monitor by default). |

### 6.2 Dynamic rules (pact architect)

| Piece | Behavior |
|-------|----------|
| **Entry point** | **@loveclaw** in chat + configured LLM (**§13**). |
| **Structured outcomes** | JSON: `propose_rule`, `need_info`, `not_possible`, `chat`. |
| **`propose_rule`** | Inserts a **custom** row (id, label, hint, category) and sends **`pact_changes_propose`** over **AXL**; the other person must **accept** before triggers change. |
| **Copilot constraint** | Only proposes rules that could be approximated from **§3** signals (apps, names, notification metadata, time, location bands, etc.). |

### 6.3 Example pact intents (illustrative)

| Intent | Detection idea (high level) |
|--------|-----------------------------|
| No dating / hookup apps | Built-in `dating_app` + relay dating/hookup classification. |
| No custodial exchange apps; non-custodial wallets OK | Custom rule + **app inventory**: e.g. **Kraken** / **Binance**-style client packages vs **Bitcoin.com**-style self-custody wallet — former flagged under that pact, latter not. Exact packages vary by store/region; **hint** text records what you two mean. |
| Screen-off by midnight (weeknights) | Time windows + screen-on / unlock signals. |

### 6.4 Enforcement note

| Layer | Today |
|-------|--------|
| **Relay `breach_ai.py`** | Tuned for **dating / hookup**-style classification + keyword fallback. |
| **Custom rule ids** | First-class in **state, invite, UI**; per–rule-id server classifiers are **extension work** beyond the reference relay. |

---

## 7. Signals, heartbeat & profiling

**Scope:** what the **couple sees** from device data. **Not** the Python relay service (**§8**); not AXL framing (**§5**).

| Topic | Detail |
|-------|--------|
| **Heartbeat** | Periodic aggregation of recent signals for the **Today** tab. |
| **Heartbeat map** | Leaflet map: your position; after **mutual** location-share accept, partner pin. |
| **Profiling (product sense)** | Consented **activity profile** — where/when apps and presence patterns show up in UI and history. |
| **Profiling (engineering)** | Browser DevTools Performance; or **§8** SSE console for ingest / breach stream. |

---

## 8. Signal relay service

**Scope:** the **Python** service on **localhost:9090**. **Not** 0G (**§12**); not Uniswap (**§11**).

| Topic | Detail |
|-------|--------|
| **Code** | `prototype/relay/` + `prototype/signal-relay.py`. |
| **Role** | Ingests signal batches, runs **`breach_ai.py`** (optional Claude + keyword fallback), broadcasts events over **SSE** to the operator console, can forward episodes toward the memory router. |
| **UI** | Console at `http://localhost:9090/` (with static/console assets as wired in the relay). |

---

## 9. Diary & AI copilot

**Scope:** diary generation and **@loveclaw** chat UX. **Not** the full provider matrix (**§13**).

| Topic | Detail |
|-------|--------|
| **Diary** | Context bundle (signals + notes) → LLM prompt → pixel-art image (e.g. **Gemini** via OpenRouter) → calendar; partner artifacts sync over **AXL**. |
| **Chat** | **@loveclaw** for pact help, quick seeds (e.g. swap phrasing, “new rule: …”), and **§6** pact architect flows. |

---

## 10. Vault & ETH stake

**Scope:** mutual commitment **story** in the UI / demos. **Not** Uniswap API details (**§11**).

| Topic | Detail |
|-------|--------|
| **Stake** | Optional proposed ETH at invite time; displayed as shared commitment. |
| **Vault** | Joint wallet narrative for demos; breach / penalty flows tie into product storytelling. |

### 10.1 LoveClawPact — deployed smart contract

The on-chain pact contract is **live and verified on Ethereum mainnet**.

| Field | Value |
|-------|-------|
| **Contract** | `LoveClawPact` |
| **Address** | [`0x597a01608952220f1d833c833111731E6762085c`](https://etherscan.io/address/0x597a01608952220f1d833c833111731e6762085c) |
| **Network** | Ethereum mainnet (chain 1) |
| **Verified** | ✅ [Etherscan source verified](https://etherscan.io/address/0x597a01608952220f1d833c833111731e6762085c#code) |
| **Source** | `evm/src/LoveClawPact.sol` |
| **Compiler** | Solidity `0.8.30`, optimizer 200 runs |

**Key functions:**

| Function | Who | What |
|----------|-----|------|
| `createPact(partnerB, agentA, agentB, triggers)` | Partner A | Creates pact, deposits stake A |
| `joinPact(pactId)` | Partner B | Joins and deposits stake B |
| `initiateInstantBreach(pactId, accused, evidence)` | Agent | First agent files instant breach |
| `confirmInstantBreach(pactId)` | Other agent | Second agent confirms → victim receives full stake immediately |
| `rejectInstantBreach(pactId)` | Other agent | Second agent rejects → pact returns to Active |
| `fileBreachWithDelay(pactId, accused, evidence, window)` | Agent | Files breach with dispute window (default 24 h, max 7 days) |
| `disputeBreach(pactId)` | Accused partner | Disputes within the window |
| `claimBreachPayout(pactId)` | Innocent partner | Claims full stake after window expires undisputed |
| `dissolvePact(pactId)` | Either partner | Mutual dissolution — splits stake 50/50 |
| `proposeTriggerAmendment` / `acceptTriggerAmendment` | Partners | Two-step trigger bitmask amendment |

**Trigger bitmask constants:**

| Constant | Value | Meaning |
|----------|-------|---------|
| `TRIGGER_DATING_APP` | `1` | Dating app detected |
| `TRIGGER_LOCATION` | `2` | Location anomaly |
| `TRIGGER_CONTACT` | `4` | Contact anomaly |
| `TRIGGER_DIARY` | `8` | Diary signal |

**To redeploy or run tests:**

```bash
cd evm
forge build
forge test
forge script script/Deploy.s.sol:Deploy \
  --rpc-url <RPC_URL> \
  --private-key $PRIVATE_KEY \
  --broadcast --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

---

## 11. Uniswap integration

**Scope:** **Uniswap Trading API v1** + vault signing path **only**. **Not** general DeFi (**§10** is stake narrative); **not** 0G.

| Topic | Detail |
|-------|--------|
| **Network** | **Ethereum mainnet** quotes / calldata in reference implementation. |
| **Code** | `src/app/swap.js` — `POST /uniswap/v1/quote`, `POST /uniswap/v1/swap`; broadcast via **ethers** + public RPC rotation. |
| **Secrets** | `VITE_UNISWAP_API_KEY` in `.env` (see `.env.example`) or Uniswap key in **AI settings** where exposed. |
| **Proxy** | Vite dev proxies `/uniswap` → `trade-api.gateway.uniswap.org`; `vercel.json` rewrites for deploy. |
| **Requirements** | Vault wallet needs **gas ETH**; quotes expire; not an audited custody product. |

---

## 12. 0G stack

**Scope:** everything **0G-branded** — compute, memory, storage sample, Docker. **Not** AXL (**§5**); not Uniswap (**§11**).

### 12.1 0G Compute

Optional **decentralized inference** endpoint in **Settings → AI** (alongside OpenRouter, Ollama, HuggingFace, custom URL).

### 12.2 0G Memory (EverMemOS)

| Topic | Detail |
|-------|--------|
| **Router** | `memory_router.py` — HTTP on **:9091** → EverMemOS **:1995**. |
| **Endpoints** | e.g. `/episode`, `/search`, `/recent` — typed episodes (breach, together, diary, handshake, …). |
| **Docker stack** | MongoDB, Elasticsearch, Milvus, Redis, **zgs_kv** → **0G testnet**. |

### 12.3 0G Storage (example app)

| Topic | Detail |
|-------|--------|
| **Path** | `examples/0g-storage-memory/` (Bun + TypeScript, **0G TS SDK**). |
| **Purpose** | Upload / verify encrypted pact or diary **blob** snapshots — pattern for durable on-chain archives. |

### 12.4 0G quick start (Docker + clone)

```bash
git clone https://github.com/0gfoundation/0g-memory ~/0g-memory
cp ~/0g-memory/env.template.0g.example ~/0g-memory/.env
# Fill LLM_API_KEY, VECTORIZE_API_KEY, RERANK_API_KEY, ZEROG_WALLET_KEY
cd ~/0g-memory && ./install.sh && ./start_service.sh
# or: python3 memory_router.py docker-up
```

---

## 13. AI model providers (settings)

**Scope:** which **LLM / image** backends the app can call from **Settings → AI**. **Not** pact rule JSON schema (**§6** — that is the pact architect contract).

| Provider | Use |
|----------|-----|
| OpenRouter | Recommended multi-model + image routes. |
| Local Ollama | Offline. |
| **0G Compute** | Decentralized inference (**§12.1**). |
| HuggingFace | Hosted open models. |
| Custom URL | OpenAI-compatible endpoint. |

The **pact architect** system prompt requires JSON-only replies and reserved ids: `dating_app`, `location`, `contact`, `diary`.

---

## 14. Runbook & prerequisites

### Commands

```bash
bun install

# Web / PWA (default http://localhost:1420 — see vite.config)
bun run dev

# HTTPS for LAN / getUserMedia
LOVECLAW_DEV_HTTPS=1 bun run dev

# §8 Signal relay
python3 prototype/signal-relay.py

# §12 Memory router (optional)
python3 memory_router.py serve
python3 memory_router.py docker-up

# Two Tauri roles (second instance bumps port if needed)
bun run dev:alice
bun run dev:boris
bun run dev:alice:relay
bun run dev:boris:relay
```

### Prerequisites

| Tool | For |
|------|-----|
| [Bun](https://bun.sh/) | Install + npm scripts |
| Python **3.10+** | Relay + memory router |
| Go **1.21+** | `examples/axl-demo/axl/node` |
| Docker | **§12** EverMemOS (optional) |

**Two-node AXL:** `bash run.sh` from repo root (see **§5**); if its bundled dev command does not match your setup, run **`bun run dev`** manually after nodes are listening.

---

## 15. Repository layout

| Path | Category |
|------|----------|
| `src/` | Vite app — UI, dashboard, **§5** AXL client, **§6–9** flows, **§11** swap. |
| `src/app/`, `src/dashboard/`, `src/lib/` | Feature modules per areas above. |
| `evm/` | Solidity contracts — **§10.1** `LoveClawPact` (deployed mainnet). |
| `prototype/relay/` | **§8** relay + `breach_ai.py`. |
| `examples/axl-demo/` | **§5** mesh binaries + configs. |
| `examples/0g-storage-memory/` | **§12.3** Storage SDK demo. |
| `src-tauri/` | Desktop shell. |
| `memory_router.py` | **§12.2** 0G Memory HTTP adapter. |

---

## 16. Design system

| Token | Hex |
|-------|-----|
| Teal | `#5DCAA5` |
| Purple | `#534AB7` |
| Pink | `#D4537E` |
| Amber | `#FAC775` |
| Red | `#E24B4A` |
| Background | `#07070f` / `#0d0d1e` |

Font: **`'Press Start 2P'`** — dark cyberpunk / 8-bit retro.

---

## 17. Architecture (ports)

```
Vite (index.html + src/)  or  Tauri
    ├── LoveClaw agent   :18789   — §3 signals (when agent is running)
    ├── AXL              :9002 / :9012 — §5
    ├── Signal relay     :9090   — §8
    └── Memory router    :9091   — §12.2

memory_router.py → EverMemOS :1995 (Docker, §12)
```

---

*Trust • Transparency • Automation — Security First, Love Second*
