# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LoveClaw is a relationship trust monitoring PWA — a hackathon 2026 project. Two partners install it on their devices, pair via an invite link, and their devices communicate directly peer-to-peer over AXL (no server).

## `prototype/console` (Signal console)

- **`signal-console.html`** loads **`examples/loveclaw-style/pixel-ui.css`** then **`examples/loveclaw-style/signal-console-ui.css`** (stats / toolbar / signal-only badges; scoped to `body.lc-signal-console`), plus **`signal-console.js`** (logic + **1x / 2x** zoom, `?scale=2`, `sessionStorage` key `signal-console-ui-scale`).
- **Recommended:** run **`python3 prototype/signal-relay.py`** from the repo root — the relay (code in **`prototype/relay/`**) serves the console and `/examples/…` assets on **http://127.0.0.1:9090/** (same origin as `RELAY` in `signal-console.js`).
- Alternatively, serve this folder only: `cd prototype/console && python3 -m http.server 9280` — then you still need the relay on **9090** for SSE unless you proxy.
