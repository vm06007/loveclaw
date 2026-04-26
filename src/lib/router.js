import { state } from "./state.js";

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
    }
}
