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
        _promptAgentRegistration();
    }, 2000);
}

function _promptAgentRegistration() {
    const mp = state.myProfile || {};
    if (mp.agenticTokenId) return;

    const toast = document.createElement("div");
    toast.className = "lc-agent-reg-toast";
    toast.innerHTML = `
        <span class="lc-agent-reg-toast__text">tap your avatar to register your AI agent on 0G</span>
        <button class="lc-agent-reg-toast__close" aria-label="dismiss">✕</button>
    `;
    document.body.appendChild(toast);

    const dismiss = () => {
        toast.classList.remove("lc-agent-reg-toast--show");
        setTimeout(() => toast.remove(), 400);
    };
    toast.querySelector(".lc-agent-reg-toast__close")?.addEventListener("click", dismiss);

    requestAnimationFrame(() => toast.classList.add("lc-agent-reg-toast--show"));
    setTimeout(dismiss, 8000);
}
