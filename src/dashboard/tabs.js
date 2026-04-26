import { clearPingBadge } from "../app/ping.js";
import { onDiaryGenerateClick } from "./render.js";

/**
 * Top-level dashboard tab strip (not to be confused with the screen router).
 */
export function initDashboardTabs() {
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
            tab.classList.add("active");
            const pane = document.getElementById(`tab-${tab.dataset.tab}`);
            if (pane) {
                pane.classList.remove("hidden");
            }
            if (tab.dataset.tab === "chat") {
                clearPingBadge();
            }
        });
    });

    const gen = document.getElementById("btn-diary-gen");
    if (gen) {
        gen.addEventListener("click", () => {
            onDiaryGenerateClick();
        });
    }
}
