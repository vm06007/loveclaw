import { state, saveState, EMPTY_PARTNER_PROFILE } from "../lib/state.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "./ipc-send.js";
import { showScreen } from "../lib/router.js";
import {
    addBreakPactDenyReceivedLine,
    addBreakPactDenySentLine,
    addPactChangesDenySentLine,
} from "./ping.js";
import {
    computePactProposalDiff,
    formatPactProposalDiffPlain,
    normalizePactProposal,
} from "../lib/pact-proposal-diff.js";

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
    state.pactChangesIncoming = null;
    state.pactChangesOutgoingPending = false;
    state.pactChangesOutgoingProposal = null;
    state.partnerTrustScore = 100;
    state.partnerProfile = { ...EMPTY_PARTNER_PROFILE };
    saveState(state);
    syncPactBadge();
    syncPactBreakOverlay();
    syncPactChangesOverlay();
    showScreen("home");
}

export function syncPactBadge() {
    const badge = document.getElementById("pact-badge");
    if (!badge) {
        return;
    }
    const has = Boolean(
        state.paired &&
        (state.breakPactIncoming || state.pactChangesIncoming),
    );
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

export function syncPactChangesOverlay() {
    const el = document.getElementById("pact-changes-overlay");
    if (!el) {
        return;
    }
    const titleEl = document.getElementById("pact-changes-overlay-title");
    const diffEl = document.getElementById("pact-changes-overlay-diff");
    const incoming = state.pactChangesIncoming;
    if (titleEl && incoming) {
        const who = titleCaseShort(incoming.from);
        titleEl.textContent = `${who} proposed pact changes`;
    }
    if (diffEl && incoming?.proposal) {
        const d = computePactProposalDiff(state.triggers, state.stakeEth, incoming.proposal);
        diffEl.textContent = formatPactProposalDiffPlain(d);
    } else if (diffEl) {
        diffEl.textContent = "";
    }
    const pactActive = document.querySelector('.tab[data-tab="pact"]')?.classList.contains("active");
    const show = Boolean(
        state.paired &&
        incoming &&
        pactActive &&
        !state.breakPactIncoming,
    );
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
        Boolean(state.breakPactOutgoingPending) ||
        Boolean(state.pactChangesIncoming) ||
        Boolean(state.pactChangesOutgoingPending);
    btn.disabled = disabled;
}

/** Disable pact edit while break or pact-change flows are pending (call after `renderPact`). */
export function syncEditPactButton() {
    const editBtn = document.getElementById("btn-edit-pact");
    if (!editBtn) {
        return;
    }
    editBtn.disabled =
        !state.paired ||
        Boolean(state.breakPactIncoming) ||
        Boolean(state.breakPactOutgoingPending) ||
        Boolean(state.pactChangesIncoming) ||
        Boolean(state.pactChangesOutgoingPending);
}

export function onPactChangesProposeReceived(msg) {
    if (!state.paired || state.breakPactIncoming) {
        return;
    }
    const proposal = normalizePactProposal(msg?.proposal || {});
    const from = String(msg?.from || "partner").trim() || "partner";
    state.pactChangesIncoming = {
        from,
        proposal,
        ts: msg.ts ?? Date.now(),
    };
    saveState(state);
    syncPactBadge();
    syncPactChangesOverlay();
    syncProposeBreakPactButton();
    syncEditPactButton();
    void import("../dashboard/render.js").then((m) => {
        m.renderPact();
    });
}

export function onBreakPactProposeReceived(msg) {
    if (!state.paired) {
        return;
    }
    const from = (msg.from && String(msg.from).trim()) || "partner";
    state.breakPactIncoming = { from, ts: msg.ts || Date.now() };
    state.pactChangesIncoming = null;
    state.pactChangesOutgoingPending = false;
    state.pactChangesOutgoingProposal = null;
    saveState(state);
    syncPactBadge();
    syncPactBreakOverlay();
    syncPactChangesOverlay();
    syncProposeBreakPactButton();
    syncEditPactButton();
    void import("../dashboard/render.js").then((m) => {
        m.renderPact();
    });
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
        syncPactChangesOverlay();
        syncProposeBreakPactButton();
    });

    document.getElementById("btn-pact-changes-grant")?.addEventListener("click", () => {
        const inc = state.pactChangesIncoming;
        if (!inc?.proposal) {
            return;
        }
        const proposal = normalizePactProposal(inc.proposal);
        void import("../dashboard/render.js").then((m) => {
            m.applyPactProposal(proposal);
            transportPartnerMessage({
                type: "pact_changes_grant",
                from: state.myName || "me",
                proposal,
                ts: Date.now(),
            });
            state.pactChangesIncoming = null;
            saveState(state);
            syncPactBadge();
            syncPactChangesOverlay();
            syncProposeBreakPactButton();
            syncEditPactButton();
        });
    });

    document.getElementById("btn-pact-changes-deny")?.addEventListener("click", () => {
        transportPartnerMessage({
            type: "pact_changes_deny",
            from: state.myName || "me",
            ts: Date.now(),
        });
        addPactChangesDenySentLine();
        state.pactChangesIncoming = null;
        saveState(state);
        syncPactBadge();
        syncPactChangesOverlay();
        syncProposeBreakPactButton();
        syncEditPactButton();
        void import("../dashboard/render.js").then((m) => {
            m.renderPact();
        });
    });

    syncPactBadge();
    syncPactBreakOverlay();
    syncPactChangesOverlay();
    syncProposeBreakPactButton();
    syncEditPactButton();
}
