/** Canonical pact rule ids (aligned with parent loveclaw Create.svelte). */
export const PACT_TRIGGER_IDS = ["dating_app", "location", "contact", "diary"];

/** Legacy per-app chip ids stored before pact rules migration. */
export const LEGACY_APP_TRIGGER_IDS = new Set([
    "tinder",
    "bumble",
    "hinge",
    "grindr",
    "badoo",
    "okcupid",
    "match",
    "zoosk",
]);

const DEFAULT_PACT_TRIGGERS = ["dating_app", "location", "diary"];

/**
 * If stored state only has legacy app keys, treat as dating_app consent.
 * Otherwise keep only known pact ids (plus dating_app if legacy present).
 */
export function migrateTriggers(triggers) {
    if (!Array.isArray(triggers) || triggers.length === 0) {
        return [...DEFAULT_PACT_TRIGGERS];
    }
    const hasPact = triggers.some(t => PACT_TRIGGER_IDS.includes(t));
    const legacyHits = triggers.filter(t => LEGACY_APP_TRIGGER_IDS.has(t));
    if (legacyHits.length > 0 && !hasPact) {
        return ["dating_app"];
    }
    const fromPact = triggers.filter(t => PACT_TRIGGER_IDS.includes(t));
    const addDating = legacyHits.length > 0 && !fromPact.includes("dating_app");
    const merged = addDating ? [...fromPact, "dating_app"] : fromPact;
    const out = [...new Set(merged)];
    return out.length ? out : [...DEFAULT_PACT_TRIGGERS];
}

/**
 * Normalizes trigger ids from a decoded invite. Does not fill defaults when
 * the inviter sent an empty list (unlike loadState migration).
 * @param {string[]|null|undefined} t
 * @returns {string[]|null} null = field absent, use app default.
 */
export function coalescePactTriggers(t) {
    if (t == null) {
        return null;
    }
    if (!Array.isArray(t)) {
        return [];
    }
    return [...new Set(t.filter(x => PACT_TRIGGER_IDS.includes(x)))];
}
