import { showScreen } from "../lib/router.js";
import { renderTriggers } from "./create.js";

export function initHomeScreen() {
    document.getElementById("btn-create").addEventListener("click", () => {
        renderTriggers();
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
}
