import { axl } from "./client.js";
import { state } from "../lib/state.js";

/**
 * Continuous 400ms poll; mirrors a2a.py's poll_loop().
 * completePairing is injected to avoid a circular import with pairing/heartbeat.
 */
export function startAxlPoll(completePairing, handleAxlMessage) {
    if (!axl.available || axl._polling) {
        return;
    }
    axl._polling = true;

    let recvBusy = false;

    const tick = async () => {
        if (recvBusy) {
            return;
        }
        recvBusy = true;
        try {
            const msg = await axl.recv();
            if (!msg) {
                return;
            }
            if (msg.type === "axl_handshake" && !state.paired) {
                state.partnerAxlKey = msg._fromKey || msg.key;
                completePairing(msg.name);
                return;
            }
            if (state.paired) {
                handleAxlMessage(msg);
            }
        } finally {
            recvBusy = false;
        }
    };

    setInterval(tick, 400);
    tick();
    console.log("[AXL] poll loop started at 400ms");
}
