import { state, saveState } from "../lib/state.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "./ipc-send.js";
import { showScreen } from "../lib/router.js";
import { addBreakPactDenyReceivedLine, addBreakPactDenySentLine } from "./ping.js";

function transportPartnerMessage(payload) {
    const msg = { ...payload, ts: payload.ts ?? Date.now() };
    if (axl.available && state.partnerAxlKey) {
        axl.send(state.partnerAxlKey, msg);
    } else {
        ipcSend(msg);
    }
}

export function applyBreakPactUnpair() {
    state.paired = false;
    state.partnerName = "";
    state.partnerAxlKey = "";
    state.coupleId = "";
    state.code = "";
    state.createdAt = null;
    state.breakPactIncoming = null;
    state.breakPactOutgoingPending = false;
    state.partnerTrustScore = 100;
    saveState(state);
    syncPactBadge();
    syncPactBreakOverlay();
    showScreen("home");
}

export function syncPactBadge() {
    const badge = document.getElementById("pact-badge");
    if (!badge) {
        return;
    }
    const has = Boolean(state.paired && state.breakPactIncoming);
    const onPact = document.querySelector('.tab[data-tab="pact"]')?.classList.contains("active");
    if (has && !onPact) {
        badge.textContent = "1";
        badge.classList.remove("hidden");
    } else {
        badge.textContent = "";
        badge.classList.add("hidden");
    }
}

function titleCaseShort(s) {
    const t = String(s || "").trim();
    if (!t) {
        return "Partner";
    }
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function syncPactBreakOverlay() {
    const el = document.getElementById("pact-break-overlay");
    if (!el) {
        return;
    }
    const titleEl = document.getElementById("pact-break-overlay-title");
    if (titleEl && state.breakPactIncoming) {
        const who = titleCaseShort(state.breakPactIncoming.from);
        titleEl.textContent = `${who} proposed to break pact`;
    }
    const pactActive = document.querySelector('.tab[data-tab="pact"]')?.classList.contains("active");
    const show = Boolean(state.paired && state.breakPactIncoming && pactActive);
    el.classList.toggle("hidden", !show);
    el.setAttribute("aria-hidden", show ? "false" : "true");
}

export function syncProposeBreakPactButton() {
    const btn = document.getElementById("btn-propose-break-pact");
    if (!btn) {
        return;
    }
    const disabled =
        !state.paired ||
        Boolean(state.breakPactIncoming) ||
        Boolean(state.breakPactOutgoingPending);
    btn.disabled = disabled;
}

export function onBreakPactProposeReceived(msg) {
    if (!state.paired) {
        return;
    }
    const from = (msg.from && String(msg.from).trim()) || "partner";
    state.breakPactIncoming = { from, ts: msg.ts || Date.now() };
    saveState(state);
    syncPactBadge();
    syncPactBreakOverlay();
}

/**
 * @param {object} [msg] partner message, may include `from`
 */
export function onBreakPactDenyReceived(msg) {
    const wasWaitingOnOutcome = state.breakPactOutgoingPending;
    const denier = msg && msg.from;
    state.breakPactIncoming = null;
    state.breakPactOutgoingPending = false;
    saveState(state);
    syncPactBadge();
    syncPactBreakOverlay();
    syncProposeBreakPactButton();
    if (wasWaitingOnOutcome) {
        addBreakPactDenyReceivedLine(denier);
    }
}

export function onBreakPactGrantReceived() {
    if (!state.paired && !state.breakPactIncoming && !state.breakPactOutgoingPending) {
        return;
    }
    applyBreakPactUnpair();
    syncProposeBreakPactButton();
}

function setBreakProposeModal(open) {
    const m = document.getElementById("modal-break-propose");
    if (m) {
        m.classList.toggle("hidden", !open);
    }
}

export function initBreakPactUi() {
    document.getElementById("btn-propose-break-pact")?.addEventListener("click", () => {
        if (!state.paired || state.breakPactIncoming || state.breakPactOutgoingPending) {
            return;
        }
        setBreakProposeModal(true);
    });

    document.getElementById("modal-break-propose-yes")?.addEventListener("click", () => {
        setBreakProposeModal(false);
        if (!state.paired) {
            return;
        }
        state.breakPactOutgoingPending = true;
        saveState(state);
        syncProposeBreakPactButton();
        transportPartnerMessage({
            type: "break_pact_propose",
            from: state.myName || "me",
            ts: Date.now(),
        });
    });

    document.getElementById("modal-break-propose-no")?.addEventListener("click", () => {
        setBreakProposeModal(false);
    });

    document.getElementById("btn-break-pact-grant")?.addEventListener("click", () => {
        if (!state.breakPactIncoming) {
            return;
        }
        transportPartnerMessage({
            type: "break_pact_grant",
            from: state.myName || "me",
            ts: Date.now(),
        });
        applyBreakPactUnpair();
        syncProposeBreakPactButton();
    });

    document.getElementById("btn-break-pact-deny")?.addEventListener("click", () => {
        transportPartnerMessage({
            type: "break_pact_deny",
            from: state.myName || "me",
            ts: Date.now(),
        });
        addBreakPactDenySentLine();
        state.breakPactIncoming = null;
        saveState(state);
        syncPactBadge();
        syncPactBreakOverlay();
        syncProposeBreakPactButton();
    });

    syncPactBadge();
    syncPactBreakOverlay();
    syncProposeBreakPactButton();
}
