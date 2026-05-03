# Uniswap builder feedback (LoveClaw)

**Purpose:** This file is included for **Uniswap / ETHGlobal prize eligibility** and records our real experience integrating the **Uniswap Trading API** and the broader **Uniswap developer platform** while building **LoveClaw** (Open Agents 2026) — a two-party “mutual vault” flow (quotes → partner approval over our own transport → `swap` → broadcast).

**References we used:** [Uniswap Developers documentation](https://developers.uniswap.org/docs) · [uniswap-ai](https://github.com/Uniswap/uniswap-ai) (skills / plugins for coding agents)

---

## What worked well

- **Trading API v1 shape is learnable.** Once we had an API key from [Uniswap Hub](https://hub.uniswap.org/), `POST …/v1/quote` and `POST …/v1/swap` were enough to go from natural-language intent in the app to a calldata-bearing transaction we could sign with **ethers v6** and send on Ethereum mainnet.
- **Header auth is simple.** Sending `x-api-key` on JSON `POST` requests matched our mental model and worked consistently in both dev (Vite proxy) and prod (Vercel rewrite to `trade-api.gateway.uniswap.org`).
- **uniswap-ai direction is exciting.** Packaging swap integration as a **skill** (`swap-integration`, `npx skills add uniswap/uniswap-ai`) is a strong story for agent-native DeFi. It signals where you want builders to land long term.

---

## Developer experience friction

- **Two “front doors” for docs vs. one obvious path for Trading API.** The main [developers site](https://developers.uniswap.org/docs) emphasizes concepts, protocols, and AI tooling. For a team that only needs **HTTP quote + swap** in a browser app, the hop from landing page → **exact Trading API base URL, version prefix, and request schema** still felt like detective work compared to a single “Web app quickstart” that is copy-paste complete (key, endpoints, minimal `fetch` bodies, error JSON).
- **Browser + CORS forces a proxy.** We never assumed we could call `trade-api.gateway.uniswap.org` directly from the browser; we proxied `/uniswap/*` in Vite and Vercel. That is a common pattern but **is not spelled out as the default recommended setup** in one place next to the API reference, so first-time SPA integrators may burn time on CORS before discovering the fix.
- **Quote response normalization.** Our UI had to defensively read multiple possible paths for the output amount (`quote.output.amount`, `quote.outputAmount`, `outputAmount`, etc.) because evolution or examples differed from what we first assumed. A **single canonical JSON example** per endpoint (including nested `quote` object for `/swap`) would reduce fragile client code.

---

## Documentation gaps (what we wished was clearer)

- **Explicit “SPA integration checklist”:** (1) obtain key, (2) never expose key in client if you care about abuse — or accept client key with rate limits and document that, (3) proxy same-origin path, (4) quote immediately before swap, (5) pass returned `quote` blob into `/swap` unchanged.
- **Quote lifetime / staleness.** We re-fetch a quote immediately before `swap` because quotes feel short-lived (~order of tens of seconds in practice). A **documented TTL or recommended pattern** (“always refresh quote &lt; N seconds before swap”) would align expectations across teams.
- **Error surface.** We surface `errorCode`, `detail`, or raw HTTP status from JSON error bodies when present. A small table in the API docs of **common `errorCode` values** and remediation (insufficient liquidity, bad `swapper`, expired quote, etc.) would speed debugging in hackathon conditions.
- **Relationship between uniswap-ai and the Trading API.** [uniswap-ai](https://github.com/Uniswap/uniswap-ai) is great for **agent authors**; our app still hand-rolled `fetch` to `/v1/quote` and `/v1/swap`. A short doc page “**If you are not using an AI agent** — minimal Trading API sequence” linked from the uniswap-ai README would bridge the two audiences.

---

## Bugs or rough edges we hit (subjective / environment)

- No hard “Uniswap bug” ticket filed from our side, but **opaque failures** when the key was missing or the body did not match what the gateway expected sometimes surfaced only as a generic HTTP error until we parsed JSON manually. Richer, consistent error JSON (always include a machine-readable `code` + human `message`) would help.

---

## What we wish existed

- **Official minimal browser example** (single HTML or Vite snippet): quote → display → swap, with proxy config for Vite and for Vercel/Netlify, using **only** Trading API v1 — no Universal Router knowledge required for the first milestone.
- **Optional “price read” guidance** for displaying ETH/USD in a dashboard: we used the same `/quote` path for a small notional amount as a price hint; documenting **recommended** vs **discouraged** patterns for “display only” would avoid misuse while helping UX teams.
- **Multi-party / delayed execution narrative.** Our product requires **both humans** to confirm before we call `/swap`. The API is still single-`swapper`-centric, which is fine — but a cookbook pattern (“quote at propose time, re-quote at execute time, second signature off-chain in your app”) would validate designs like ours without each team reinventing the narrative.

---

## Closing

Overall the **Trading API** was the right abstraction for a hackathon: we shipped quotes, formatted amounts for chat, and executed swaps from a shared vault wallet. The largest wins for the next wave of builders would be **tighter doc-to-HTTP linkage** (one golden path for browser apps), **canonical response examples**, and a clearer **bridge from uniswap-ai skills to raw REST** for teams who adopt the API before the agent stack.

Thank you for running the program and for investing in developer docs and AI tooling — the feedback above is offered in the spirit of improving the next builder’s first hour on the platform.
