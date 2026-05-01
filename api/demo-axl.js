/**
 * When DEMO_AX_9002_URL + DEMO_AX_9012_URL are set on Vercel, the SPA discovers
 * same-origin proxy paths (browser never calls ngrok directly — no CORS).
 */
export default function handler(req, res) {
    const u9002 = process.env.DEMO_AX_9002_URL;
    const u9012 = process.env.DEMO_AX_9012_URL;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    const ok = !!(u9002?.trim() && u9012?.trim());
    if (!ok) {
        res.status(200).json({ enabled: false });
        return;
    }
    res.status(200).json({
        enabled: true,
        node9002: "/api/demo-axl-proxy?p=9002",
        node9012: "/api/demo-axl-proxy?p=9012",
    });
}
