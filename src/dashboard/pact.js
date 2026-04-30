import { state, saveState } from "../lib/state.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "../app/ipc-send.js";
import {
    syncPactBadge,
    syncPactBreakOverlay,
    syncPactChangesOverlay,
    syncProposeBreakPactButton,
    syncEditPactButton,
} from "../app/breakPact.js";
import {
    pactRuleLabel,
    formatStakeSummary,
    getAllPactRules,
    getPactRuleById,
    getAllTriggerIds,
    getBreachTriggerIds,
    getAutomationTriggerIds,
    sanitizeCustomPactRules,
} from "../lib/invite.js";
import { normalizePactProposal } from "../lib/pact-proposal-diff.js";
import { PACT_BREACH_TRIGGER_IDS } from "../lib/pact-triggers.js";
import { addPactChangesDenyReceivedLine } from "../app/ping.js";
import { renderSignalShareSettings } from "./signal-settings.js";

let pactEditMode = false;
/** Snapshot when entering edit pact (JSON sig) so save enables after deletes / toggles. */
let pactEditBaselineJson = null;
/** Deep copy of pact fields when edit opens — cancel restores this. */
let pactEditUndoSnapshot = null;

/** Expanded/collapsed state for pact category panels (persisted between pact tab re-renders). */
let pactCategoryExpanded = { breach: true, automation: true };

