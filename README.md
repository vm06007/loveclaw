# LoveClaw — Trust & Accountability System

> *The A.I. Arbiter for Connected Couples*

LoveClaw is a **relationship pact app** for two people who explicitly opt in to mutual accountability. Each partner runs the app on their own device, pairs over an invite, and keeps the relationship **off a central couple server**: device agents stream consented signals, partners sync over **AXL** peer-to-peer, and optional layers add **AI breach review**, **0G memory**, and **on-chain vault / Uniswap** flows.

Built for **AgentHack 2026**.

---

## What you can do with it

- **Connect a couple** — One person creates a pact and invite (QR / link); the other joins. After an **AXL handshake**, both sides share scores, diary hooks, breach alerts, pact-change proposals, and optional location sharing without routing that traffic through LoveClaw’s servers.
- **Profile activity (consented signals)** — The local agent contributes **heartbeat** data (presence, battery, app surface, location snippets, etc.). The **Today** experience and **heartbeat map** visualize you vs. your match; the **signal relay** console (SSE) shows the same stream operators and demos use for debugging.
- **Rules + stakes** — Turn on built-in triggers (dating installs, location anomalies, offline patterns) and optional **ETH stake** semantics tied to the shared vault narrative. **Custom rules** extend the pact when both people agree (see below).
- **AI diary & chat copilot** — Daily pixel-art diary generation from a shared context bundle; **@loveclaw** chat for pact help, Uniswap phrasing, and **agent-authored rule drafts**.
- **Optional infra** — **Signal relay** for server-side AI breach classification on ingested signals; **Memory router + 0G** for durable episodes; **Uniswap Trading API** for quoted swaps from the couple vault wallet.

This repo is a **hackathon prototype**: not production security or legal advice; pairing and enforcement paths are for demonstration and research.

---

## How it works (high level)

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

### Local agents

Each device runs a **LoveClaw agent** that reads **consented** signals: app usage metadata, GPS / network location, battery and charging, foreground focus, notification categories (not bodies), screen-on patterns, and more. No private message text or keystrokes — only what the product surface describes and the couple opts into.

### Mutual rules

Both agents share a **pact**: built-in triggers plus any **custom** rows. Signals feed a rule engine locally and, when the relay is enabled, an **AI classifier** on the signal server for richer narratives. Outcomes can surface trust score changes, breach overlays, and **AXL** messages to the other device.

### Optional on-chain enforcement

When the story includes staking, collateral (ETH) is framed as locked in mutual commitment; breach flows can tie into vault / penalty semantics in the UI and demos.

---

## AXL — peer-to-peer couple sync

**AXL** is the mesh layer partners use so **messages never need a central “couples cloud”**.

| Concern | Behavior |
|--------|----------|
| **Transport** | HTTP control plane to local AXL nodes (`topology`, `send`, `recv`). Dev defaults: proxy to **:9002** and **:9012** (Alice / Boris style two-node demo). Tauri release talks to `127.0.0.1:9002` / `9012` directly. |
| **Identity** | Ed25519 public keys from topology; pairing embeds keys in the invite so the joiner targets the right peer. |
| **Handshake** | `axl_handshake` carries names, couple id, optional **instance tag** so replays and wrong-cohort traffic are easier to reject. |
| **After pairing** | `breach`, `score`, `diary`, diary notes, **pact change proposals** (`pact_changes_propose` / accept flow), pings, optional **share location** requests for the heartbeat map — all over the same link. |

