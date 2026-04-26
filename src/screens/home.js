import { showScreen } from "../lib/router.js";
import { renderDashboard } from "../dashboard/render.js";
import { renderPactRuleToggles } from "./create.js";

export function initHomeScreen() {
    document.getElementById("btn-create").addEventListener("click", () => {
        renderPactRuleToggles();
        showScreen("create");
    });

    document.getElementById("btn-join").addEventListener("click", () => {
        const params = new URLSearchParams(location.search);
        const pactCode = params.get("pact");
        if (pactCode) {
            document.getElementById("join-code").value = pactCode;
        }
        showScreen("join");
    });

    const backDash = document.getElementById("btn-back-dashboard");
    if (backDash) {
        backDash.addEventListener("click", () => {
            showScreen("dashboard");
            renderDashboard();
        });
    }
}
