import { axl } from "./client.js";
import { state } from "../lib/state.js";

let _pollIntervalId = null;

/**
 * Continuous 400ms poll; mirrors a2a.py's poll_loop().
 * completePairing is injected to avoid a circular import with pairing/heartbeat.
 */
export function startAxlPoll(completePairing, handleAxlMessage) {
    if (!axl.available) {
        return;
    }
    if (_pollIntervalId != null) {
        clearInterval(_pollIntervalId);
        _pollIntervalId = null;
    }
    axl._polling = true;

    let recvBusy = false;

    const tick = async () => {
        if (recvBusy) {
            return;
        }
        recvBusy = true;
        try {
            const maxDrain = 32;
            for (let n = 0; n < maxDrain; n++) {
                const msg = await axl.recv();
                if (!msg) {
                    return;
                }
                if (msg.type === "axl_handshake" && !state.paired) {
                    const theirCid = String(msg.coupleId ?? "").trim().toLowerCase();
                    const mine = String(state.coupleId || "").trim().toLowerCase();
                    if (mine && theirCid && theirCid !== mine) {
                        console.warn("[AXL] axl_handshake coupleId mismatch (pairing anyway)", {
                            mine: mine.slice(0, 18),
                            theirs: theirCid.slice(0, 18),
                        });
                    }
                    state.partnerAxlKey = msg._fromKey || msg.key;
                    completePairing(msg.name, { partnerInstanceTag: msg.instanceTag });
                    return;
                }
                if (state.paired) {
                    handleAxlMessage(msg);
                    return;
                }
                console.warn("[AXL] dropping stale pre-handshake message:", msg.type);
            }
            console.warn("[AXL] pre-handshake drain cap hit; remaining queue may delay pairing");
        } finally {
            recvBusy = false;
        }
    };

    _pollIntervalId = setInterval(tick, 400);
    tick();
    console.log("[AXL] poll loop started at 400ms");
}
