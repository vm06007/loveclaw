import { state, getStorageKey, setStorageKeyAndReload, resetToDefault } from "../lib/state.js";
import { isTauri, invoke } from "../lib/tauri.js";
import { showScreen } from "../lib/router.js";
import { renderDashboard } from "../dashboard/render.js";
import { startHeartbeat } from "./heartbeat.js";
import { axl } from "../axl/client.js";
import { startAxlPoll } from "../axl/poll.js";
import { completePairing } from "./pairing.js";
import { handleAxlMessage } from "./messages.js";
import { renderPingStatus } from "./ping.js";

/**
 * Tauri: each fresh app launch (not page reload) starts with a clean pairing state
 * (sessionStorage is cleared on process exit; it survives in-tab reloads).
 */
function maybeTauriSessionReset() {
    if (!isTauri()) {
        return;
    }
    const sessionFlag = `lc-session-${getStorageKey()}`;
    if (!sessionStorage.getItem(sessionFlag)) {
        sessionStorage.setItem(sessionFlag, "1");
        localStorage.removeItem(getStorageKey());
        resetToDefault();
    }
}

export async function boot() {
    const urlParams = new URLSearchParams(location.search);
    const urlRole = urlParams.get("role");

    if (urlRole) {
        const roleKey = `loveclaw-state-${urlRole}`;
        if (roleKey !== getStorageKey()) {
            setStorageKeyAndReload(roleKey);
        }
        axl.setPreferPort(urlRole === "boris" ? 9012 : 9002);
        const urlName = urlParams.get("name");
        if (urlName && !state.myName) {
            const cn = document.getElementById("create-name");
            const jn = document.getElementById("join-name");
            if (cn) {
                cn.value = urlName;
            }
            if (jn) {
                jn.value = urlName;
            }
        }
    } else if (isTauri()) {
        try {
            const cfg = await invoke("get_instance_config");
            if (cfg?.role) {
                const roleKey = `loveclaw-state-${cfg.role}`;
                if (roleKey !== getStorageKey()) {
                    setStorageKeyAndReload(roleKey);
                }
                if (cfg.axlPort) {
                    axl.setPreferPort(cfg.axlPort);
                }
            }
            if (cfg?.name && !state.myName) {
                const cn = document.getElementById("create-name");
                const jn = document.getElementById("join-name");
                if (cn) {
                    cn.value = cfg.name;
                }
                if (jn) {
                    jn.value = cfg.name;
                }
            }
        } catch {
            /* */
        }
    }

    maybeTauriSessionReset();

    if (state.paired) {
        renderDashboard();
        showScreen("dashboard");
        startHeartbeat();

        axl.init(state.partnerAxlKey).then(ok => {
            if (ok) {
                startAxlPoll(completePairing, handleAxlMessage);
                renderPingStatus();
            }
        });
        return;
    }

    const params = new URLSearchParams(location.search);
    if (params.get("pact")) {
        document.getElementById("join-code").value = params.get("pact");
        showScreen("join");
        return;
    }

    showScreen("home");
}
