import { state, saveState, EMPTY_MY_PROFILE, EMPTY_PARTNER_PROFILE } from "../lib/state.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "./ipc-send.js";
import { renderTodayTab } from "../dashboard/render.js";
import {
    PROFILE_ICON_PATHS,
    compressImageToAvatarDataUrl,
    getDeviceSummary,
    initialsFromName,
    profileIconFilled,
} from "./coop-profile-helpers.js";

/** Keep AXL / IPC payloads small enough for typical JSON bodies. */
const MAX_AVATAR_DATA_URL_CHARS = 160_000;

function profileFieldBlock(labelText, rowEl) {
    const block = document.createElement("div");
    block.className = "lc-profile-field";
    const lab = document.createElement("label");
    lab.className = "lc-profile-label";
    lab.textContent = labelText;
    block.appendChild(lab);
    block.appendChild(rowEl);
    return block;
}

function profileInputRow(middleEl, iconEl) {
    const wrap = document.createElement("div");
    wrap.className = "lc-profile-input-wrap";
    wrap.appendChild(middleEl);
    wrap.appendChild(iconEl);
    return wrap;
}

function showProfileToast(message) {
    const id = "lc-profile-toast";
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.className = "lc-profile-toast";
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("lc-profile-toast--show");
    window.clearTimeout(showProfileToast._timer);
    showProfileToast._timer = window.setTimeout(() => {
        el?.classList.remove("lc-profile-toast--show");
    }, 1800);
}

function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value) {
        return Promise.resolve(false);
    }
    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(value).then(() => true).catch(() => false);
    }
    return new Promise(resolve => {
        try {
            const ta = document.createElement("textarea");
            ta.value = value;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            ta.style.pointerEvents = "none";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            resolve(Boolean(ok));
        } catch {
            resolve(false);
        }
    });
}

function makeAgentAddressRow(address) {
    const addrText = String(address || "").trim();
    const text = addrText || "—";
    const valueEl = document.createElement("div");
    valueEl.className = "lc-profile-static lc-profile-static--mono lc-profile-static--agent";
    valueEl.textContent = text;
    const copyIcon = profileIconFilled(PROFILE_ICON_PATHS.link);
    if (addrText) {
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "lc-profile-icon-btn";
        copyBtn.setAttribute("aria-label", "Copy agent address");
        copyBtn.setAttribute("title", "Copy agent address");
        copyBtn.appendChild(copyIcon);
        copyBtn.addEventListener("click", async () => {
            const ok = await copyTextToClipboard(addrText);
            showProfileToast(ok ? "Address copied" : "Copy failed");
        });
        return profileInputRow(valueEl, copyBtn);
    }
    return profileInputRow(valueEl, copyIcon);
}

function buildOutboundProfile() {
    const mp = state.myProfile || { ...EMPTY_MY_PROFILE };
    let avatar = String(mp.avatarDataUrl || "");
    if (avatar.length > MAX_AVATAR_DATA_URL_CHARS) {
        avatar = "";
    }
    return {
        walletAddress: String(mp.walletAddress || "").trim().slice(0, 66),
        ensName: String(mp.ensName || "").trim().slice(0, 128),
        note: String(mp.note || "").trim().slice(0, 500),
        avatarDataUrl: avatar.startsWith("data:image/") ? avatar : "",
        deviceLabel: getDeviceSummary().slice(0, 400),
        agentPublicKey: String(state.myAxlKey || "").trim().slice(0, 512),
    };
}

/**
 * Push profile to coop over AXL when available, and always mirror via IPC
 * (BroadcastChannel + storage) so two tabs on the same origin update immediately.
 * @returns {Promise<boolean>} true if AXL send succeeded at least once
 */
export async function sendMyProfileToCoop() {
    if (!state.paired) {
        return false;
    }
    const basePayload = () => ({
        type: "coop_profile",
        from: state.myName || "me",
        profile: buildOutboundProfile(),
        ts: Date.now(),
    });

    let axlOk = false;
    const tryAxl = async payload => {
        if (axl.available && state.partnerAxlKey) {
            const ok = await axl.send(state.partnerAxlKey, payload);
            if (ok) {
                axlOk = true;
            } else {
                console.warn("[loveclaw] coop_profile: AXL /send was not OK (offline or payload rejected?)");
            }
        }
    };

    const p1 = basePayload();
    await tryAxl(p1);
    ipcSend(p1);

    if (axl.available && state.partnerAxlKey && !axlOk && p1.profile?.avatarDataUrl) {
        const p2 = basePayload();
        p2.profile = { ...p2.profile, avatarDataUrl: "" };
        await tryAxl(p2);
    }

    return axlOk;
}

