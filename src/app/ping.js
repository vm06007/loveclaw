export { getVaultAddress, refreshVaultDisplay } from "./vault.js";
export { bumpPingBadge, clearPingBadge } from "./chat-log.js";

import { state } from "../lib/state.js";
import { axl } from "../axl/client.js";
import { chatLog, addBubble, bumpPingBadge, clearChatWindow, setChatClearModal } from "./chat-log.js";
import { transportSend } from "./transport.js";
import { maybeHandleLoveclawPrompt, testLoveclawAiConnection } from "./lovclaw-ai.js";
import {
    getAiSettings,
    isShareConversationsOn,
    persistAiSettings,
    loadAiSettingsIntoModal,
    readAiSettingsFromModal,
    setAiSettingsModal,
    syncAiProviderFields,
} from "./ai-settings.js";

/**
 * Shown in dashboard chat tab header (AXL port vs. local IPC).
 */
export function renderPingStatus() {
    const me = document.getElementById("ping-status-me");
    const partner = document.getElementById("ping-status-partner");
    if (!me || !partner) {
        return;
    }
    const isBc = !axl.available;
    const myPort = axl.available ? `axl :${axl.port}` : "local IPC";
    const partnerPort = axl.available ? `axl :${axl.port === 9002 ? 9012 : 9002}` : "local IPC";

    me.innerHTML = `
    <span class="ping-status-name">${state.myName || "me"}</span>
    <span class="ping-status-port${isBc ? " bc" : ""}">${myPort}</span>`;

    partner.innerHTML = `
    <span class="ping-status-name">${state.partnerName || "partner"}</span>
    <span class="ping-status-port${isBc ? " bc" : ""}">${partnerPort}</span>`;
}

export function sendPing() {
    if (!state.paired) {
        return;
    }
    const btn = document.getElementById("btn-ping");
    if (btn) {
        btn.classList.add("pinging");
        setTimeout(() => btn.classList.remove("pinging"), 800);
    }
    const msg = { type: "ping", from: state.myName, ts: Date.now() };
    transportSend(msg);
    addBubble("right", `ping: sent to ${state.partnerName || "partner"}`);
}

export function sendChat() {
    if (!state.paired) {
        return;
    }
    const input = document.getElementById("chat-input");
    if (!input) {
        return;
    }
    const text = input.value.trim();
    if (!text) {
        return;
    }
    input.value = "";
    const msg = { type: "chat", from: state.myName, text, ts: Date.now() };
    const isLoveclawMsg = /^@love(c(l(a(w)?)?)?)?(\s|$)|^@claw(\s|$)|^@lovc(l(a(w)?)?)?(\s|$)/i.test(text.trim());
    if (!isLoveclawMsg || isShareConversationsOn()) {
        transportSend(msg);
    }
    addBubble("right", text);
    void maybeHandleLoveclawPrompt(text);
}

export function handlePing(msg) {
    addBubble("left", `ping: ${msg.from} is checking in`);
    bumpPingBadge();
    const pong = { type: "pong", from: state.myName, pingTs: msg.ts, ts: Date.now() };
    transportSend(pong);
    addBubble("right", "pong: sent to partner", true);
}

export function handlePong(msg) {
    const latency = msg.pingTs ? Date.now() - msg.pingTs : null;
    const latStr = latency !== null ? ` (${latency}ms)` : "";
    addBubble("left", `pong: ${msg.from} got your ping${latStr}`, true);
    bumpPingBadge();
}

/**
 * Partner declined your break-pact request (in-chat, same as pong ack).
 * @param {string} fromName
 */
export function addBreakPactDenyReceivedLine(fromName) {
    const who = (fromName && String(fromName).trim()) || "partner";
    addBubble("left", `deny: ${who} declined your break pact request`, true);
    bumpPingBadge();
}

/**
 * You denied their request — echo on your side, like "pong: sent to partner".
 */
export function addBreakPactDenySentLine() {
    addBubble("right", "deny: sent to partner", true);
}

/**
 * Partner declined your pact-change request (mirrors break-pact deny ack).
 * @param {string} fromName
 */
export function addPactChangesDenyReceivedLine(fromName) {
    const who = (fromName && String(fromName).trim()) || "partner";
    addBubble("left", `deny: ${who} declined your pact changes`, true);
    bumpPingBadge();
}

/**
 * You denied their pact-change request.
 */
export function addPactChangesDenySentLine() {
    addBubble("right", "deny: pact changes sent to partner", true);
}

