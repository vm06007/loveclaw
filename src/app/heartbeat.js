import { state, saveState } from "../lib/state.js";
import { initTauri, invoke, isTauri } from "../lib/tauri.js";
import {
    appendTodayHeartbeatEntry,
    renderTodayTab,
} from "../dashboard/render.js";
import { checkBreaches } from "./breach.js";
import { startAxlPoll } from "../axl/poll.js";
import { handleAxlMessage } from "./messages.js";
import { refreshHeartbeatMapIfOpen } from "./heartbeat-map.js";
import { collectBrowserSignals, collectWebLocationOnly } from "../lib/web-signals.js";

let _completePairing = null;

export function registerAxlPairing(completePairing) {
    _completePairing = completePairing;
}

function formatHeartbeatLogSummary(tick) {
    if (!tick || tick.length === 0) {
        return "signals refreshed";
    }
    const bat = tick.find(s => s.type === "battery");
    const loc = tick.find(s => s.type === "location");
    const parts = [];
    if (bat) {
        parts.push(`battery: ${bat.value}`);
    }
    if (loc) {
        parts.push(`location: ${loc.value}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "signals refreshed";
}

async function heartbeat() {
    if (!state.paired) {
        return;
    }
    let tick = [];
    if (isTauri()) {
        try {
            await initTauri();
            const fromRust = await invoke("get_device_signals");
            fromRust.forEach(s => state.signals.push({ ...s, ts: Date.now() }));
            let locEntry = await collectWebLocationOnly({ highAccuracy: false });
            if (!locEntry) {
                try {
                    const ipCoords = await invoke("get_ip_location_coords");
                    if (typeof ipCoords === "string" && ipCoords.length > 0) {
                        locEntry = { type: "location", value: ipCoords };
                    }
                } catch {
                    /* offline / blocked */
                }
            }
            if (!locEntry) {
                locEntry = { type: "location", value: "—" };
            }
            state.signals.push({ ...locEntry, ts: Date.now() });
            tick = [...fromRust, locEntry];
        } catch (e) {
            console.warn("[signals]", e);
        }
    } else {
        try {
            tick = await collectBrowserSignals();
            tick.forEach(s => state.signals.push({ ...s, ts: Date.now() }));
        } catch (e) {
            console.warn("[web-signals]", e);
            tick = pushDemoSignal();
        }
    }
    if (state.signals.length > 200) {
        state.signals = state.signals.slice(-200);
    }
    checkBreaches();
    saveState(state);
    renderTodayTab();
    refreshHeartbeatMapIfOpen();
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    appendTodayHeartbeatEntry(`[${stamp}] ${formatHeartbeatLogSummary(tick)}`);
}

/** Manual “Run check” from the today tab. */
export async function runHeartbeatCheck() {
    await heartbeat();
}

/** @returns {{ type: string; value: string }[]} */
function pushDemoSignal() {
    const ts = Date.now();
    const pair = [
        { type: "battery", value: `${Math.floor(Math.random() * 40 + 60)}%` },
        { type: "location", value: "home area" },
    ];
    pair.forEach(p => state.signals.push({ ...p, ts }));
    if (state.signals.length > 200) {
        state.signals = state.signals.slice(-200);
    }
    return pair;
}

export function startHeartbeat() {
    if (!_completePairing) {
        console.warn("[heartbeat] completePairing not registered; AXL poll may be incomplete");
    }
    heartbeat();
    setInterval(heartbeat, 30000);
    if (_completePairing) {
        startAxlPoll(_completePairing, handleAxlMessage);
    }
}
