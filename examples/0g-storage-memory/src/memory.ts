/**
 * Minimal JSON shape for "pact memory" we can later wire from LoveClaw:
 * append-only snapshots map naturally to 0G Storage Log layer; hot keys
 * (per-agent cursor, last root) can move to 0G KV in a follow-up.
 *
 * @see https://docs.0g.ai/concepts/storage
 */

export type ChatRole = "user" | "partner" | "agent";

export type ChatTurn = {
    ts: number;
    role: ChatRole;
    author?: string;
    text: string;
};

export type PactMemorySnapshot = {
    schemaVersion: 1;
    coupleId: string;
    /** Monotonic on each upload so you can order snapshots without chain indexing. */
    seq: number;
    turns: ChatTurn[];
};

export function encodeSnapshot(snapshot: PactMemorySnapshot): Uint8Array {
    const json = JSON.stringify(snapshot);
    return new TextEncoder().encode(json);
}

export function decodeSnapshot(bytes: Uint8Array): PactMemorySnapshot {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text) as PactMemorySnapshot;
    if (parsed.schemaVersion !== 1) {
        throw new Error(`unsupported schemaVersion: ${parsed.schemaVersion}`);
    }
    return parsed;
}
