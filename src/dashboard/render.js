import { state, saveState } from "../lib/state.js";
import { isTauri, invoke } from "../lib/tauri.js";
import { showScreen } from "../lib/router.js";
import { renderPingStatus } from "../app/ping.js";
import { axl } from "../axl/client.js";
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
import {
    AI_PLACEHOLDERS,
    DIARY_IMG_LOCATIONS,
    DIARY_IMG_POOL,
    DOW_LABELS,
    MONTH_NAMES,
} from "./diary-demo-data.js";

function effectiveSignalShares() {
    return applyPactAgentLocks(mergeSignalShares(state.signalShares), state.triggers);
}

let pendingSignalShares = null;
let signalSaveToastEl = null;
let signalSaveToastTimer = null;

function getRenderedSignalShares() {
    return pendingSignalShares || effectiveSignalShares();
}

function markSignalSharesPending(nextShares) {
    pendingSignalShares = applyPactAgentLocks(nextShares, state.triggers);
}

function savePendingSignalShares() {
    if (!pendingSignalShares) {
        return;
    }
    state.signalShares = pendingSignalShares;
    saveState(state);
    pendingSignalShares = null;
}

function isSignalsTabVisible() {
    const tab = document.getElementById("tab-signals");
    return Boolean(tab && !tab.classList.contains("hidden"));
}

function getSignalSaveToastButton() {
    if (signalSaveToastEl) {
        return signalSaveToastEl;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "signal-settings-save-toast hidden";
    btn.textContent = "Save signal settings";
    btn.addEventListener("click", () => {
        savePendingSignalShares();
        btn.textContent = "Saved!";
        btn.disabled = true;
        window.clearTimeout(signalSaveToastTimer);
        signalSaveToastTimer = window.setTimeout(() => {
            btn.disabled = false;
            btn.textContent = "Save signal settings";
            syncSignalSaveToast();
            renderSignalShareSettings();
        }, 900);
    });
    document.body.appendChild(btn);
    signalSaveToastEl = btn;
    return btn;
}

function syncSignalSaveToast() {
    const btn = getSignalSaveToastButton();
    const shouldShow = Boolean(pendingSignalShares) && isSignalsTabVisible();
    btn.classList.toggle("hidden", !shouldShow);
}

export function refreshSignalSaveToastVisibility() {
    syncSignalSaveToast();
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
    const shares = getRenderedSignalShares();

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
            const next = { ...shares, [row.id]: { ...shares[row.id], agent: agentCb.checked } };
            next[row.id].agent = agentCb.checked;
            markSignalSharesPending(next);
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
            const next = { ...shares, [row.id]: { ...shares[row.id], partner: partnerCb.checked } };
            next[row.id].partner = partnerCb.checked;
            markSignalSharesPending(next);
            renderSignalShareSettings();
        });
        partnerLabel.appendChild(partnerCb);
        partnerCell.appendChild(partnerLabel);

        rowEl.append(typeCell, agentCell, partnerCell);
        table.appendChild(rowEl);
    }

    root.appendChild(table);
    syncSignalSaveToast();
}

function buildDiaryDayMap() {
    const map = {};
    for (const e of state.diary) {
        const d = new Date(e.ts);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!map[k]) map[k] = { mine: [], partner: [] };
        if (e.author) map[k].partner.push(e);
        else map[k].mine.push(e);
    }
    return map;
}

