// Namespaced per role so two Tauri instances don't share storage.
// Updated in boot() when role is known from get_instance_config or ?role=.
import { migrateTriggers } from "./pact-triggers.js";

const DEFAULT_KEY = "loveclaw-state";

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
    signals: [],
    diary: [],
    stakeEth: 0,
};

let storageKey = DEFAULT_KEY;

function loadState() {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return { ...DEFAULT_STATE };
        }
        const parsed = { ...DEFAULT_STATE, ...JSON.parse(raw) };
        parsed.triggers = migrateTriggers(parsed.triggers);
        const se = Number(parsed.stakeEth);
        parsed.stakeEth = Number.isFinite(se) && se >= 0 ? se : 0;
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
