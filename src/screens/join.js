import { state, saveState } from "../lib/state.js";
import { showScreen } from "../lib/router.js";
import { parsePact, generateKey } from "../lib/invite.js";
import { axl } from "../axl/client.js";
import { startAxlPoll } from "../axl/poll.js";
import { completePairing } from "../app/pairing.js";
import { handleAxlMessage } from "../app/messages.js";
import { ipcSend } from "../app/ipc-send.js";

export function initJoinScreen() {
    document.getElementById("back-join").addEventListener("click", () => showScreen("home"));

    document.getElementById("btn-join-submit").addEventListener("click", async () => {
        const name = document.getElementById("join-name").value.trim();
        const raw = document.getElementById("join-code").value.trim();
        if (!name) {
            alert("enter your name");
            return;
        }
        if (!raw) {
            alert("paste the invite code");
            return;
        }

        let code = raw;
        try {
            const u = new URL(raw);
            code = u.searchParams.get("pact") ?? raw;
        } catch {
            /* not a URL, use as-is */
        }

        const pact = parsePact(code);
        if (!pact) {
            alert("invalid invite code");
            return;
        }

        state.myName = name;
        state.partnerName = pact.name;
        state.partnerAxlKey = pact.key;
        state.coupleId = pact.coupleId;
        state.triggers = pact.triggers ?? state.triggers;
        state.createdAt = Date.now();
        state.paired = true;
        state.myAxlKey = "";

        const joinBtn = document.getElementById("btn-join-submit");
        const origJoinLabel = joinBtn.textContent;
        joinBtn.textContent = "connecting to AXL…";
        joinBtn.disabled = true;

        const axlUp = await axl.init(state.partnerAxlKey);
        if (!axlUp) {
            state.myAxlKey = generateKey();
        }

        joinBtn.textContent = origJoinLabel;
        joinBtn.disabled = false;
        saveState(state);

        const handshake = { type: "axl_handshake", name: state.myName, key: state.myAxlKey };
        if (axl.available) {
            await axl.send(state.partnerAxlKey, handshake);
            startAxlPoll(completePairing, handleAxlMessage);
        } else {
            ipcSend(handshake);
        }

        completePairing();
    });
}
