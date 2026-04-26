/**
 * CLI: upload a sample pact chat snapshot to 0G Storage, then download + verify.
 *
 * Docs: https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk
 * Quickstart: https://build.0g.ai/storage/#quickstart
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
    decodeSnapshot,
    encodeSnapshot,
    type PactMemorySnapshot,
} from "./memory.js";
import { loadEnv, resolveEndpoints, ROOT, storageScanUrl } from "./env.js";
import { downloadUtf8Text, uploadUtf8Text } from "./storage.js";

function sampleSnapshot(): PactMemorySnapshot {
    return {
        schemaVersion: 1,
        coupleId: "demo-couple",
        seq: 1,
        turns: [
            {
                ts: Date.now() - 60_000,
                role: "user",
                author: "alice",
                text: "Let's log this pact turn to 0G Storage.",
            },
            {
                ts: Date.now() - 30_000,
                role: "agent",
                author: "claw-helper",
                text: "Ack - persisting snapshot as MemData → root hash.",
            },
        ],
    };
}

async function cmdUpload(ep: ReturnType<typeof resolveEndpoints>) {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
        const hint =
            ep.network === "mainnet"
                ? "Fund with 0G on Mainnet (gas)."
                : "Fund with testnet tokens (e.g. faucet.0g.ai).";
        throw new Error(
            `Set PRIVATE_KEY in .env.local (see .env.local.example). ${hint}`,
        );
    }

    const payload = new TextDecoder().decode(encodeSnapshot(sampleSnapshot()));
    const { rootHash, txHash } = await uploadUtf8Text(
        { rpcUrl: ep.rpcUrl, indexerRpc: ep.indexerRpc },
        pk,
        payload,
    );

    console.log(`Upload OK - ${ep.label}`);
    console.log(`OG_NETWORK=${ep.network}  RPC=${ep.rpcUrl}`);
    console.log("rootHash:", rootHash);
    if (txHash) {
        console.log("txHash:", txHash);
    }
    console.log(`Verify on StorageScan (${ep.network}): ${storageScanUrl(ep.network)}`);
    console.log("Download with: bun run src/demo.ts download", rootHash);
}

async function cmdDownload(
    rootHash: string,
    ep: ReturnType<typeof resolveEndpoints>,
) {
    const raw = await downloadUtf8Text(
        { rpcUrl: ep.rpcUrl, indexerRpc: ep.indexerRpc },
        rootHash,
    );

    const outDir = join(ROOT, "out");
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, "memory-download.json");
    await Bun.write(outPath, raw);

    let pretty: string;
    try {
        const snapshot = decodeSnapshot(new TextEncoder().encode(raw));
        pretty = JSON.stringify(snapshot, null, 4);
    } catch {
        pretty = raw;
    }
    console.log(`Download OK (${ep.label}) →`, outPath);
    console.log(pretty);
}

async function main() {
    await loadEnv();
    const ep = resolveEndpoints();
    const cmd = process.argv[2];
    const arg = process.argv[3];
    if (!cmd || cmd === "upload") {
        await cmdUpload(ep);
        return;
    }
    if (cmd === "download") {
        if (!arg) {
            throw new Error("usage: bun run src/demo.ts download <rootHash>");
        }
        await cmdDownload(arg, ep);
        return;
    }
    throw new Error(
        "usage: bun run src/demo.ts [upload|download <rootHash>]",
    );
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