/** Tracks which profile sheet is open for live refresh when coop_profile arrives. */
let profileModalWhoOpen = null;

function closeProfileModal() {
    profileModalWhoOpen = null;
    const sheet = document.getElementById("modal-partner-profile");
    if (sheet) {
        sheet.classList.add("hidden");
    }
}

/** Re-render modal body if it is open (so coop view updates without closing). */
export function refreshCoopProfileModalIfOpen() {
    const sheet = document.getElementById("modal-coop-profile");
    if (!profileModalWhoOpen || !sheet || sheet.classList.contains("hidden")) {
        return;
    }
    openCoopProfile(profileModalWhoOpen);
}

/**
 * @param {"me" | "partner" | "coop"} who
 */
export function openCoopProfile(who) {
    if ((who === "coop" || who === "partner") && !state.paired) {
        return;
    }
    const sheet = document.getElementById("modal-partner-profile");
    const headTitle = document.getElementById("profile-head-title");
    const body = document.getElementById("profile-modal-body");
    const saveBtn = document.getElementById("profile-modal-save");
    if (!sheet || !headTitle || !body || !saveBtn) {
        return;
    }

    const isMe = who === "me";
    profileModalWhoOpen = who;

    headTitle.textContent = isMe ? "Your Profile" : `${state.partnerName || "Coop"}'s profile`;

    body.innerHTML = "";
    saveBtn.classList.toggle("hidden", !isMe);

    const agentLocal = String(state.myAxlKey || "").trim();
    const agentDisplay = agentLocal || "—";

    const hero = document.createElement("div");
    hero.className = "lc-profile-hero";

    if (isMe) {
        const mp = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
        const nMe = initialsFromName(state.myName, "You");

        const avatar = document.createElement("div");
        avatar.className = "lc-profile-avatar-lg lc-profile-avatar-lg--tap";
        avatar.setAttribute("role", "button");
        avatar.setAttribute("tabindex", "0");
        avatar.setAttribute("aria-label", "Change profile photo");
        if (mp.avatarDataUrl && mp.avatarDataUrl.startsWith("data:image/")) {
            const im = document.createElement("img");
            im.src = mp.avatarDataUrl;
            im.alt = "";
            avatar.appendChild(im);
        } else {
            avatar.textContent = nMe;
        }

        const fileInp = document.createElement("input");
        fileInp.type = "file";
        fileInp.accept = "image/jpeg,image/png,image/webp,image/gif";
        fileInp.className = "lc-profile-file-hidden";
        fileInp.id = "profile-inp-avatar-file";
        fileInp.addEventListener("change", async () => {
            const f = fileInp.files?.[0];
            fileInp.value = "";
            if (!f) {
                return;
            }
            try {
                const url = await compressImageToAvatarDataUrl(f);
                const cur = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
                state.myProfile = { ...cur, avatarDataUrl: url };
                saveState(state);
                avatar.innerHTML = "";
                const im = document.createElement("img");
                im.src = url;
                im.alt = "";
                avatar.appendChild(im);
                syncRemovePhotoVisibility();
                renderTodayTab();
            } catch (e) {
                console.warn("[profile] avatar", e);
            }
        });
        const openFile = () => fileInp.click();
        avatar.addEventListener("click", openFile);
        avatar.addEventListener("keydown", ev => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                openFile();
            }
        });

        const rmBtn = document.createElement("button");
        rmBtn.type = "button";
        rmBtn.className = "lc-profile-link-btn";
        rmBtn.textContent = "Remove photo";
        const syncRemovePhotoVisibility = () => {
            const hasAvatar = Boolean(
                state.myProfile?.avatarDataUrl
                && String(state.myProfile.avatarDataUrl).startsWith("data:image/"),
            );
            rmBtn.classList.toggle("hidden", !hasAvatar);
        };
        rmBtn.addEventListener("click", () => {
            const cur = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
            state.myProfile = { ...cur, avatarDataUrl: "" };
            saveState(state);
            avatar.innerHTML = "";
            avatar.textContent = nMe;
            syncRemovePhotoVisibility();
            renderTodayTab();
        });
        syncRemovePhotoVisibility();

        const meta = document.createElement("div");
        meta.className = "lc-profile-avatar-meta";
        meta.appendChild(fileInp);
        meta.appendChild(rmBtn);

        const nameEl = document.createElement("h3");
        nameEl.className = "lc-profile-name";
        nameEl.textContent = state.myName || "You";

        const lede = document.createElement("p");
        lede.className = "lc-profile-lede";
        lede.textContent =
            "Edit your details, then tap save & share. Your coop sees this read-only. Agent address is your LoveClaw link key.";

        hero.appendChild(avatar);
        hero.appendChild(nameEl);
        hero.appendChild(lede);
        hero.appendChild(meta);
        body.appendChild(hero);

        body.appendChild(profileFieldBlock("Agent address (AXL)", makeAgentAddressRow(agentDisplay)));

        const wInp = document.createElement("input");
        wInp.type = "text";
        wInp.className = "lc-profile-input";
        wInp.placeholder = "0x… (optional)";
        wInp.value = mp.walletAddress || "";
        wInp.maxLength = 66;
        wInp.id = "profile-inp-wallet";
        body.appendChild(profileFieldBlock("Wallet address", profileInputRow(wInp, profileIconFilled(PROFILE_ICON_PATHS.mail))));

        const ensInp = document.createElement("input");
        ensInp.type = "text";
        ensInp.className = "lc-profile-input";
        ensInp.placeholder = "name.eth (optional)";
        ensInp.value = mp.ensName || "";
        ensInp.maxLength = 128;
        ensInp.id = "profile-inp-ens";
        body.appendChild(profileFieldBlock("ENS name", profileInputRow(ensInp, profileIconFilled(PROFILE_ICON_PATHS.globe))));

        const devSt = document.createElement("div");
        devSt.className = "lc-profile-static";
        devSt.textContent = getDeviceSummary();
        body.appendChild(profileFieldBlock("This device", profileInputRow(devSt, profileIconFilled(PROFILE_ICON_PATHS.phone))));

        const noteTa = document.createElement("textarea");
        noteTa.className = "lc-profile-textarea";
        noteTa.placeholder = "Short note visible to coop…";
        noteTa.value = mp.note || "";
        noteTa.maxLength = 500;
        noteTa.rows = 3;
        noteTa.id = "profile-inp-note";
        const noteWrap = document.createElement("div");
        noteWrap.className = "lc-profile-input-wrap lc-profile-input-wrap--stack";
        noteWrap.appendChild(noteTa);
        noteWrap.appendChild(profileIconFilled(PROFILE_ICON_PATHS.note));
        body.appendChild(profileFieldBlock("Note to coop", noteWrap));
    } else {
        const pp = { ...EMPTY_PARTNER_PROFILE, ...(state.partnerProfile || {}) };
        const agentP = String(pp.agentPublicKey || "").trim() || "—";
        const wallet = String(pp.walletAddress || "").trim() || "—";
        const ens = String(pp.ensName || "").trim() || "—";
        const dev = String(pp.deviceLabel || "").trim() || "—";
        const note = String(pp.note || "").trim() || "—";
        const updated = pp.updatedAt
            ? new Date(pp.updatedAt).toLocaleString()
            : "not shared yet";
        const nPt = initialsFromName(state.partnerName, "Coop");

        const avatar = document.createElement("div");
        avatar.className = "lc-profile-avatar-lg lc-profile-avatar-lg--partner";
        if (pp.avatarDataUrl && pp.avatarDataUrl.startsWith("data:image/")) {
            const im = document.createElement("img");
            im.src = pp.avatarDataUrl;
            im.alt = "";
            avatar.appendChild(im);
        } else {
            avatar.textContent = nPt;
        }

        const nameEl = document.createElement("h3");
        nameEl.className = "lc-profile-name lc-profile-name--partner";
        nameEl.textContent = state.partnerName || "Coop";

        const lede = document.createElement("p");
        lede.className = "lc-profile-lede";
        lede.textContent =
            "Read-only. They update this when they save & share from their device.";

        hero.appendChild(avatar);
        hero.appendChild(nameEl);
        hero.appendChild(lede);
        body.appendChild(hero);

        const mkRead = (text, mono) => {
            const d = document.createElement("div");
            d.className = mono ? "lc-profile-static lc-profile-static--mono" : "lc-profile-static";
            d.textContent = text;
            return d;
        };

        body.appendChild(profileFieldBlock("Agent address (AXL)", makeAgentAddressRow(agentP)));
        body.appendChild(profileFieldBlock("Wallet address", profileInputRow(mkRead(wallet, false), profileIconFilled(PROFILE_ICON_PATHS.mail))));
        body.appendChild(profileFieldBlock("ENS name", profileInputRow(mkRead(ens, false), profileIconFilled(PROFILE_ICON_PATHS.globe))));
        body.appendChild(profileFieldBlock("Device", profileInputRow(mkRead(dev, false), profileIconFilled(PROFILE_ICON_PATHS.phone))));
        body.appendChild(profileFieldBlock("Note", profileInputRow(mkRead(note, false), profileIconFilled(PROFILE_ICON_PATHS.note))));
        body.appendChild(profileFieldBlock("Last updated", profileInputRow(mkRead(updated, false), profileIconFilled(PROFILE_ICON_PATHS.clock))));
    }

    sheet.classList.remove("hidden");
}

