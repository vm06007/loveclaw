import { state } from "../lib/state.js";
import { p2pChannel } from "./ipc-send.js";
import { completePairing } from "./pairing.js";
import { handleAxlMessage } from "./messages.js";

// Dedup: both channels can deliver the same message.
const _seen = new Set();

function routeIncoming(msg) {
    if (!msg?._id || !msg?.type) {
        return;
    }
    if (_seen.has(msg._id)) {
        return;
    }
    _seen.add(msg._id);
    if (_seen.size > 200) {
        _seen.clear();
    }
    // Inviter tab: partner mesh key is unknown until joiner sends handshake (joiner already has inviter key from pact).
    if (
        msg.type === "axl_handshake"
        && msg.key
        && msg.key !== state.myAxlKey
        && !state.paired
        && !state.partnerAxlKey
        && String(state.myAxlKey || "").trim()
    ) {
        state.partnerAxlKey = msg.key;
        completePairing(msg.name);
        return;
    }
    if (state.paired) {
        handleAxlMessage(msg);
    }
}

p2pChannel.addEventListener("message", ({ data }) => {
    routeIncoming(data);
});

window.addEventListener("storage", e => {
    if (e.key !== "loveclaw-ipc" || !e.newValue) {
        return;
    }
    try {
        routeIncoming(JSON.parse(e.newValue));
    } catch {
        /* */
    }
});
