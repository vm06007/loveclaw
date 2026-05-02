# Uniswap Integration — LoveClaw

LoveClaw uses **Uniswap** for two complementary purposes: the **Trading API** powers a shared couple vault where partners can swap tokens together, and the **Ethereum smart contract** (`LoveClawPact`) locks real ETH stakes on-chain to back relationship trust commitments.

---

## 1. Uniswap Trading API v1

All requests target `https://trade-api.gateway.uniswap.org/v1` — proxied through Vite in dev and Vercel in production.

### Swap Utilities — [`src/app/swap.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js)

| Code | Purpose |
|---|---|
| [`L22` — `UNISWAP_API = "/uniswap/v1"`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L22) | Base path for all Trading API calls |
| [`L23` — `CHAIN_ID = 1`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L23) | Ethereum mainnet |
| [`L25-L32` — `KNOWN_TOKENS`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L25-L32) | ETH, WETH, USDC, USDT, DAI, WBTC — mainnet addresses + decimals |
| [`L34` — `getUniswapKey()`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L34) | Reads API key from `VITE_UNISWAP_API_KEY` env or user AI settings |
| [`L50` — `parseSwapIntent(text)`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L50) | Parses natural-language swap commands ("swap 0.1 ETH for USDC") |
| [`L76` — `fetchSwapQuote(intent, swapper)`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L76) | Function definition |
| [`L82` — `fetch(UNISWAP_API + "/quote")`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L82) | **POST `/uniswap/v1/quote`** with `x-api-key` header — returns best route + amount out |
| [`L103` — `formatQuoteSummary(intent, quoteResp)`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L103) | Human-readable summary of quote for UI display |
| [`L117` — `executeSwap(intent)`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L117) | Function definition — full quote → execute flow |
| [`L126` — `fetchSwapQuote(intent, swapper)`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L126) | Gets quote before executing |
| [`L128` — `fetch(UNISWAP_API + "/swap")`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L128) | **POST `/uniswap/v1/swap`** — returns signed transaction; broadcast via ethers |

### Vault Display & ETH Price Feed — [`src/app/vault.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js)

| Code | Purpose |
|---|---|
| [`L35` — `fetchVaultBalances(address)`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L35) | Queries ETH and USDC balances for the couple's vault address |
| [`L95` — Uniswap API key](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L95) | Reads `VITE_UNISWAP_API_KEY` to price ETH |
| [`L100` — `fetch("/uniswap/v1/quote")`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L100) | **POST `/uniswap/v1/quote`** — `tokenIn=ETH`, `tokenOut=USDC` to get live ETH/USD price |
| [`L102` — `"x-api-key": uniKey`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L102) | Passes Uniswap API key in request header |

### Swap Negotiation over AXL — [`src/dashboard/swap-proposal.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js)

Partners negotiate swaps peer-to-peer before any transaction is broadcast:

| Code | AXL message type |
|---|---|
| [`L85-L88` — `axl.send(…swap_confirm)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L85-L88) | Partner approves the proposed swap |
| [`L96-L99` — `axl.send(…swap_deny)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L96-L99) | Partner rejects the proposed swap |
| [`L105-L107` — `axl.send(…swap_execute)`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L105-L107) | Agreed swap is executed via `executeSwap()` |

### Vite Proxy (dev) — [`vite.config.js`](https://github.com/vm06007/loveclaw/blob/master/vite.config.js)

