import { state, saveState } from "../lib/state.js";

export function checkBreaches() {
    const recentApps = state.signals.filter(s => s.type === "apps").map(s => s.value.toLowerCase());
    const hit = state.triggers.find(t => recentApps.some(a => a.includes(t)));
    if (hit) {
        triggerBreach(hit);
    }
}

export function triggerBreach(trigger) {
    const msgEl = document.getElementById("breach-msg");
    if (msgEl) {
        msgEl.textContent = `${trigger} detected on device. trust score has been updated.`;
    }
    const overlay = document.getElementById("overlay-breach");
    if (overlay) {
        overlay.classList.remove("hidden");
    }
    state.trustScore = Math.max(0, (state.trustScore ?? 100) - 50);
    const trustEl = document.getElementById("today-trust-me");
    if (trustEl) {
        trustEl.textContent = String(state.trustScore);
    }
    saveState(state);
}

export function initBreachUi() {
    const dismiss = document.getElementById("btn-breach-dismiss");
    if (dismiss) {
        dismiss.addEventListener("click", () => {
            const overlay = document.getElementById("overlay-breach");
            if (overlay) {
                overlay.classList.add("hidden");
            }
        });
    }
}
