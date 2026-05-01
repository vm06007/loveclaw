import { state, getStorageKey, saveState, setStorageKeyAndReload, resetToDefault } from "../lib/state.js";
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
 * `?role=alice` / `?role=boris`, or production paths `/alice` / `/boris` (see `vercel.json`).
 * Query wins if both are present.
 */
function parseRoleFromLocation() {
    const q = new URLSearchParams(location.search).get("role");
    if (q && String(q).trim()) {
        return String(q).trim().toLowerCase();
    }
    const raw = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (raw === "/alice") {
        return "alice";
    }
    if (raw === "/boris") {
        return "boris";
    }
    return null;
}

/**
 * Match window title "LoveClaw — Alice": capitalize role when name matches role or name is absent.
 */
function displayNameFromInstance(role, name) {
    const r = role && String(role).trim();
    const n = name != null ? String(name).trim() : "";
    if (!r && !n) {
        return "";
    }
    if (n && r && n.toLowerCase() === r.toLowerCase()) {
        return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
    }
    if (n) {
        return n;
    }
    return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
}

function prefillNameInputsIfEmpty(value) {
    if (!value) {
        return;
    }
    const cn = document.getElementById("create-name");
    const jn = document.getElementById("join-name");
    if (cn && !cn.value.trim()) {
        cn.value = value;
    }
    if (jn && !jn.value.trim()) {
        jn.value = value;
    }
}

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
    const urlRole = parseRoleFromLocation();
    /** Same idea as title "LoveClaw — Alice"; fill inputs whenever they are still empty. */
    let instanceDisplayName = "";

    if (urlRole) {
        const roleKey = `loveclaw-state-${urlRole}`;
        if (roleKey !== getStorageKey()) {
            setStorageKeyAndReload(roleKey);
        }
        axl.setPreferPort(urlRole === "boris" ? 9012 : 9002);
        const urlNameParam = urlParams.get("name");
        instanceDisplayName =
            (urlNameParam && urlNameParam.trim()) || displayNameFromInstance(urlRole, null);
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
            instanceDisplayName = displayNameFromInstance(cfg?.role, cfg?.name);
        } catch {
            /* */
        }
    }

    maybeTauriSessionReset();

    if (instanceDisplayName) {
        prefillNameInputsIfEmpty(instanceDisplayName);
    }

    // Only skip the welcome screen when we have a real couple session. A lone
    // `paired: true` in storage (no partner name) used to open the dashboard
    // while the UI still showed "solo mode" — send those users to welcome.
    const hasCoupleSession =
        Boolean(state.paired) && Boolean(String(state.partnerName || "").trim());

    if (state.paired && !hasCoupleSession) {
        state.paired = false;
        state.breakPactIncoming = null;
        state.breakPactOutgoingPending = false;
    }

    // Swap state is session-only — clear on every boot so stale proposals don't linger.
    state.swapPending   = null;
    state.swapIncoming  = null;
    state.swapExecuting = null;
    state.swapResult    = null;
    saveState(state);

    const params = new URLSearchParams(location.search);
    if (params.get("pact")) {
        const jc = document.getElementById("join-code");
        if (jc) {
            jc.value = params.get("pact");
            jc.dispatchEvent(new Event("input", { bubbles: true }));
        }
        showScreen("join");
        return;
    }

    // UX rule: in desktop app always start at welcome (Create/Join),
    // even when a previous couple session exists.
    if (isTauri()) {
        showScreen("home");
        return;
    }

    if (hasCoupleSession) {
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

    showScreen("home");
}
