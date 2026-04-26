import { state, saveState } from "../lib/state.js";
import { isTauri, invoke } from "../lib/tauri.js";
import { renderSignalGrid, renderSignalList } from "../dashboard/render.js";
import { checkBreaches } from "./breach.js";
import { startAxlPoll } from "../axl/poll.js";
import { handleAxlMessage } from "./messages.js";

let _completePairing = null;

export function registerAxlPairing(completePairing) {
    _completePairing = completePairing;
}

async function heartbeat() {
    if (!state.paired) {
        return;
    }
    if (isTauri()) {
        try {
            const signals = await invoke("get_device_signals");
            signals.forEach(s => state.signals.push({ ...s, ts: Date.now() }));
        } catch (e) {
            console.warn("[signals]", e);
        }
    } else {
        pushDemoSignal();
    }
    checkBreaches();
    saveState(state);
    renderSignalGrid();
    renderSignalList();
}

function pushDemoSignal() {
    const types = [
        { type: "battery", value: `${Math.floor(Math.random() * 40 + 60)}%` },
        { type: "motion", value: ["walking", "still", "running"][Math.floor(Math.random() * 3)] },
        { type: "location", value: "home area" },
    ];
    state.signals.push({ ...types[Math.floor(Math.random() * types.length)], ts: Date.now() });
    if (state.signals.length > 200) {
        state.signals = state.signals.slice(-200);
    }
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
