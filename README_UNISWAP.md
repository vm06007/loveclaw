# Uniswap Integration

LoveClaw uses Uniswap in two ways. The **Trading API** powers a shared couple vault where partners can get quotes and execute token swaps together. The **LoveClawPact smart contract** lets both partners lock real ETH stakes on Ethereum to back their relationship trust commitments.

## Uniswap Trading API v1

All requests go to `https://trade-api.gateway.uniswap.org/v1`, proxied through Vite in development and Vercel in production so the browser never hits the API directly.

### Swap utilities

File: [`src/app/swap.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js)

This file handles everything swap-related: parsing natural language, fetching quotes, and broadcasting signed transactions.

| Line | What it does |
|---|---|
| [L22 `UNISWAP_API`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L22) | Sets the base path to `/uniswap/v1` for all Trading API calls |
| [L23 `CHAIN_ID = 1`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L23) | Targets Ethereum mainnet |
| [L25-L32 `KNOWN_TOKENS`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L25-L32) | Mainnet addresses and decimals for ETH, WETH, USDC, USDT, DAI, and WBTC |
| [L34 `getUniswapKey()`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L34) | Reads the API key from `VITE_UNISWAP_API_KEY` or the user's AI settings |
| [L50 `parseSwapIntent(text)`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L50) | Parses natural-language commands like "swap 0.1 ETH for USDC" into a structured intent |
| [L76 `fetchSwapQuote(intent, swapper)`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L76) | Function definition for fetching a quote |
| [L82 POST `/uniswap/v1/quote`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L82) | Calls the Uniswap quote endpoint with `x-api-key` header and returns the best route and output amount |
| [L103 `formatQuoteSummary()`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L103) | Formats the quote response into a human-readable string for the UI |
| [L117 `executeSwap(intent)`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L117) | Function definition for the full quote-then-execute flow |
| [L126 `fetchSwapQuote()` inside execute](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L126) | Gets a fresh quote immediately before executing |
| [L128 POST `/uniswap/v1/swap`](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L128) | Calls the Uniswap swap endpoint and gets back a signed transaction, which is then broadcast via ethers |

### Vault balances and ETH price feed

File: [`src/app/vault.js`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js)

The vault display shows real balances and prices the ETH in USD using a live Uniswap quote.

| Line | What it does |
|---|---|
| [L35 `fetchVaultBalances(address)`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L35) | Queries the ETH and USDC balances for the couple's vault address |
| [L95 Uniswap API key](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L95) | Reads `VITE_UNISWAP_API_KEY` to authenticate the price request |
| [L100 POST `/uniswap/v1/quote`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L100) | Calls the quote endpoint with `tokenIn=ETH` and `tokenOut=USDC` to get the live ETH/USD price |
| [L102 `"x-api-key": uniKey`](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L102) | Passes the Uniswap API key in the request header |

### Swap negotiation over AXL

File: [`src/dashboard/swap-proposal.js`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js)

Before any transaction hits the chain, partners negotiate the swap peer-to-peer over the AXL mesh. Both sides must agree before `executeSwap()` is called.

| Line | AXL message |
|---|---|
| [L85-L88 `swap_confirm`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L85-L88) | Partner approves the proposed swap |
| [L96-L99 `swap_deny`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L96-L99) | Partner rejects the proposed swap |
| [L105-L107 `swap_execute`](https://github.com/vm06007/loveclaw/blob/master/src/dashboard/swap-proposal.js#L105-L107) | Executes the swap once both partners have confirmed |

### Proxy configuration

File: [`vite.config.js`](https://github.com/vm06007/loveclaw/blob/master/vite.config.js)

| Line | What it does |
|---|---|
| [L108 `/uniswap` reserved](https://github.com/vm06007/loveclaw/blob/master/vite.config.js#L108) | Prevents Vite from intercepting the `/uniswap` path |
| [L194-L197 proxy rule](https://github.com/vm06007/loveclaw/blob/master/vite.config.js#L194-L197) | Rewrites `/uniswap/...` to `https://trade-api.gateway.uniswap.org/...` with `changeOrigin: true` |

## LoveClawPact smart contract

File: [`evm/src/LoveClawPact.sol`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol)

This is the core on-chain relationship pact. Both partners deposit ETH when creating and joining a pact, and assign an AI agent address each. Only the agents (not the partners themselves) can file breach evidence on-chain, which prevents self-serving accusations.

### Breach trigger bitmask

| Line | Constant |
|---|---|
| [L12 `TRIGGER_DATING_APP = 1`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L12) | Dating app detected on device |
| [L13 `TRIGGER_LOCATION = 2`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L13) | Suspicious location signal |
| [L14 `TRIGGER_CONTACT = 4`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L14) | Contact-based breach |
| [L15 `TRIGGER_DIARY = 8`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L15) | Diary evidence |

### Pact lifecycle functions

| Line | Function |
|---|---|
| [L83 `createPact(...) payable`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L83) | Creator deposits ETH stake and sets the partner and agent addresses |
| [L130 `joinPact(pactId) payable`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L130) | Partner B joins and deposits their own ETH stake |
| [L149 `initiateInstantBreach(...)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L149) | First agent files an instant breach with evidence |
| [L172 `confirmInstantBreach(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L172) | Second agent confirms the breach; the entire stake transfers to the victim immediately |
| [L199 `rejectInstantBreach(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L199) | Second agent rejects the breach; pact returns to Active with no funds moved |
| [L221 `fileBreachWithDelay(...)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L221) | Agent files a breach with a dispute window (default 24 hours, max 7 days) |
| [L257 `disputeBreach(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L257) | The accused partner can dispute the breach while the window is open |
| [L286 `claimBreachPayout(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L286) | The innocent partner claims the full stake after the dispute window closes |
| [L335 `dissolvePact(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L335) | Either partner dissolves the pact; stakes are split 50/50 |
| [L367 `proposeTriggerAmendment(...)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L367) | A partner proposes changing the breach trigger bitmask |
| [L393 `acceptTriggerAmendment(pactId)`](https://github.com/vm06007/loveclaw/blob/master/evm/src/LoveClawPact.sol#L393) | The other partner accepts the trigger change |

## Foundry test suite

File: [`evm/test/LoveClawPact.t.sol`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol)

The contract is covered by a full Foundry test suite including fuzz tests.

| Line | Test |
|---|---|
| [L43 `test_createPact_basic`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L43) | Checks pact state and addresses after creation |
| [L62 `test_joinPact`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L62) | Partner B joins with a stake and `totalStake` is verified |
| [L74 `test_createPact_emitsEvent`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L74) | Confirms event emission on creation |
| [L160 `test_instantBreach_fullFlow`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L160) | Both agents confirm; ETH transfers to the victim |
| [L209 `test_rejectInstantBreach`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L209) | Second agent rejects; pact returns to Active and no ETH moves |
| [L238 same-agent-cannot-confirm revert](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L238) | Checks the `SameAgentCannotConfirm` guard |
| [L276 `test_fileBreachWithDelay_defaultWindow`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L276) | Confirms the default 24 hour dispute window is set |
| [L317 `test_claimBreachPayout`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L317) | Warps past the window with `vm.warp`; victim claims the full stake |
| [L424 `test_dissolvePact_equalStakes`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L424) | Confirms a 50/50 split on dissolution |
| [L478 `test_amendTriggers`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L478) | Propose and accept a trigger change |
| [L545 `test_noStakePact_instantBreach`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L545) | Zero-stake pact resolves a breach with no ETH movement |
| [L578 `testFuzz_createPact_stakePreserved`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L578) | Fuzz: stake accounting is always correct |
| [L592 `testFuzz_dissolveSplitsEvenly`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L592) | Fuzz: dissolution never loses a wei |
| [L617 `testFuzz_triggers_bitmask`](https://github.com/vm06007/loveclaw/blob/master/evm/test/LoveClawPact.t.sol#L617) | Fuzz: any non-zero trigger bitmask is accepted |

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_UNISWAP_API_KEY` | Uniswap Trading API key, read at [swap.js L34](https://github.com/vm06007/loveclaw/blob/master/src/app/swap.js#L34) and [vault.js L95](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L95) |
| `VITE_VAULT_ADDRESS` | Ethereum address of the couple's shared vault, read at [vault.js L3](https://github.com/vm06007/loveclaw/blob/master/src/app/vault.js#L3) |
| `VITE_VAULT_PRIVATE_KEY` | Signing key used to broadcast vault swap transactions |

## Running the contracts

```bash
cd evm

# Run all tests including fuzz
forge test -vv

# Deploy
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```
