# AXL Integration

LoveClaw uses **AXL** as its peer-to-peer transport layer. Every message between partners (breach alerts, diary sync, location heartbeats, handshakes, pact amendments) travels over AXL with no server in the middle.

## What AXL Provides

| Capability | How LoveClaw uses it |
|---|---|
| P2P mesh nodes | One node per device. Creator runs on `:9002`, joiner on `:9012` |
| `/topology` endpoint | Node discovery on startup |
| `/send` endpoint | Outbound messages addressed to the partner's peer key |
| `/recv` endpoint | Inbound message polling every 400 ms |
| Peer key addressing | Each partner's `myAxlKey` (64-char hex) is embedded in the invite QR and URL |

## AXL Client

File: [`src/axl/client.js`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js)

The entire AXL abstraction lives in this one file. Everything else in the app imports from here.

| Line | What it does |
|---|---|
| [L9 `axlPublicBase(port)`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L9) | Resolves the correct AXL base URL, honouring `VITE_AXL_PORT` env override and the `:9002` / `:9012` port split |
| [L18 `meshRequestUrl(base, segment)`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L18) | Builds the full URL for `topology`, `send`, and `recv` sub-paths |
| [L32 `resolveAxlNodes(preferPort)`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L32) | Async node discovery. Tries the primary port first, falls back to the secondary, then caches the result |
| [L98 `setPreferPort(port)`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L98) | Sets which AXL port this instance should prefer. Called during boot |
| [L116 `fetch(..., "topology")`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L116) | Calls the AXL `/topology` endpoint to confirm the node is alive |
| [L151 `fetch(..., "send")`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L151) | Calls the AXL `/send` endpoint to push a message to the partner's peer key |
| [L167 `fetch(..., "recv")`](https://github.com/vm06007/loveclaw/blob/master/src/axl/client.js#L167) | Calls the AXL `/recv` endpoint to pull inbound messages |

## Polling Loop

File: [`src/axl/poll.js`](https://github.com/vm06007/loveclaw/blob/master/src/axl/poll.js)

| Line | What it does |
|---|---|
| [L10 `startAxlPoll()`](https://github.com/vm06007/loveclaw/blob/master/src/axl/poll.js#L10) | Starts a 400 ms `setInterval` that continuously calls `axl.recv()` |
| [L34 `axl_handshake` dispatch](https://github.com/vm06007/loveclaw/blob/master/src/axl/poll.js#L34) | Detects an incoming `axl_handshake` message to complete the pairing flow |
| [L38 couple-ID mismatch warning](https://github.com/vm06007/loveclaw/blob/master/src/axl/poll.js#L38) | Logs when the handshake `coupleId` does not match but pairs anyway |

## Transport Abstraction

File: [`src/app/transport.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/transport.js)

All higher-level modules call `transportSend` rather than AXL directly, which keeps them transport-agnostic.

| Line | What it does |
|---|---|
| [L2 import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/app/transport.js#L2) | Pulls in the AXL client |
| [L5-L7 `transportSend(payload)`](https://github.com/vm06007/loveclaw/blob/master/src/app/transport.js#L5-L7) | Tries `axl.send()` first and falls back to local IPC if AXL is not available |

## Boot and Initialization

File: [`src/app/boot.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js)

| Line | What it does |
|---|---|
| [L7-L8 imports](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L7-L8) | Imports the `axl` client and `startAxlPoll` |
| [L75 `axl.setPreferPort(9002)`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L75) | Assigns the creator to port 9002 |
| [L77 `axl.setPreferPort(9012)`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L77) | Assigns the joiner to port 9012 |
| [L152 `axl.init(partnerAxlKey)`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L152) | Initialises AXL on every app boot when already paired |
| [L154 `startAxlPoll()`](https://github.com/vm06007/loveclaw/blob/master/src/app/boot.js#L154) | Begins the polling loop after a successful init |

## Pairing Flow

### Creator side

File: [`src/screens/create.js`](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js)

| Line | What it does |
|---|---|
| [L8-L9 imports](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L8-L9) | Imports `axl` and `startAxlPoll` |
| [L197 "connecting to AXL..."](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L197) | Shows the connecting status in the UI |
| [L200 `axl.init()`](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L200) | Initialises the AXL node for the creator (no partner key yet) |
| [L283 `startAxlPoll()`](https://github.com/vm06007/loveclaw/blob/master/src/screens/create.js#L283) | Starts polling to wait for the joiner's handshake |

### Joiner side

File: [`src/screens/join.js`](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js)

| Line | What it does |
|---|---|
| [L6-L7 imports](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L6-L7) | Imports `axl` and `startAxlPoll` |
| [L77 "connecting to AXL..."](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L77) | Shows the connecting status in the UI |
| [L80 `axl.init(state.partnerAxlKey)`](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L80) | Initialises AXL with the creator's key extracted from the invite URL |
| [L99 `axl.send(partnerAxlKey, handshake)`](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L99) | Sends the `axl_handshake` message to the creator |
| [L106 `startAxlPoll()`](https://github.com/vm06007/loveclaw/blob/master/src/screens/join.js#L106) | Starts polling after the handshake is sent |

## Message Types Sent Over AXL

### Breach and pact dissolution

File: [`src/app/breakPact.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js)

| Line | Message |
|---|---|
| [L2 import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L2) | AXL client import |
| [L18-L19 `axl.send()`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L18-L19) | Sends break-pact messages over AXL |
| [L226 `break_pact_propose`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L226) | Initiates a dissolution proposal |
| [L242 `break_pact_grant`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L242) | Partner accepts dissolution |
| [L253 `break_pact_deny`](https://github.com/vm06007/loveclaw/blob/master/src/app/breakPact.js#L253) | Partner rejects dissolution |

### Diary sync

File: [`src/dashboard/diary.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js)

| Line | Message |
|---|---|
| [L3 import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L3) | AXL client import |
| [L324 `diary_note`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L324) | Sends a new diary note to the partner |
| [L360 `diary_note_delete`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L360) | Sends a note deletion |
| [L363 `diary_notes_sync`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L363) | Full authoritative diary sync |
| [L381-L382 delete + sync](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L381-L382) | Paired delete followed by a re-sync |
| [L410-L411 delete + sync](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L410-L411) | Same paired delete and re-sync on an alternate code path |
| [L461 `diary_notes_sync`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/diary.js#L461) | Full notes sync sent on reconnect |

### Swap negotiation

File: [`src/dashboard/swap-proposal.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js)

Partners negotiate any swap peer-to-peer over AXL before a transaction is ever broadcast.

| Line | Message |
|---|---|
| [L85-L88 `swap_confirm`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L85-L88) | Partner approves the proposed swap |
| [L96-L99 `swap_deny`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L96-L99) | Partner rejects the proposed swap |
| [L105-L107 `swap_execute`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L105-L107) | Executes the agreed swap once both sides confirm |

### Pact amendments

File: [`src/dashboard/pact.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/pact.js)

| Line | Message |
|---|---|
| [L2 import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/pact.js#L2) | AXL client import |
| [L111-L112 `axl.send()`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/pact.js#L111-L112) | Sends the pact amendment message |
| [L356 `pact_changes_propose`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/pact.js#L356) | Proposes a trigger change to the partner |

### Profile and avatar sync

File: [`src/app/coop-profile.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js)

| Line | What it does |
|---|---|
| [L5 import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L5) | AXL client import |
| [L440-L441 re-init](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L440-L441) | Re-initialises AXL if the connection dropped |
| [L454-L455 `axl.send(payload)`](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L454-L455) | Sends the profile and avatar payload over AXL |
| [L491 AXL offline guard](https://github.com/vm06007/loveclaw/blob/master/src/app/coop-profile.js#L491) | Warns the user if photo sync fails because AXL is not available |

## Connectivity Status

File: [`src/app/ping.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/ping.js)

| Line | What it does |
|---|---|
| [L5 import `axl`](https://github.com/vm06007/loveclaw/blob/master/src/app/ping.js#L5) | AXL client import |
| [L28-L30 port display](https://github.com/vm06007/loveclaw/blob/master/src/app/ping.js#L28-L30) | Shows `axl :9002` / `axl :9012` or `local IPC` in the dashboard header |
| [L33-L35 offline message](https://github.com/vm06007/loveclaw/blob/master/src/app/ping.js#L33-L35) | Explains the Vite proxy fallback and how to start a local AXL node |

## Proxy Configuration

### Local dev (Vite)

File: [`vite.config.js`](https://github.com/vm06007/loveclaw/blob/master/vite.config.js)

| Line | What it does |
|---|---|
| [L105-L106 path reservations](https://github.com/vm06007/loveclaw/blob/master/vite.config.js#L105-L106) | Reserves the `/axl9002` and `/axl9012` routes so Vite does not intercept them |
| [L181-L182 proxy rules](https://github.com/vm06007/loveclaw/blob/master/vite.config.js#L181-L182) | Forwards `/axl9002` to `localhost:9002` and `/axl9012` to `localhost:9012` |

### Production (Vercel)

Files: [`api/demo-axl.js`](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl.js) and [`api/demo-axl-proxy.js`](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl-proxy.js)

| Line | What it does |
|---|---|
| [demo-axl.js L6-L7](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl.js#L6-L7) | Reads `DEMO_AX_9002_URL` and `DEMO_AX_9012_URL` from environment |
| [demo-axl.js L17-L18](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl.js#L17-L18) | Returns the two proxy endpoint URLs to the SPA at runtime |
| [demo-axl-proxy.js L37-L38](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl-proxy.js#L37-L38) | Extracts the port (`9002` or `9012`) and sub-path (`topology`, `send`, `recv`) from the query string |
| [demo-axl-proxy.js L43](https://github.com/vm06007/loveclaw/blob/master/api/demo-axl-proxy.js#L43) | Selects the correct env-var target URL for the requested port and forwards the request |
