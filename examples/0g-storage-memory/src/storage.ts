import { Indexer, MemData, StorageNode } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import type { OgNetwork } from "./env.js";

type UploadTxResult =
    | { txHash: string; rootHash: string; txSeq: number }
    | { txHashes: string[]; rootHashes: string[]; txSeqs: number[] };

export type StorageEndpoints = {
    rpcUrl: string;
    indexerRpc: string;
};

function rootHashFromUploadTx(tx: UploadTxResult): string {
    if ("rootHash" in tx) {
        return tx.rootHash;
    }
    const first = tx.rootHashes[0];
    if (!first) {
        throw new Error(
            "upload returned fragmented result but rootHashes was empty",
        );
    }
    return first;
}

function txMetaFromUploadTx(
    tx: UploadTxResult,
): { txHash: string | null; txSeq: number | null } {
    const normalizeHash = (h: string | null | undefined): string | null => {
        const t = h != null ? String(h).trim() : "";
        return t.length > 2 ? t : null;
    };

    if ("txHash" in tx) {
        return {
            txHash: normalizeHash(tx.txHash),
            txSeq: typeof tx.txSeq === "number" ? tx.txSeq : null,
        };
    }
    const h = tx.txHashes[0] ?? null;
    const s = tx.txSeqs[0];
    return {
        txHash: normalizeHash(h),
        txSeq: typeof s === "number" ? s : null,
    };
}

export async function uploadUtf8Text(
    ep: StorageEndpoints,
    privateKey: string,
    text: string,
): Promise<{ rootHash: string; txHash: string | null; txSeq: number | null }> {
    const provider = new ethers.JsonRpcProvider(ep.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(ep.indexerRpc);
    const bytes = new TextEncoder().encode(text);
    const mem = new MemData(bytes);

    const [, treeErr] = await mem.merkleTree();
    if (treeErr !== null) {
        throw new Error(`merkleTree: ${treeErr}`);
    }

    const [tx, uploadErr] = await indexer.upload(mem, ep.rpcUrl, signer);
    if (uploadErr !== null) {
        throw new Error(`upload: ${uploadErr}`);
    }

    const rootHash = rootHashFromUploadTx(tx as UploadTxResult);
    const { txHash, txSeq } = txMetaFromUploadTx(tx as UploadTxResult);

    return { rootHash, txHash, txSeq };
}

/**
 * Resolve storage log `tx.seq` for a root hash (StorageScan `/submission/:seq`).
 * Tries a few replica nodes from the indexer in case one is slow.
 */
export async function getTxSeqForRootHash(
    ep: StorageEndpoints,
    rootHash: string,
): Promise<number | null> {
    const indexer = new Indexer(ep.indexerRpc);
    let locations: Awaited<ReturnType<Indexer["getFileLocations"]>>;
    try {
        locations = await indexer.getFileLocations(rootHash);
    } catch {
        return null;
    }
    if (!locations?.length) {
        return null;
    }
    for (const loc of locations.slice(0, 5)) {
        try {
            const node = new StorageNode(loc.url);
            const info = await node.getFileInfo(rootHash, true);
            const seq = info?.tx?.seq;
            if (typeof seq === "number" && seq > 0) {
                return seq;
            }
        } catch {
            continue;
        }
    }
    return null;
}

/** Proof-verified download (SDK uses indexer + storage nodes). */
export async function downloadUtf8Text(
    ep: StorageEndpoints,
    rootHash: string,
): Promise<string> {
    const indexer = new Indexer(ep.indexerRpc);
    const [blob, err] = await indexer.downloadToBlob(rootHash, {
        proof: true,
    });
    if (err !== null) {
        throw new Error(`download: ${err}`);
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    return new TextDecoder().decode(buf);
}

export function chainScanUrl(network: OgNetwork): string {
    return network === "mainnet"
        ? "https://chainscan.0g.ai"
        : "https://chainscan-galileo.0g.ai";
}
