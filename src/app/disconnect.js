import { showScreen } from "../lib/router.js";

/** Dashboard ✕ — same as former “← welcome”: leave dashboard for home. */
export function initDisconnect() {
    document.getElementById("btn-disconnect").addEventListener("click", () => {
        showScreen("home");
    });
}
