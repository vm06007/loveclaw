import QRCode from "qrcode";
import { state } from "./state.js";
import {
    PACT_TRIGGER_IDS,
    PACT_BREACH_TRIGGER_IDS,
    PACT_AUTOMATION_TRIGGER_IDS,
} from "./pact-triggers.js";

/** Default: no proposed stake; inviter can set a positive amount to encode in the invite. */
export const STAKE_DEFAULT_ETH = 0;

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Package substrings checked when `dating_app` is in the pact. */
export const DATING_APP_SUBSTRINGS = [
    "tinder",
    "bumble",
    "hinge",
    "grindr",
    "badoo",
    "okcupid",
    "match",
    "zoosk",
];

/**
 * Pact rules shown on create + invite screens (same concepts as loveclaw/Svelte Create.svelte).
 */
export const PACT_RULES = [
    {
        id: "dating_app",
        label: "Dating app installations",
        hint:
            "Your agent reviews installed apps—package IDs, display names, and AI-assisted signals from app metadata/context—to infer dating apps (not just a fixed keyword list).",
    },
    {
        id: "location",
        label: "Location anomaly detection",
        hint:
            "Flags when movement breaks from your usual routine—unexpected stops, odd routes or timing (e.g. hotels, late nights, after-work detours with no matching plans).",
    },
    {
        id: "contact",
        label: "Interrupted online presence",
        hint:
            "Flags when you stay offline too long while battery still looks healthy (e.g. over 20%) — consistent with powering down or disconnecting on purpose, not the phone dying.",
    },
    {
        id: "diary",
        label: "AI daily diary",
        hint: "AI generates a warm daily summary from your activity signals. Shared between couple via AXL.",
    },
];

export function pactRuleLabel(id) {
    return PACT_RULES.find(r => r.id === id)?.label ?? id;
}

/**
 * @param {number|undefined} n
 * @returns {string} e.g. "0.01 ETH" or "0 ETH"
 */
export function formatStakeEth(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) {
        return "0 ETH";
    }
    if (v === 0) {
        return "0 ETH";
    }
    const t = String(parseFloat(v.toFixed(6)));
    return `${t} ETH`;
}

/**
 * Read-only line on invite / join: em dash when no positive stake is proposed.
 * @param {number|undefined} n
 */
export function formatStakeSummary(n) {
    const v = Number(n);
    if (Number.isFinite(v) && v > 0) {
        return formatStakeEth(v);
    }
    return "—";
}


/**
 * Renders 4 on/off rows plus mandatory ETH stake (read-only on invite / join preview).
 * @param {{ triggers: string[]; stakeEth: number; }} p
 * @param {{ heading: string; lead: string; leadHtml?: boolean; }} head
 */
export function buildPactSummaryCardHtml(p, head) {
    const leadInner = head.leadHtml ? head.lead : escapeHtml(head.lead);
    const titleInner = escapeHtml(head.heading);
    const active = new Set((p.triggers || []).filter(t => PACT_TRIGGER_IDS.includes(t)));
    const breachRules = PACT_RULES.filter(r => PACT_BREACH_TRIGGER_IDS.includes(r.id));
    const automationRules = PACT_RULES.filter(r => PACT_AUTOMATION_TRIGGER_IDS.includes(r.id));
    const rowForRule = r => `
      <div class="pact-toggle-row invite-pact-readonly">
        <span class="pact-toggle-name">${escapeHtml(r.label)}</span>
        <span class="pact-toggle-val${active.has(r.id) ? "" : " off"}">${active.has(r.id) ? "on" : "off"}</span>
      </div>`;
    const breachRows = breachRules.map(rowForRule).join("");
    const automationRows = automationRules.map(rowForRule).join("");
    const stakeLabel = "Mandatory ETH stake";
    const sv = Number(p.stakeEth);
    const hasStake = Number.isFinite(sv) && sv > 0;
    const stakeText = formatStakeSummary(p.stakeEth);
    const stakeClass = hasStake ? "pact-stake-amount" : "pact-stake-amount off";
    const stakeRow = `
      <div class="pact-toggle-row invite-pact-readonly pact-stake-row">
        <span class="pact-toggle-name">${escapeHtml(stakeLabel)}</span>
        <span class="${stakeClass}">${escapeHtml(stakeText)}</span>
      </div>`;
    return `
    <div class="invite-pact-card">
      <div class="pact-rules-heading">${titleInner}</div>
      <p class="pact-rules-lead">${leadInner}</p>
      <p class="pact-rules-subheading">automation tasks</p>
      ${automationRows}
      <p class="pact-rules-subheading pact-rules-subheading--spaced">breach triggers</p>
      ${breachRows}
      ${stakeRow}
    </div>`;
}

