import { state, saveState } from "../lib/state.js";
import { handlePing, handlePong, handleChat, handleAgenticChatLine } from "./ping.js";
import { triggerBreach } from "./breach.js";
import {
    renderDiaryFeed,
    renderTodayTab,
    renderDiaryCalIfOpen,
    onPactChangesGrantReceived,
    onPactChangesDenyReceived,
} from "../dashboard/render.js";
import { applyCoopProfileFromMessage, refreshCoopProfileModalIfOpen } from "./coop-profile.js";
import {
    refreshHeartbeatMapIfOpen,
    onShareLocationRequestMessage,
    onShareLocationAcceptMessage,
    onShareLocationStopMessage,
    onShareLocationCancelMessage,
} from "./heartbeat-map.js";
import {
    onBreakPactDenyReceived,
    onBreakPactGrantReceived,
    onBreakPactProposeReceived,
    onPactChangesProposeReceived,
} from "./breakPact.js";

export function handleAxlMessage(msg) {
    switch (msg.type) {
        case "ping":
            handlePing(msg);
            break;
        case "pong":
            handlePong(msg);
            break;
        case "chat":
            handleChat(msg);
            break;
        case "agentic_chat_line":
            handleAgenticChatLine(msg);
            break;
        case "score": {
            const v = msg.score ?? msg.value ?? msg.trust;
            if (v != null && v !== "" && !Number.isNaN(Number(v))) {
                state.partnerTrustScore = Number(v);
                saveState(state);
                renderTodayTab();
            }
            break;
        }
        case "breach":
            triggerBreach(msg.app || "unknown app (partner report)");
            break;
        case "diary":
            if (msg.text) {
                state.diary.unshift({ ts: Date.now(), text: `[partner] ${msg.text}`, author: msg.author });
                saveState(state);
                renderDiaryFeed();
            }
            break;
        case "diary_note": {
            const { dayKey, text, ts } = msg;
            if (dayKey && text) {
                if (!state.calNotes) state.calNotes = {};
                let arr = state.calNotes[dayKey] || [];
                if (typeof arr === "string") arr = arr ? [{ author: "you", text: arr, ts: 0 }] : [];
                const author = state.partnerName || "partner";
                arr.push({ author, text, ts: ts || Date.now() });
                state.calNotes[dayKey] = arr;
                saveState(state);
                renderDiaryCalIfOpen(dayKey);
            }
            break;
        }
        case "diary_note_delete": {
            const { dayKey, ts } = msg;
            if (dayKey && ts && state.calNotes?.[dayKey]) {
                let arr = state.calNotes[dayKey];
                if (typeof arr === "string") arr = arr ? [{ author: "you", text: arr, ts: 0 }] : [];
                arr = arr.filter(n => n.ts !== ts);
                if (arr.length) state.calNotes[dayKey] = arr;
                else delete state.calNotes[dayKey];
                saveState(state);
                renderDiaryCalIfOpen(dayKey);
            }
            break;
        }
        case "diary_notes_sync": {
            const { notes, authoritative } = msg;
            if (!notes || typeof notes !== "object") break;
            if (!state.calNotes) state.calNotes = {};
            const author = state.partnerName || "partner";
            let changed = false;

            // collect all ts values the partner claims to own (across all days)
            const partnerTs = authoritative ? new Set(
                Object.values(notes).flatMap(entries =>
                    Array.isArray(entries) ? entries.map(n => n.ts).filter(Boolean) : []
                )
            ) : null;

            // if authoritative, remove partner's notes that are no longer in their list
            if (authoritative) {
                for (const [dayKey, arr] of Object.entries(state.calNotes)) {
                    if (!Array.isArray(arr)) continue;
                    const filtered = arr.filter(n => n.author === "you" || partnerTs.has(n.ts));
                    if (filtered.length !== arr.length) {
                        if (filtered.length) state.calNotes[dayKey] = filtered;
                        else delete state.calNotes[dayKey];
                        changed = true;
                    }
                }
            }

            // add partner notes that are missing locally
            for (const [dayKey, entries] of Object.entries(notes)) {
                if (!Array.isArray(entries)) continue;
                let arr = state.calNotes[dayKey] || [];
                if (typeof arr === "string") arr = arr ? [{ author: "you", text: arr, ts: 0 }] : [];
                const existing = new Set(arr.map(n => n.ts));
                for (const n of entries) {
                    if (n.ts && !existing.has(n.ts)) {
                        arr.push({ author, text: n.text, ts: n.ts });
                        existing.add(n.ts);
                        changed = true;
                    }
                }
                if (arr.length) state.calNotes[dayKey] = arr.sort((a, b) => a.ts - b.ts);
            }

            if (changed) {
                saveState(state);
                renderDiaryFeed();
            }
            break;
        }
        case "break_pact_propose":
            onBreakPactProposeReceived(msg);
            break;
        case "break_pact_deny":
            onBreakPactDenyReceived(msg);
            break;
        case "break_pact_grant":
            onBreakPactGrantReceived();
            break;
        case "pact_changes_propose":
            onPactChangesProposeReceived(msg);
            break;
        case "pact_changes_grant":
            onPactChangesGrantReceived(msg);
            break;
        case "pact_changes_deny":
            onPactChangesDenyReceived(msg);
            break;
        case "coop_profile": {
            if (!state.paired || !msg.profile || typeof msg.profile !== "object") {
                break;
            }
            const pk = String(state.partnerAxlKey || "").trim().toLowerCase();
            const fk = String(msg._fromKey || "").trim().toLowerCase();
            const ap = String(msg.profile?.agentPublicKey || "").trim().toLowerCase();
            console.log("[coop_profile] via:", fk ? "axl" : "ipc", "| fk:", fk.slice(0,10)||"—", "| ap:", ap.slice(0,10)||"—", "| pk:", pk.slice(0,10)||"—");
            // Only enforce key checks when the message arrived over AXL (fk is set).
            // IPC-delivered messages (fk empty) are same-origin trusted; coupleId check below is sufficient.
            if (pk && fk) {
                if (fk !== pk && ap !== pk) {
                    console.warn("[loveclaw] coop_profile: sender key mismatch; ignoring", {
                        fromHeader: fk.slice(0, 12),
                        fromProfile: ap.slice(0, 12),
                        expected: pk.slice(0, 12),
                    });
                    break;
                }
            }
            const incomingCid = msg.coupleId != null ? String(msg.coupleId).trim() : "";
            const mine = String(state.coupleId || "").trim();
            if (incomingCid && mine && incomingCid.toLowerCase() !== mine.toLowerCase()) {
                console.warn("[loveclaw] coop_profile: coupleId mismatch; ignoring");
                break;
            }
            applyCoopProfileFromMessage(msg);
            renderTodayTab();
            refreshCoopProfileModalIfOpen();
            refreshHeartbeatMapIfOpen();
            break;
        }
        case "share_location_request":
            onShareLocationRequestMessage(msg);
            break;
        case "share_location_accept":
            onShareLocationAcceptMessage(msg);
            break;
        case "share_location_stop":
            onShareLocationStopMessage();
            break;
        case "share_location_cancel":
            onShareLocationCancelMessage();
            break;
        case "swap_propose":
            if (msg.from === state.myName) break; // ignore own echo
            if (msg.intent && msg.summary) {
                state.swapPending   = null;
                state.swapExecuting = null;
                state.swapResult    = null;
                state.swapIncoming  = { intent: msg.intent, summary: msg.summary, from: msg.from, ts: msg.ts };
                saveState(state);
                void import("../dashboard/render.js").then(m => m.renderSwapProposal?.());
                void import("./ping.js").then(m => m.bumpPingBadge?.());
            }
            break;
        case "swap_confirm":
            if (msg.from === state.myName) break; // ignore own echo
            if (state.swapPending) {
                state.swapPending.partnerConfirmed = true;
                saveState(state);
                void import("../dashboard/render.js").then(m => m.renderSwapProposal?.());
            }
            break;
        case "swap_executing":
            state.swapIncoming  = null;
            state.swapPending   = null;
            state.swapExecuting = { summary: msg.summary };
            saveState(state);
            void import("../dashboard/render.js").then(m => m.renderSwapProposal?.());
            break;
        case "swap_deny":
            state.swapPending  = null;
            state.swapIncoming = null;
            saveState(state);
            void import("../dashboard/render.js").then(m => m.renderSwapProposal?.());
            break;
        case "swap_result":
            state.swapExecuting = null;
            state.swapResult    = { txHash: msg.txHash, summary: msg.summary };
            saveState(state);
            void import("../dashboard/render.js").then(m => m.renderSwapProposal?.());
            break;
        default:
            break;
    }
}
