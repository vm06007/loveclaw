import { state, saveState } from "../lib/state.js";
import { DATING_APP_SUBSTRINGS, pactRuleLabel } from "../lib/invite.js";

export function checkBreaches() {
    const recentApps = state.signals.filter(s => s.type === "apps").map(s => s.value.toLowerCase());
    const triggers = state.triggers || [];
    if (!triggers.includes("dating_app")) {
        return;
    }
    const hitPkg = DATING_APP_SUBSTRINGS.find(pkg => recentApps.some(a => a.includes(pkg)));
    if (hitPkg) {
        triggerBreach("dating_app", hitPkg);
    }
}

export function triggerBreach(trigger, detail) {
    const label = pactRuleLabel(trigger);
    const extra = detail ? ` (${detail})` : "";
    const msgEl = document.getElementById("breach-msg");
    if (msgEl) {
        msgEl.textContent = `${label}${extra} detected on device. trust score has been updated.`;
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
