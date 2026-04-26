/**
 * Local-only UI for store / retrieve UTF-8 blobs on 0G Storage.
 * Binds 127.0.0.1 - uses PRIVATE_KEY from .env.local (never sent to the browser).
 */
import { join, resolve, sep } from "node:path";
import { loadEnv, resolveEndpoints, ROOT, storageScanUrl } from "./env.js";
import {
    chainScanUrl,
    downloadUtf8Text,
    getTxSeqForRootHash,
    uploadUtf8Text,
} from "./storage.js";
import { resolveWalletAddress } from "./wallet.js";

function json(res: unknown, status = 200) {
    return new Response(JSON.stringify(res), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
        },
    });
}

const PUBLIC_DIR = resolve(join(ROOT, "public"));
const SHARED_PIXEL_UI = resolve(join(ROOT, "..", "loveclaw-style", "pixel-ui.css"));

/** Serve a single file from `public/` (no path traversal). */
async function servePublicFile(pathname: string): Promise<Response | null> {
    const rel = pathname.replace(/^\//, "");
    if (!rel || rel.includes("..") || rel.includes("/") || rel.includes("\\")) {
        return null;
    }
    const abs = resolve(join(PUBLIC_DIR, rel));
    if (!abs.startsWith(PUBLIC_DIR + sep)) {
        return null;
    }
    const file = Bun.file(abs);
    if (!(await file.exists())) {
        return null;
    }
    const type = rel.endsWith(".css")
        ? "text/css; charset=utf-8"
        : rel.endsWith(".html")
          ? "text/html; charset=utf-8"
          : rel.endsWith(".js")
            ? "application/javascript; charset=utf-8"
            : "application/octet-stream";
    return new Response(file, { headers: { "Content-Type": type } });
}

async function handleApi(req: Request, pathname: string) {
    const ep = resolveEndpoints();
    const pk = process.env.PRIVATE_KEY;

    if (pathname === "/api/config" && req.method === "GET") {
        const chainBase = chainScanUrl(ep.network);
        const storageBase = storageScanUrl(ep.network);
        const wallet = resolveWalletAddress();
        return json({
            network: ep.network,
            label: ep.label,
            region: ep.region,
            rpcUrl: ep.rpcUrl,
            storageScan: storageBase,
            chainScan: chainBase,
            hasPrivateKey: Boolean(pk && pk.length > 2),
            walletAddress: wallet,
            chainAddressUrl: wallet ? `${chainBase}/address/${wallet}` : null,
            storageAddressUrl: wallet
                ? `${storageBase}/address/${wallet}`
                : null,
            storageHistoryUrl: `${storageBase}/history`,
        });
    }

    if (pathname === "/api/upload" && req.method === "POST") {
        if (!pk) {
            return json({ error: "PRIVATE_KEY missing in .env.local" }, 400);
        }
        let body: { text?: string };
        try {
            body = (await req.json()) as { text?: string };
        } catch {
            return json({ error: "Invalid JSON body" }, 400);
        }
        const text = body.text ?? "";
        if (text.length > 512 * 1024) {
            return json({ error: "Payload too large (max 512 KiB)" }, 400);
        }
        try {
            const { rootHash, txHash, txSeq } = await uploadUtf8Text(
                { rpcUrl: ep.rpcUrl, indexerRpc: ep.indexerRpc },
                pk,
                text,
            );
            const chainBase = chainScanUrl(ep.network);
            const storageBase = storageScanUrl(ep.network);
            const wallet = resolveWalletAddress();
            const l1TxUrl = txHash ? `${chainBase}/tx/${txHash}` : null;
            const storageSubmissionUrl =
                txSeq != null && txSeq > 0
                    ? `${storageBase}/submission/${txSeq}`
                    : null;
            const storageRootSearchUrl = `${storageBase}/files?q=${encodeURIComponent(rootHash)}`;
            const storageHistoryUrl = `${storageBase}/history`;

            return json({
                rootHash,
                txHash,
                txSeq,
                network: ep.network,
                walletAddress: wallet,
                storageScan: storageBase,
                chainScan: chainBase,
                l1TxUrl,
                chainAddressUrl: wallet ? `${chainBase}/address/${wallet}` : null,
                storageAddressUrl: wallet
                    ? `${storageBase}/address/${wallet}`
                    : null,
                storageSubmissionUrl,
                storageRootSearchUrl,
                storageHistoryUrl,
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json({ error: msg }, 502);
        }
    }

    if (pathname === "/api/retrieve" && req.method === "GET") {
        const url = new URL(req.url);
        const rootHash = url.searchParams.get("rootHash")?.trim() ?? "";
        if (!rootHash) {
            return json({ error: "Missing rootHash query param" }, 400);
        }
        try {
            const endpoints = {
                rpcUrl: ep.rpcUrl,
                indexerRpc: ep.indexerRpc,
            };
            const text = await downloadUtf8Text(endpoints, rootHash);
            const chainBase = chainScanUrl(ep.network);
            const storageBase = storageScanUrl(ep.network);
            const wallet = resolveWalletAddress();
            const storageRootSearchUrl = `${storageBase}/files?q=${encodeURIComponent(rootHash)}`;
            const storageHistoryUrl = `${storageBase}/history`;
            const txSeq = await getTxSeqForRootHash(endpoints, rootHash);
            const storageSubmissionUrl =
                txSeq != null && txSeq > 0
                    ? `${storageBase}/submission/${txSeq}`
                    : null;
            return json({
                text,
                rootHash,
                txSeq,
                walletAddress: wallet,
                chainScan: chainBase,
                storageScan: storageBase,
                chainAddressUrl: wallet ? `${chainBase}/address/${wallet}` : null,
                storageAddressUrl: wallet
                    ? `${storageBase}/address/${wallet}`
                    : null,
                storageSubmissionUrl,
                storageRootSearchUrl,
                storageHistoryUrl,
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json({ error: msg }, 502);
        }
    }

    return json({ error: "Not found" }, 404);
}

await loadEnv();

const uiPortRaw = process.env.UI_PORT?.trim();
const strictPort = uiPortRaw !== undefined && uiPortRaw !== "";
const basePort = strictPort ? Number(uiPortRaw) : 4789;
if (strictPort && (!Number.isFinite(basePort) || basePort <= 0 || basePort > 65535)) {
    throw new Error(`Invalid UI_PORT: ${uiPortRaw}`);
}

const portRange = strictPort ? [basePort] : Array.from({ length: 32 }, (_, i) => basePort + i);

let server: ReturnType<typeof Bun.serve> | null = null;
let lastErr: unknown;
for (const port of portRange) {
    try {
        server = Bun.serve({
            hostname: "127.0.0.1",
            port,
            async fetch(req) {
                const url = new URL(req.url);
                const pathname = url.pathname.replace(/\/$/, "") || "/";

                if (pathname.startsWith("/api/")) {
                    return handleApi(req, pathname);
                }

                if (pathname === "/" || pathname === "/index.html") {
                    const file = Bun.file(join(ROOT, "public", "index.html"));
                    return new Response(file, {
                        headers: { "Content-Type": "text/html; charset=utf-8" },
                    });
                }

                if (pathname === "/pixel-ui.css") {
                    const file = Bun.file(SHARED_PIXEL_UI);
                    if (!(await file.exists())) {
                        return new Response("Shared stylesheet missing", { status: 500 });
                    }
                    return new Response(file, {
                        headers: { "Content-Type": "text/css; charset=utf-8" },
                    });
                }

                const staticRes = await servePublicFile(pathname);
                if (staticRes) {
                    return staticRes;
                }

                return new Response("Not found", { status: 404 });
            },
        });
        break;
    } catch (e) {
        lastErr = e;
    }
}

if (!server) {
    const hint = strictPort
        ? `Port ${basePort} is in use. Stop the other process or pick a free UI_PORT.`
        : `Ports ${basePort}–${basePort + portRange.length - 1} are busy. Set UI_PORT to a free port.`;
    console.error(hint);
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const url = `http://127.0.0.1:${server.port}/`;
console.log(`0G Storage UI → ${url}`);
if (!strictPort && server.port !== basePort) {
    console.log(`(default ${basePort} was in use - using ${server.port})`);
}
