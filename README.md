# LoveClaw — Trust & Accountability System

> *The A.I. Arbiter for Connected Couples*

LoveClaw is a **relationship pact app** for two people who explicitly opt in to mutual accountability. Each partner installs the app on their own device, pairs over a private P2P mesh, and from that point their devices talk directly — no couple data routes through a central server. On top of that foundation sits a rule engine, an AI-powered diary, and an optional on-chain vault that can automatically slash collateral when both agents agree a pact rule was broken.

Built for **AgentHack 2026**.

---

## How it works

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

### 1. Local agents on phones

Each device runs a **LoveClaw agent** that reads consented signals: app usage metadata, GPS / network location, battery & charging state, foreground app focus, notification categories, screen-on patterns, and more. No message bodies, no keystrokes — only metadata the couple explicitly opts in to.

### 2. Mutual rules evaluation

Both agents share a **pact** — a set of rules the couple agreed on together (e.g. "no dating-app installs", "notify when offline unexpectedly for > 2 hours"). Signals stream into a rule engine over the encrypted **AXL** P2P link. The AI copilot (LoveClaw chat) can propose new custom rules in natural language; both partners must accept before any rule goes live.

### 3. Smart contract enforcement

When the rule engine flags a breach on both sides, the outcome flows to an on-chain **smart contract**:
- Collateral (ETH) is locked at pairing time as a mutual commitment.
- A confirmed breach triggers a penalty — funds reallocate toward the non-violating partner.
- A **breach alert** is pushed to both devices instantly.

---

## Features

### Loyalty Check

Monitor fidelity signals in real time. The rule engine watches for dating-app installs, unusual location stops, unexplained offline windows, and other configurable signals. Score ≥ 100 triggers an immediate breach overlay and partner notification over AXL.

Built-in pact rules:
| Rule | What it watches |
|------|----------------|
| `dating_app` | Dating-oriented app installs inferred from package metadata |
| `location` | Movement vs. usual routine — stops, routes, timing |
| `contact` | Long unexplained offline periods while battery indicates phone could be on |
| `diary` | Automation — AI daily diary from shared signals (not a breach monitor) |

Custom rules can be added via the AI pact architect chat. The AI validates whether a proposed rule is actually detectable from available signals and asks for clarification when parameters are ambiguous.

### Smart Staking

Both partners stake ETH into a **shared vault** at pairing time. The stake is a mutual commitment — not a deposit held by LoveClaw. Contract logic:
- Funds are locked on-chain, accessible only by the smart contract.
- Breach confirmed by both agents → penalty fraction transfers to the non-violating partner.
- No breach → both partners can withdraw their stake together when the pact ends.

### AI Diary

Every day the app assembles a **context bundle** from device signals (location, app focus, together-time, heartbeat) and optional notes each partner adds manually. The AI diary engine:

1. Reads the shared signal context and both partners' notes.
2. Calls the configured LLM (OpenRouter, local Ollama, 0G Compute, or HuggingFace) to craft a pixel-art image prompt that reflects the day's activity and the couple's real appearance.
3. Sends the prompt — along with avatar reference photos and a style reference image — to **Google Gemini** via OpenRouter to generate a unique 8-bit pixel-art illustration for that day.
4. Stores the generated image and notes in the diary calendar, where both partners can view and annotate their shared memories.

Diary memories can optionally be written to **0G Storage** (permanent, encrypted, on-chain) so the couple's story is never lost.

### Shared DeFi

A multisig layer lets couples propose and approve shared financial transactions:
- Either partner proposes a spend or transfer.
- The other must approve before execution.
- Couples can interact with DeFi protocols (swap via Unihorn / DEX) using jointly-controlled funds.
- Full audit trail of proposals and approvals stored locally and optionally on-chain.

---

## Architecture

```
Browser (loveclaw-app.html / Tauri)
    ├── LoveClaw agent   localhost:18789  — reads device signals
    ├── AXL              localhost:9002   — P2P mesh to partner's device
    ├── Signal Relay     localhost:9090   — AI breach engine + SSE signal console
    └── Memory Router    localhost:9091   — 0G Memory wrapper (on-chain episode storage)

Memory Router (memory_router.py)
    └── EverMemOS        localhost:1995   — Docker stack
            ├── MongoDB        :27017
            ├── Elasticsearch  :19200
            ├── Milvus         :19530     (vector embeddings)
            ├── Redis          :6379
            └── zgs_kv binary             → 0G testnet blockchain
```

### Key modules

