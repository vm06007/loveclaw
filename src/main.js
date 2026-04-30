import { initTauri } from "./lib/tauri.js";
import { registerAxlPairing } from "./app/heartbeat.js";
import { completePairing } from "./app/pairing.js";
import "./app/ipc-inbox.js";
import { boot } from "./app/boot.js";
import { initBreachUi } from "./app/breach.js";
import { initBreakPactUi } from "./app/breakPact.js";
import { initPingActions } from "./app/ping.js";
import { initTheme } from "./app/theme.js";
import { initHomeScreen } from "./screens/home.js";
import { initCreateScreen } from "./screens/create.js";
import { initInviteCodeScreen } from "./screens/inviteCode.js";
import { initJoinScreen } from "./screens/join.js";
import { initDashboardTabs } from "./dashboard/tabs.js";
import { initDashboardShell } from "./app/dashboard-pwa.js";
import { initRelayNotify } from "./app/relay-notify.js";
import { initCoopProfileUi } from "./app/coop-profile.js";

await initTauri();
registerAxlPairing(completePairing);

initBreachUi();
initBreakPactUi();
initPingActions();
initTheme();
initHomeScreen();
initCreateScreen();
initInviteCodeScreen();
initJoinScreen();
initDashboardTabs();
initDashboardShell();
initCoopProfileUi();

await boot();
initRelayNotify();
