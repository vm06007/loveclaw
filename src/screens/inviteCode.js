import { showScreen } from "../lib/router.js";
import { state, saveState } from "../lib/state.js";
import { renderPactRuleToggles } from "./create.js";
import { callDissolvePact } from "../lib/pact-contract.js";

export function initInviteCodeScreen() {
    document.getElementById("back-code").addEventListener("click", () => {
        renderPactRuleToggles();
        showScreen("create");
    });

    document.getElementById("btn-copy-link").addEventListener("click", () => {
        const text = document.getElementById("invite-link").textContent;
        navigator.clipboard
            .writeText(text)
            .then(() => {
                const btn = document.getElementById("btn-copy-link");
                if (btn) {
                    btn.textContent = "copied!";
                }
            })
            .catch(() => {});
    });

    document.getElementById("btn-cancel-invite").addEventListener("click", async () => {
        const pactId = state.pactContractId;
        if (!pactId) return;

        const btn      = document.getElementById("btn-cancel-invite");
        const statusEl = document.getElementById("cancel-invite-status");
        const origLabel = btn.textContent;

        const reset = (msg) => {
            btn.textContent = origLabel;
            btn.disabled = false;
            if (statusEl) statusEl.textContent = msg || "";
        };

        btn.textContent = "confirm in Wallet…";
        btn.disabled = true;
        if (statusEl) statusEl.textContent = "";

        try {
            await callDissolvePact(pactId, (hash) => {
                btn.textContent = "cancelling…";
                if (statusEl) statusEl.textContent = `tx ${hash.slice(0, 10)}… pending`;
            });

            state.pactContractId = null;
            state.pactTxHash     = null;
            saveState(state);

            renderPactRuleToggles();
            showScreen("create");
        } catch (err) {
            const msg = String(err?.message || err);
            const cancelled = /rejected|denied|cancel|ACTION_REJECTED/i.test(msg);
            reset(cancelled ? "" : `⚠ ${msg}`);
        }
    });
}

/** Show or hide the cancel button depending on whether an on-chain pact is active. */
export function syncCancelInviteButton() {
    const wrap = document.getElementById("cancel-invite-wrap");
    if (wrap) wrap.style.display = state.pactContractId ? "block" : "none";
}
