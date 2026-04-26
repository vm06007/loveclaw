import QRCode from "qrcode";
import { state } from "./state.js";

/**
 * Pairs id + label for breach trigger chips. Used by create flow.
 */
export const ALL_TRIGGERS = [
    { id: "tinder", label: "Tinder" },
    { id: "bumble", label: "Bumble" },
    { id: "hinge", label: "Hinge" },
    { id: "grindr", label: "Grindr" },
    { id: "badoo", label: "Badoo" },
    { id: "okcupid", label: "OkCupid" },
    { id: "match", label: "Match" },
    { id: "zoosk", label: "Zoosk" },
];

export function generateKey() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function buildPact() {
    const pact = {
        name: state.myName,
        key: state.myAxlKey,
        triggers: state.triggers,
        coupleId: state.coupleId,
        ts: Date.now(),
    };
    return btoa(JSON.stringify(pact));
}

export function parsePact(code) {
    try {
        return JSON.parse(atob(code.trim()));
    } catch {
        return null;
    }
}

export function buildInviteUrl() {
    const pact = buildPact();
    return `${location.origin}${location.pathname}?pact=${encodeURIComponent(pact)}`;
}

export async function renderQR(container, text) {
    if (!container) {
        return;
    }
    container.replaceChildren();
    const canvas = document.createElement("canvas");
    const opts = { width: 200, margin: 0, errorCorrectionLevel: "M" };
    try {
        await QRCode.toCanvas(canvas, text, opts);
    } catch (e) {
        const placeholder = document.createElement("div");
        placeholder.style.cssText =
            "width:200px;height:200px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#333;font-family:monospace;white-space:pre-wrap;text-align:center;padding:0.5rem;";
        placeholder.textContent = `Could not build QR: ${e?.message ?? e}`;
        container.appendChild(placeholder);
        return;
    }
    container.appendChild(canvas);
}
