export { refreshSignalSaveToastVisibility, renderSignalShareSettings } from "./signal-settings.js";
export { renderDiaryFeed, renderDiaryCalIfOpen, onDiaryGenerateClick, refreshDiaryStoreBtn } from "./diary.js";
export { applyPactProposal, onPactChangesGrantReceived, onPactChangesDenyReceived, renderPact } from "./pact.js";
export { renderTodayTab, appendTodayHeartbeatEntry, clearTodayHeartbeatLog } from "./today-tab.js";
export { onDiaryStoreClick } from "./zg-store.js";
export { renderSwapProposal } from "./swap-proposal.js";

import { state } from "../lib/state.js";
import { showScreen } from "../lib/router.js";
import { renderPingStatus } from "../app/ping.js";
import { renderTodayTab } from "./today-tab.js";
import { renderSignalShareSettings } from "./signal-settings.js";
import { renderDiaryFeed } from "./diary.js";
import { renderPact } from "./pact.js";

export function renderDashboard() {
    if (!state.paired) {
        if (document.getElementById("screen-dashboard")?.classList.contains("active")) {
            showScreen("home");
        }
        return;
    }
    renderTodayTab();
    renderSignalShareSettings();
    renderDiaryFeed();
    renderPact();
    renderPingStatus();
}
