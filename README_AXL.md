# AXL Integration — LoveClaw

LoveClaw uses **AXL** as its peer-to-peer transport layer. Every message between partners — breach alerts, diary sync, location heartbeats, handshakes, pact amendments — travels over AXL with no server in the middle.

---

## What AXL Provides

| Capability | How LoveClaw uses it |
|---|---|
| P2P mesh nodes | One node per device; creator on `:9002`, joiner on `:9012` |
| `/topology` endpoint | Node discovery on startup |
| `/send` endpoint | Outbound messages addressed to partner's peer key |
| `/recv` endpoint | Inbound message polling (400 ms interval) |
| Peer key addressing | Each partner's `myAxlKey` (64-char hex) embedded in the invite QR/URL |

---

## AXL Client — [`src/axl/client.js`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js)

The entire AXL abstraction lives here.

| Code | Purpose |
|---|---|
| [`L9` — `axlPublicBase(port)`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L9) | Resolves the correct AXL base URL; honours `VITE_AXL_PORT` env override and the `:9002` / `:9012` port split |
| [`L18` — `meshRequestUrl(base, segment)`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L18) | Builds `<base>/<segment>` for `topology`, `send`, `recv` sub-paths |
| [`L32` — `resolveAxlNodes(preferPort)`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L32) | Async node discovery — tries primary port, falls back to secondary, caches result |
| [`L98` — `setPreferPort(port)`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L98) | Sets which AXL port this instance should prefer (called during boot) |
| [`L116` — `fetch(…"topology")`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L116) | Calls the AXL `/topology` endpoint to verify node is alive |
| [`L151` — `fetch(…"send")`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L151) | Calls the AXL `/send` endpoint to push a message to the partner peer key |
| [`L167` — `fetch(…"recv")`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L167) | Calls the AXL `/recv` endpoint to pull inbound messages |

---

## Polling Loop — [`src/axl/poll.js`](https://github.com/vm06007/loveclaw/blob/master/src/axl/poll.js)

