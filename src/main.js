import { initTauri } from "./lib/tauri.js";
import { registerAxlPairing } from "./app/heartbeat.js";
import { completePairing } from "./app/pairing.js";
import "./app/ipc-inbox.js";
import { boot } from "./app/boot.js";
import { initBreachUi } from "./app/breach.js";
import { initPingActions } from "./app/ping.js";
import { initDisconnect } from "./app/disconnect.js";
import { initHomeScreen } from "./screens/home.js";
import { initCreateScreen } from "./screens/create.js";
import { initInviteCodeScreen } from "./screens/inviteCode.js";
import { initJoinScreen } from "./screens/join.js";
import { initDashboardTabs } from "./dashboard/tabs.js";

await initTauri();
registerAxlPairing(completePairing);

initBreachUi();
initPingActions();
initDisconnect();
initHomeScreen();
initCreateScreen();
initInviteCodeScreen();
initJoinScreen();
initDashboardTabs();

boot();
