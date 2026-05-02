import { state, saveState, EMPTY_PARTNER_PROFILE } from "../lib/state.js";
import { getEffectiveInstanceTag, normalizeInstanceTag } from "../lib/instance-tag.js";
import { showScreen } from "../lib/router.js";
import { parsePactFromInviteField, renderJoinPactPreview, generateKey } from "../lib/invite.js";
import { coalescePactTriggers, migrateTriggers } from "../lib/pact-triggers.js";
import { axl } from "../axl/client.js";
import { startAxlPoll } from "../axl/poll.js";
import { completePairing } from "../app/pairing.js";
import { handleAxlMessage } from "../app/messages.js";
import { ipcSend } from "../app/ipc-send.js";
import { initJoinQrScan } from "./join-qr-scan.js";

function runJoinPactPreview() {
    const raw = document.getElementById("join-code")?.value ?? "";
    const el = document.getElementById("join-pact-preview");
    if (!el) return;
    const p = parsePactFromInviteField(raw);
    renderJoinPactPreview(el, p);

    const notice = document.getElementById("join-stake-notice");
    if (!notice) return;
    const stake = p ? Number(p.stakeEth) : 0;
    if (Number.isFinite(stake) && stake > 0) {
        notice.textContent = `This pact requires a stake of ${stake} ETH. You can join now — you will have 24 hours to deposit the required amount.`;
        notice.classList.remove("hidden");
    } else {
        notice.textContent = "";
        notice.classList.add("hidden");
    }
}

export function initJoinScreen() {
    document.getElementById("back-join").addEventListener("click", () => showScreen("home"));

    const joinCode = document.getElementById("join-code");
    if (joinCode) {
        joinCode.addEventListener("input", runJoinPactPreview);
        joinCode.addEventListener("paste", () => {
            queueMicrotask(runJoinPactPreview);
        });
    }

    initJoinQrScan(() => document.getElementById("join-code"));

    document.getElementById("btn-join-submit").addEventListener("click", async () => {
        const name = document.getElementById("join-name").value.trim();
        const raw = document.getElementById("join-code").value.trim();
        if (!name) {
            alert("enter your name");
            return;
        }
        if (!raw) {
            alert("paste the invite code");
            return;
        }

        const pact = parsePactFromInviteField(raw);
        if (!pact) {
            alert("invalid invite code");
            return;
        }

        state.myName = name;
        state.partnerName = pact.name;
        state.partnerAxlKey = pact.key;
        state.coupleId = pact.coupleId;
        const c = coalescePactTriggers(pact.triggers);
        state.triggers = c != null ? c : migrateTriggers([]);
        const se = Number(pact.stakeEth);
        state.stakeEth = Number.isFinite(se) && se >= 0 ? se : 0;
        state.createdAt = Date.now();
        state.paired = false;
        state.myAxlKey = "";

        const inviterTag = normalizeInstanceTag(pact.instanceTag);
        if (inviterTag) {
            state.partnerProfile = {
                ...EMPTY_PARTNER_PROFILE,
                ...(state.partnerProfile && typeof state.partnerProfile === "object" ? state.partnerProfile : {}),
                instanceTag: inviterTag,
            };
        }

        const joinBtn = document.getElementById("btn-join-submit");
        const origJoinLabel = joinBtn.textContent;
        joinBtn.textContent = "connecting to AXL…";
        joinBtn.disabled = true;

        const axlUp = await axl.init(state.partnerAxlKey);
        if (!axlUp) {
            state.myAxlKey = generateKey();
        }

        joinBtn.textContent = origJoinLabel;
        joinBtn.disabled = false;
        saveState(state);

        const handshake = { type: "axl_handshake", name: state.myName, key: state.myAxlKey };
        const joinerTag = normalizeInstanceTag(getEffectiveInstanceTag());
        if (joinerTag) {
            handshake.instanceTag = joinerTag;
        }
        const pactCoupleId = String(state.coupleId || "").trim();
        if (pactCoupleId) {
            handshake.coupleId = pactCoupleId;
        }
        if (axl.available) {
            const sent = await axl.send(state.partnerAxlKey, handshake);
            if (!sent) {
                alert(
                    "could not send your join handshake to the mesh (network or relay). fix connectivity and try again.",
                );
                return;
            }
            startAxlPoll(completePairing, handleAxlMessage);
        } else {
            ipcSend(handshake);
        }

        completePairing();
    });
}
