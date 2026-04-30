import { state } from "../lib/state.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "./ipc-send.js";

export function transportSend(payload) {
    if (axl.available) {
        axl.send(state.partnerAxlKey, payload);
    } else {
        ipcSend(payload);
    }
}
