import { state, saveState } from "../lib/state.js";
import { handlePing, handlePong, handleChat } from "./ping.js";
import { triggerBreach } from "./breach.js";
import { renderDiaryFeed, renderTodayTab } from "../dashboard/render.js";
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
        case "break_pact_propose":
            onBreakPactProposeReceived(msg);
            break;
        case "break_pact_deny":
            onBreakPactDenyReceived(msg);
            break;
        case "break_pact_grant":
            onBreakPactGrantReceived();
            break;
        case "coop_profile": {
            if (!state.paired || !msg.profile || typeof msg.profile !== "object") {
                break;
            }
            if (state.partnerAxlKey && msg._fromKey && msg._fromKey !== state.partnerAxlKey) {
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
        default:
            break;
    }
}
