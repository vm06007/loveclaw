# LoveClaw × AXL — two-node demo

This folder runs **two AXL nodes** on one machine (Alice and Boris), performs a **public-key handshake**, then exchanges **LoveClaw-shaped messages** (score, diary, breach candidate / vote, etc.) over the mesh. There is **no central relay or registry**—peers talk over the mesh using public keys only.

For convenience, **localhost-only HTTP** sits **next to the mesh** in two places: (1) `a2a.py` listens on port **8090** for the browser UI and an SSE log stream—the browser never talks to AXL; only this script calls each node at `http://127.0.0.1:9002` and `:9012`. (2) Each `./axl/node` exposes a **small local control API** on its port (`/send`, `/recv`, `/topology`) so agents can drive **that** peer only; LoveClaw payloads still move **peer-to-peer on the mesh**, not through any shared routing hub.

The `axl/` subdirectory is the **AXL node** (Go): build output is `./axl/node`. See `axl/README.md` and `axl/AGENTS.md` for that per-node API.

## Prerequisites

-   Python 3
-   Go (see root `run.sh` for toolchain pin, e.g. `GOTOOLCHAIN=go1.25.5`)
-   `openssl` for Ed25519 key PEM files

## One-time setup

From this directory:

```bash
./setup.sh
```

This builds `./axl/node` and creates `alice-key.pem` / `boris-key.pem` if missing. Node configs `node-alice.json` and `node-boris.json` are used by `a2a.py` (root `run.sh` can regenerate similar configs for the Tauri dev flow).

## Run the demo

```bash
python3 a2a.py
```

-   **UI**: [http://localhost:8090](http://localhost:8090) (override with `UI_PORT`).
-   Alice node API: **9002**; Boris: **9012**.

Other modes:

```bash
python3 a2a.py --test        # run test sequence, then live mode
python3 a2a.py --nodes-up    # assume nodes already listening on 9002 / 9012
```

## What you should see

-   Two processes: `./axl/node -config node-alice.json` and `./axl/node -config node-boris.json`.
-   Terminal coloured logs plus **SSE** events in the web UI.
-   **POST /send** from each agent’s port to the partner’s **64-hex public key** (from `/topology`).

## Files

| File | Purpose |
|------|---------|
| `a2a.py` | Spawns nodes and agents; optional localhost listener (UI, SSE, `POST /send`) |
| `ui.html`, `ui.js` | Browser panel + controls |
| `test.py` | Optional automated checks |
| `rgb.py` | Terminal colours |
| `node-alice.json`, `node-boris.json` | AXL listen / API ports and peering |
| `axl/` | AXL source and built `node` binary |

Styling shared with the signal console lives under `examples/loveclaw-style/`.

## More documentation

-   [Examples index](../README.md) — architecture diagram, **AXL message types**, curl examples.
-   [Repository root `../../README.md`](../../README.md) — LoveClaw product overview and stack.
