import { pactRuleLabel } from "./invite.js";

/**
 * Rows for the Signals tab: what the on-device agent ingests vs what may go to the partner.
 * `pactAgentLockTrigger` ties a row to a pact rule — when that rule is active, agent sharing
 * stays on and the checkbox is disabled.
 */
export const SIGNAL_SHARE_ROWS = [
    {
        id: "battery",
        label: "Battery",
        blurb: "Charge %, charging state, low-power mode.",
        pactAgentLockTrigger: null,
    },
    {
        id: "location",
        label: "Location",
        blurb: "GPS / network fixes and place names.",
        pactAgentLockTrigger: "location",
    },
    {
        id: "apps",
        label: "Foreground apps",
        blurb: "Active app / window focus (package names only).",
        pactAgentLockTrigger: "dating_app",
    },
    {
        id: "notification",
        label: "Notification shapes",
        blurb: "App id + category only — never message bodies.",
        pactAgentLockTrigger: null,
    },
    {
        id: "contact_radar",
        label: "Call & contact radar",
        blurb: "Unknown numbers dialed often; contact labels, not recordings.",
        pactAgentLockTrigger: "contact",
    },
    {
        id: "diary_context",
        label: "Diary context bundle",
        blurb: "Mood tokens, rough schedule, and snippets for the AI diary.",
        pactAgentLockTrigger: "diary",
    },
    {
        id: "heartrate",
        label: "Heartbear & fitness",
        blurb: "Wearable BPM and a simple calm / stress band.",
        pactAgentLockTrigger: null,
    },
    {
        id: "screen_time",
        label: "Screen time",
        blurb: "Unlock counts, screen-on streaks, late-night usage windows.",
        pactAgentLockTrigger: null,
    },
    {
        id: "now_playing",
        label: "Now playing",
        blurb: "Track title + source app (no full lyrics sync).",
        pactAgentLockTrigger: null,
    },
    {
        id: "sleep_debt",
        label: "Sleep debt",
        blurb: "Estimated deficit vs your usual sleep window.",
        pactAgentLockTrigger: null,
    },
];

export function defaultSignalShares() {
    const out = {};
    for (const row of SIGNAL_SHARE_ROWS) {
        out[row.id] = { agent: true, partner: true };
    }
    return out;
}

/**
 * @param {Record<string, { agent?: boolean; partner?: boolean }>|null|undefined} stored
 */
export function mergeSignalShares(stored) {
    const base = defaultSignalShares();
    if (!stored || typeof stored !== "object") {
        return base;
    }
    for (const id of Object.keys(base)) {
        const v = stored[id];
        if (v && typeof v === "object") {
            base[id] = {
                agent: Boolean(v.agent),
                partner: Boolean(v.partner),
            };
        }
    }
    return base;
}

/**
 * @param {Record<string, { agent: boolean; partner: boolean }>} shares
 * @param {string[]|null|undefined} triggers
 */
export function applyPactAgentLocks(shares, triggers) {
    const t = new Set(triggers || []);
    const out = { ...shares };
    for (const row of SIGNAL_SHARE_ROWS) {
        if (row.pactAgentLockTrigger && t.has(row.pactAgentLockTrigger)) {
            const cur = out[row.id] || { agent: true, partner: true };
            out[row.id] = { ...cur, agent: true };
        }
    }
    return out;
}

export function pactAgentLockReason(triggerId) {
    return `Locked on for your agent — required by pact: ${pactRuleLabel(triggerId)}`;
}