function renderDiaryCal(feed, year, month, selectedKey) {
    const dayMap = buildDiaryDayMap();
    const now = new Date();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const collapsed = feed.dataset.calCollapsed === "1";

    let html = `
    <div class="diary-cal${collapsed ? " diary-cal--collapsed" : ""}">
      <div class="diary-cal-header" id="diary-cal-header">
        <button class="diary-cal-nav" id="diary-cal-prev">&#9664;</button>
        <span class="diary-cal-month">${MONTH_NAMES[month]} ${year}</span>
        <button class="diary-cal-nav" id="diary-cal-next">&#9654;</button>
      </div>
      <div class="diary-cal-grid">
        ${DOW_LABELS.map(d => `<div class="diary-cal-dow">${d}</div>`).join("")}
        ${Array(firstDow).fill(`<div class="diary-cal-cell diary-cal-cell--empty"></div>`).join("")}`;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let day = 1; day <= daysInMonth; day++) {
        const k = `${year}-${month}-${day}`;
        const isToday = now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
        const isSelected = selectedKey === k;
        const isPastDay = new Date(year, month, day) < todayStart;
        const entry = dayMap[k];
        const hasMine = entry?.mine.length > 0;
        const hasPartner = entry?.partner.length > 0;
        const hasBoth = hasMine && hasPartner;
        let dots = "";
        if (hasBoth) {
            dots = `<div class="diary-cal-dots"><span class="diary-cal-dot diary-cal-dot--both"></span></div>`;
        } else if (hasMine) {
            dots = `<div class="diary-cal-dots"><span class="diary-cal-dot diary-cal-dot--me"></span></div>`;
        } else if (hasPartner) {
            dots = `<div class="diary-cal-dots"><span class="diary-cal-dot diary-cal-dot--partner"></span></div>`;
        } else if (isPastDay) {
            const h = (year * 10000 + month * 100 + day) | 0;
            const hasImplied = Math.abs(h * 2654435761) % 3 !== 0; // ~2/3 of past days
            dots = `<div class="diary-cal-dots"><span class="diary-cal-dot ${hasImplied ? "diary-cal-dot--implied" : "diary-cal-dot--past"}"></span></div>`;
        }
        // note indicator
        const noteKey = `${year}-${month}-${day}`;
        const noteVal = state.calNotes?.[noteKey];
        const hasNote = Array.isArray(noteVal) ? noteVal.length > 0 : !!noteVal;
        if (hasNote) {
            const preview = Array.isArray(noteVal) ? noteVal[noteVal.length - 1].text : noteVal;
            dots += `<span class="diary-cal-note-dot" title="${preview}">✎</span>`;
        }
        const cls = ["diary-cal-cell",
            isToday ? "diary-cal-cell--today" : "",
            isSelected ? "diary-cal-cell--selected" : "",
            (hasMine || hasPartner) ? "diary-cal-cell--has-entry" : "",
        ].filter(Boolean).join(" ");
        html += `<div class="${cls}" data-diary-day="${k}"><span class="diary-cal-day-num">${day}</span>${dots}</div>`;
    }
    html += `</div></div>`;

    if (selectedKey) {
        const [sy, sm, sd] = selectedKey.split("-").map(Number);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const isPast = new Date(sy, sm, sd) < todayStart;

        const dateLabel = new Date(sy, sm, sd).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
        const stickyDateLabel = new Date(sy, sm, sd).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
        // calNotes[key] is an array of {author, text, ts}; handle old string format
        let noteEntries = state.calNotes?.[selectedKey] || [];
        if (typeof noteEntries === "string") noteEntries = noteEntries ? [{ author: "you", text: noteEntries, ts: 0 }] : [];
        const notesListHtml = noteEntries.length ? noteEntries.map((n, i) => {
            const isMine = !n.author || n.author === "you";
            const delBtn = isMine ? `<button class="diary-note-del" data-note-ts="${n.ts}" title="delete">×</button>` : "";
            return `<div class="diary-note-entry" data-note-idx="${i}">
            <span class="diary-note-author">${n.author || "you"}${n.ts ? ` · ${new Date(n.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}${delBtn}</span>
            <div class="diary-note-bubble">${n.text}</div>
          </div>`;
        }).join("") : "";
        const hasMineNotes = noteEntries.some(n => !n.author || n.author === "you");
        const noteWidget = `<div class="diary-note-wrap">
          ${notesListHtml ? `<div class="diary-notes-list">${notesListHtml}</div>` : ""}
          <textarea class="diary-note-input" id="diary-note-input" placeholder="add a note for this day..." rows="2"></textarea>
          <div class="diary-note-actions">
            ${hasMineNotes ? `<button class="diary-note-delall btn btn-ghost btn-sm" id="diary-note-delall">delete my notes</button>` : ""}
            <button class="diary-note-save btn btn-ghost btn-sm" id="diary-note-save">add note</button>
          </div>
        </div>`;

        if (!isPast) {
            const isFuture = new Date(sy, sm, sd) > todayStart;
            html += `<div class="diary-pending-panel">
              <div class="diary-pending-date">${dateLabel}</div>
              <p class="diary-pending-msg">${isFuture
                ? "no signals yet — this day hasn't happened."
                : "signals still flowing. today's diary will be ready at end of day. add a note below to capture anything you want to remember."
              }</p>
              ${noteWidget}
            </div>`;
        } else {
            const entries = [
                ...(dayMap[selectedKey]?.mine || []),
                ...(dayMap[selectedKey]?.partner || []),
            ].sort((a, b) => a.ts - b.ts);
            const hash = sy * 10000 + sm * 100 + sd;
            const hasImplied = Math.abs((hash | 0) * 2654435761) % 3 !== 0;

            if (entries.length === 0 && !hasImplied) {
                html += `<div class="diary-pending-panel">
                  <div class="diary-pending-date">${dateLabel}</div>
                  <p class="diary-pending-msg">no signals logged this day.</p>
                  ${noteWidget}
                </div>`;
            } else {
                // real entries OR implied signals → show image + sticky
                const imgIdx = sd % DIARY_IMG_POOL.length;
                const imgSrc = `prototype/diary/images/${DIARY_IMG_POOL[imgIdx]}`;
                const locPool = DIARY_IMG_LOCATIONS[imgIdx];
                const location = locPool[Math.abs(hash * 1234567 | 0) % locPool.length];
                const placeholder = AI_PLACEHOLDERS[imgIdx].replace("{loc}", location);
                const stickyBody = entries.length > 0
                    ? entries[0].text.slice(0, 120) + (entries[0].text.length > 120 ? "..." : "")
                    : placeholder;
                const STICKY_POS = ["tl", "tr"];
                const stickyPos = STICKY_POS[sd % STICKY_POS.length];
                html += `<div class="diary-entry-panel">
                  <div class="diary-img-wrap" id="diary-img-wrap">
                    <img class="diary-entry-panel-img" src="${imgSrc}" alt="" />
                    <div class="diary-sticky diary-sticky--${stickyPos}">
                      <span class="diary-sticky-date">${stickyDateLabel}</span>${stickyBody}
                    </div>
                    <button class="diary-cal-toggle diary-cal-toggle--img" id="diary-cal-toggle">${collapsed ? "&#9660;" : "&#9650;"}</button>
                  </div>`;
                if (entries.length > 0) {
                    html += entries.map(e => `
                  <div class="diary-entry">
                    <div class="diary-entry-date">${e.author ? `[${e.author}]` : "you"} · ${new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    <div class="diary-entry-text">${e.text}</div>
                  </div>`).join("");
                }
                html += noteWidget + `</div>`;
            }
        }
    }

    feed.innerHTML = html;

    const toggleCollapse = () => {
        feed.dataset.calCollapsed = feed.dataset.calCollapsed === "1" ? "0" : "1";
        renderDiaryCal(feed, year, month, feed.dataset.selectedDate || null);
    };
    document.getElementById("diary-cal-header")?.addEventListener("click", toggleCollapse);
    document.getElementById("diary-cal-toggle")?.addEventListener("click", toggleCollapse);
    document.getElementById("diary-cal-prev")?.addEventListener("click", (e) => {
        e.stopPropagation();
        let m = month - 1, y = year;
        if (m < 0) { m = 11; y--; }
        feed.dataset.viewYear = y; feed.dataset.viewMonth = m;
        renderDiaryCal(feed, y, m, feed.dataset.selectedDate || null);
    });
    document.getElementById("diary-cal-next")?.addEventListener("click", (e) => {
        e.stopPropagation();
        let m = month + 1, y = year;
        if (m > 11) { m = 0; y++; }
        feed.dataset.viewYear = y; feed.dataset.viewMonth = m;
        renderDiaryCal(feed, y, m, feed.dataset.selectedDate || null);
    });
    feed.querySelectorAll(".diary-cal-cell[data-diary-day]").forEach(cell => {
        cell.addEventListener("click", () => {
            feed.dataset.selectedDate = cell.dataset.diaryDay;
            renderDiaryCal(feed, year, month, cell.dataset.diaryDay);
        });
    });

    const imgWrap = feed.querySelector("#diary-img-wrap");
    if (imgWrap) {
        // dormant sparkle particles
        for (let i = 0; i < 20; i++) {
            const sp = document.createElement("div");
            sp.className = "diary-sparkle";
            const sz = 1.5 + Math.random() * 2.5;
            sp.style.width  = `${sz}px`;
            sp.style.height = `${sz}px`;
            sp.style.left   = `${Math.random() * 96}%`;
            sp.style.top    = `${8 + Math.random() * 84}%`;
            sp.style.setProperty("--dur",   `${2.2 + Math.random() * 2.8}s`);
            sp.style.setProperty("--delay", `${Math.random() * 4}s`);
            imgWrap.appendChild(sp);
        }

        // click — speech bubbles + shake
        const BUBBLES = [
            { text: "so cute~",  big: false },
            { text: "aww !!",    big: false },
            { text: "yay ~!",    big: false },
            { text: "SO CUTE !!", big: true  },
            { text: "LOVELY ♡",  big: true  },
            { text: "hihi !",    big: false },
            { text: "♥ ♥",       big: false },
        ];
        imgWrap.addEventListener("click", () => {
            imgWrap.classList.remove("diary-img-wrap--shake");
            void imgWrap.offsetWidth;
            imgWrap.classList.add("diary-img-wrap--shake");
            imgWrap.addEventListener("animationend", () => imgWrap.classList.remove("diary-img-wrap--shake"), { once: true });

            const overlay = document.createElement("div");
            overlay.className = "diary-burst-overlay";
            imgWrap.appendChild(overlay);

            const pool = [...BUBBLES].sort(() => Math.random() - 0.5).slice(0, 5);
            pool.forEach((b, i) => {
                const el = document.createElement("div");
                el.className = "diary-bubble" + (b.big ? " diary-bubble--big" : "");
                el.textContent = b.text;
                el.style.left  = `${5 + Math.random() * 68}%`;
                el.style.top   = `${5 + Math.random() * 72}%`;
                el.style.setProperty("--r", `${-12 + Math.random() * 24}deg`);
                el.style.animationDelay = `${i * 0.1}s`;
                overlay.appendChild(el);
            });
            setTimeout(() => overlay.remove(), 1800);
        });
    }

    // note add (co-op chat)
    document.getElementById("diary-note-save")?.addEventListener("click", () => {
        const input = document.getElementById("diary-note-input");
        if (!input || !selectedKey) return;
        const val = input.value.trim();
        if (!val) return;
        const ts = Date.now();
        if (!state.calNotes) state.calNotes = {};
        let arr = state.calNotes[selectedKey] || [];
        if (typeof arr === "string") arr = arr ? [{ author: "you", text: arr, ts: 0 }] : [];
        arr.push({ author: "you", text: val, ts });
        state.calNotes[selectedKey] = arr;
        saveState();
        if (state.paired && state.partnerAxlKey) {
            axl.send(state.partnerAxlKey, { type: "diary_note", dayKey: selectedKey, text: val, ts });
        }
        renderDiaryCal(feed, year, month, selectedKey);
    });

    // delete all my notes for this day — with confirmation modal
    document.getElementById("diary-note-delall")?.addEventListener("click", () => {
        if (!selectedKey) return;
        const existing = document.getElementById("diary-confirm-modal");
        if (existing) existing.remove();
        const modal = document.createElement("div");
        modal.id = "diary-confirm-modal";
        modal.className = "diary-confirm-modal";
        modal.innerHTML = `
          <div class="diary-confirm-box">
            <p class="diary-confirm-msg">delete all your notes for this day?</p>
            <div class="diary-confirm-actions">
              <button class="btn btn-ghost btn-sm" id="diary-confirm-cancel">cancel</button>
              <button class="btn btn-ghost btn-sm diary-confirm-ok" id="diary-confirm-ok">delete</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        document.getElementById("diary-confirm-cancel").addEventListener("click", () => modal.remove());
        modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
        document.getElementById("diary-confirm-ok").addEventListener("click", () => {
            modal.remove();
            let arr = state.calNotes?.[selectedKey] || [];
            if (typeof arr === "string") arr = arr ? [{ author: "you", text: arr, ts: 0 }] : [];
            const mine = arr.filter(n => !n.author || n.author === "you");
            const kept = arr.filter(n => n.author && n.author !== "you");
            if (kept.length) state.calNotes[selectedKey] = kept;
            else delete state.calNotes?.[selectedKey];
            saveState();
            if (state.paired && state.partnerAxlKey) {
                // individual deletes (fast path)
                for (const n of mine) {
                    if (n.ts) axl.send(state.partnerAxlKey, { type: "diary_note_delete", dayKey: selectedKey, ts: n.ts });
                }
                // full sync as backup so partner removes stale notes even if individual messages were missed
                axl.send(state.partnerAxlKey, { type: "diary_notes_sync", notes: state.calNotes || {}, authoritative: true });
            }
            renderDiaryCal(feed, year, month, selectedKey);
        });
    });

    // per-note delete (own notes only)
    feed.querySelectorAll(".diary-note-del").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!selectedKey) return;
            const ts = Number(btn.dataset.noteTs);
            let arr = state.calNotes?.[selectedKey] || [];
            if (typeof arr === "string") arr = arr ? [{ author: "you", text: arr, ts: 0 }] : [];
            arr = arr.filter(n => n.ts !== ts);
            if (arr.length) state.calNotes[selectedKey] = arr;
            else delete state.calNotes[selectedKey];
            saveState();
            if (state.paired && state.partnerAxlKey && ts) {
                axl.send(state.partnerAxlKey, { type: "diary_note_delete", dayKey: selectedKey, ts });
                axl.send(state.partnerAxlKey, { type: "diary_notes_sync", notes: state.calNotes || {}, authoritative: true });
            }
            renderDiaryCal(feed, year, month, selectedKey);
        });
    });

    // hidden easter egg: triple-click a partner's note bubble to delete it
    feed.querySelectorAll(".diary-note-entry").forEach((entry, idx) => {
        const bubble = entry.querySelector(".diary-note-bubble");
        if (!bubble) return;
        let clicks = 0, clickTimer = null;
        bubble.addEventListener("click", () => {
            clicks++;
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => { clicks = 0; }, 500);
            if (clicks >= 3) {
                clicks = 0;
                clearTimeout(clickTimer);
                if (!selectedKey) return;
                let arr = state.calNotes?.[selectedKey] || [];
                if (typeof arr === "string") arr = arr ? [{ author: "you", text: arr, ts: 0 }] : [];
                const target = arr[idx];
                if (!target || !target.author || target.author === "you") return; // only partner notes
                arr = arr.filter((_, i) => i !== idx);
                if (arr.length) state.calNotes[selectedKey] = arr;
                else delete state.calNotes[selectedKey];
                saveState();
                if (state.paired && state.partnerAxlKey && target.ts) {
                    axl.send(state.partnerAxlKey, { type: "diary_note_delete", dayKey: selectedKey, ts: target.ts });
                    axl.send(state.partnerAxlKey, { type: "diary_notes_sync", notes: state.calNotes || {}, authoritative: true });
                }
                renderDiaryCal(feed, year, month, selectedKey);
            }
        });
    });
}

