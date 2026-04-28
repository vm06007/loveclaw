/**
 * 0G Storage upload — run via Bun from the examples/0g-storage-memory/ cwd.
 * Reads PRIVATE_KEY + ZG_TEXT from env, uploads to 0G Galileo testnet, prints JSON.
 *
 * Usage (from examples/0g-storage-memory/):
 *   PRIVATE_KEY=0x... ZG_TEXT="..." bun run ../../prototype/relay/zg_upload.ts
 */
import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const RPC      = "https://evmrpc-testnet.0g.ai";
const INDEXER  = "https://indexer-storage-testnet-turbo.0g.ai";
const CHAIN    = "https://chainscan-galileo.0g.ai";
const STORAGE  = "https://storagescan-galileo.0g.ai";

const pk   = process.env.PRIVATE_KEY ?? "";
const text = process.env.ZG_TEXT ?? "";

function bail(msg: string): never {
    process.stdout.write(JSON.stringify({ error: msg }) + "\n");
    process.exit(1);
}

if (!pk)   bail("PRIVATE_KEY missing");
if (!text) bail("ZG_TEXT missing");

try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const signer   = new ethers.Wallet(pk, provider);
    const indexer  = new Indexer(INDEXER);
    const bytes    = new TextEncoder().encode(text);
    const mem      = new MemData(bytes);

    const [, treeErr] = await mem.merkleTree();
    if (treeErr !== null) bail(`merkleTree: ${treeErr}`);

    const [tx, uploadErr] = await indexer.upload(mem, RPC, signer);
    if (uploadErr !== null) bail(`upload: ${uploadErr}`);

    const t = tx as Record<string, unknown>;
    const rootHash: string = (t.rootHash as string) ?? (t.rootHashes as string[])?.[0] ?? "";
    const rawTxHash = (t.txHash as string) ?? (t.txHashes as string[])?.[0] ?? "";
    const txHash   = rawTxHash && rawTxHash.length > 2 ? rawTxHash : null;
    const txSeq    = (t.txSeq as number) ?? (t.txSeqs as number[])?.[0] ?? null;

    process.stdout.write(JSON.stringify({
        rootHash,
        txHash,
        txSeq,
        l1TxUrl:         txHash ? `${CHAIN}/tx/${txHash}` : null,
        storageUrl:      `${STORAGE}/files?q=${encodeURIComponent(rootHash)}`,
        submissionUrl:   (typeof txSeq === "number" && txSeq > 0) ? `${STORAGE}/submission/${txSeq}` : null,
        chainScan:       CHAIN,
        storageScan:     STORAGE,
    }) + "\n");
} catch (e) {
    bail(e instanceof Error ? e.message : String(e));
}
