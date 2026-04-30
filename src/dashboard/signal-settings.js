import { state, saveState } from "../lib/state.js";
import {
    SIGNAL_SHARE_ROWS,
    mergeSignalShares,
    applyPactAgentLocks,
    pactAgentLockReason,
} from "../lib/signal-share-settings.js";

function effectiveSignalShares() {
    return applyPactAgentLocks(mergeSignalShares(state.signalShares), state.triggers);
}

let pendingSignalShares = null;
let signalSaveToastEl = null;
let signalSaveToastTimer = null;

function getRenderedSignalShares() {
    return pendingSignalShares || effectiveSignalShares();
}

function markSignalSharesPending(nextShares) {
    pendingSignalShares = applyPactAgentLocks(nextShares, state.triggers);
}

function savePendingSignalShares() {
    if (!pendingSignalShares) {
        return;
    }
    state.signalShares = pendingSignalShares;
    saveState(state);
    pendingSignalShares = null;
}

function isSignalsTabVisible() {
    const tab = document.getElementById("tab-signals");
    return Boolean(tab && !tab.classList.contains("hidden"));
}

function getSignalSaveToastButton() {
    if (signalSaveToastEl) {
        return signalSaveToastEl;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "signal-settings-save-toast hidden";
    btn.textContent = "Save signal settings";
    btn.addEventListener("click", () => {
        savePendingSignalShares();
        btn.textContent = "Saved!";
        btn.disabled = true;
        window.clearTimeout(signalSaveToastTimer);
        signalSaveToastTimer = window.setTimeout(() => {
            btn.disabled = false;
            btn.textContent = "Save signal settings";
            syncSignalSaveToast();
            renderSignalShareSettings();
        }, 900);
    });
    document.body.appendChild(btn);
    signalSaveToastEl = btn;
    return btn;
}

function syncSignalSaveToast() {
    const btn = getSignalSaveToastButton();
    const shouldShow = Boolean(pendingSignalShares) && isSignalsTabVisible();
    btn.classList.toggle("hidden", !shouldShow);
}

export function refreshSignalSaveToastVisibility() {
    syncSignalSaveToast();
}

export function renderSignalShareSettings() {
    const root = document.getElementById("signal-settings-root");
    if (!root) {
        return;
    }
    root.replaceChildren();
    const triggers = new Set(state.triggers || []);
    const shares = getRenderedSignalShares();

    const table = document.createElement("div");
    table.className = "signal-settings-table";

    const head = document.createElement("div");
    head.className = "signal-settings-row signal-settings-row--head";
    const hType = document.createElement("div");
    hType.className = "signal-settings-cell signal-settings-cell--type";
    hType.textContent = "Signal";
    const hAgent = document.createElement("div");
    hAgent.className = "signal-settings-cell signal-settings-cell--check signal-settings-cell--head-check";
    hAgent.textContent = "Agent";
    const hPartner = document.createElement("div");
    hPartner.className = "signal-settings-cell signal-settings-cell--check signal-settings-cell--head-check";
    hPartner.textContent = (state.partnerName || "").trim() || "Partner";
    head.append(hType, hAgent, hPartner);
    table.appendChild(head);

    for (const row of SIGNAL_SHARE_ROWS) {
        const agentLocked = Boolean(row.pactAgentLockTrigger && triggers.has(row.pactAgentLockTrigger));
        const rowEl = document.createElement("div");
        rowEl.className = "signal-settings-row";

        const typeCell = document.createElement("div");
        typeCell.className = "signal-settings-cell signal-settings-cell--type";
        const title = document.createElement("div");
        title.className = "signal-settings-type-title";
        title.textContent = row.label;
        const blurb = document.createElement("div");
        blurb.className = "signal-settings-type-blurb";
        blurb.textContent = row.blurb;
        typeCell.append(title, blurb);
        if (agentLocked && row.pactAgentLockTrigger) {
            const lock = document.createElement("div");
            lock.className = "signal-settings-lock-note";
            lock.textContent = pactAgentLockReason(row.pactAgentLockTrigger);
            typeCell.appendChild(lock);
        }

        const agentCell = document.createElement("div");
        agentCell.className = "signal-settings-cell signal-settings-cell--check";
        const agentLabel = document.createElement("label");
        agentLabel.className = "signal-settings-check-label";
        const agentCb = document.createElement("input");
        agentCb.type = "checkbox";
        agentCb.className = "pact-toggle-input";
        agentCb.checked = shares[row.id].agent;
        agentCb.disabled = agentLocked;
        if (agentLocked && row.pactAgentLockTrigger) {
            agentCb.title = pactAgentLockReason(row.pactAgentLockTrigger);
        }
        agentCb.addEventListener("change", () => {
            const next = { ...shares, [row.id]: { ...shares[row.id], agent: agentCb.checked } };
            next[row.id].agent = agentCb.checked;
            markSignalSharesPending(next);
            renderSignalShareSettings();
        });
        agentLabel.appendChild(agentCb);
        agentCell.appendChild(agentLabel);

        const partnerCell = document.createElement("div");
        partnerCell.className = "signal-settings-cell signal-settings-cell--check";
        const partnerLabel = document.createElement("label");
        partnerLabel.className = "signal-settings-check-label";
        const partnerCb = document.createElement("input");
        partnerCb.type = "checkbox";
        partnerCb.className = "pact-toggle-input";
        partnerCb.checked = shares[row.id].partner;
        partnerCb.addEventListener("change", () => {
            const next = { ...shares, [row.id]: { ...shares[row.id], partner: partnerCb.checked } };
            next[row.id].partner = partnerCb.checked;
            markSignalSharesPending(next);
            renderSignalShareSettings();
        });
        partnerLabel.appendChild(partnerCb);
        partnerCell.appendChild(partnerLabel);

        rowEl.append(typeCell, agentCell, partnerCell);
        table.appendChild(rowEl);
    }

    root.appendChild(table);
    syncSignalSaveToast();
}
