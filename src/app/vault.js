import { state } from "../lib/state.js";

export const VAULT_ADDRESS = String(import.meta.env.VITE_VAULT_ADDRESS || "").trim();
const USDC_CONTRACT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ETH_RPCS = [
    "https://eth.llamarpc.com",
    "https://ethereum.publicnode.com",
    "https://rpc.ankr.com/eth",
];

async function ethRpcCall(method, params) {
    let lastErr;
    for (const rpc of ETH_RPCS) {
        try {
            const res = await fetch(rpc, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error.message);
            return json.result;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

function hexToBigInt(hex) {
    if (!hex || hex === "0x" || hex === "0x0") return 0n;
    return BigInt(hex);
}

export async function fetchVaultBalances(address) {
    try {
        const ethHex = await ethRpcCall("eth_getBalance", [address, "latest"]);
        const eth = (Number(hexToBigInt(ethHex)) / 1e18).toFixed(4);

        let usdc = "0.00";
        try {
            const usdcHex = await ethRpcCall("eth_call", [
                {
                    to: USDC_CONTRACT,
                    data: "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0"),
                },
                "latest",
            ]);
            usdc = (Number(hexToBigInt(usdcHex)) / 1e6).toFixed(2);
        } catch {
            // USDC call failed — show ETH only
        }

        return `Mutual vault (${address.slice(0, 6)}...${address.slice(-4)}) — ETH: ${eth} | USDC: ${usdc}`;
    } catch (err) {
        return `Could not fetch vault balance: ${err.message}`;
    }
}

export function getVaultAddress() {
    // Mutual vault is a shared deposit address — separate from each partner's personal agent wallet.
    // Falls back to the hardcoded demo address if no couple vault is configured in state.
    return String(state.coupleVaultAddress || VAULT_ADDRESS).trim();
}

export async function refreshVaultDisplay() {
    const address = getVaultAddress();
    const ethEl  = document.getElementById("today-budget-eth");
    const usdcEl = document.getElementById("today-budget-usdc");
    const usdEl  = document.getElementById("today-budget-usd");
    if (!ethEl && !usdcEl) return;

    try {
        const [ethHex] = await Promise.all([
            ethRpcCall("eth_getBalance", [address, "latest"]),
        ]);
        const ethAmt = Number(hexToBigInt(ethHex)) / 1e18;

        let usdcAmt = 0;
        try {
            const usdcHex = await ethRpcCall("eth_call", [
                { to: USDC_CONTRACT, data: "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0") },
                "latest",
            ]);
            usdcAmt = Number(hexToBigInt(usdcHex)) / 1e6;
        } catch { /* USDC unavailable */ }

        if (ethEl)  ethEl.textContent  = ethAmt.toFixed(4);
        if (usdcEl) usdcEl.textContent = usdcAmt.toFixed(2);

        if (usdEl) {
            let ethPrice = 0;
            try {
                const uniKey = String(
                    import.meta.env.VITE_UNISWAP_API_KEY || state.aiSettings?.uniswapApiKey || ""
                ).trim();
                if (uniKey && ethAmt > 0) {
                    // a way to get ETH price in USD using Uniswap API.
                    // Quote 1 ETH → USDC; USDC is 1:1 with USD so output = ETH price in USD
                    const qRes = await fetch("/uniswap/v1/quote", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-api-key": uniKey },
                        body: JSON.stringify({
                            tokenIn: "0x0000000000000000000000000000000000000000",
                            tokenOut: USDC_CONTRACT,
                            amount: "1000000000000000000",
                            type: "EXACT_INPUT",
                            swapper: address,
                            tokenInChainId: 1,
                            tokenOutChainId: 1,
                        }),
                    });
                    if (qRes.ok) {
                        const qJson = await qRes.json();
                        const outRaw = qJson?.quote?.output?.amount ?? qJson?.quote?.outputAmount ?? qJson?.outputAmount;
                        if (outRaw) ethPrice = Number(BigInt(outRaw)) / 1e6;
                    }
                }
            } catch { /* price unavailable — show token amounts only */ }
            const usdTotal = ethAmt * ethPrice + usdcAmt;
            usdEl.textContent = usdTotal > 0 ? `$${usdTotal.toFixed(2)}` : `$${usdcAmt.toFixed(2)}`;
        }
    } catch (err) { console.warn("[vault] balance fetch failed:", err); }
}
