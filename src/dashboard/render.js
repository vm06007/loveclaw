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
import {
    SIGNAL_SHARE_ROWS,
    mergeSignalShares,
    applyPactAgentLocks,
    pactAgentLockReason,
} from "../lib/signal-share-settings.js";

function effectiveSignalShares() {
    return applyPactAgentLocks(mergeSignalShares(state.signalShares), state.triggers);
}

function setTodayAvatarButton(el, initials, avatarDataUrl) {
    if (!el) {
        return;
    }
    el.textContent = "";
    el.style.backgroundSize = "";
    el.style.backgroundPosition = "";
    el.style.backgroundImage = "";
    const url = typeof avatarDataUrl === "string" && avatarDataUrl.startsWith("data:image/")
        ? avatarDataUrl
        : "";
    if (url) {
        el.style.backgroundImage = `url(${JSON.stringify(url)})`;
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        el.style.color = "transparent";
    } else {
        el.textContent = initials;
        el.style.color = "";
    }
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

export function renderSignalShareSettings() {
    const root = document.getElementById("signal-settings-root");
    if (!root) {
        return;
    }
    root.replaceChildren();
    const triggers = new Set(state.triggers || []);
    const shares = effectiveSignalShares();

    const table = document.createElement("div");
    table.className = "signal-settings-table";

    const head = document.createElement("div");
    head.className = "signal-settings-row signal-settings-row--head";
    const hType = document.createElement("div");
    hType.className = "signal-settings-cell signal-settings-cell--type";
    hType.textContent = "Signal";
    const hAgent = document.createElement("div");
    hAgent.className = "signal-settings-cell signal-settings-cell--check signal-settings-cell--head-check";
    hAgent.textContent = "Agent";
    const hPartner = document.createElement("div");
    hPartner.className = "signal-settings-cell signal-settings-cell--check signal-settings-cell--head-check";
    hPartner.textContent = (state.partnerName || "").trim() || "Partner";
    head.append(hType, hAgent, hPartner);
    table.appendChild(head);

    for (const row of SIGNAL_SHARE_ROWS) {
        const agentLocked = Boolean(row.pactAgentLockTrigger && triggers.has(row.pactAgentLockTrigger));
        const rowEl = document.createElement("div");
        rowEl.className = "signal-settings-row";

        const typeCell = document.createElement("div");
        typeCell.className = "signal-settings-cell signal-settings-cell--type";
        const title = document.createElement("div");
        title.className = "signal-settings-type-title";
        title.textContent = row.label;
        const blurb = document.createElement("div");
        blurb.className = "signal-settings-type-blurb";
        blurb.textContent = row.blurb;
        typeCell.append(title, blurb);
        if (agentLocked && row.pactAgentLockTrigger) {
            const lock = document.createElement("div");
            lock.className = "signal-settings-lock-note";
            lock.textContent = pactAgentLockReason(row.pactAgentLockTrigger);
            typeCell.appendChild(lock);
        }

        const agentCell = document.createElement("div");
        agentCell.className = "signal-settings-cell signal-settings-cell--check";
        const agentLabel = document.createElement("label");
        agentLabel.className = "signal-settings-check-label";
        const agentCb = document.createElement("input");
        agentCb.type = "checkbox";
        agentCb.className = "pact-toggle-input";
        agentCb.checked = shares[row.id].agent;
        agentCb.disabled = agentLocked;
        if (agentLocked && row.pactAgentLockTrigger) {
            agentCb.title = pactAgentLockReason(row.pactAgentLockTrigger);
        }
        agentCb.addEventListener("change", () => {
            const next = mergeSignalShares(state.signalShares);
            next[row.id].agent = agentCb.checked;
            state.signalShares = applyPactAgentLocks(next, state.triggers);
            saveState(state);
            renderSignalShareSettings();
        });
        agentLabel.appendChild(agentCb);
        agentCell.appendChild(agentLabel);

        const partnerCell = document.createElement("div");
        partnerCell.className = "signal-settings-cell signal-settings-cell--check";
        const partnerLabel = document.createElement("label");
        partnerLabel.className = "signal-settings-check-label";
        const partnerCb = document.createElement("input");
        partnerCb.type = "checkbox";
        partnerCb.className = "pact-toggle-input";
        partnerCb.checked = shares[row.id].partner;
        partnerCb.addEventListener("change", () => {
            const next = mergeSignalShares(state.signalShares);
            next[row.id].partner = partnerCb.checked;
            state.signalShares = applyPactAgentLocks(next, state.triggers);
            saveState(state);
            renderSignalShareSettings();
        });
        partnerLabel.appendChild(partnerCb);
        partnerCell.appendChild(partnerLabel);

        rowEl.append(typeCell, agentCell, partnerCell);
        table.appendChild(rowEl);
    }

    root.appendChild(table);
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
    <div class="pact-item">mandatory ETH stake: ${stakeText}</div>
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
    const myPh = state.myProfile?.avatarDataUrl;
    const ptPh = state.partnerProfile?.avatarDataUrl;
    setTodayAvatarButton(meAv, nMe, myPh);
    if (state.paired) {
        setTodayAvatarButton(ptAv, nPt, ptPh);
    } else {
        setTodayAvatarButton(ptAv, "?", "");
    }
    if (ptAv) {
        ptAv.disabled = !state.paired;
    }
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
        sub.textContent = "today / last check just now";
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

export function clearTodayHeartbeatLog() {
    const log = document.getElementById("today-hb-log");
    if (log) {
        log.replaceChildren();
    }
    const sub = document.getElementById("today-hb-sub");
    if (sub) {
        sub.textContent = "today / log cleared";
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
    renderSignalShareSettings();
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
