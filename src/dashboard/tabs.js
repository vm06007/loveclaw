import { runHeartbeatCheck } from "../app/heartbeat.js";
import { clearPingBadge } from "../app/ping.js";
import { onDiaryGenerateClick } from "./render.js";
import { syncPactBadge, syncPactBreakOverlay } from "../app/breakPact.js";

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
            syncPactBadge();
            syncPactBreakOverlay();
        });
    });

    const gen = document.getElementById("btn-diary-gen");
    if (gen) {
        gen.addEventListener("click", () => {
            onDiaryGenerateClick();
        });
    }

    const runCheck = document.getElementById("btn-run-check");
    if (runCheck) {
        runCheck.addEventListener("click", async () => {
            const prev = runCheck.textContent;
            runCheck.disabled = true;
            runCheck.textContent = "Checking…";
            try {
                await runHeartbeatCheck();
            } finally {
                runCheck.textContent = prev;
                runCheck.disabled = false;
            }
        });
    }
}
