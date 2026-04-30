import {
    pactRuleLabel,
    formatStakeEth,
    getAllTriggerIds,
    getAutomationTriggerIds,
    sanitizeCustomPactRules,
} from "./invite.js";
import { PACT_BREACH_TRIGGER_IDS } from "./pact-triggers.js";

/**
 * Normalize inbound pact proposal payloads (same rules as dashboard apply).
 * @param {object} raw
 * @returns {{ triggers: string[]; stakeEth: number; customRules: object[]; omittedBaseBreachTriggerIds?: string[] }}
 */
export function normalizePactProposal(raw) {
    const customRules = sanitizeCustomPactRules(raw?.customRules);
    const triggerIds = getAllTriggerIds(customRules);
    const proposedSet = new Set(
        Array.isArray(raw?.triggers) ? raw.triggers.map(x => String(x)) : [],
    );
    const triggers = triggerIds.filter(id => proposedSet.has(id));
    const sv = Number(raw?.stakeEth);
    const stakeEth = Number.isFinite(sv) && sv >= 0 ? sv : 0;
    const out = { triggers, stakeEth, customRules };
    if (Array.isArray(raw?.omittedBaseBreachTriggerIds)) {
        out.omittedBaseBreachTriggerIds = [...new Set(
            raw.omittedBaseBreachTriggerIds
                .map((x) => String(x))
                .filter((id) => PACT_BREACH_TRIGGER_IDS.includes(id)),
        )];
    }
    return out;
}

function triggerSection(id, customRules = []) {
    return getAutomationTriggerIds(customRules).includes(id) ? "automation" : "breach";
}

/**
 * @param {string[]} currentTriggers
 * @param {number} currentStakeEth
 * @param {object} proposalRaw
 * @param {{ customRules?: object[]; omittedBaseBreachTriggerIds?: string[] }} [currentExtra]
 */
export function computePactProposalDiff(currentTriggers, currentStakeEth, proposalRaw, currentExtra = {}) {
    const curCustom = sanitizeCustomPactRules(currentExtra.customRules);
    const curOmitted = currentExtra.omittedBaseBreachTriggerIds;
    const cur = normalizePactProposal({
        triggers: currentTriggers,
        stakeEth: currentStakeEth,
        customRules: curCustom,
        ...(Array.isArray(curOmitted)
            ? { omittedBaseBreachTriggerIds: [...curOmitted] }
            : {}),
    });
    const prop = normalizePactProposal(proposalRaw);
    const propCustomIds = new Set(prop.customRules.map((r) => r.id));
    const removedCustomRuleIds = curCustom
        .map((r) => r.id)
        .filter((id) => !propCustomIds.has(id));
    const mergedCustomRules = sanitizeCustomPactRules([...prop.customRules, ...curCustom]);
    const curTriggerSet = new Set(curCustom.map((r) => r.id).concat(currentTriggers || []));
    const allIds = getAllTriggerIds(mergedCustomRules);
    const curSet = new Set(
        getAllTriggerIds(curCustom).filter((id) => curTriggerSet.has(id) || (cur.triggers || []).includes(id)),
    );
    (cur.triggers || []).forEach((id) => curSet.add(id));
    const propSet = new Set(prop.triggers);
    const added = allIds.filter((id) => !curSet.has(id) && propSet.has(id));
    const removed = allIds.filter((id) => curSet.has(id) && !propSet.has(id));
    for (const id of removedCustomRuleIds) {
        if (!removed.includes(id) && curSet.has(id)) {
            removed.push(id);
        }
    }
    const stakeBefore = cur.stakeEth;
    const stakeAfter = prop.stakeEth;
    const stakeChanged = stakeBefore !== stakeAfter;
    const curO = new Set(cur.omittedBaseBreachTriggerIds || []);
    const propO = new Set(prop.omittedBaseBreachTriggerIds || []);
    const omittedAdded = [...propO].filter((id) => !curO.has(id));
    const omittedRemoved = [...curO].filter((id) => !propO.has(id));
    return {
        added,
        removed,
        stakeBefore,
        stakeAfter,
        stakeChanged,
        customRules: mergedCustomRules,
        omittedAdded,
        omittedRemoved,
        removedCustomRuleIds,
    };
}

/**
 * Human-readable diff for the pact-changes overlay (changed items only).
 * @param {ReturnType<typeof computePactProposalDiff>} diff
 */
export function formatPactProposalDiffPlain(diff) {
    const lines = [];
    for (const id of diff.added) {
        lines.push(`Added ${triggerSection(id, diff.customRules)} rule: ${pactRuleLabel(id, diff.customRules)}`);
    }
    for (const id of diff.removed) {
        lines.push(`Removed ${triggerSection(id, diff.customRules)} rule: ${pactRuleLabel(id, diff.customRules)}`);
    }
    for (const id of diff.omittedAdded || []) {
        lines.push(`Removed built-in breach trigger from pact: ${pactRuleLabel(id, diff.customRules)}`);
    }
    for (const id of diff.omittedRemoved || []) {
        lines.push(`Restored built-in breach trigger to pact list: ${pactRuleLabel(id, diff.customRules)}`);
    }
    if (diff.stakeChanged) {
        lines.push(`Mandatory ETH stake: ${formatStakeEth(diff.stakeBefore)} → ${formatStakeEth(diff.stakeAfter)}`);
    }
    return lines.length ? lines.join("\n") : "No changes detected.";
}
