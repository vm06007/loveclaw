// Namespaced per role so two Tauri instances don't share storage.
// Updated in boot() when role is known from get_instance_config or ?role=.
const DEFAULT_KEY = "loveclaw-state";

const DEFAULT_STATE = {
    myName: "",
    partnerName: "",
    coupleId: "",
    code: "",
    triggers: ["tinder", "bumble", "hinge", "grindr", "badoo", "okcupid"],
    createdAt: null,
    paired: false,
    myAxlKey: "",
    partnerAxlKey: "",
    trustScore: 100,
    signals: [],
    diary: [],
};

let storageKey = DEFAULT_KEY;

function loadState() {
    try {
        const raw = localStorage.getItem(storageKey);
        return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
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