const PACT_EDIT_DELETE_ICON = `<svg class="pact-edit-trigger-delete-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

const PACT_CATEGORY_CHEVRON_SVG = `
                            <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
                                <rect x="2" y="1" width="2" height="2" />
                                <rect x="4" y="3" width="2" height="2" />
                                <rect x="6" y="5" width="2" height="2" />
                                <rect x="4" y="7" width="2" height="2" />
                                <rect x="2" y="9" width="2" height="2" />
                            </svg>`;

function buildPactCategoryHeading(title, panelId, catKey, expanded) {
    const open = expanded !== false;
    const disclosureCls = open ? " today-budget-toggle--open" : "";
    const headingCls = open ? " pact-category-heading--open" : "";
    return `
    <button type="button"
      class="pact-item pact-item--parent pact-category-heading${headingCls}"
      aria-expanded="${open ? "true" : "false"}"
      aria-controls="${panelId}"
      data-category="${catKey}"
      title="tap to show or hide items under this section"
      id="${panelId}-heading">
      <span class="pact-category-heading-label">${escapePactText(title)}</span>
      <span class="today-budget-toggle pact-category-heading-disclosure${disclosureCls}" aria-hidden="true">
        <span class="today-budget-toggle-glyph" aria-hidden="true">${PACT_CATEGORY_CHEVRON_SVG}
        </span>
      </span>
    </button>`;
}

function escapePactText(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function togglePactCategorySection(heading) {
    const panelId = heading.getAttribute("aria-controls");
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) {
        return;
    }
    const cat = heading.dataset.category;
    const willOpen = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !willOpen);
    heading.setAttribute("aria-expanded", willOpen ? "true" : "false");
    heading.classList.toggle("pact-category-heading--open", willOpen);
    const disclosure = heading.querySelector(".pact-category-heading-disclosure");
    disclosure?.classList.toggle("today-budget-toggle--open", willOpen);
    if (cat === "breach" || cat === "automation") {
        pactCategoryExpanded[cat] = willOpen;
    }
}

/** One delegated listener so collapse works reliably whenever `renderPact` replaces markup. */
function ensurePactCategoryPanelDelegation() {
    const root = document.getElementById("pact-view");
    if (!root || root.dataset.pactCategoryDelegated === "1") {
        return;
    }
    root.dataset.pactCategoryDelegated = "1";
    root.addEventListener("click", (e) => {
        const heading = e.target.closest(".pact-category-heading");
        if (!heading || !root.contains(heading)) {
            return;
        }
        e.preventDefault();
        togglePactCategorySection(heading);
    });
}

function transportPartnerMessage(payload) {
    const msg = { ...payload, ts: payload.ts ?? Date.now() };
    if (axl.available && state.partnerAxlKey) {
        axl.send(state.partnerAxlKey, msg);
    } else {
        ipcSend(msg);
    }
}

export function applyPactProposal(proposal) {
    const clean = normalizePactProposal(proposal);
    state.triggers = clean.triggers;
    state.stakeEth = clean.stakeEth;
    state.customPactRules = sanitizeCustomPactRules(clean.customRules || []);
    if (clean.omittedBaseBreachTriggerIds !== undefined) {
        state.omittedBaseBreachTriggerIds = [...clean.omittedBaseBreachTriggerIds];
    }
    saveState(state);
    renderSignalShareSettings();
    renderPact();
}

function bindPactTriggerTree(view) {
    view.querySelectorAll(".pact-trigger-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
            const triggerId = btn.getAttribute("data-trigger-id");
            if (!triggerId) {
                return;
            }
            const details = view.querySelector(`.pact-trigger-details[data-trigger-id="${triggerId}"]`);
            if (!details) {
                return;
            }
            const open = details.classList.contains("hidden");
            details.classList.toggle("hidden", !open);
            btn.setAttribute("aria-expanded", open ? "true" : "false");
            btn.classList.toggle("is-open", open);
            const disclosure = btn.querySelector(".pact-trigger-disclosure");
            if (disclosure) {
                disclosure.classList.toggle("today-budget-toggle--open", open);
            }
        });
    });
}

function buildPactTriggerRowHtml(t) {
    const rule = getPactRuleById(t, state.customPactRules);
    const label = pactRuleLabel(t);
    const hint = rule?.hint || "No extra details available for this trigger yet.";
    return `
            <div class="pact-item pact-item--child">
                <button
                    type="button"
                    class="pact-trigger-toggle"
                    data-trigger-id="${escapePactText(t)}"
                    aria-expanded="false"
                >
                    <span class="pact-trigger-label">${escapePactText(label)}</span>
                    <span class="today-budget-toggle pact-trigger-disclosure" aria-hidden="true">
                        <span class="today-budget-toggle-glyph" aria-hidden="true">
                            <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
                                <rect x="2" y="1" width="2" height="2" />
                                <rect x="4" y="3" width="2" height="2" />
                                <rect x="6" y="5" width="2" height="2" />
                                <rect x="4" y="7" width="2" height="2" />
                                <rect x="2" y="9" width="2" height="2" />
                            </svg>
                        </span>
                    </span>
                </button>
                <p class="pact-trigger-details hidden" data-trigger-id="${escapePactText(t)}">${escapePactText(hint)}</p>
            </div>`;
}

function stablePactEditProposalJson(norm) {
    const p = norm && typeof norm === "object" ? norm : {};
    const customs = sanitizeCustomPactRules(p.customRules || [])
        .map((r) => ({
            id: r.id,
            label: r.label,
            hint: r.hint,
            category: r.category,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify({
        triggers: [...(p.triggers || [])].sort(),
        stakeEth: Number.isFinite(Number(p.stakeEth)) && Number(p.stakeEth) >= 0 ? Number(p.stakeEth) : 0,
        omittedBaseBreachTriggerIds: [...(p.omittedBaseBreachTriggerIds || [])].sort(),
        customRules: customs,
    });
}

function readPactEditProposalFromView(view) {
    const checked = new Set(
        Array.from(view.querySelectorAll('input[name="pact-edit-trigger"]:checked'))
            .map((el) => String(el.value)),
    );
    const allTriggerIds = getAllTriggerIds(state.customPactRules);
    const proposedTriggers = allTriggerIds.filter((id) => checked.has(id));
    const stakeInp = view.querySelector("#pact-edit-stake");
    let proposedStakeEth = 0;
    if (stakeInp instanceof HTMLInputElement) {
        const raw = String(stakeInp.value).trim();
        if (raw !== "" && raw !== ".") {
            const n = parseFloat(raw, 10);
            proposedStakeEth = Number.isFinite(n) && n >= 0 ? n : 0;
        }
    }
    return normalizePactProposal({
        triggers: proposedTriggers,
        stakeEth: proposedStakeEth,
        customRules: state.customPactRules,
        omittedBaseBreachTriggerIds: [...(state.omittedBaseBreachTriggerIds || [])],
    });
}

function removeBreachTriggerFromPactInEdit(triggerId) {
    const id = String(triggerId || "").trim();
    if (!id) {
        return;
    }
    state.triggers = (state.triggers || []).filter((t) => t !== id);
    if (PACT_BREACH_TRIGGER_IDS.includes(id)) {
        const next = new Set(state.omittedBaseBreachTriggerIds || []);
        next.add(id);
        state.omittedBaseBreachTriggerIds = [...next];
    } else {
        state.customPactRules = (state.customPactRules || []).filter((r) => r.id !== id);
    }
    saveState(state);
}

function bindPactEditUi(view) {
    const editBtn = document.getElementById("btn-edit-pact");
    if (editBtn && !editBtn.dataset.bound) {
        editBtn.addEventListener("click", () => {
            pactEditMode = true;
            pactEditUndoSnapshot = {
                triggers: [...(state.triggers || [])],
                customPactRules: sanitizeCustomPactRules(state.customPactRules).map((r) => ({ ...r })),
                omittedBaseBreachTriggerIds: [...(state.omittedBaseBreachTriggerIds || [])],
                stakeEth: Number.isFinite(Number(state.stakeEth)) && Number(state.stakeEth) >= 0
                    ? Number(state.stakeEth)
                    : 0,
            };
            const se = Number(state.stakeEth);
            const stakeEth = Number.isFinite(se) && se >= 0 ? se : 0;
            pactEditBaselineJson = stablePactEditProposalJson(
                normalizePactProposal({
                    triggers: [...(state.triggers || [])],
                    stakeEth,
                    customRules: state.customPactRules,
                    omittedBaseBreachTriggerIds: [...(state.omittedBaseBreachTriggerIds || [])],
                }),
            );
            renderPact();
        });
        editBtn.dataset.bound = "1";
    }
    if (!pactEditMode) {
        return;
    }
    const cancelBtn = view.querySelector("#btn-cancel-pact-edit");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            if (pactEditUndoSnapshot) {
                state.triggers = [...pactEditUndoSnapshot.triggers];
                state.customPactRules = [...pactEditUndoSnapshot.customPactRules];
                state.omittedBaseBreachTriggerIds = [...pactEditUndoSnapshot.omittedBaseBreachTriggerIds];
                state.stakeEth = pactEditUndoSnapshot.stakeEth;
                saveState(state);
            }
            pactEditUndoSnapshot = null;
            pactEditMode = false;
            pactEditBaselineJson = null;
            renderPact();
        });
    }
    const saveBtn = view.querySelector("#btn-save-pact-edit");
    if (saveBtn) {
        const triggerInputs = Array.from(view.querySelectorAll('input[name="pact-edit-trigger"]'));
        const stakeInp = view.querySelector("#pact-edit-stake");
        const readCurrentStake = () => {
            if (!(stakeInp instanceof HTMLInputElement)) {
                return 0;
            }
            const raw = String(stakeInp.value).trim();
            if (raw === "" || raw === ".") {
                return 0;
            }
            const n = parseFloat(raw, 10);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        };
        const syncProposalButtonState = () => {
            if (!pactEditBaselineJson) {
                saveBtn.disabled = true;
                return;
            }
            const now = readPactEditProposalFromView(view);
            saveBtn.disabled = stablePactEditProposalJson(now) === pactEditBaselineJson;
        };
        triggerInputs.forEach((inp) => {
            inp.addEventListener("change", syncProposalButtonState);
        });
        if (stakeInp instanceof HTMLInputElement) {
            stakeInp.addEventListener("input", syncProposalButtonState);
            stakeInp.addEventListener("change", syncProposalButtonState);
        }
        view.querySelectorAll("[data-pact-delete-breach]").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                const id = btn.getAttribute("data-pact-delete-breach");
                if (!id) {
                    return;
                }
                removeBreachTriggerFromPactInEdit(id);
                renderPact();
            });
        });
        syncProposalButtonState();

        saveBtn.addEventListener("click", () => {
            if (saveBtn.disabled) {
                return;
            }
            const normalized = readPactEditProposalFromView(view);
            const proposal = {
                triggers: normalized.triggers,
                stakeEth: normalized.stakeEth,
                customRules: normalized.customRules,
                omittedBaseBreachTriggerIds: [...(normalized.omittedBaseBreachTriggerIds || [])],
            };
            if (!state.paired || !state.partnerAxlKey) {
                applyPactProposal(proposal);
                pactEditMode = false;
                pactEditBaselineJson = null;
                pactEditUndoSnapshot = null;
                return;
            }
            state.pactChangesOutgoingPending = true;
            state.pactChangesOutgoingProposal = proposal;
            saveState(state);
            pactEditMode = false;
            pactEditBaselineJson = null;
            pactEditUndoSnapshot = null;
            renderPact();
            transportPartnerMessage({
                type: "pact_changes_propose",
                from: state.myName || "me",
                proposal,
            });
        });
    }
}

export function onPactChangesGrantReceived(msg) {
    const granted = normalizePactProposal(msg?.proposal || state.pactChangesOutgoingProposal || {});
    if (state.pactChangesOutgoingPending) {
        applyPactProposal(granted);
    }
    state.pactChangesOutgoingPending = false;
    state.pactChangesOutgoingProposal = null;
    saveState(state);
    syncPactBadge();
    syncPactChangesOverlay();
    syncProposeBreakPactButton();
    syncEditPactButton();
}

export function onPactChangesDenyReceived(msg) {
    state.pactChangesOutgoingPending = false;
    state.pactChangesOutgoingProposal = null;
    saveState(state);
    syncPactBadge();
    syncPactChangesOverlay();
    syncProposeBreakPactButton();
    syncEditPactButton();
    addPactChangesDenyReceivedLine(msg?.from);
}

export function renderPact() {
    const view = document.getElementById("pact-view");
    if (!view) {
        return;
    }
    view.classList.toggle("pact-view--edit", pactEditMode);
    const s = formatStakeSummary(state.stakeEth);
    const stakeText = s === "—" ? "0.00 ETH" : s;
    const allRules = getAllPactRules(state.customPactRules);
    const allTriggerIds = getAllTriggerIds(state.customPactRules);
    const breachTriggerIds = getBreachTriggerIds(state.customPactRules);
    const automationTriggerIds = getAutomationTriggerIds(state.customPactRules);
    const ordered = state.triggers.filter(t => allTriggerIds.includes(t));
    const breachIds = ordered.filter(t => breachTriggerIds.includes(t));
    const automationIds = ordered.filter(t => automationTriggerIds.includes(t));
    const breachRowsHtml = breachIds.length
        ? breachIds.map(buildPactTriggerRowHtml).join("")
        : `<div class="pact-item pact-item--child"><p class="hint">no breach triggers set</p></div>`;
    const automationRowsHtml = automationIds.length
        ? automationIds.map(buildPactTriggerRowHtml).join("")
        : `<div class="pact-item pact-item--child"><p class="hint">no automation tasks enabled</p></div>`;
    const omittedBreach = new Set(state.omittedBaseBreachTriggerIds || []);
    const breachRulesEdit = allRules.filter(
        (r) => breachTriggerIds.includes(r.id) &&
            !(PACT_BREACH_TRIGGER_IDS.includes(r.id) && omittedBreach.has(r.id)),
    );
    const automationRulesEdit = allRules.filter(r => automationTriggerIds.includes(r.id));
    const editForm = pactEditMode
        ? `
    <div class="pact-edit-card">
      <p class="pact-edit-title">edit pact</p>
      <p class="pact-edit-section-title">automation tasks</p>
      <div class="pact-edit-list">
        ${automationRulesEdit.map((rule) => `
        <label class="pact-edit-row">
          <input type="checkbox" class="pact-toggle-input pact-edit-checkbox" name="pact-edit-trigger" value="${escapePactText(rule.id)}" ${state.triggers.includes(rule.id) ? "checked" : ""}>
          <span>${escapePactText(rule.label)}</span>
        </label>
        `).join("")}
      </div>
      <p class="pact-edit-section-title pact-edit-section-title--gap">breach triggers</p>
      <div class="pact-edit-list">
        ${breachRulesEdit.map((rule) => `
        <div class="pact-edit-row pact-edit-row--breach">
          <label class="pact-edit-row-label">
            <input type="checkbox" class="pact-toggle-input pact-edit-checkbox" name="pact-edit-trigger" value="${escapePactText(rule.id)}" ${state.triggers.includes(rule.id) ? "checked" : ""}>
            <span>${escapePactText(rule.label)}</span>
          </label>
          <button type="button" class="pact-edit-trigger-delete" data-pact-delete-breach="${escapePactText(rule.id)}" aria-label="Remove ${escapePactText(rule.label)} from pact" title="remove from pact">${PACT_EDIT_DELETE_ICON}</button>
        </div>
        `).join("")}
      </div>
      <label class="pact-edit-stake-row" for="pact-edit-stake">
        mandatory ETH stake
      </label>
      <input
        id="pact-edit-stake"
        class="field-input pact-edit-stake-input"
        type="number"
        min="0"
        step="0.001"
        inputmode="decimal"
        value="${Number.isFinite(Number(state.stakeEth)) && Number(state.stakeEth) >= 0 ? escapePactText(String(state.stakeEth)) : "0"}"
      >
      <div class="pact-edit-actions">
        <button type="button" class="btn btn-ghost" id="btn-cancel-pact-edit">cancel</button>
        <button type="button" class="btn btn-primary" id="btn-save-pact-edit">propose pact changes</button>
      </div>
    </div>`
        : "";
    const breachPanelOpen = pactCategoryExpanded.breach !== false;
    const automationPanelOpen = pactCategoryExpanded.automation !== false;
    if (pactEditMode) {
        view.innerHTML = editForm;
    } else {
        view.innerHTML = `
    <div class="pact-category-group">
      ${buildPactCategoryHeading("automation tasks:", "pact-panel-automation", "automation", automationPanelOpen)}
      <div id="pact-panel-automation" class="pact-trigger-tree-wrap${automationPanelOpen ? "" : " hidden"}">
        <div class="pact-trigger-tree">
          ${automationRowsHtml}
        </div>
      </div>
    </div>
    <div class="pact-category-group">
      ${buildPactCategoryHeading("breach triggers:", "pact-panel-breach", "breach", breachPanelOpen)}
      <div id="pact-panel-breach" class="pact-trigger-tree-wrap${breachPanelOpen ? "" : " hidden"}">
        <div class="pact-trigger-tree">
          ${breachRowsHtml}
        </div>
      </div>
    </div>
    <div class="pact-item">mandatory ETH stake: ${stakeText}</div>
    `;
        ensurePactCategoryPanelDelegation();
        bindPactTriggerTree(view);
    }
    bindPactEditUi(view);
    const pactActions = document.querySelector("#tab-pact .pact-actions");
    if (pactActions) {
        pactActions.classList.toggle("hidden", pactEditMode);
        pactActions.setAttribute("aria-hidden", pactEditMode ? "true" : "false");
    }
    syncProposeBreakPactButton();
    syncPactBadge();
    syncPactBreakOverlay();
    syncPactChangesOverlay();
    syncEditPactButton();
}
