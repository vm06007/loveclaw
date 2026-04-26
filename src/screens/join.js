import { state, saveState } from "../lib/state.js";
import { showScreen } from "../lib/router.js";
import { parsePactFromInviteField, renderJoinPactPreview, generateKey } from "../lib/invite.js";
import { coalescePactTriggers, migrateTriggers } from "../lib/pact-triggers.js";
import { axl } from "../axl/client.js";
import { startAxlPoll } from "../axl/poll.js";
import { completePairing } from "../app/pairing.js";
import { handleAxlMessage } from "../app/messages.js";
import { ipcSend } from "../app/ipc-send.js";

function runJoinPactPreview() {
    const raw = document.getElementById("join-code")?.value ?? "";
    const el = document.getElementById("join-pact-preview");
    if (!el) {
        return;
    }
    const p = parsePactFromInviteField(raw);
    renderJoinPactPreview(el, p);
}

export function initJoinScreen() {
    document.getElementById("back-join").addEventListener("click", () => showScreen("home"));

    const joinCode = document.getElementById("join-code");
    if (joinCode) {
        joinCode.addEventListener("input", runJoinPactPreview);
        joinCode.addEventListener("paste", () => {
            queueMicrotask(runJoinPactPreview);
        });
    }

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

        const pact = parsePactFromInviteField(raw);
        if (!pact) {
            alert("invalid invite code");
            return;
        }

        state.myName = name;
        state.partnerName = pact.name;
        state.partnerAxlKey = pact.key;
        state.coupleId = pact.coupleId;
        const c = coalescePactTriggers(pact.triggers);
        state.triggers = c != null ? c : migrateTriggers([]);
        const se = Number(pact.stakeEth);
        state.stakeEth = Number.isFinite(se) && se >= 0 ? se : 0;
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