**`LoveClaw` object** — calls the local agent (`/api/invoke`, `/api/status`) to read device signals. Used by `runHeartbeat()` and `generateDiaryEntry()`. Falls back to demo mode offline.

**`AXL` object** — handles all partner communication (`/topology`, `/send`, `/recv`). Key message types: `axl_handshake`, `breach`, `score`, `diary`, `diary_note`, `diary_note_delete`.

**Signal Relay** (`prototype/relay/`) — Python HTTP server at port 9090. Receives signal batches, runs AI breach analysis (`breach_ai.py`), streams events over SSE to the signal console, and proxies image generation.

**Memory Router** (`memory_router.py`) — thin HTTP wrapper around EverMemOS. Writes typed episodes (breach, together, diary, handshake) to 0G Memory for permanent recall.

---

## Pairing flow

1. **Creator** generates an invite URL — their AXL public key is embedded in a base64 pact bundle, along with agreed triggers and couple ID.
2. **Joiner** clicks the link, extracts the creator's AXL key, sends back a handshake message over AXL.
3. Both sides store each other's keys; polling starts; all subsequent messages are direct P2P.

---

## Running

```bash
# 1. Web app (required for service worker)
python3 -m http.server 8080
open http://localhost:8080/loveclaw-app.html

# 2. Signal relay — breach engine, SSE console
python3 prototype/signal-relay.py
# → http://localhost:9090/

# 3. Memory router — 0G Memory / EverMemOS (optional, needs Docker)
python3 memory_router.py serve
# → http://localhost:9091/

# 4. Desktop (Tauri) with two local roles
bun run dev:alice   # Partner A
bun run dev:boris   # Partner B
```

### Prerequisites

- [Bun](https://bun.sh/) — JS tooling and Tauri dev
- Python 3.10+ — signal relay, memory router, AXL demo
- Go 1.21+ — build the AXL node binary (`examples/axl-demo/`)
- Docker — 0G Memory / EverMemOS stack (optional)

---

## AI configuration

The app supports multiple AI providers, switchable in **Settings → AI**:

| Provider | Use case |
|----------|----------|
| OpenRouter | Recommended — access to GPT-4o, Gemini, Claude, and image generation via `google/gemini-3.1-flash-image-preview` |
| Local Ollama | Fully offline — `gemma3:4b` or any local model |
| 0G Compute | Decentralised inference via 0G network |
| HuggingFace | Hosted open models |
| Custom endpoint | Any OpenAI-compatible API |

---

## 0G Storage & Memory

Diary entries and breach episodes can be written to the **0G network** for permanent, encrypted, on-chain storage:

- **0G Storage** (`examples/0g-storage-memory/`) — upload/download pact snapshots via the 0G Storage SDK (Bun + TypeScript).
- **0G Memory / EverMemOS** — vector + keyword search over all stored episodes; semantic retrieval used when generating diary entries.

```bash
# One-time Docker setup
git clone https://github.com/0gfoundation/0g-memory ~/0g-memory
cp ~/0g-memory/env.template.0g.example ~/0g-memory/.env
# Fill in LLM_API_KEY, VECTORIZE_API_KEY, RERANK_API_KEY, ZEROG_WALLET_KEY
python3 memory_router.py docker-up
```

---

## Project layout

```
src/              Vite front-end — app screens, dashboard tabs, AI logic
  app/            AI settings, chat, breach overlay, ping
  dashboard/      Diary, signals, pact, today tabs
  lib/            State, AXL client, Tauri bridge
  styles/         CSS design system (dark cyberpunk / 8-bit retro)
prototype/
  relay/          Signal relay — breach_ai, signal_ingest, push_notify, 0G upload
  console/        SSE signal console UI
  diary/images/   Pixel-art reference images for diary generation
examples/
  axl-demo/       Two-node AXL demo + browser UI
  0g-storage-memory/ Bun TypeScript: upload diary snapshots to 0G Storage
src-tauri/        Tauri desktop shell
memory_router.py  HTTP wrapper around EverMemOS / 0G Memory
```

---

## Design language

Dark cyberpunk / 8-bit retro. Font: `'Press Start 2P'`. Core palette:

| Token | Value |
|-------|-------|
| Teal | `#5DCAA5` |
| Purple | `#534AB7` |
| Pink | `#D4537E` |
| Amber | `#FAC775` |
| Red | `#E24B4A` |
| Background | `#07070f` / `#0d0d1e` |

---

*Trust • Transparency • Automation — Security First, Love Second*
