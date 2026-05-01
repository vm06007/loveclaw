import { state } from "../lib/state.js";
import { isTauri } from "../lib/tauri.js";

/**
 * Dev: Vite proxies `/axl9002` → localhost:9002 and `/axl9012` → 9012 (see vite.config.js).
 * Prod: `VITE_AXL_NODE_*_BASE`, or Vercel rewrites + `VITE_AXL_VERCEL_REWRITE=1`, or
 * Vercel env `DEMO_AX_*_URL` + `/api/demo-axl` (same-origin proxy — see `api/demo-axl-proxy.js`).
 */
function axlPublicBase(port) {
    const key = port === 9002 ? "VITE_AXL_NODE_9002_BASE" : "VITE_AXL_NODE_9012_BASE";
    const raw = import.meta.env[key];
    if (typeof raw === "string" && raw.trim()) {
        return raw.trim().replace(/\/$/, "");
    }
    return `/axl${port}`;
}

function meshRequestUrl(base, segment) {
    const b = String(base || "");
    if (b.startsWith("/api/demo-axl-proxy")) {
        const u = new URL(b, "http://localhost");
        const p = u.searchParams.get("p") || "9002";
        return `/api/demo-axl-proxy?p=${encodeURIComponent(p)}&sub=${encodeURIComponent(segment)}`;
    }
    return `${b}/${segment}`;
}

/**
 * @param {number | null} preferPort
 * @returns {Promise<{ base: string; port: number }[]>}
 */
async function resolveAxlNodes(preferPort) {
    const nodes = [];
    const add = (port, base) => {
        if (base) {
            nodes.push({ base: String(base).replace(/\/$/, ""), port });
        }
    };
    const v9002 = typeof import.meta.env.VITE_AXL_NODE_9002_BASE === "string" && import.meta.env.VITE_AXL_NODE_9002_BASE.trim();
    const v9012 = typeof import.meta.env.VITE_AXL_NODE_9012_BASE === "string" && import.meta.env.VITE_AXL_NODE_9012_BASE.trim();
    if (v9002) {
        add(9002, v9002);
    } else if (import.meta.env.DEV || import.meta.env.VITE_AXL_VERCEL_REWRITE === "1") {
        add(9002, "/axl9002");
    }
    if (v9012) {
        add(9012, v9012);
    } else if (import.meta.env.DEV || import.meta.env.VITE_AXL_VERCEL_REWRITE === "1") {
        add(9012, "/axl9012");
    }
    if (nodes.length === 2) {
        return preferSort(nodes, preferPort);
    }
    if (nodes.length > 0) {
        return preferSort(nodes, preferPort);
    }
    if (!import.meta.env.DEV && !isTauri()) {
        try {
            const r = await fetch("/api/demo-axl", { signal: AbortSignal.timeout(3000) });
            if (r.ok) {
                const j = await r.json();
                if (j.enabled && j.node9002 && j.node9012) {
                    return preferSort(
                        [
                            { base: j.node9002, port: 9002 },
                            { base: j.node9012, port: 9012 },
                        ],
                        preferPort,
                    );
                }
            }
        } catch {
            /* offline or not deployed on Vercel */
        }
    }
    return [];
}

function preferSort(nodes, preferPort) {
    if (!preferPort) {
        return nodes;
    }
    return [...nodes].sort((a, b) => (a.port === preferPort ? -1 : b.port === preferPort ? 1 : 0));
}

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
        const nodes = await resolveAxlNodes(this._preferPort);
        if (nodes.length === 0) {
            console.log("[AXL] no mesh endpoints (dev proxy, VITE bases, Vercel rewrite, or /api/demo-axl demo)");
            return false;
        }
        const TRIES = 30;
        const DELAY = 400;
        for (let attempt = 0; attempt < TRIES; attempt++) {
            for (const { base, port } of nodes) {
                try {
                    const r = await fetch(meshRequestUrl(base, "topology"), { signal: AbortSignal.timeout(1500) });
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
            const r = await fetch(meshRequestUrl(this.base, "send"), {
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
            const r = await fetch(meshRequestUrl(this.base, "recv"), { signal: AbortSignal.timeout(3000) });
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
