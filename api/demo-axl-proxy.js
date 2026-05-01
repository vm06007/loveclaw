/**
 * Server-side forward to DEMO_AX_*_URL (e.g. two ngrok HTTPS URLs). No CORS to the browser.
 * Query: p=9002|9012, sub=topology|send|recv
 */
async function getBody(req) {
    if (req.method === "GET" || req.method === "HEAD") {
        return null;
    }
    if (req.body !== undefined && req.body !== null) {
        if (Buffer.isBuffer(req.body)) {
            return req.body;
        }
        if (typeof req.body === "string") {
            return Buffer.from(req.body);
        }
        return Buffer.from(JSON.stringify(req.body));
    }
    const chunks = [];
    try {
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
    } catch {
        return null;
    }
    return chunks.length ? Buffer.concat(chunks) : null;
}

export default async function handler(req, res) {
    let url;
    try {
        url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    } catch {
        res.status(400).send("bad url");
        return;
    }
    const p = url.searchParams.get("p") || "9002";
    const sub = (url.searchParams.get("sub") || "topology").replace(/^\//, "");
    if (!/^(topology|send|recv)$/.test(sub)) {
        res.status(400).send("invalid sub");
        return;
    }
    const envKey = p === "9012" ? "DEMO_AX_9012_URL" : "DEMO_AX_9002_URL";
    const base = process.env[envKey];
    if (!base?.trim()) {
        res.status(503).json({ error: "DEMO_AX_*_URL not configured" });
        return;
    }
    const target = `${String(base).trim().replace(/\/$/, "")}/${sub}`;
    const dest = req.headers["x-destination-peer-id"];
    const headers = {};
    const ct = req.headers["content-type"];
    if (ct) {
        headers["Content-Type"] = ct;
    }
    if (dest) {
        headers["X-Destination-Peer-Id"] = dest;
    }
    const body = await getBody(req);
    try {
        const fr = await fetch(target, {
            method: req.method,
            headers,
            body: body && body.length ? body : undefined,
        });
        const ctOut = fr.headers.get("content-type");
        if (ctOut) {
            res.setHeader("Content-Type", ctOut);
        }
        const fromPeer = fr.headers.get("x-from-peer-id");
        if (fromPeer) {
            res.setHeader("X-From-Peer-Id", fromPeer);
        }
        res.status(fr.status);
        if (fr.status === 204) {
            res.end();
            return;
        }
        const buf = Buffer.from(await fr.arrayBuffer());
        res.send(buf);
    } catch (e) {
        res.status(502).json({ error: String(e?.message || e) });
    }
}
