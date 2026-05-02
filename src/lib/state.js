// Namespaced per role so two Tauri instances don't share storage.
// Updated in boot() when role is known from get_instance_config or ?role=.
import { migrateTriggers, PACT_BREACH_TRIGGER_IDS } from "./pact-triggers.js";
import { mergeSignalShares, applyPactAgentLocks } from "./signal-share-settings.js";
import { normalizeInstanceTag } from "./instance-tag.js";

const DEFAULT_KEY = "loveclaw-state";

export const EMPTY_MY_PROFILE = {
    walletAddress: "",
    ensName: "",
    note: "",
    avatarDataUrl: "",
    agenticTokenId: "",
    agentWalletAddress: "",
};

export const EMPTY_PARTNER_PROFILE = {
    walletAddress: "",
    ensName: "",
    note: "",
    avatarDataUrl: "",
    agentPublicKey: "",
    deviceLabel: "",
    updatedAt: null,
    agenticTokenId: "",
    agentWalletAddress: "",
    /** Partner's URL path tag (`/tag`) when they share profile over coop; used to open their tab. */
    instanceTag: "",
};

const DEFAULT_STATE = {
    myName: "",
    partnerName: "",
    coupleId: "",
    code: "",
    triggers: ["dating_app", "location", "diary"],
    createdAt: null,
    paired: false,
    myAxlKey: "",
    partnerAxlKey: "",
    trustScore: 100,
    partnerTrustScore: 100,
    breakPactIncoming: null,
    breakPactOutgoingPending: false,
    pactChangesIncoming: null,
    pactChangesOutgoingPending: false,
    pactChangesOutgoingProposal: null,
    coupleVaultAddress: "",   // shared deposit address — separate from individual agent wallets
    swapPending: null,
    swapIncoming: null,
    swapExecuting: null,
    swapResult: null,
    customPactRules: [],
    /** Built-in breach ids removed from the pact (hidden from edit list until reset). */
    omittedBaseBreachTriggerIds: [],
    aiSettings: {
        enabled: true,
        provider: "zgcompute",
        openrouterKey: "",
        openrouterModel: "openai/gpt-4o-mini",
        huggingfaceKey: "",
        huggingfaceModel: "google/gemma-2-9b-it",
        zgComputeUrl: "",
        zgComputeSecret: "",
        zgComputeModel: "qwen/qwen-2.5-7b-instruct",
        localUrl: "http://127.0.0.1:11434",
        localModel: "gemma3:4b",
        customUrl: "",
        customToken: "",
    },
    signals: [],
    diary: [],
    calNotes: {},
    signalShares: {},
    stakeEth: 0,
    myProfile: { ...EMPTY_MY_PROFILE },
    partnerProfile: { ...EMPTY_PARTNER_PROFILE },
};

let storageKey = DEFAULT_KEY;

function loadState() {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return { ...DEFAULT_STATE };
        }
        const parsed = { ...DEFAULT_STATE, ...JSON.parse(raw) };
        const rawTriggers = Array.isArray(parsed.triggers) ? parsed.triggers.map(x => String(x)) : [];
        parsed.customPactRules = Array.isArray(parsed.customPactRules)
            ? parsed.customPactRules
                .filter(r => r && typeof r === "object")
                .map((r) => ({
                    id: String(r.id || "").trim(),
                    label: String(r.label || "").trim(),
                    hint: String(r.hint || "").trim(),
                    category: r.category === "automation" ? "automation" : "breach",
                }))
                .filter(r => r.id && r.label)
            : [];
        parsed.aiSettings = {
            ...DEFAULT_STATE.aiSettings,
            ...(parsed.aiSettings && typeof parsed.aiSettings === "object" ? parsed.aiSettings : {}),
        };
        parsed.omittedBaseBreachTriggerIds = Array.isArray(parsed.omittedBaseBreachTriggerIds)
            ? [...new Set(
                parsed.omittedBaseBreachTriggerIds
                    .map((x) => String(x))
                    .filter((id) => PACT_BREACH_TRIGGER_IDS.includes(id)),
            )]
            : [];
        parsed.triggers = migrateTriggers(parsed.triggers);
        if (Array.isArray(parsed.triggers)) {
            const customIds = new Set(parsed.customPactRules.map(r => r.id));
            const fromStoredCustom = rawTriggers
                .filter(id => customIds.has(id));
            parsed.triggers = [...new Set([...parsed.triggers, ...fromStoredCustom])];
        }
        const se = Number(parsed.stakeEth);
        parsed.stakeEth = Number.isFinite(se) && se >= 0 ? se : 0;
        parsed.myProfile = { ...EMPTY_MY_PROFILE, ...(parsed.myProfile && typeof parsed.myProfile === "object" ? parsed.myProfile : {}) };
        parsed.partnerProfile = {
            ...EMPTY_PARTNER_PROFILE,
            ...(parsed.partnerProfile && typeof parsed.partnerProfile === "object" ? parsed.partnerProfile : {}),
        };
        parsed.signalShares = applyPactAgentLocks(
            mergeSignalShares(parsed.signalShares),
            parsed.triggers,
        );
        return parsed;
    } catch {
        return { ...DEFAULT_STATE };
    }
}

function saveState(s) {
    localStorage.setItem(storageKey, JSON.stringify(s));
}

export { DEFAULT_STATE, loadState, saveState };

export function getStorageKey() {
    return storageKey;
}

export function setStorageKeyAndReload(key) {
    if (storageKey === key) {
        return;
    }
    storageKey = key;
    state = loadState();
}

export let state = loadState();

/**
 * Replaces the in-memory state object (e.g. Tauri cold start without touching storage keys).
 */
export function resetToDefault() {
    state = { ...DEFAULT_STATE };
}

/**
 * Read another URL-tag slot’s saved couple id (same origin, localStorage).
 * Both partners share the same `coupleId` after a valid join.
 * @param {string} instanceTagRaw e.g. "boris" → key `loveclaw-state-boris`
 * @returns {{ coupleId: string, paired: boolean, partnerName: string, partnerAxlKey: string } | null}
 */
export function readCoupleSnapshotForTag(instanceTagRaw) {
    const tag = normalizeInstanceTag(instanceTagRaw);
    if (!tag) {
        return null;
    }
    const key = `loveclaw-state-${tag}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
        return null;
    }
    try {
        const o = JSON.parse(raw);
        return {
            coupleId: String(o.coupleId || ""),
            paired: Boolean(o.paired),
            partnerName: String(o.partnerName || ""),
            partnerAxlKey: String(o.partnerAxlKey || ""),
        };
    } catch {
        return null;
    }
}

/**
 * True when this tab’s paired `coupleId` matches the other tag’s saved `coupleId`.
 * @param {string} otherTag e.g. "boris" while on `/alice`
 */
export function isSameCoupleAsTag(otherTag) {
    const mine = String(state.coupleId || "").trim();
    if (!mine || !state.paired) {
        return false;
    }
    const o = readCoupleSnapshotForTag(otherTag);
    return Boolean(o?.paired && String(o.coupleId || "").trim() === mine);
}
