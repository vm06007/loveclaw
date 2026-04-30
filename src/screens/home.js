import { showScreen } from "../lib/router.js";
import { renderDashboard } from "../dashboard/render.js";
import { renderPactRuleToggles } from "./create.js";
import { state, saveState } from "../lib/state.js";

export function initHomeScreen() {
    const fullscreenPill = document.getElementById("home-fullscreen-pill");
    if (fullscreenPill) {
        const updateFullscreenPillUi = () => {
            const isFullscreen = !!document.fullscreenElement;
            fullscreenPill.classList.toggle("is-on", isFullscreen);
            const label = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
            fullscreenPill.title = label;
            fullscreenPill.setAttribute("aria-label", label);
            fullscreenPill.innerHTML = `<span class="LoveClaw-dot-sm" aria-hidden="true"></span>${isFullscreen ? "ACTIVE" : "FULL"}`;
        };
        fullscreenPill.addEventListener("click", async () => {
            try {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                } else {
                    await document.documentElement.requestFullscreen();
                }
            } catch {
                /* ignore fullscreen permission failures */
            } finally {
                updateFullscreenPillUi();
            }
        });
        document.addEventListener("fullscreenchange", updateFullscreenPillUi);
        updateFullscreenPillUi();
    }

    const infoPill = document.getElementById("home-info-pill");
    const infoHint = document.getElementById("home-info-hint");
    if (infoPill && infoHint) {
        infoPill.addEventListener("click", () => {
            infoHint.classList.toggle("hidden");
            infoPill.classList.toggle("is-on", !infoHint.classList.contains("hidden"));
        });
    }

    document.getElementById("btn-create").addEventListener("click", () => {
        // Always wipe pairing state so we can never get stuck in limbo
        const savedName = state.myName;
        state.paired = false;
        state.partnerName = "";
        state.partnerAxlKey = "";
        state.myAxlKey = "";
        state.coupleId = "";
        state.code = "";
        state.createdAt = null;
        state.breakPactIncoming = null;
        state.breakPactOutgoingPending = false;
        state.pactChangesIncoming = null;
        state.pactChangesOutgoingPending = false;
        state.pactChangesOutgoingProposal = null;
        saveState(state);

        renderPactRuleToggles();

        const nameInput = document.getElementById("create-name");
        if (nameInput && !nameInput.value.trim() && savedName) {
            nameInput.value = savedName;
        }

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
