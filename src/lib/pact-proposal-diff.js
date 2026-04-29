import { pactRuleLabel, formatStakeEth } from "./invite.js";
import {
    PACT_TRIGGER_IDS,
    PACT_AUTOMATION_TRIGGER_IDS,
} from "./pact-triggers.js";

/**
 * Normalize inbound pact proposal payloads (same rules as dashboard apply).
 * @param {object} raw
 * @returns {{ triggers: string[]; stakeEth: number }}
 */
export function normalizePactProposal(raw) {
    const proposedSet = new Set(
        Array.isArray(raw?.triggers) ? raw.triggers.map(x => String(x)) : [],
    );
    const triggers = PACT_TRIGGER_IDS.filter(id => proposedSet.has(id));
    const sv = Number(raw?.stakeEth);
    const stakeEth = Number.isFinite(sv) && sv >= 0 ? sv : 0;
    return { triggers, stakeEth };
}

function triggerSection(id) {
    return PACT_AUTOMATION_TRIGGER_IDS.includes(id) ? "automation" : "breach";
}

/**
 * @param {string[]} currentTriggers
 * @param {number} currentStakeEth
 * @param {object} proposalRaw
 */
export function computePactProposalDiff(currentTriggers, currentStakeEth, proposalRaw) {
    const cur = normalizePactProposal({ triggers: currentTriggers, stakeEth: currentStakeEth });
    const prop = normalizePactProposal(proposalRaw);
    const curSet = new Set(cur.triggers);
    const propSet = new Set(prop.triggers);
    const added = PACT_TRIGGER_IDS.filter(id => !curSet.has(id) && propSet.has(id));
    const removed = PACT_TRIGGER_IDS.filter(id => curSet.has(id) && !propSet.has(id));
    const stakeBefore = cur.stakeEth;
    const stakeAfter = prop.stakeEth;
    const stakeChanged = stakeBefore !== stakeAfter;
    return { added, removed, stakeBefore, stakeAfter, stakeChanged };
}

/**
 * Human-readable diff for the pact-changes overlay (changed items only).
 * @param {ReturnType<typeof computePactProposalDiff>} diff
 */
export function formatPactProposalDiffPlain(diff) {
    const lines = [];
    for (const id of diff.added) {
        lines.push(`Added ${triggerSection(id)} rule: ${pactRuleLabel(id)}`);
    }
    for (const id of diff.removed) {
        lines.push(`Removed ${triggerSection(id)} rule: ${pactRuleLabel(id)}`);
    }
    if (diff.stakeChanged) {
        lines.push(`Mandatory ETH stake: ${formatStakeEth(diff.stakeBefore)} → ${formatStakeEth(diff.stakeAfter)}`);
    }
    return lines.length ? lines.join("\n") : "No changes detected.";
}
