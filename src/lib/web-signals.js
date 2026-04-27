/**
 * Web vs Tauri:
 * - **Plain browser:** battery from `navigator.getBattery()` when the browser exposes it
 *   (Chrome/Edge). Safari has no API. **Brave** often removes or blocks it for
 *   anti-fingerprinting — use Chrome or the Tauri app for numeric battery there.
 *   Location from `navigator.geolocation` only.
 * - **Tauri:** battery comes from Rust (`get_device_signals`); this module only supplies
 *   **location** from the WebView Geolocation API (same as the browser path).
 *
 * @returns {Promise<Array<{ type: string; value: string }>>}
 */

import { isTauri } from "./tauri.js";

/** Brave deliberately limits the Battery Status API; `navigator.brave.isBrave()` when present. */
async function isLikelyBraveBrowser() {
    if (typeof navigator === "undefined") {
        return false;
    }
    if (navigator.brave && typeof navigator.brave.isBrave === "function") {
        try {
            return await navigator.brave.isBrave();
        } catch {
            return false;
        }
    }
    return /\bBrave\b/i.test(navigator.userAgent || "");
}

const BRAVE_BATTERY_HINT = "— Brave blocks battery API (privacy)";

/**
 * Battery for **browser only** (never call from the Tauri heartbeat path).
 * @returns {Promise<{ type: string; value: string }>}
 */
export async function collectBrowserBatterySignal() {
    if (typeof navigator === "undefined") {
        return { type: "battery", value: "—" };
    }

    if (isTauri()) {
        return { type: "battery", value: "—" };
    }

    const insecure = typeof window !== "undefined" && window.isSecureContext === false;
    if (insecure) {
        return {
            type: "battery",
            value: "HTTPS or localhost required",
        };
    }

    if (typeof navigator.getBattery !== "function") {
        if (await isLikelyBraveBrowser()) {
            return { type: "battery", value: BRAVE_BATTERY_HINT };
        }
        return { type: "battery", value: "—" };
    }

    try {
        const b = await navigator.getBattery();
        const raw = Number(b.level);
        const pct = Math.round(raw * 100);
        if (!Number.isFinite(pct)) {
            if (await isLikelyBraveBrowser()) {
                return { type: "battery", value: BRAVE_BATTERY_HINT };
            }
            return { type: "battery", value: "—" };
        }
        const charging = b.charging ? " (charging)" : "";
        return { type: "battery", value: `${pct}%${charging}` };
    } catch {
        if (await isLikelyBraveBrowser()) {
            return { type: "battery", value: BRAVE_BATTERY_HINT };
        }
        return { type: "battery", value: "—" };
    }
}

/**
 * @param {{ highAccuracy?: boolean }} [opts]
 * @returns {Promise<{ type: string; value: string } | null>}
 */
export async function collectWebLocationOnly(opts = {}) {
    const highAccuracy = opts.highAccuracy === true;
    if (typeof navigator === "undefined" || !navigator.geolocation?.getCurrentPosition) {
        return null;
    }
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: highAccuracy,
                timeout: 20000,
                maximumAge: 300000,
            });
        });
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        return {
            type: "location",
            value: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
        };
    } catch {
        return null;
    }
}

/**
 * One tick for **non-Tauri** (browser / PWA): web battery + geolocation.
 * @returns {Promise<Array<{ type: string; value: string }>>}
 */
export async function collectBrowserSignals() {
    if (isTauri()) {
        return [];
    }
    const out = [];
    out.push(await collectBrowserBatterySignal());

    let loc = await collectWebLocationOnly({ highAccuracy: true });
    if (!loc) {
        loc = { type: "location", value: "—" };
    }
    out.push(loc);

    return out;
}
