import { state, saveState } from "../lib/state.js";
import { showScreen } from "../lib/router.js";
import { buildInviteUrl, renderQR, generateKey, ALL_TRIGGERS } from "../lib/invite.js";
import { axl } from "../axl/client.js";
import { startAxlPoll } from "../axl/poll.js";
import { completePairing } from "../app/pairing.js";
import { handleAxlMessage } from "../app/messages.js";

export function renderTriggers() {
    const grid = document.getElementById("triggers-list");
    if (!grid) {
        return;
    }
    grid.innerHTML = "";
    ALL_TRIGGERS.forEach(t => {
        const chip = document.createElement("button");
        chip.className = "trigger-chip" + (state.triggers.includes(t.id) ? " selected" : "");
        chip.textContent = t.label;
        chip.addEventListener("click", () => {
            if (state.triggers.includes(t.id)) {
                state.triggers = state.triggers.filter(x => x !== t.id);
            } else {
                state.triggers = [...state.triggers, t.id];
            }
            chip.classList.toggle("selected");
        });
        grid.appendChild(chip);
    });
}

export function initCreateScreen() {
    document.getElementById("back-create").addEventListener("click", () => showScreen("home"));

    document.getElementById("btn-generate").addEventListener("click", async () => {
        const name = document.getElementById("create-name").value.trim();
        if (!name) {
            alert("enter your name first");
            return;
        }

        state.myName = name;
        state.coupleId = generateKey().slice(0, 16);
        state.createdAt = Date.now();

        const btn = document.getElementById("btn-generate");
        const origLabel = btn.textContent;
        btn.textContent = "connecting to AXL…";
        btn.disabled = true;

        const axlUp = await axl.init();
        if (!axlUp && !state.myAxlKey) {
            state.myAxlKey = generateKey();
        }

        btn.textContent = origLabel;
        btn.disabled = false;
        saveState(state);

        const url = buildInviteUrl();
        document.getElementById("invite-link").textContent = url;
        await renderQR(document.getElementById("qr-wrap"), url);
        showScreen("code");

        startAxlPoll(completePairing, handleAxlMessage);
    });
}
