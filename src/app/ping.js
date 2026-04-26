import { state } from "../lib/state.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "./ipc-send.js";

const chatLog = [];

let chatUnread = 0;

export function bumpPingBadge() {
    const chatTab = document.querySelector('.tab[data-tab="chat"]');
    if (chatTab?.classList.contains("active")) {
        return;
    }
    chatUnread++;
    const badge = document.getElementById("chat-badge");
    if (badge) {
        badge.textContent = String(chatUnread);
        badge.classList.remove("hidden");
    }
}

export function clearPingBadge() {
    chatUnread = 0;
    const badge = document.getElementById("chat-badge");
    if (badge) {
        badge.textContent = "";
        badge.classList.add("hidden");
    }
}

function addBubble(side, text, ack = false) {
    chatLog.push({ side, text, ack, ts: Date.now() });
    flushChatLog();
}

function flushChatLog() {
    const chat = document.getElementById("chat-log");
    if (!chat) {
        return;
    }
    const empty = document.getElementById("chat-empty");
    if (empty) {
        empty.remove();
    }
    const rendered = chat.querySelectorAll(".chat-row").length;
    const toAdd = chatLog.slice(rendered);
    toAdd.forEach(({ side, text, ack, ts }) => {
        const row = document.createElement("div");
        row.className = `chat-row ${side}`;
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble${ack ? " ack" : ""}`;
        bubble.textContent = text;
        const timeEl = document.createElement("div");
        timeEl.className = "chat-time";
        timeEl.textContent = new Date(ts).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        row.appendChild(bubble);
        row.appendChild(timeEl);
        chat.appendChild(row);
    });
    chat.scrollTop = chat.scrollHeight;
}

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

function transportSend(payload) {
    if (axl.available) {
        axl.send(state.partnerAxlKey, payload);
    } else {
        ipcSend(payload);
    }
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
    transportSend(msg);
    addBubble("right", text);
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

export function handleChat(msg) {
    const who = (msg.from || "partner").trim() || "partner";
    const body = typeof msg.text === "string" ? msg.text : "";
    addBubble("left", `${who}: ${body}`);
    bumpPingBadge();
}

export function initPingActions() {
    const pingBtn = document.getElementById("btn-ping");
    if (pingBtn) {
        pingBtn.addEventListener("click", () => {
            if (!state.paired) {
                return;
            }
            sendPing();
        });
    }

    const sendBtn = document.getElementById("btn-chat-send");
    if (sendBtn) {
        sendBtn.addEventListener("click", () => {
            sendChat();
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