let _lastNotesSyncAt = 0;

export function renderDiaryFeed() {
    const feed = document.getElementById("diary-feed");
    if (!feed) return;
    const now = new Date();
    const year = feed.dataset.viewYear !== undefined ? parseInt(feed.dataset.viewYear) : now.getFullYear();
    const month = feed.dataset.viewMonth !== undefined ? parseInt(feed.dataset.viewMonth) : now.getMonth();
    if (feed.dataset.viewYear === undefined) feed.dataset.viewYear = now.getFullYear();
    if (feed.dataset.viewMonth === undefined) feed.dataset.viewMonth = now.getMonth();
    // pre-select today on first open
    if (feed.dataset.selectedDate === undefined) {
        feed.dataset.selectedDate = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    }
    renderDiaryCal(feed, year, month, feed.dataset.selectedDate || null);
    // push all local notes to partner so both sides stay in sync (throttled)
    const t = Date.now();
    if (state.paired && state.partnerAxlKey && t - _lastNotesSyncAt > 30000) {
        _lastNotesSyncAt = t;
        const notes = state.calNotes || {};
        if (Object.keys(notes).length) {
            axl.send(state.partnerAxlKey, { type: "diary_notes_sync", notes });
        }
    }
}

export function renderDiaryCalIfOpen(dayKey) {
    const feed = document.getElementById("diary-feed");
    if (!feed) return;
    const now = new Date();
    const year = feed.dataset.viewYear !== undefined ? parseInt(feed.dataset.viewYear) : now.getFullYear();
    const month = feed.dataset.viewMonth !== undefined ? parseInt(feed.dataset.viewMonth) : now.getMonth();
    const selected = feed.dataset.selectedDate || null;
    if (selected === dayKey) {
        renderDiaryCal(feed, year, month, selected);
    }
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
