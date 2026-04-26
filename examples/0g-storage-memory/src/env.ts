import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type OgNetwork = "testnet" | "mainnet";

const ENDPOINTS: Record<
    OgNetwork,
    { rpc: string; indexer: string; label: string; region: string }
> = {
    testnet: {
        rpc: "https://evmrpc-testnet.0g.ai",
        indexer: "https://indexer-storage-testnet-turbo.0g.ai",
        label: "0G Testnet (Galileo) - turbo indexer",
        region: "Galileo",
    },
    mainnet: {
        rpc: "https://evmrpc.0g.ai",
        indexer: "https://indexer-storage-turbo.0g.ai",
        label: "0G Mainnet (Aristotle) - turbo indexer",
        region: "Aristotle",
    },
};

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");

function parseEnvText(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) {
            continue;
        }
        const i = t.indexOf("=");
        if (i === -1) {
            continue;
        }
        const key = t.slice(0, i).trim();
        const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        out[key] = val;
    }
    return out;
}

/**
 * Loads `.env` then `.env.local`. Later file wins per key.
 * Does not overwrite non-empty `process.env` (shell wins).
 */
export async function loadEnv() {
    const paths = [join(ROOT, ".env"), join(ROOT, ".env.local")];
    const merged: Record<string, string> = {};
    let foundFile = false;
    for (const envPath of paths) {
        const file = Bun.file(envPath);
        if (!(await file.exists())) {
            continue;
        }
        foundFile = true;
        Object.assign(merged, parseEnvText(await file.text()));
    }
    if (!foundFile) {
        console.warn(
            `No .env or .env.local under ${ROOT} - using process.env only. ` +
                `Copy .env.local.example → .env.local and set PRIVATE_KEY.`,
        );
        return;
    }
    for (const [key, val] of Object.entries(merged)) {
        if (!process.env[key]) {
            process.env[key] = val;
        }
    }
}

function parseOgNetwork(): OgNetwork {
    const raw = (process.env.OG_NETWORK ?? "testnet").trim().toLowerCase();
    if (!raw || raw === "testnet" || raw === "galileo") {
        return "testnet";
    }
    if (raw === "mainnet" || raw === "aristotle") {
        return "mainnet";
    }
    throw new Error(
        `OG_NETWORK must be testnet|galileo or mainnet|aristotle; got "${process.env.OG_NETWORK}"`,
    );
}

export function resolveEndpoints(): {
    network: OgNetwork;
    label: string;
    region: string;
    rpcUrl: string;
    indexerRpc: string;
} {
    const network = parseOgNetwork();
    const base = ENDPOINTS[network];
    return {
        network,
        label: base.label,
        region: base.region,
        rpcUrl: process.env.RPC_URL ?? base.rpc,
        indexerRpc: process.env.INDEXER_RPC ?? base.indexer,
    };
}

export function storageScanUrl(network: OgNetwork): string {
    return network === "mainnet"
        ? "https://storagescan.0g.ai"
        : "https://storagescan-galileo.0g.ai";
}
