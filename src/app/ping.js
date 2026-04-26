import { state } from "../lib/state.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "./ipc-send.js";

const pingLog = [];

let pingUnread = 0;

export function bumpPingBadge() {
    const pingTab = document.querySelector('.tab[data-tab="ping"]');
    if (pingTab?.classList.contains("active")) {
        return;
    }
    pingUnread++;
    const badge = document.getElementById("ping-badge");
    if (badge) {
        badge.textContent = String(pingUnread);
        badge.classList.remove("hidden");
    }
}

export function clearPingBadge() {
    pingUnread = 0;
    const badge = document.getElementById("ping-badge");
    if (badge) {
        badge.textContent = "";
        badge.classList.add("hidden");
    }
}

function addBubble(side, text, ack = false) {
    pingLog.push({ side, text, ack, ts: Date.now() });
    flushPingChat();
}

function flushPingChat() {
    const chat = document.getElementById("ping-chat");
    if (!chat) {
        return;
    }
    const empty = document.getElementById("ping-empty");
    if (empty) {
        empty.remove();
    }
    const rendered = chat.querySelectorAll(".chat-row").length;
    const toAdd = pingLog.slice(rendered);
    toAdd.forEach(({ side, text, ack, ts }) => {
        const row = document.createElement("div");
        row.className = `chat-row ${side}`;
        row.innerHTML = `
      <div class="chat-bubble${ack ? " ack" : ""}">${text}</div>
      <div class="chat-time">${new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>`;
        chat.appendChild(row);
    });
    chat.scrollTop = chat.scrollHeight;
}

/**
 * Shown in dashboard ping tab header (AXL port vs. local IPC).
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
    if (axl.available) {
        axl.send(state.partnerAxlKey, msg);
    } else {
        ipcSend(msg);
    }
    addBubble("right", `ping: sent to ${state.partnerName || "partner"}`);
}

export function handlePing(msg) {
    addBubble("left", `ping: ${msg.from} is checking in`);
    bumpPingBadge();
    const pong = { type: "pong", from: state.myName, pingTs: msg.ts, ts: Date.now() };
    if (axl.available) {
        axl.send(state.partnerAxlKey, pong);
    } else {
        ipcSend(pong);
    }
    addBubble("right", "pong: sent to partner", true);
}

export function handlePong(msg) {
    const latency = msg.pingTs ? Date.now() - msg.pingTs : null;
    const latStr = latency !== null ? ` (${latency}ms)` : "";
    addBubble("left", `pong: ${msg.from} got your ping${latStr}`, true);
    bumpPingBadge();
}

export function initPingActions() {
    const btn = document.getElementById("btn-ping");
    if (btn) {
        btn.addEventListener("click", () => {
            if (!state.paired) {
                return;
            }
            sendPing();
        });
    }
}
