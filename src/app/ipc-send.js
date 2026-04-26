/**
 * Outbound P2P bridge (same origin): BroadcastChannel + localStorage.
 * Inbound dispatch lives in ipc-inbox.js to avoid an import cycle with messages/ping.
 */
export const p2pChannel = new BroadcastChannel("loveclaw-p2p");

export function ipcSend(data) {
    const msg = { ...data, _id: crypto.randomUUID() };
    try {
        p2pChannel.postMessage(msg);
    } catch {
        /* */
    }
    try {
        localStorage.setItem("loveclaw-ipc", JSON.stringify(msg));
    } catch {
        /* */
    }
}
