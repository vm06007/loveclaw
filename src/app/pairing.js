import { state, saveState } from "../lib/state.js";
import { showScreen } from "../lib/router.js";
import { renderDashboard } from "../dashboard/render.js";
import { startHeartbeat } from "./heartbeat.js";

/**
 * Unlocks the paired and dashboard flow after a successful handshake
 * (creator sees partner name from join; joiner has partner in pact state).
 */
export function completePairing(partnerName) {
    if (partnerName) {
        state.partnerName = partnerName;
    }
    state.paired = true;
    saveState(state);

    const el = document.getElementById("paired-msg");
    if (el) {
        el.textContent = `connected with ${state.partnerName || "partner"}`;
    }
    showScreen("paired");

    setTimeout(() => {
        renderDashboard();
        showScreen("dashboard");
        startHeartbeat();
    }, 2000);
}
