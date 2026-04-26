import { showScreen } from "../lib/router.js";
import { renderPactRuleToggles } from "./create.js";

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
}
