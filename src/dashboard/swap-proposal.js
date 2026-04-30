import { state, saveState } from "../lib/state.js";

// ── Swap proposal chat bubble ────────────────────────────
export function renderSwapProposal() {
    const pending   = state.swapPending;
    const incoming  = state.swapIncoming;
    const executing = state.swapExecuting;
    const result    = state.swapResult;
    const active    = pending || incoming || executing || result;

    const chat = document.getElementById("chat-log");
    if (!chat) return;

    let row = document.getElementById("swap-chat-bubble-row");

    if (!active) {
        row?.remove();
        return;
    }

    if (!row) {
        document.getElementById("chat-empty")?.remove();
        row = document.createElement("div");
        row.className = "chat-row left";
        row.id = "swap-chat-bubble-row";
        chat.appendChild(row);
    }

    let summaryText, statusText, showConfirmReject = false, showExecute = false, extraClass = "";

    if (result) {
        summaryText = result.summary || "";
        statusText  = result.txHash
            ? `executed ✓ → <a class="swap-bubble-tx swap-bubble-tx--link" href="https://etherscan.io/tx/${result.txHash}" target="_blank" rel="noopener noreferrer">${result.txHash}</a>`
            : `execution failed: ${result.error || "unknown error"}`;
        extraClass  = result.txHash ? " swap-bubble--done" : " swap-bubble--error";
    } else if (executing) {
        summaryText = executing.summary || "";
        statusText  = "executing swap…";
        extraClass  = " swap-bubble--executing";
    } else if (incoming && !pending) {
        summaryText       = incoming.summary;
        statusText        = `proposed by ${incoming.from || "partner"}`;
        showConfirmReject = true;
    } else if (pending) {
        const iAmProposer = pending.proposer === state.myName;
        summaryText = pending.summary;
        if (iAmProposer && pending.partnerConfirmed) {
            statusText   = `${state.partnerName || "partner"} confirmed — tap to execute`;
            showExecute  = true;
        } else if (iAmProposer) {
            statusText = `waiting for ${state.partnerName || "partner"} to confirm…`;
        } else {
            statusText = `confirmed — waiting for ${pending.proposer || state.partnerName || "partner"} to execute`;
        }
    }

    row.innerHTML = `
        <div class="chat-bubble chat-bubble--swap${extraClass}">
            <div class="swap-bubble-label">vault swap proposal</div>
            ${summaryText ? `<div class="swap-bubble-summary">${summaryText}</div>` : ""}
            <div class="swap-bubble-status">${statusText}</div>
            ${showConfirmReject ? `<div class="swap-bubble-btns">
                <button class="btn btn-primary swap-bubble-confirm">✓ confirm</button>
                <button class="btn btn-ghost swap-bubble-deny">✗ reject</button>
            </div>` : ""}
            ${showExecute ? `<button class="btn btn-primary swap-bubble-execute">⚡ execute swap</button>` : ""}
        </div>
        <div class="chat-time">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
    `;
    chat.scrollTop = chat.scrollHeight;

    row.querySelector(".swap-bubble-confirm")?.addEventListener("click", async () => {
        if (!incoming) return;
        state.swapPending = {
            intent: incoming.intent,
            summary: incoming.summary,
            proposer: incoming.from,
            ts: incoming.ts,
            myConfirmed: true,
            partnerConfirmed: false,
        };
        state.swapIncoming = null;
        saveState(state);
        const { axl: _axl } = await import("../axl/client.js");
        const { ipcSend: _ipc } = await import("../app/ipc-send.js");
        const dualSend = (p) => { if (_axl.available) _axl.send(state.partnerAxlKey, p); _ipc(p); };
        dualSend({ type: "swap_confirm", from: state.myName, ts: Date.now() });
        renderSwapProposal();
    });

    row.querySelector(".swap-bubble-deny")?.addEventListener("click", async () => {
        state.swapPending  = null;
        state.swapIncoming = null;
        saveState(state);
        const { axl: _axl } = await import("../axl/client.js");
        const { ipcSend: _ipc } = await import("../app/ipc-send.js");
        const dualSend = (p) => { if (_axl.available) _axl.send(state.partnerAxlKey, p); _ipc(p); };
        dualSend({ type: "swap_deny", from: state.myName, ts: Date.now() });
        renderSwapProposal();
    });

    row.querySelector(".swap-bubble-execute")?.addEventListener("click", async () => {
        if (!state.swapPending) return;
        const { axl: _axl } = await import("../axl/client.js");
        const { ipcSend: _ipc } = await import("../app/ipc-send.js");
        const dualSend = (p) => { if (_axl.available) _axl.send(state.partnerAxlKey, p); _ipc(p); };

        const { summary, intent } = state.swapPending;
        state.swapPending   = null;
        state.swapExecuting = { summary };
        saveState(state);
        dualSend({ type: "swap_executing", from: state.myName, summary, ts: Date.now() });
        renderSwapProposal();

        try {
            const { executeSwap, KNOWN_TOKENS } = await import("../app/swap.js");
            const fullIntent = {
                ...intent,
                tokenIn:  KNOWN_TOKENS[intent.symbolIn],
                tokenOut: KNOWN_TOKENS[intent.symbolOut],
            };
            const txHash = await executeSwap(fullIntent);
            state.swapExecuting = null;
            state.swapResult    = { txHash, summary };
            saveState(state);
            dualSend({ type: "swap_result", from: state.myName, txHash, summary, ts: Date.now() });
            renderSwapProposal();
        } catch (err) {
            state.swapExecuting = null;
            state.swapResult    = { error: err.message, summary };
            saveState(state);
            renderSwapProposal();
        }
    });
}