**Running two nodes locally** — See `examples/axl-demo/` (Go `axl/node` binaries, configs, logs). Convenience script from repo root: `bash run.sh` builds/starts two nodes and opens two browser roles (the script currently spawns the dev server; prefer **`bun run dev`** for day-to-day — see [Running](#running)).

**Expectation** — If AXL is down, pairing and live partner sync degrade; the Vite app can still run in demo/offline modes. For real two-device tests, keep both mesh endpoints reachable from each browser or Tauri instance.

---

## Dynamic pacts — agents draft rules, humans confirm

Rules are not only static checkboxes. The **LoveClaw pact architect** (AI settings → provider of your choice) reads **@loveclaw** messages, the current pact snapshot, and can return structured actions:

- **`propose_rule`** — Adds a **custom pact rule** (id, label, hint, category) and sends a **`pact_changes_propose`** payload over **AXL** so the other person must **accept** before triggers update. Nothing silently changes on both sides without that confirmation.
- **`need_info` / `not_possible` / `chat`** — Clarifies parameters or refuses rules that cannot be approximated from available signals (e.g. “read my partner’s DMs”).

**Custom rules can express almost any mutual agreement** that you could later map to **detectable signals** — mainly **installed apps, display names, notification metadata, time windows, location bands**, and combinations thereof. The copilot is instructed to only propose rules that plausibly fit that sensor set.

**Examples couples might agree on**

| Intent | How detection might look (illustrative) |
|--------|----------------------------------------|
| **No dating apps** | Built-in `dating_app` trigger plus relay **AI + keyword** paths on dating/hookup-like packages and titles. |
| **No dating / hookup surfaces** | Same family of signals; architect can phrase a custom row for nuance (e.g. exclude a named benign app). |
| **No centralized exchange apps — non-custodial wallets only** | A custom rule the architect describes in terms of **app inventory**: custodial exchange clients (e.g. **Kraken**, **Binance** — identifiable by package / brand strings) vs **self-custody** wallets (e.g. **Bitcoin.com** wallet — different category). Installing the former could contribute to a breach narrative under that pact; installing the latter would not, by design. Exact package lists evolve with stores and regional apps; the pact **hint** documents what the two of you mean. |
| **Screen-off by midnight on weeknights** | Combines time-of-day + screen-on / unlock signals. |

**Reality check** — The **reference relay classifier** (`prototype/relay/breach_ai.py`) is optimized for **dating / hookup** style signals today. **Custom rule rows** are first-class in state, invites, and UI; wiring every custom id to new server-side classifiers is ongoing product work. Treat exchange-vs-wallet style rules as **the contract you negotiate**, with enforcement depth depending on how you extend ingest + AI prompts.

---

## 0G — storage, memory, and compute

LoveClaw integrates **0G** in three complementary ways:

1. **0G Compute (AI settings)** — Optional **decentralized inference** endpoint alongside OpenRouter, Ollama, HuggingFace, or a custom OpenAI-compatible URL.
2. **0G Memory (EverMemOS)** — **`memory_router.py`** exposes `/episode`, `/search`, `/recent` on **:9091** and forwards to EverMemOS (**:1995**). Breach, together-time, diary, handshake, and related **episodes** can be indexed for semantic recall when building diary context.
3. **0G Storage (example)** — **`examples/0g-storage-memory/`** is a Bun + TypeScript sample: upload encrypted pact / diary snapshots with the **0G TS SDK**, verify downloads — the pattern for **durable, on-chain blobs** beside hot app state.

**Docker** — EverMemOS pulls MongoDB, Elasticsearch, Milvus, Redis, and **zgs_kv** toward **0G testnet**. See `CLAUDE.md` / commands below for `~/0g-memory` clone, `.env` keys (`LLM_API_KEY`, `VECTORIZE_API_KEY`, `RERANK_API_KEY`, `ZEROG_WALLET_KEY`), and `python3 memory_router.py docker-up`.

Diary copy in-product may mention writing memories to **0G Storage** for long-term couple archives; the example repo is the place to experiment with that SDK end-to-end.

---

## Uniswap — shared vault swaps

The **couple vault** path includes **Uniswap Trading API v1** integration for **Ethereum mainnet** quotes and calldata:

- Chat quick action seeds: *“@loveclaw lets swap 0.0005 ETH to USDC”* (natural language still goes through the swap / vault helpers where wired).
- **`src/app/swap.js`** — `POST /uniswap/v1/quote` and `POST /uniswap/v1/swap` with an API key; execution uses **ethers** + public RPC candidates to broadcast the returned transaction from the decrypted vault key (demo / hackathon flow — protect keys accordingly).
- **Configuration** — Set **`VITE_UNISWAP_API_KEY`** in `.env` (see `.env.example`, [Uniswap Dev Hub](https://hub.uniswap.org/)) or store the key in **AI settings** where the UI exposes it. **Vite dev** proxies `/uniswap` to `trade-api.gateway.uniswap.org`; **Vercel** rewrites the same path in `vercel.json`.

**Expectation** — Swaps require **gas ETH** on the vault wallet, a valid quote, and network availability. This is **not** a audited custody product; it demonstrates **joint financial intent** next to the pact narrative.

---

## Features (short)

### Loyalty & signals

Real-time-ish fidelity and routine signals: dating-oriented installs, location story, offline/contact patterns, configurable triggers. High scores / breach paths can drive overlays and **AXL** `breach` messages. Built-in rows include `dating_app`, `location`, `contact`, and automation `diary`.

### Smart staking (narrative)

Mutual ETH stake / vault framing for commitment and penalty storytelling in the UI and demos.

### AI diary

Context bundle from signals + notes → LLM image prompt → **Gemini** (via OpenRouter) pixel art for the calendar; partner sync over AXL.

### Heartbeat map & “profiling”

**Heartbeat** runs on a timer and aggregates signal history for the **Today** tab. The **heartbeat map** (Leaflet) shows your position and, after mutual consent, your match’s shared pin — useful for **spatial profiling** in the benign sense (“where are we both active?”). For **engineering profiling**, use browser DevTools Performance, or the signal relay SSE console to watch ingest volume and breach decisions.

---

## Architecture

```
Vite app (index.html + src/)  or  Tauri shell
    ├── LoveClaw agent   localhost:18789  — device signals (when present)
    ├── AXL              :9002 / :9012   — P2P mesh (see vite proxy + env)
    ├── Signal Relay     localhost:9090  — ingest, breach_ai, SSE console
    └── Memory Router    localhost:9091  — 0G Memory / EverMemOS facade

memory_router.py
    └── EverMemOS        localhost:1995  — Docker (see 0G section)
```

### Key modules (src/)

- **`src/axl/client.js`**, **`src/axl/poll.js`** — Mesh client and inbound loop.
- **`src/app/heartbeat.js`**, **`src/app/heartbeat-map.js`** — Signal-driven today + map UX.
- **`src/app/lovclaw-ai.js`**, **`src/app/ai-settings.js`** — Pact architect + providers.
- **`src/app/swap.js`**, **`src/app/vault.js`** — Uniswap + vault display.
- **`prototype/relay/`** — Relay implementation (`breach_ai.py`, ingest, push, memory client).

---

## Pairing flow

1. **Creator** generates an invite — AXL public key, triggers, optional stake and **custom rules** ride in the encoded pact bundle.
2. **Joiner** opens the link, completes join UI, sends **`axl_handshake`** back over AXL.
3. Both store keys; polling begins; subsequent traffic is **P2P-shaped** (still localhost-to-mesh in dev).

---

## Running

```bash
bun install

# Primary: Vite PWA / web (default http://localhost:1420 — see vite.config)
bun run dev

# Optional: HTTPS for LAN / getUserMedia (phones)
LOVECLAW_DEV_HTTPS=1 bun run dev

# Signal relay — AI breach stream + SSE console → http://localhost:9090/
python3 prototype/signal-relay.py

# Memory router — 0G Memory API → http://localhost:9091/ (optional)
python3 memory_router.py serve
python3 memory_router.py docker-up   # first-time EverMemOS stack

# Two Tauri dev identities (separate processes; second bumps port if needed)
bun run dev:alice
bun run dev:boris

# Same with relay env hint (see vite.config — LOVECLAW_RELAY=1)
bun run dev:alice:relay
bun run dev:boris:relay
```

**Two-node AXL + two tabs** — From repo root, `bash run.sh` (under `examples/axl-demo`) builds the Go node if needed, starts Alice/Boris listeners, and opens `?role=alice` / `?role=boris` in the browser. If the script’s embedded dev command disagrees with your toolchain, start **`bun run dev`** yourself after the nodes are up.

### Prerequisites

- **[Bun](https://bun.sh/)** — install and scripts
- **Python 3.10+** — relay + memory router
- **Go 1.21+** — build `examples/axl-demo/axl/node`
- **Docker** — optional, for 0G Memory / EverMemOS

---

## AI configuration

**Settings → AI** in the app:

| Provider | Role |
|----------|------|
| OpenRouter | Recommended multi-model + image models |
| Local Ollama | Offline models |
| **0G Compute** | Decentralized inference |
| HuggingFace | Hosted open weights |
| Custom URL | Any OpenAI-compatible endpoint |

The **pact architect** system prompt defines JSON-only responses and built-in rule ids (`dating_app`, `location`, `contact`, `diary`).

---

## 0G quick start (copy-paste)

```bash
git clone https://github.com/0gfoundation/0g-memory ~/0g-memory
cp ~/0g-memory/env.template.0g.example ~/0g-memory/.env
# Fill LLM_API_KEY, VECTORIZE_API_KEY, RERANK_API_KEY, ZEROG_WALLET_KEY
cd ~/0g-memory && ./install.sh && ./start_service.sh
# or: python3 memory_router.py docker-up
```

---

## Project layout

```
src/                 Vite app — screens, dashboard, AXL, AI, swap, heartbeat
  app/               Boot, breach UI, ping, coop profile, messages
  axl/               Mesh client + poll loop
  dashboard/         Today, signals, diary, pact tabs
  lib/               State, invite, pact helpers
prototype/relay/     Python relay + breach AI + memory client
examples/axl-demo/   Two-node mesh demo + keys
examples/0g-storage-memory/  Bun SDK sample for 0G Storage
src-tauri/           Tauri desktop wrapper
memory_router.py     0G Memory HTTP adapter
```

---

## Design language

Dark cyberpunk / 8-bit retro. Font: `'Press Start 2P'`. Palette: teal `#5DCAA5`, purple `#534AB7`, pink `#D4537E`, amber `#FAC775`, red `#E24B4A`, background `#07070f` / `#0d0d1e`.

---

*Trust • Transparency • Automation — Security First, Love Second*
