import { state, saveState, EMPTY_PARTNER_PROFILE } from "../lib/state.js";
import { normalizeInstanceTag } from "../lib/instance-tag.js";
import { showScreen } from "../lib/router.js";
import { renderDashboard } from "../dashboard/render.js";
import { startHeartbeat } from "./heartbeat.js";

/**
 * Unlocks the paired and dashboard flow after a successful handshake
 * (creator sees partner name from join; joiner has partner in pact state).
 * @param {string} [partnerName]
 * @param {{ partnerInstanceTag?: string }} [opts]
 */
export function completePairing(partnerName, opts = {}) {
    if (partnerName) {
        state.partnerName = partnerName;
    }
    const pit = normalizeInstanceTag(opts.partnerInstanceTag);
    if (pit) {
        state.partnerProfile = {
            ...EMPTY_PARTNER_PROFILE,
            ...(state.partnerProfile && typeof state.partnerProfile === "object" ? state.partnerProfile : {}),
            instanceTag: pit,
        };
    }
    state.paired = true;
    saveState(state);

    const el = document.getElementById("paired-msg");
    if (el) {
        el.textContent = `connected with ${state.partnerName || "partner"}`;
    }
    showScreen("paired");

    setTimeout(async () => {
        renderDashboard();
        showScreen("dashboard");
        startHeartbeat();
        _promptAgentRegistration();
        try {
            const { sendMyProfileToCoop } = await import("./coop-profile.js");
            void sendMyProfileToCoop();
            setTimeout(() => void sendMyProfileToCoop(), 6000);
        } catch (e) {
            console.warn("[loveclaw] post-pair profile sync", e);
        }
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