export function renderInvitePactSummary(container) {
    if (!container) {
        return;
    }
    const html = buildPactSummaryCardHtml(
        { triggers: state.triggers, stakeEth: state.stakeEth },
        {
            heading: "pact rules on this invite",
            lead: "Your partner sees the same rules.",
        },
    );
    container.innerHTML = html;
}

export function generateKey() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function buildPact() {
    const se = Number(state.stakeEth);
    const stakeEth = Number.isFinite(se) && se >= 0 ? se : 0;
    const pact = {
        name: state.myName,
        key: state.myAxlKey,
        triggers: state.triggers,
        coupleId: state.coupleId,
        ts: Date.now(),
        stakeEth,
    };
    return btoa(JSON.stringify(pact));
}

export function parsePact(code) {
    try {
        return JSON.parse(atob(code.trim()));
    } catch {
        return null;
    }
}

/**
 * @param {string} raw  pasted URL, `?pact=…`, or raw base64
 * @returns {object | null} decoded pact
 */
export function parsePactFromInviteField(raw) {
    const t = raw?.trim() ?? "";
    if (!t) {
        return null;
    }
    let code = t;
    try {
        const u = new URL(t);
        const p = u.searchParams.get("pact");
        if (p) {
            code = p;
        }
    } catch {
        /* plain base64 or invalid URL fragment */
    }
    return parsePact(code);
}

/**
 * Fills the join flow preview; hides when the field does not parse yet.
 * @param {HTMLElement | null} container
 * @param {object | null} pact
 */
export function renderJoinPactPreview(container, pact) {
    if (!container) {
        return;
    }
    if (!pact || !String(pact.name ?? "").trim()) {
        container.classList.add("hidden");
        container.replaceChildren();
        return;
    }
    const se = Number(pact.stakeEth);
    const stakeEth = Number.isFinite(se) && se >= 0 ? se : 0;
    const t = (pact.triggers || []).filter(x => PACT_TRIGGER_IDS.includes(x));
    const n = escapeHtml(pact.name);
    const html = buildPactSummaryCardHtml(
        { triggers: t, stakeEth },
        {
            heading: "you are joining this Claw",
            lead: `Invited by <strong class="pact-partner-name">${n}</strong> — review the pact before you connect.`,
            leadHtml: true,
        },
    );
    container.classList.remove("hidden");
    container.innerHTML = html;
}

/** Rounded white frame around QR canvas (invite + modal). */
export function wrapQrCanvas(canvas) {
    const wrap = document.createElement("div");
    wrap.className = "qr-canvas-wrap";
    wrap.appendChild(canvas);
    return wrap;
}

export async function renderQR(container, text) {
    if (!container) {
        return;
    }
    container.replaceChildren();
    const canvas = document.createElement("canvas");
    const opts = { width: 200, margin: 0, errorCorrectionLevel: "M" };
    try {
        await QRCode.toCanvas(canvas, text, opts);
    } catch (e) {
        const placeholder = document.createElement("div");
        placeholder.style.cssText =
            "width:200px;height:200px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#333;font-family:monospace;white-space:pre-wrap;text-align:center;padding:0.5rem;";
        placeholder.textContent = `Could not build QR: ${e?.message ?? e}`;
        container.appendChild(placeholder);
        return;
    }
    container.appendChild(wrapQrCanvas(canvas));
}
