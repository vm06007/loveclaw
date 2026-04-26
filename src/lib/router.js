import { state } from "./state.js";

/**
 * When the "already in a couple" banner is visible, Create / Join must not run.
 */
function syncHomeWelcomeButtons() {
    const banner = document.getElementById("home-paired-banner");
    const createBtn = document.getElementById("btn-create");
    const joinBtn = document.getElementById("btn-join");
    const disable = Boolean(banner && !banner.classList.contains("hidden"));
    if (createBtn) {
        createBtn.disabled = disable;
    }
    if (joinBtn) {
        joinBtn.disabled = disable;
    }
}

export function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(`screen-${id}`);
    if (target) {
        target.classList.add("active");
    }
    if (id === "home") {
        const banner = document.getElementById("home-paired-banner");
        if (banner) {
            banner.classList.toggle("hidden", !state.paired);
        }
        syncHomeWelcomeButtons();
    }
}