export function handleChat(msg) {
    const who = (msg.from || "partner").trim() || "partner";
    const body = typeof msg.text === "string" ? msg.text : "";
    addBubble("left", `${who}: ${body}`);
    bumpPingBadge();
}

export function handleAgenticChatLine(msg) {
    const body = typeof msg?.text === "string" ? msg.text.trim() : "";
    if (!body) {
        return;
    }
    addBubble("left", `LoveClaw: ${body}`, true);
    bumpPingBadge();
}

export function initPingActions() {
    // Quick-actions lightning button
    const quickBtn  = document.getElementById("btn-quick");
    const quickMenu = document.getElementById("quick-menu");
    if (quickBtn && quickMenu) {
        const openMenu  = () => { quickMenu.classList.add("quick-menu--open"); quickBtn.setAttribute("aria-expanded", "true"); };
        const closeMenu = () => { quickMenu.classList.remove("quick-menu--open"); quickBtn.setAttribute("aria-expanded", "false"); };
        const toggleMenu = () => quickMenu.classList.contains("quick-menu--open") ? closeMenu() : openMenu();

        quickBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
        document.addEventListener("click", (e) => {
            if (!quickBtn.contains(e.target) && !quickMenu.contains(e.target)) closeMenu();
        });

        document.getElementById("quick-ping")?.addEventListener("click", () => {
            closeMenu();
            if (!state.paired) return;
            sendPing();
        });

        document.getElementById("quick-swap")?.addEventListener("click", () => {
            closeMenu();
            const input = document.getElementById("chat-input");
            if (input) {
                input.value = "@loveclaw lets swap 0.0005 ETH to USDC";
                input.focus();
            }
        });
    }

    // Legacy ping button (kept for compat if it exists)
    const pingBtn = document.getElementById("btn-ping");
    if (pingBtn) {
        pingBtn.addEventListener("click", () => {
            if (!state.paired) return;
            sendPing();
        });
    }

    const sendBtn = document.getElementById("btn-chat-send");
    if (sendBtn) {
        sendBtn.addEventListener("click", () => {
            sendChat();
        });
    }

    const clearBtn = document.getElementById("btn-chat-clear");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            if (!chatLog.length) {
                return;
            }
            setChatClearModal(true);
        });
    }

    const aiBtn = document.getElementById("btn-chat-ai-settings");
    if (aiBtn) {
        aiBtn.addEventListener("click", () => {
            loadAiSettingsIntoModal();
            setAiSettingsModal(true);
        });
    }
    const aiProvider = document.getElementById("ai-provider");
    if (aiProvider) {
        aiProvider.addEventListener("change", () => {
            syncAiProviderFields(String(aiProvider.value || ""));
        });
    }
    const aiSave = document.getElementById("modal-ai-settings-save");
    if (aiSave) {
        aiSave.addEventListener("click", async () => {
            if (aiSave instanceof HTMLButtonElement) {
                aiSave.disabled = true;
            }
            try {
                const draft = readAiSettingsFromModal();
                const test = await testLoveclawAiConnection(draft);
                if (!test.ok) {
                    addBubble(
                        "left",
                        `LoveClaw: AI settings were not saved. ${test.reason || "Connection test failed."}`,
                        true,
                    );
                    bumpPingBadge();
                    return;
                }
                persistAiSettings(draft);
                setAiSettingsModal(false);
                if (test.skipped) {
                    addBubble("left", "LoveClaw: AI settings saved (AI stays off until you enable it on this device).", true);
                } else {
                    addBubble("left", "LoveClaw: AI settings saved and the model connection test succeeded.", true);
                }
                bumpPingBadge();
            } finally {
                if (aiSave instanceof HTMLButtonElement) {
                    aiSave.disabled = false;
                }
            }
        });
    }
    const aiClose = document.getElementById("modal-ai-settings-close");
    if (aiClose) {
        aiClose.addEventListener("click", () => {
            setAiSettingsModal(false);
        });
    }

    const clearYes = document.getElementById("modal-chat-clear-yes");
    if (clearYes) {
        clearYes.addEventListener("click", () => {
            setChatClearModal(false);
            clearChatWindow();
        });
    }

    const clearNo = document.getElementById("modal-chat-clear-no");
    if (clearNo) {
        clearNo.addEventListener("click", () => {
            setChatClearModal(false);
        });
    }

    const input = document.getElementById("chat-input");
    if (input) {
        input.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChat();
            }
        });
    }
}
