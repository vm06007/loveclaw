import { state, saveState } from "../lib/state.js";
import { isTauri, invoke } from "../lib/tauri.js";
import { showScreen } from "../lib/router.js";
import { renderPingStatus } from "../app/ping.js";
import {
    syncPactBadge,
    syncPactBreakOverlay,
    syncProposeBreakPactButton,
} from "../app/breakPact.js";
import { pactRuleLabel, formatStakeSummary } from "../lib/invite.js";

const SIGNAL_CARDS = [
    { key: "location", mark: "loc", label: "location" },
    { key: "motion", mark: "mov", label: "motion" },
    { key: "battery", mark: "bat", label: "battery" },
    { key: "apps", mark: "app", label: "apps" },
];

function signalTypeMark(type) {
    const t = String(type);
    return {
        location: "loc",
        motion: "mov",
        battery: "bat",
        apps: "app",
        notification: "ntf",
    }[t] ?? t.slice(0, 3);
}

function trustNameLabel(raw, fallback) {
    const s = String(raw != null && raw !== "" ? raw : fallback)
        .trim()
        .slice(0, 10) || fallback;
    if (!s) {
        return fallback;
    }
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) {
        return "now";
    }
    if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}m`;
    }
    return `${Math.floor(diff / 3600000)}h`;
}

export function renderSignalGrid() {
    const grid = document.getElementById("signal-grid");
    if (!grid) {
        return;
    }
    grid.innerHTML = "";
    SIGNAL_CARDS.forEach(({ key, mark, label }) => {
        const latest = state.signals.filter(s => s.type === key).at(-1);
        const card = document.createElement("div");
        card.className = "signal-card";
        card.innerHTML = `
      <div class="signal-card-icon">${mark}</div>
      <div class="signal-card-label">${label}</div>
      <div class="signal-card-value">${latest?.value ?? "—"}</div>
    `;
        grid.appendChild(card);
    });
}

export function renderSignalList() {
    const list = document.getElementById("signal-list");
    if (!list) {
        return;
    }
    const recent = [...state.signals].reverse().slice(0, 40);
    list.innerHTML = recent.length === 0
        ? `<p class="hint">no signals yet</p>`
        : recent
            .map(
                s => `
      <div class="signal-row">
        <div class="signal-row-icon">${signalTypeMark(s.type)}</div>
        <div class="signal-row-body">
          <div class="signal-row-name">${s.type}</div>
          <div class="signal-row-val">${s.value}</div>
        </div>
        <div class="signal-row-time">${relTime(s.ts)}</div>
      </div>`,
            )
            .join("");
}

export function renderDiaryFeed() {
    const feed = document.getElementById("diary-feed");
    if (!feed) {
        return;
    }
    feed.innerHTML = state.diary.length === 0
        ? `<p class="hint">no diary entries yet</p>`
        : state.diary
            .map(
                e => `
      <div class="diary-entry">
        <div class="diary-entry-date">${new Date(e.ts).toLocaleDateString()}</div>
        <div class="diary-entry-text">${e.text}</div>
      </div>`,
            )
            .join("");
}

export function renderPact() {
    const view = document.getElementById("pact-view");
    if (!view) {
        return;
    }
    const s = formatStakeSummary(state.stakeEth);
    const stakeText = s === "—" ? "not proposed (optional)" : s;
    const pactTriggers = state.triggers.length
        ? state.triggers.map(t => `<div class="pact-item">${pactRuleLabel(t)}</div>`).join("")
        : `<p class="hint">no breach triggers set</p>`;
    view.innerHTML = `
    <div class="pact-item">couple id: ${state.coupleId || "—"}</div>
    <div class="pact-item">paired since: ${state.createdAt ? new Date(state.createdAt).toLocaleDateString() : "—"}</div>
    <div class="pact-item">propose ETH stake: ${stakeText}</div>
    <div class="pact-item">breach triggers:</div>
    ${pactTriggers}
  `;
    syncProposeBreakPactButton();
    syncPactBadge();
    syncPactBreakOverlay();
}

export function renderTodayTab() {
    const meAv = document.getElementById("today-avatar-me");
    const ptAv = document.getElementById("today-avatar-partner");
    const la = document.getElementById("today-label-me");
    const lb = document.getElementById("today-label-partner");
    const rawMe = (state.myName || "?").trim();
    const rawPt = (state.partnerName || "?").trim();
    const nMe = rawMe.slice(0, 2).toUpperCase() || "?";
    const nPt = rawPt.slice(0, 2).toUpperCase() || "?";
    if (meAv) meAv.textContent = nMe;
    if (ptAv) ptAv.textContent = state.paired ? nPt : "?";
    if (la) la.textContent = state.myName || "You";
    if (lb) lb.textContent = state.paired ? (state.partnerName || "Partner") : "Partner";
    const trustMe = document.getElementById("today-trust-me");
    const trustPt = document.getElementById("today-trust-partner");
    const labMe = document.getElementById("today-trust-label-me");
    const labPt = document.getElementById("today-trust-label-partner");
    if (trustMe) trustMe.textContent = String(state.trustScore ?? 100);
    if (trustPt) {
        if (state.paired) {
            const p = state.partnerTrustScore;
            const n = p != null && p !== "" && !Number.isNaN(Number(p)) ? Number(p) : 100;
            trustPt.textContent = String(n);
            trustPt.classList.remove("today-trust-score--muted");
        } else {
            trustPt.textContent = "—";
            trustPt.classList.add("today-trust-score--muted");
        }
    }
    if (labMe) {
        labMe.textContent = trustNameLabel(state.myName, "you");
    }
    if (labPt) {
        if (state.paired) {
            labPt.textContent = trustNameLabel(state.partnerName, "Partner");
        } else {
            labPt.textContent = "Partner";
        }
    }
    const dayPill = document.getElementById("today-day-pill");
    let days = 1;
    if (state.paired && state.createdAt) {
        const t = typeof state.createdAt === "number" ? state.createdAt : Date.parse(state.createdAt);
        if (!Number.isNaN(t)) {
            days = Math.max(1, Math.floor((Date.now() - t) / 86400000) + 1);
        }
    }
    if (dayPill) dayPill.textContent = `day ${days}`;
    const streakDays = document.getElementById("today-streak-days");
    if (streakDays) {
        streakDays.textContent = days === 1 ? "1 day" : `${days} days`;
    }
    document.querySelectorAll("#today-streak-cells .today-streak-cell").forEach((el, i) => {
        el.classList.toggle("filled", i < Math.min(7, days));
    });
}

export function appendTodayHeartbeatEntry(line) {
    const sub = document.getElementById("today-hb-sub");
    if (sub) {
        sub.textContent = "today · last check just now";
    }
    const log = document.getElementById("today-hb-log");
    if (!log || !line) {
        return;
    }
    const row = document.createElement("div");
    row.className = "today-hb-entry";
    row.textContent = line;
    log.prepend(row);
    while (log.children.length > 24) {
        log.removeChild(log.lastChild);
    }
}

export function renderDashboard() {
    if (!state.paired) {
        if (document.getElementById("screen-dashboard")?.classList.contains("active")) {
            showScreen("home");
        }
        return;
    }
    renderTodayTab();
    renderSignalGrid();
    renderSignalList();
    renderDiaryFeed();
    renderPact();
    renderPingStatus();
}

export async function onDiaryGenerateClick() {
    const recentSignals = state.signals.slice(-20).map(s => `${s.type}: ${s.value}`).join(", ");
    let text = `[${new Date().toLocaleTimeString()}] signals today - ${recentSignals || "no signals recorded yet"}`;

    if (isTauri()) {
        try {
            text = await invoke("generate_diary_entry", { signals: recentSignals });
        } catch (e) {
            console.warn("[diary]", e);
        }
    }

    state.diary.unshift({ ts: Date.now(), text });
    if (state.diary.length > 50) {
        state.diary = state.diary.slice(0, 50);
    }
    saveState(state);
    renderDiaryFeed();
}