async function saveMyProfileFromForm() {
    const w = document.getElementById("profile-inp-wallet");
    const ens = document.getElementById("profile-inp-ens");
    const note = document.getElementById("profile-inp-note");
    const mp = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
    if (w) {
        mp.walletAddress = String(w.value || "").trim().slice(0, 66);
    }
    if (ens) {
        mp.ensName = String(ens.value || "").trim().slice(0, 128);
    }
    if (note) {
        mp.note = String(note.value || "").trim().slice(0, 500);
    }
    let av = String(mp.avatarDataUrl || "");
    if (av.length > MAX_AVATAR_DATA_URL_CHARS) {
        av = "";
    }
    mp.avatarDataUrl = av.startsWith("data:image/") ? av : "";
    state.myProfile = mp;
    saveState(state);
    await sendMyProfileToCoop();
    renderTodayTab();
    closeProfileModal();
}

export function applyCoopProfileFromMessage(msg) {
    if (!msg?.profile || typeof msg.profile !== "object") {
        return;
    }
    const p = msg.profile;
    const avatarRaw = String(p.avatarDataUrl || "");
    const avatarOk = avatarRaw.startsWith("data:image/") && avatarRaw.length <= MAX_AVATAR_DATA_URL_CHARS
        ? avatarRaw
        : "";
    state.partnerProfile = {
        ...EMPTY_PARTNER_PROFILE,
        walletAddress: String(p.walletAddress || "").trim().slice(0, 66),
        ensName: String(p.ensName || "").trim().slice(0, 128),
        note: String(p.note || "").trim().slice(0, 500),
        avatarDataUrl: avatarOk,
        agentPublicKey: String(p.agentPublicKey || "").trim().slice(0, 512),
        deviceLabel: String(p.deviceLabel || "").trim().slice(0, 400),
        updatedAt: typeof msg.ts === "number" ? msg.ts : Date.now(),
    };
    saveState(state);
}

export function initCoopProfileUi() {
    const meBtn = document.getElementById("today-avatar-me");
    const ptBtn = document.getElementById("today-avatar-partner");
    const sheet = document.getElementById("modal-partner-profile");
    const closeBtn = document.getElementById("profile-modal-close");
    const saveBtn = document.getElementById("profile-modal-save");

    meBtn?.addEventListener("click", () => openCoopProfile("me"));
    ptBtn?.addEventListener("click", () => openCoopProfile("partner"));

    closeBtn?.addEventListener("click", () => closeProfileModal());
    saveBtn?.addEventListener("click", () => {
        void saveMyProfileFromForm();
    });

    sheet?.addEventListener("click", ev => {
        if (ev.target === sheet) {
            closeProfileModal();
        }
    });

    document.addEventListener("keydown", ev => {
        if (ev.key === "Escape" && sheet && !sheet.classList.contains("hidden")) {
            closeProfileModal();
        }
    });
}
