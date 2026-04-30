/**
 * Uniswap swap utilities — quote fetching, intent parsing, transaction execution.
 * Uses the Uniswap Trading API v1 (https://trade-api.gateway.uniswap.org/v1).
 */
import { state } from "../lib/state.js";
import { encryptAndStoreVaultKey, decryptStoredVaultKey, hasEncryptedVaultKey } from "../lib/agent-key-store.js";

const VAULT_FALLBACK    = String(import.meta.env.VITE_VAULT_ADDRESS     || "").trim();
const VAULT_DEFAULT_KEY = String(import.meta.env.VITE_VAULT_PRIVATE_KEY || "").trim();
const VAULT_DEFAULT_PIN = String(import.meta.env.VITE_VAULT_PIN         || "").trim();

function getVaultAddr() {
    return String(state.coupleVaultAddress || VAULT_FALLBACK).trim();
}

async function ensureVaultKey() {
    if (!hasEncryptedVaultKey()) {
        await encryptAndStoreVaultKey(VAULT_DEFAULT_KEY, VAULT_DEFAULT_PIN);
    }
}

const UNISWAP_API = "/uniswap/v1";
const CHAIN_ID = 1; // Ethereum mainnet

export const KNOWN_TOKENS = {
    ETH:  { address: "0x0000000000000000000000000000000000000000", decimals: 18, symbol: "ETH" },
    WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, symbol: "WETH" },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6,  symbol: "USDC" },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6,  symbol: "USDT" },
    DAI:  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, symbol: "DAI"  },
    WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8,  symbol: "WBTC" },
};

function getUniswapKey() {
    return String(
        import.meta.env.VITE_UNISWAP_API_KEY ||
        state.aiSettings?.uniswapApiKey ||
        ""
    ).trim();
}

const STRIP_PREFIX = /^@love(?:c(?:l(?:a(?:w)?)?)?)?\s*|^@claw\s*|^@lovc(?:l(?:a(?:w)?)?)?\s*/i;

export function looksLikeSwapRequest(text) {
    const q = text.replace(STRIP_PREFIX, "").trim();
    return /\b(swap|exchange|convert|trade|sell|buy)\b/i.test(q) &&
           /\b(eth|weth|usdc|usdt|dai|wbtc)\b/i.test(q);
}

export function parseSwapIntent(text) {
    const q = text.replace(STRIP_PREFIX, "").trim();

    // "swap/exchange/convert/trade/sell 0.1 ETH for/to/into USDC"
    let m = q.match(/(?:swap|exchange|convert|trade|sell)\s+([\d.]+)\s+(\w+)\s+(?:for|to|into|→|->)\s+(\w+)/i);
    if (m) {
        const tokenIn  = KNOWN_TOKENS[m[2].toUpperCase()];
        const tokenOut = KNOWN_TOKENS[m[3].toUpperCase()];
        if (tokenIn && tokenOut) {
            return { amount: m[1], tokenIn, tokenOut, symbolIn: m[2].toUpperCase(), symbolOut: m[3].toUpperCase() };
        }
    }

    // "buy USDC with/using 0.1 ETH"
    m = q.match(/buy\s+(\w+)\s+(?:with|using)\s+([\d.]+)\s+(\w+)/i);
    if (m) {
        const tokenOut = KNOWN_TOKENS[m[1].toUpperCase()];
        const tokenIn  = KNOWN_TOKENS[m[3].toUpperCase()];
        if (tokenIn && tokenOut) {
            return { amount: m[2], tokenIn, tokenOut, symbolIn: m[3].toUpperCase(), symbolOut: m[1].toUpperCase() };
        }
    }

    return null;
}

export async function fetchSwapQuote(intent, swapper) {
    const key = getUniswapKey();
    if (!key) throw new Error("No Uniswap API key. Add VITE_UNISWAP_API_KEY to .env or set it in AI settings.");

    const amountWei = BigInt(Math.round(parseFloat(intent.amount) * 10 ** intent.tokenIn.decimals)).toString();

    const res = await fetch(`${UNISWAP_API}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({
            tokenIn: intent.tokenIn.address,
            tokenOut: intent.tokenOut.address,
            amount: amountWei,
            type: "EXACT_INPUT",
            swapper,
            tokenInChainId: CHAIN_ID,
            tokenOutChainId: CHAIN_ID,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.errorCode || err.detail || `Quote error ${res.status}`);
    }
    return res.json();
}

export function formatQuoteSummary(intent, quoteResp) {
    try {
        const outRaw =
            quoteResp?.quote?.output?.amount ??
            quoteResp?.quote?.outputAmount ??
            quoteResp?.outputAmount;
        if (!outRaw) return `${intent.amount} ${intent.symbolIn} → ? ${intent.symbolOut}`;
        const out = (Number(BigInt(outRaw)) / 10 ** intent.tokenOut.decimals).toFixed(intent.tokenOut.decimals <= 6 ? 2 : 4);
        return `${intent.amount} ${intent.symbolIn} → ~${out} ${intent.symbolOut}`;
    } catch {
        return `${intent.amount} ${intent.symbolIn} → ? ${intent.symbolOut}`;
    }
}

export async function executeSwap(intent) {
    await ensureVaultKey();
    const pin = VAULT_DEFAULT_PIN;
    const key = getUniswapKey();
    if (!key) throw new Error("No Uniswap API key.");

    const swapper = getVaultAddr();

    // Fresh quote at execution time (quotes expire in ~30s)
    const quoteResp = await fetchSwapQuote(intent, swapper);

    const swapRes = await fetch(`${UNISWAP_API}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: JSON.stringify({ quote: quoteResp.quote }),
    });

    if (!swapRes.ok) {
        const err = await swapRes.json().catch(() => ({}));
        throw new Error(err.errorCode || err.detail || `Swap error ${swapRes.status}`);
    }
    const { swap } = await swapRes.json();
    if (!swap?.data) throw new Error("Swap API returned no transaction data.");

    const privateKey = await decryptStoredVaultKey(pin);
    const { ethers } = await import("https://esm.sh/ethers@6.13.0");
    const RPC_CANDIDATES = [
        "https://cloudflare-eth.com",
        "https://ethereum.publicnode.com",
        "https://rpc.ankr.com/eth",
        "https://eth.llamarpc.com",
    ];
    let provider;
    for (const rpcUrl of RPC_CANDIDATES) {
        try {
            const p = new ethers.JsonRpcProvider(rpcUrl);
            await p.getTransactionCount(new ethers.Wallet(privateKey).address, "pending");
            provider = p;
            break;
        } catch {
            // try next
        }
    }
    if (!provider) throw new Error("All RPC endpoints are unavailable or rate-limited.");
    const wallet = new ethers.Wallet(privateKey, provider);

    const tx = await wallet.sendTransaction({
        to: swap.to,
        data: swap.data,
        value: swap.value ?? "0x0",
        chainId: swap.chainId ?? CHAIN_ID,
        gasLimit: swap.gasLimit,
    });

    return tx.hash;
}
