export const chatLog = [];
let chatUnread = 0;

export function addBubble(side, text, ack = false) {
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

export function clearChatWindow() {
    chatLog.length = 0;
    const chat = document.getElementById("chat-log");
    if (!chat) {
        return;
    }
    chat.innerHTML = `
        <div class="ping-empty" id="chat-empty">
            <div class="ping-empty-icon" aria-hidden="true">~</div>
            <div class="ping-empty-text">send a message or tap ping to test the link</div>
        </div>
    `;
}

export function setChatClearModal(open) {
    const m = document.getElementById("modal-chat-clear");
    if (m) {
        m.classList.toggle("hidden", !open);
    }
}

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
