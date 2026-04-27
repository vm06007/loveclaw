# LoveClaw

## What it is

LoveClaw is for **two people who already trust each other enough to enter an explicit digital pact**—not for spying on strangers. Each person installs the app on their own phone. They **pair** (invite link / QR) so the two instances know how to reach each other. From then on, **status and pact messages flow directly between the two devices over [AXL](https://github.com/gensyn-ai/axl)** (a local HTTP API to a P2P node), instead of routing couple-to-couple chat through a company’s server.

What the app actually *does* in this repo: it helps them **agree on rules** (what counts as breaking the pact), **surface device-side signals** the project cares about (for example installed apps or notifications the logic treats as risk signals), **show a shared dashboard** (today, signals, diary, pact), and **notify the partner** when the app believes a breach pattern occurred. A **diary** and optional **memory** paths let “what happened” be summarized or stored for later (including experiments with **0G**-style storage in `examples/`). None of that requires the couple to hand a third party the full contents of their relationship—but it **does** require both people to opt in to the pact and to whatever telemetry the build reads locally.

**Where the roadmap goes:** treat each side like a small **agent** that only sees what the couple’s policy allows, can exchange structured state with the other agent over the mesh, can mint **memories** when they are together or when agreed signals fire, and can drive **economic enforcement** (for example reallocating locked funds toward the non-violating partner when both agents agree a breach). That agent + vault + slash stack is **not fully implemented** here; the current codebase is the **paired web app + AXL + signals + breach UX** foundation.

**LoveClaw** (one line): a **relationship trust pact app** (hackathon 2026)—pair over AXL, shared UI for signals and pact state, breach flows and optional memory/relay integrations; **dual-agent governance and on-chain slash are in progress** (see below). Optional: **signal relay** (AI breach analysis, SSE console), **memory router** (0G Memory / EverMemOS), **0G Storage** example for snapshots.

## What we are building

We are building a **paired trust product** for two people who explicitly opt in: each runs the app on their own device, **pairs over [AXL](https://github.com/gensyn-ai/axl)**, and keeps **pact state and notifications between the two sides** without sending that couple channel through a central server. The experience should feel like a **mutual agreement**—they define what counts as honoring or breaking the pact—not like one party unilaterally monitoring the other.

On top of that transport layer we want **linked agents** (OpenClaw / NanoClaw–class idea): one agent per device that can exchange **structured messages** with its counterpart. The couple **governs what those agents are allowed to see**—which signals, which categories, which “picks”—so transparency is **by policy**, not by default full-phone access. We also want a credible **read-only** stance where the UI and agents work from **minimal, consented** inputs rather than hoovering everything off the device.

We are building **memory** that matches the story of the relationship: **episodes when they are together**, and **summaries or events derived from signals they already approved** for agent use, plus a **diary** line the product already experiments with. Optional services (signal relay, AI-assisted breach reasoning, **0G** storage or memory routers) sit beside the core app as **assistants**, not as owners of the relationship data.

Finally we are building an **economic layer couples can opt into**: **mutual funds or stake** attached to the same pact rules, so that when **both agents agree** there has been a **breach of the rules they set together**, **part of that stake can slash or reallocate toward the other partner**. That last piece—safe custody, clear dispute paths, and chain-level enforcement—is **still in progress**; today’s tree is mainly the **paired app, AXL mesh, signals, breach UX, and example integrations** that everything else will hang on.

## Short pitch (≤100 characters)

Use this on submission forms (under 100 characters):

> **Nano-style pact: pair, read-only opt, dual agents, governed signals, breach→partner slash (WIP).** (96 characters)

Shorter branded line (89 characters):

> **LoveClaw: dual agents/AXL, governed signals, co-memories, breach→partner stake slash—WIP.**

Earlier simpler pitches (less vault / agent detail):

- `LoveClaw: P2P couples trust app—pair on AXL, signals, breach rules, diary & 0G hooks.` (88)
- `Relationship trust app: pair over AXL; signals, scores, diary, breach flow.` (77)

## Features

-   **Pairing**: QR / invite link with embedded AXL identity; joiner completes handshake over the mesh.
-   **Dashboard**: Today view, signals, diary, pact tabs; pixel / cyberpunk UI (Vite + static HTML paths supported).
-   **Breach flow**: Rule engine on device signals; partner notifications over AXL (evolving toward **dual-agent** consensus and **policy-governed** signal sharing).
-   **Desktop**: Tauri app in `src-tauri/` with role-based dev (`bun run dev:alice`, etc.).
-   **Roadmap**: Read-only-by-default modes, explicit **signal picklists** for inter-agent visibility, richer **memory** episodes (together-time + signal-derived), and **programmable vault / slash** on agreed breach.

## Prerequisites

-   [Bun](https://bun.sh/) (JavaScript tooling)
-   Python 3 for `prototype/signal-relay.py`, `memory_router.py`, and `examples/axl-demo/a2a.py`
-   Go (1.25.x as used in `run.sh`) to build the AXL node binary under `examples/axl-demo/axl/`

## Quick start (web UI)

```bash
cd /path/to/loveclaw-hack
bun install
bun run dev
```

Open the URL Vite prints (default dev port per `vite.config.js`). For **Tauri** with two local roles, see `package.json` scripts `dev:alice` / `dev:boris` and repo `run.sh` (starts AXL nodes + dev server).

## Optional services

| Service | Port (typical) | Role |
|---------|----------------|------|
| Signal relay | `9090` | `python3 prototype/signal-relay.py` — breach engine, SSE console, static `/examples` |
| Memory router | `9091` | `python3 memory_router.py serve` — bridge to EverMemOS / 0G Memory (Docker stack separate) |

Details: [`CLAUDE.md`](./CLAUDE.md) (architecture, `LoveClaw` / `AXL` objects, memory router API).

## Examples in this repo

| Path | README |
|------|--------|
| [`examples/axl-demo/`](./examples/axl-demo/) | Two-node AXL demo + browser UI (`a2a.py`) |
| [`examples/0g-storage-memory/`](./examples/0g-storage-memory/) | Bun + TypeScript: upload / download pact memory via 0G Storage SDK |
| [`examples/README.md`](./examples/README.md) | Index of all examples + AXL message table |

## Project layout (high level)

-   `index.html`, `src/` — Vite front-end sources and styles.
-   `loveclaw-app.html` — standalone browser entry (serve over HTTP for service worker); see `CLAUDE.md` for static server notes.
-   `prototype/` — signal relay and relay implementation.
-   `memory_router.py` — HTTP wrapper around 0G Memory stack.
-   `examples/axl-demo/` — vendored AXL `node` build + Python orchestration.

## License

See repository files (e.g. `LICENSE` if present) or upstream AXL / 0G SDK terms inside `examples/`.
