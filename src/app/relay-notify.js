/**
 * Web Push subscription + SSE fallback for in-app notifications.
 * Uses Vite proxy /relay/* → http://127.0.0.1:9090/* to avoid mixed-content blocks.
 * Relay is opt-in: start with --relay flag or LOVECLAW_RELAY=1.
 */

import { state } from "../lib/state.js";

const RELAY_ENABLED = import.meta.env.VITE_RELAY === "1";
// All relay calls go through the Vite proxy (same origin, no mixed-content)
const RELAY = "/relay";

let _es = null;

export async function initRelayNotify() {
    if (!RELAY_ENABLED) return;
    if (!("Notification" in window)) {
        fetch(`${RELAY}/debug`, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Notification API not available" }) }).catch(() => {});
        return;
    }

    fetch(`${RELAY}/debug`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission: Notification.permission, sw: "serviceWorker" in navigator, push: "PushManager" in window }) }).catch(() => {});

    if (Notification.permission === "granted") {
        await _subscribePush();
    } else if (Notification.permission === "default") {
        _showBanner();
    }

    _connectSse();
}

function _showBanner() {
    const banner  = document.getElementById("notif-banner");
    const allow   = document.getElementById("notif-banner-btn");
    const dismiss = document.getElementById("notif-banner-dismiss");
    if (!banner) return;

    banner.classList.remove("hidden");

    allow?.addEventListener("click", async () => {
        banner.classList.add("hidden");
        const perm = await Notification.requestPermission();
        if (perm === "granted") await _subscribePush();
    }, { once: true });

    dismiss?.addEventListener("click", () => {
        banner.classList.add("hidden");
    }, { once: true });
}

async function _subscribePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        fetch(`${RELAY}/debug`, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sw: "serviceWorker" in navigator, push: "PushManager" in window, perm: Notification.permission }) });
        return;
    }
    if (Notification.permission !== "granted") return;

    try {
        const reg = await navigator.serviceWorker.ready;

        // Fetch VAPID public key from relay
        const r = await fetch(`${RELAY}/vapid-public-key`);
        if (!r.ok) return;
        const { publicKey } = await r.json();

        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();
        const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: _urlBase64ToUint8Array(publicKey),
        });

        const name = (state.myName || "").trim().toLowerCase() || "unknown";
        await fetch(`${RELAY}/push-subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, subscription: sub.toJSON() }),
        });

        console.info(`[push] subscribed as "${name}"`);
    } catch (e) {
        console.warn("[push] subscription failed:", e);
    }
}

function _connectSse() {
    if (_es) { _es.close(); _es = null; }

    // SSE connects directly to the relay (relay is http, so use the proxy path too)
    _es = new EventSource(`${RELAY}/stream`);

    _es.onmessage = (e) => {
        let sig;
        try { sig = JSON.parse(e.data); } catch { return; }
        if (sig.type !== "notify") return;

        const me     = (state.myName || "").trim().toLowerCase();
        const target = (sig.target || "all").toLowerCase();
        if (target !== "all" && target !== me) return;
        if (Notification.permission !== "granted") return;

        new Notification(sig.title || "LoveClaw", {
            body: sig.body || "",
            icon: "/icon.svg",
            tag:  `loveclaw-notify-${Date.now()}`,
        });
    };
}

function _urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/** Fire a notification directly from the console — no relay needed. */
export async function lcNotify(target = "all", title = "LoveClaw", body = "") {
    if (!("Notification" in window)) { console.warn("Notifications not supported"); return; }
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") { console.warn("Notification permission denied"); return; }

    const me = (state.myName || "").trim().toLowerCase();
    const t  = (target || "all").toLowerCase();
    if (t !== "all" && t !== me) {
        console.info(`[lcNotify] skipped — target "${target}" != myName "${state.myName}"`);
        return;
    }
    new Notification(title, { body, icon: "/icon.svg", tag: `loveclaw-notify-${Date.now()}` });
}

if (typeof window !== "undefined") window.lcNotify = lcNotify;
