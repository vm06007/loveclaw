import { state, saveState } from "../lib/state.js";
import { isTauri, invoke } from "../lib/tauri.js";
import { renderPingStatus } from "../app/ping.js";

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
    const pactTriggers = state.triggers.length
        ? state.triggers.map(t => `<div class="pact-item">${t}</div>`).join("")
        : `<p class="hint">no breach triggers set</p>`;
    view.innerHTML = `
    <div class="pact-item">couple id: ${state.coupleId || "—"}</div>
    <div class="pact-item">paired since: ${state.createdAt ? new Date(state.createdAt).toLocaleDateString() : "—"}</div>
    <div class="pact-item">breach triggers:</div>
    ${pactTriggers}
  `;
}

export function renderDashboard() {
    const label = document.getElementById("dash-couple-label");
    if (label) {
        label.textContent = `${state.myName} + ${state.partnerName || "?"}`;
    }
    const trust = document.getElementById("trust-score");
    if (trust) {
        trust.textContent = state.trustScore ?? 100;
    }
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