| Code | Purpose |
|---|---|
| [`L108` — `/uniswap` reserved](https://github.com/vm06007/loveclaw/blob/master/vite.config.js#L108) | Prevents Vite from handling this path itself |
| [`L194-L197` — proxy rule](https://github.com/vm06007/loveclaw/blob/master/vite.config.js#L194-L197) | Rewrites `/uniswap/…` → `https://trade-api.gateway.uniswap.org/…` with `changeOrigin: true` |

---

## 2. Ethereum Smart Contract — [`evm/src/LoveClawPact.sol`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol)

The core relationship pact contract. Two partners each lock ETH and assign an **AI agent** address; agents (not partners) file breach evidence on-chain.

### Trigger Bitmask

| Code | Constant |
|---|---|
| [`L12` — `TRIGGER_DATING_APP = 1`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L12) | Dating app detected |
| [`L13` — `TRIGGER_LOCATION = 2`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L13) | Suspicious location |
| [`L14` — `TRIGGER_CONTACT = 4`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L14) | Contact breach |
| [`L15` — `TRIGGER_DIARY = 8`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L15) | Diary evidence |

### Pact Lifecycle

| Code | Function |
|---|---|
| [`L83` — `createPact(…) payable`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L83) | Creator deposits ETH stake and sets partner + agent addresses |
| [`L130` — `joinPact(pactId) payable`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L130) | PartnerB joins and deposits their ETH stake |
| [`L149` — `initiateInstantBreach(…)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L149) | First agent files instant breach with evidence |
| [`L172` — `confirmInstantBreach(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L172) | Second agent confirms — entire stake transfers to victim immediately |
| [`L199` — `rejectInstantBreach(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L199) | Second agent rejects — pact returns to Active |
| [`L221` — `fileBreachWithDelay(…)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L221) | Agent files breach with a dispute window (default 24 h, max 7 days) |
| [`L257` — `disputeBreach(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L257) | Accused partner disputes within the window |
| [`L286` — `claimBreachPayout(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L286) | Innocent partner claims entire stake after window closes |
| [`L335` — `dissolvePact(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L335) | Either partner dissolves — stakes split 50/50 |
| [`L367` — `proposeTriggerAmendment(…)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L367) | Partner proposes new breach trigger bitmask |
| [`L393` — `acceptTriggerAmendment(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L393) | Other partner accepts trigger change |

---

## 3. Foundry Test Suite — [`evm/test/LoveClawPact.t.sol`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol)

Full Foundry test coverage using `forge-std`:

| Code | Test category |
|---|---|
| [`L43` — `test_createPact_basic`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L43) | Pact creation, state and address checks |
| [`L62` — `test_joinPact`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L62) | Partner B joins with stake; `totalStake` verified |
| [`L74` — `test_createPact_emitsEvent`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L74) | Event emission checks |
| [`L160` — `test_instantBreach_fullFlow`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L160) | Both-agent confirm path; ETH transferred to victim |
| [`L209` — `test_rejectInstantBreach`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L209) | Second agent rejects; pact returns to Active, no ETH moved |
| [`L238` — same-agent-cannot-confirm revert](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L238) | `SameAgentCannotConfirm` guard |
| [`L276` — `test_fileBreachWithDelay_defaultWindow`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L276) | Default 24 h dispute window set |
| [`L317` — `test_claimBreachPayout`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L317) | `vm.warp` past window; victim claims full stake |
| [`L424` — `test_dissolvePact_equalStakes`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L424) | 50/50 split on dissolution |
| [`L478` — `test_amendTriggers`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L478) | Propose + accept trigger change |
| [`L545` — `test_noStakePact_instantBreach`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L545) | Zero-stake pact — breach resolves with no ETH movement |
| [`L578` — `testFuzz_createPact_stakePreserved`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L578) | Fuzz: stake accounting always correct |
| [`L592` — `testFuzz_dissolveSplitsEvenly`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L592) | Fuzz: dissolution split never loses wei |
| [`L617` — `testFuzz_triggers_bitmask`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L617) | Fuzz: any non-zero trigger bitmask accepted |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_UNISWAP_API_KEY` | Uniswap Trading API key — used in [`swap.js L34`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L34) and [`vault.js L95`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L95) |
| `VITE_VAULT_ADDRESS` | Ethereum address of the couple's shared vault — used in [`vault.js L3`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L3) |
| `VITE_VAULT_PRIVATE_KEY` | Signing key for vault swap transactions |

---

## Running the Smart Contracts

```bash
cd evm

# Run all tests (including fuzz)
forge test -vv

# Deploy
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```