| Code | Purpose |
|---|---|
| [`L10` — `startAxlPoll()`](https://github.com/vm06007/loveclaw/blob/master/src/axl/poll.js#L10) | Starts the 400 ms `setInterval` that continuously calls `axl.recv()` |
| [`L34` — `axl_handshake` dispatch](https://github.com/vm06007/loveclaw/blob/master/src/axl/poll.js#L34) | Detects incoming `axl_handshake` type to complete pairing |
| [`L38` — couple-ID mismatch warning](https://github.com/vm06007/loveclaw/blob/master/src/axl/poll.js#L38) | Logs when handshake `coupleId` doesn't match; pairs anyway |

---

## Transport Abstraction — [`src/app/transport.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/transport.js)

| Code | Purpose |
|---|---|
| [`L2` — import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/app/transport.js#L2) | Pulls in the AXL client |
| [`L5-L7` — `transportSend(payload)`](https://github.com/vm06007/loveclaw/blob/master/src/app/transport.js#L5-L7) | Tries `axl.send()` first; falls back to local IPC if AXL is unavailable |

---

## Boot & Initialization — [`src/app/boot.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js)

| Code | Purpose |
|---|---|
| [`L7-L8` — imports](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L7-L8) | Imports `axl` client and `startAxlPoll` |
| [`L75` — `axl.setPreferPort(9002)`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L75) | Assigns creator to port 9002 |
| [`L77` — `axl.setPreferPort(9012)`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L77) | Assigns joiner to port 9012 |
| [`L152` — `axl.init(partnerAxlKey)`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L152) | Initialises AXL on every app boot when already paired |
| [`L154` — `startAxlPoll()`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L154) | Begins polling loop after successful init |

---

## Pairing Flow

### Creator — [`src/screens/create.js`](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js)

| Code | Purpose |
|---|---|
| [`L8-L9` — imports](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L8-L9) | Imports `axl` and `startAxlPoll` |
| [`L197` — "connecting to AXL…"](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L197) | Shows connecting status in UI |
| [`L200` — `axl.init()`](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L200) | Initialises AXL node for creator (no partner key yet) |
| [`L283` — `startAxlPoll()`](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L283) | Starts polling to wait for joiner handshake |

### Joiner — [`src/screens/join.js`](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js)

| Code | Purpose |
|---|---|
| [`L6-L7` — imports](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L6-L7) | Imports `axl` and `startAxlPoll` |
| [`L77` — "connecting to AXL…"](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L77) | Shows connecting status in UI |
| [`L80` — `axl.init(state.partnerAxlKey)`](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L80) | Initialises AXL with creator's key extracted from the invite URL |
| [`L99` — `axl.send(partnerAxlKey, handshake)`](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L99) | Sends the `axl_handshake` message to the creator |
| [`L106` — `startAxlPoll()`](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L106) | Starts polling after successful handshake send |

---

## Message Types Sent Over AXL

### Breach & Pact — [`src/app/breakPact.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js)

| Code | Message type |
|---|---|
| [`L2` — import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L2) | AXL client import |
| [`L18-L19` — `axl.send()`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L18-L19) | Sends break-pact messages over AXL |
| [`L226` — `break_pact_propose`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L226) | Initiates dissolution proposal |
| [`L242` — `break_pact_grant`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L242) | Partner accepts dissolution |
| [`L253` — `break_pact_deny`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L253) | Partner rejects dissolution |

### Diary Sync — [`src/dashboard/diary.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js)

| Code | Message type |
|---|---|
| [`L3` — import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L3) | AXL client import |
| [`L324` — `axl.send(…diary_note)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L324) | Sends new diary note to partner |
| [`L360` — `axl.send(…diary_note_delete)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L360) | Sends note deletion |
| [`L363` — `axl.send(…diary_notes_sync)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L363) | Full diary sync (authoritative) |
| [`L381-L382` — delete + sync](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L381-L382) | Paired delete + re-sync |
| [`L410-L411` — delete + sync](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L410-L411) | Paired delete + re-sync (alt path) |
| [`L461` — `axl.send(…diary_notes_sync)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L461) | Full notes sync on reconnect |

### Swap Negotiation — [`src/dashboard/swap-proposal.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js)

| Code | Message type |
|---|---|
| [`L85-L88` — `axl.send(…swap_confirm)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L85-L88) | Partner approves proposed swap |
| [`L96-L99` — `axl.send(…swap_deny)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L96-L99) | Partner rejects proposed swap |
| [`L105-L107` — `axl.send(…swap_execute)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L105-L107) | Executes agreed swap over AXL |

### Pact Amendments — [`src/dashboard/pact.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/pact.js)

| Code | Message type |
|---|---|
| [`L2` — import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/pact.js#L2) | AXL client import |
| [`L111-L112` — `axl.send()`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/pact.js#L111-L112) | Sends pact amendment message |
| [`L356` — `pact_changes_propose`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/pact.js#L356) | Proposes trigger change to partner |

### Profile & Avatar Sync — [`src/app/coop-profile.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js)

| Code | Purpose |
|---|---|
| [`L5` — import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L5) | AXL client import |
| [`L440-L441` — re-init](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L440-L441) | Re-initialises AXL if connection dropped |
| [`L454-L455` — `axl.send(payload)`](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L454-L455) | Sends profile/avatar payload over AXL |
| [`L491` — AXL offline guard](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L491) | Warns user if photo sync fails because AXL is unavailable |

---

## Connectivity Status — [`src/app/ping.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/ping.js)

| Code | Purpose |
|---|---|
| [`L5` — import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/app/ping.js#L5) | AXL client import |
| [`L28-L30` — port display](https://github.com/vm06007/loveclaw/blob/master/src/app/ping.js#L28-L30) | Shows `axl :9002` / `axl :9012` or `local IPC` in dashboard header |
| [`L33-L35` — offline message](https://github.com/vm06007/loveclaw/blob/master/src/app/ping.js#L33-L35) | Explains AXL Vite proxy fallback and node startup instructions |

---

## Dev Proxy Configuration

### Vite (local dev) — [`vite.config.js`](https://github.com/vm06007/loveclaw/blob/master/vite.config.js)

| Code | Purpose |
|---|---|
| [`L105-L106` — path reservations](https://github.com/vm06007/loveclaw/blob/master/vite.config.js#L105-L106) | Reserves `/axl9002` and `/axl9012` routes |
| [`L181-L182` — proxy rules](https://github.com/vm06007/loveclaw/blob/master/vite.config.js#L181-L182) | Forwards `/axl9002` → `localhost:9002`, `/axl9012` → `localhost:9012` |

### Vercel (production) — [`api/demo-axl.js`](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl.js) + [`api/demo-axl-proxy.js`](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl-proxy.js)

| Code | Purpose |
|---|---|
| [`demo-axl.js L6-L7`](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl.js#L6-L7) | Reads `DEMO_AX_9002_URL` and `DEMO_AX_9012_URL` env vars |
| [`demo-axl.js L17-L18`](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl.js#L17-L18) | Returns `/api/demo-axl-proxy?p=9002` and `?p=9012` endpoint URLs to the SPA |
| [`demo-axl-proxy.js L37-L38`](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl-proxy.js#L37-L38) | Extracts `p` (port) and `sub` (`topology`/`send`/`recv`) from query string |
| [`demo-axl-proxy.js L43`](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl-proxy.js#L43) | Selects the correct env-var target URL for the requested port |
