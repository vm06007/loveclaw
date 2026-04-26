import { state } from "../lib/state.js";

// Two nodes (examples/axl-demo/a2a.py): Alice -> :9002, Boris -> :9012 (proxied under /axl9002, /axl9012).

const AXL_NODES = [
    { base: "/axl9002", port: 9002 },
    { base: "/axl9012", port: 9012 },
];

export const axl = {
    available: false,
    base: null,
    port: null,
    _polling: false,
    _preferPort: null,

    setPreferPort(port) {
        this._preferPort = port;
    },

    /**
     * Try each AXL node; skip the node that returns skipKey (joiner uses the other node).
     */
    async init(skipKey = null) {
        const TRIES = 30;
        const DELAY = 400;
        const nodes = this._preferPort
            ? [...AXL_NODES].sort((a, b) => (a.port === this._preferPort ? -1 : 1))
            : AXL_NODES;
        for (let attempt = 0; attempt < TRIES; attempt++) {
            for (const { base, port } of nodes) {
                try {
                    const r = await fetch(`${base}/topology`, { signal: AbortSignal.timeout(1500) });
                    if (!r.ok) {
                        continue;
                    }
                    const data = await r.json();
                    if (!data.our_public_key) {
                        continue;
                    }
                    if (skipKey && data.our_public_key === skipKey) {
                        console.log(`[AXL] :${port} is creator's node - skipping`);
                        continue;
                    }
                    state.myAxlKey = data.our_public_key;
                    this.base = base;
                    this.port = port;
                    this.available = true;
                    console.log(`[AXL] connected :${port} key=${state.myAxlKey.slice(0, 12)}...`);
                    return true;
                } catch {
                    /* node not up yet */
                }
            }
            if (attempt < TRIES - 1) {
                await new Promise(r => setTimeout(r, DELAY));
            }
        }
        console.warn("[AXL] no nodes available after retries - using local IPC fallback");
        return false;
    },

    async send(peerKey, payload) {
        if (!this.available) {
            return false;
        }
        try {
            const r = await fetch(`${this.base}/send`, {
                method: "POST",
                headers: { "X-Destination-Peer-Id": peerKey },
                body: JSON.stringify(payload),
            });
            return r.ok;
        } catch {
            return false;
        }
    },

    async recv() {
        if (!this.available) {
            return null;
        }
        try {
            const r = await fetch(`${this.base}/recv`, { signal: AbortSignal.timeout(3000) });
            if (r.status === 204) {
                return null;
            }
            if (!r.ok) {
                return null;
            }
            const msg = await r.json();
            const fromKey = r.headers.get("X-From-Peer-Id") ?? "";
            return { ...msg, _fromKey: fromKey };
        } catch {
            return null;
        }
    },
};
