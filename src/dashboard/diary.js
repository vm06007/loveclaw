import { state, saveState } from "../lib/state.js";
import { isTauri, invoke } from "../lib/tauri.js";
import { axl } from "../axl/client.js";
import { getAiSettings } from "../app/ai-settings.js";
import { fetchLoveclawChatCompletions } from "../app/lovclaw-ai.js";
import {
    AI_PLACEHOLDERS,
    DIARY_IMG_LOCATIONS,
    DIARY_IMG_POOL,
    DOW_LABELS,
    MONTH_NAMES,
} from "./diary-demo-data.js";

let _lastNotesSyncAt = 0;

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

    // declared here so event listeners registered after feed.innerHTML can close over it
    let noteEntries = [];

    if (!selectedKey) {
        feed.dataset.diaryHasImage = "0";
    }
    if (selectedKey) {
        const [sy, sm, sd] = selectedKey.split("-").map(Number);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const isPast = new Date(sy, sm, sd) < todayStart;

        const dateLabel = new Date(sy, sm, sd).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
        const stickyDateLabel = new Date(sy, sm, sd).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
        // calNotes[key] is an array of {author, text, ts}; handle old string format
        noteEntries = state.calNotes?.[selectedKey] || [];
        if (typeof noteEntries === "string") noteEntries = noteEntries ? [{ author: "you", text: noteEntries, ts: 0 }] : [];
        const notesListHtml = noteEntries.length ? noteEntries.map((n, i) => {
            const isMine = !n.author || n.author === "you";
            const delBtn = isMine ? `<button class="diary-note-del" data-note-ts="${n.ts}" title="delete this note">✕</button>` : "";
            return `<div class="diary-note-entry" data-note-idx="${i}">
            <span class="diary-note-author">${n.author || "you"}${n.ts ? ` · ${new Date(n.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}${delBtn}</span>
            <div class="diary-note-bubble">${n.text}</div>
          </div>`;
        }).join("") : "";
        const hasMineNotes = noteEntries.some(n => !n.author || n.author === "you");
        const hasPartnerNotes = noteEntries.some(n => n.author && n.author !== "you");
        const bothHaveNotes = hasMineNotes && hasPartnerNotes;
        const partnerName = (state.partnerName && String(state.partnerName).trim()) || "partner";
        const generateBtn = noteEntries.length > 0
            ? bothHaveNotes
                ? `<button class="diary-note-generate btn btn-ghost btn-sm diary-note-action-btn" id="diary-note-generate">generate diary</button>`
                : `<button class="diary-note-generate btn btn-ghost btn-sm diary-note-action-btn" id="diary-note-generate" disabled title="ask ${partnerName} to add their notes">generate diary</button>`
            : "";
        const noteWidget = `<div class="diary-note-wrap">
          ${notesListHtml ? `<div class="diary-notes-list">${notesListHtml}</div>` : ""}
          <textarea class="diary-note-input" id="diary-note-input" placeholder="add a note for this day..." rows="2"></textarea>
          <div class="diary-note-actions">
            ${generateBtn}
            ${hasMineNotes ? `<button class="diary-note-delall btn btn-ghost btn-sm diary-note-action-btn" id="diary-note-delall">delete my notes</button>` : ""}
            <button class="diary-note-save btn btn-ghost btn-sm diary-note-action-btn" id="diary-note-save">add note</button>
          </div>
        </div>`;

        if (!isPast) {
            feed.dataset.diaryHasImage = "0";
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

            const generatedImg = state.calGeneratedImages?.[selectedKey];

            if (!generatedImg && entries.length === 0 && !hasImplied) {
                feed.dataset.diaryHasImage = "0";
                html += `<div class="diary-pending-panel">
                  <div class="diary-pending-date diary-pending-date--past">${dateLabel}</div>
                  <p class="diary-pending-msg">not enough signals logged this day — feel free to add a description for the diary.</p>
                  ${noteWidget}
                    </div>`;
            } else {
                feed.dataset.diaryHasImage = "1";
                const imgIdx = sd % DIARY_IMG_POOL.length;
                const imgSrc = generatedImg?.url || `prototype/diary/images/${DIARY_IMG_POOL[imgIdx]}`;
                const locPool = DIARY_IMG_LOCATIONS[imgIdx];
                const location = locPool[Math.abs(hash * 1234567 | 0) % locPool.length];
                const placeholder = AI_PLACEHOLDERS[imgIdx].replace("{loc}", location);
                const firstNote = (noteEntries[0]?.text || "").trim();
                const stickyBody = generatedImg
                    ? (firstNote ? firstNote.slice(0, 120) + (firstNote.length > 120 ? "..." : "") : (generatedImg.prompt || placeholder).slice(0, 120))
                    : entries.length > 0
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
                  </div>
                  ${generatedImg ? `<div class="diary-img-del-bar" id="diary-img-del-bar"><button class="diary-img-del-btn" id="diary-img-del-btn">delete image</button></div>` : ""}`;
                if (entries.length > 0) {
                    html += entries.map(e => `
                  <div class="diary-entry">
                    <div class="diary-entry-date">${e.author ? `[${e.author}]` : "you"} · ${new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    <div class="diary-entry-text">${e.text}</div>
                  </div>`).join("");
                }
                html += `</div>`;
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

        // click — speech bubbles + shake; triple-click removes generated image
        const BUBBLES = [
            { text: "so cute~",  big: false },
            { text: "aww !!",    big: false },
            { text: "yay ~!",    big: false },
            { text: "SO CUTE !!", big: true  },
            { text: "LOVELY ♡",  big: true  },
            { text: "hihi !",    big: false },
            { text: "♥ ♥",       big: false },
        ];
        const delBar = document.getElementById("diary-img-del-bar");
        let _dimTimer = null;
        function showDelBar() {
            if (!delBar) return;
            delBar.classList.add("diary-img-del-bar--visible");
            clearTimeout(_dimTimer);
            _dimTimer = setTimeout(() => delBar.classList.remove("diary-img-del-bar--visible"), 3000);
        }

        document.getElementById("diary-img-del-btn")?.addEventListener("click", (e) => {
            e.stopPropagation();
            clearTimeout(_dimTimer);
            if (selectedKey && state.calGeneratedImages?.[selectedKey]) {
                delete state.calGeneratedImages[selectedKey];
                saveState(state);
                renderDiaryFeed();
            }
        });

        let _clicks = 0, _clickTimer = null;
        imgWrap.addEventListener("click", (e) => {
            _clicks++;
            clearTimeout(_clickTimer);
            _clickTimer = setTimeout(() => { _clicks = 0; }, 600);

            if (_clicks >= 3) {
                _clicks = 0;
                clearTimeout(_clickTimer);
                if (state.calGeneratedImages?.[selectedKey]) {
                    showDelBar();
                }
                return;
            }

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

    document.getElementById("diary-note-generate")?.addEventListener("click", () => {
        onDiaryGenerateClick(selectedKey, noteEntries, year, month);
    });

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

    refreshDiaryStoreBtn();
}

export function refreshDiaryStoreBtn() {
    const feed = document.getElementById("diary-feed");
    const btn  = document.getElementById("btn-diary-gen");
    if (!btn) return;
    const hasImage = feed?.dataset.diaryHasImage === "1";
    btn.classList.toggle("hidden", !hasImage);
}

export function renderDiaryFeed() {
    const feed = document.getElementById("diary-feed");
    if (!feed) return;
    const now = new Date();
    let year = feed.dataset.viewYear !== undefined ? parseInt(feed.dataset.viewYear) : now.getFullYear();
    let month = feed.dataset.viewMonth !== undefined ? parseInt(feed.dataset.viewMonth) : now.getMonth();
    // If no past days exist in the chosen month (e.g. it's the 1st of the month),
    // show the previous month so previously-generated diary entries remain visible.
    if (feed.dataset.viewYear === undefined && feed.dataset.viewMonth === undefined) {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const hasPastDays = now.getDate() > 1;
        if (!hasPastDays) {
            month = now.getMonth() - 1;
            if (month < 0) { month = 11; year--; }
        }
        feed.dataset.viewYear = year;
        feed.dataset.viewMonth = month;
    }
    // pre-select the most recent past day on first open
    if (feed.dataset.selectedDate === undefined) {
        const selDay = (year === now.getFullYear() && month === now.getMonth())
            ? now.getDate()
            : new Date(year, month + 1, 0).getDate(); // last day of selected month
        feed.dataset.selectedDate = `${year}-${month}-${selDay}`;
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

export async function onDiaryGenerateClick(selectedKey, noteEntries, year, month) {
    const feed = document.getElementById("diary-feed");

    const btn = document.getElementById("diary-note-generate");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="diary-gen-spinner"></span>generating...`;
    }
    // Disable the entire note form during generation
    const actionsEl = feed?.querySelector(".diary-note-actions");
    const inputEl   = feed?.querySelector("#diary-note-input");
    const allBtns   = actionsEl ? [...actionsEl.querySelectorAll("button")] : [];
    allBtns.forEach(b => { b.disabled = true; });
    if (inputEl) inputEl.disabled = true;

    try {
        const settings = getAiSettings();

        const myName = state.myName || "me";
        const partnerName = state.partnerName || "partner";
        const notes = (noteEntries || []).map(n => `${n.author || myName}: ${n.text}`).join("\n");

        const openrouterKey = settings.openrouterKey
            || String(import.meta.env?.VITE_OPENROUTER_API_KEY || "").trim();
        if (!openrouterKey) throw new Error("OpenRouter API key is required — add it in AI Settings");

        // Resolve images to data-URLs
        async function resolveImage(urlOrDataUrl) {
            if (urlOrDataUrl?.startsWith("data:image/")) return urlOrDataUrl;
            try {
                const r = await fetch(urlOrDataUrl);
                if (!r.ok) return null;
                const blob = await r.blob();
                return await new Promise((res, rej) => {
                    const reader = new FileReader();
                    reader.onload = () => res(reader.result);
                    reader.onerror = rej;
                    reader.readAsDataURL(blob);
                });
            } catch { return null; }
        }

        const [myAvatar, partnerAvatar, styleRef] = await Promise.all([
            resolveImage(state.myProfile?.avatarDataUrl || `/src/img/${myName.toLowerCase()}.jpg`),
            resolveImage(state.partnerProfile?.avatarDataUrl || `/src/img/${partnerName.toLowerCase()}.jpg`),
            resolveImage("/prototype/diary/images/beachparty.jpg"),
        ]);

        // Step 1 — craft a pixel-art image prompt; pass avatar photos so the LLM
        //          can see the characters' actual appearance (hair, features, etc.)
        const step1Content = [];
        if (myAvatar) step1Content.push({ type: "image_url", image_url: { url: myAvatar } });
        if (partnerAvatar) step1Content.push({ type: "image_url", image_url: { url: partnerAvatar } });
        const avatarNote = (myAvatar || partnerAvatar)
            ? `${myAvatar ? `First image is ${myName}. ` : ""}${partnerAvatar ? `${myAvatar ? "Second" : "First"} image is ${partnerName}. ` : ""}Use their actual appearance (hair colour, features) in the prompt. `
            : "";
        step1Content.push({
            type: "text",
            text: `You write image generation prompts. A couple named ${myName} and ${partnerName} wrote these diary notes about their day:\n\n${notes}\n\n${avatarNote}Write ONE concise image prompt (max 55 words) for a pixel-art diary illustration. Requirements: 8-bit / 16-bit pixel art style, warm retro palette, chibi couple characters doing the day's main activity together, cozy atmosphere, no text or UI in image. Return ONLY the prompt, no explanation.`,
        });

        const imagePrompt = await fetchLoveclawChatCompletions(
            settings,
            [{ role: "user", content: step1Content }],
            0.7,
        ) || `8-bit pixel art of a cute chibi couple enjoying a cozy day together, warm retro colors, no text`;

        // Step 2 — generate image via OpenRouter (google/gemini-3.1-flash-image-preview)
        console.log("[diary] image prompt:", imagePrompt);

        // Build multimodal content: style reference first, then avatars, then scene prompt
        const msgContent = [];
        if (styleRef) msgContent.push({ type: "image_url", image_url: { url: styleRef } });
        if (myAvatar) msgContent.push({ type: "image_url", image_url: { url: myAvatar } });
        if (partnerAvatar) msgContent.push({ type: "image_url", image_url: { url: partnerAvatar } });
        const styleNote = styleRef ? `The first image shows the exact pixel-art style to match (8-bit, warm retro palette, chibi characters). ` : "";
        const refNote = (myAvatar || partnerAvatar)
            ? `${styleNote}${myAvatar ? `Next image is ${myName}. ` : ""}${partnerAvatar ? `${myAvatar ? "Following image" : "Next image"} is ${partnerName}. ` : ""}Depict these people faithfully in the scene. `
            : styleNote;
        msgContent.push({ type: "text", text: `${refNote}${imagePrompt}` });

        const imgRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openrouterKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": String(import.meta.env?.VITE_OPENROUTER_APP_URL || "http://localhost:1420"),
                "X-Title": "LoveClaw Diary",
            },
            body: JSON.stringify({
                model: "google/gemini-3.1-flash-image-preview",
                messages: [{ role: "user", content: msgContent }],
                modalities: ["image", "text"],
            }),
        });

        const imgJson = await imgRes.json();
        if (!imgRes.ok) {
            throw new Error(`Image generation error ${imgRes.status}: ${imgJson?.error?.message || JSON.stringify(imgJson).slice(0, 200)}`);
        }

        // Per OpenRouter docs: image is in choices[0].message.images[0].image_url.url
        const msg = imgJson.choices?.[0]?.message;
        const imgSrc = msg?.images?.[0]?.image_url?.url ?? null;
        if (!imgSrc) {
            console.error("[diary] full response:", JSON.stringify(imgJson));
            throw new Error("No image in response — check console for details");
        }

        if (!state.calGeneratedImages) state.calGeneratedImages = {};
        state.calGeneratedImages[selectedKey] = { url: imgSrc, ts: Date.now(), prompt: imagePrompt };
        saveState(state);

    } catch (e) {
        console.error("[diary] image gen failed:", e);
        const { addBubble, bumpPingBadge } = await import("../app/chat-log.js");
        addBubble("left", `LoveClaw: diary image generation failed — ${e.message || "check console"}`, true);
        bumpPingBadge();
    } finally {
        renderDiaryFeed();
    }
}
