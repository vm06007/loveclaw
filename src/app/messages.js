import { state, saveState } from "../lib/state.js";
import { handlePing, handlePong, handleChat } from "./ping.js";
import { triggerBreach } from "./breach.js";
import { renderDiaryFeed } from "../dashboard/render.js";

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
        case "score":
            break;
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
        default:
            break;
    }
}
