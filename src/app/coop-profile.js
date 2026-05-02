import { state, saveState, EMPTY_MY_PROFILE, EMPTY_PARTNER_PROFILE } from "../lib/state.js";
import { getEffectiveInstanceTag, normalizeInstanceTag } from "../lib/instance-tag.js";
import { registerAgenticId, setupAgentWallet, agenticExplorerUrl, agentWalletExplorerUrl, silentLookup, CONTRACT_ADDRESS, EXPLORER_BASE } from "../lib/agentic-id.js";
import { encryptAndStoreKey, hasEncryptedKey } from "../lib/agent-key-store.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "./ipc-send.js";
import { renderTodayTab } from "../dashboard/render.js";
import {
    PROFILE_ICON_PATHS,
    compressImageToAvatarDataUrl,
    getDeviceSummary,
    initialsFromName,
    profileIconFilled,
    shrinkAvatarDataUrlForMesh,
} from "./coop-profile-helpers.js";

/** Keep AXL / IPC payloads small enough for typical JSON bodies. */
const MAX_AVATAR_DATA_URL_CHARS = 160_000;

/** One-shot hint: two Tauri apps do not share BroadcastChannel / localStorage IPC. */
let meshPhotoWarned = false;

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

/** New tab → partner path tag when known (reads live state). */
function openPartnerLoveclawTabIfTagKnown() {
    if (!state.paired) {
        return;
    }
    const pp = { ...EMPTY_PARTNER_PROFILE, ...(state.partnerProfile || {}) };
    const tag = normalizeInstanceTag(pp.instanceTag);
    if (!tag) {
        return;
    }
    const path = `/${encodeURIComponent(tag)}`;
    const w = window.open(path, "_blank");
    if (w) {
        w.opener = null;
    }
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

async function resolveEns(address) {
    if (!address) return null;
    try {
        const res = await fetch(`https://api.ensideas.com/ens/resolve/${address}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.name || null;
    } catch {
        return null;
    }
}

function makeAgentAddressRow(address) {
    const addrText = String(address || "").trim();
    const valueEl = document.createElement("div");
    valueEl.className = "lc-profile-static lc-profile-static--mono lc-profile-static--agent";
    valueEl.textContent = addrText || "—";
    if (!addrText) {
        return profileInputRow(valueEl, profileIconFilled(PROFILE_ICON_PATHS.link));
    }
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "lc-profile-icon-btn";
    copyBtn.setAttribute("aria-label", "Copy agent address");
    copyBtn.setAttribute("title", "Copy agent address");
    copyBtn.innerHTML = `<svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    copyBtn.addEventListener("click", async () => {
        const ok = await copyTextToClipboard(addrText);
        showProfileToast(ok ? "Address copied" : "Copy failed");
    });
    return profileInputRow(valueEl, copyBtn);
}

function shortAddress(addr) {
    const v = String(addr || "").trim();
    if (v.length <= 12) {
        return v;
    }
    return `${v.slice(0, 6)}...${v.slice(-3)}`;
}

function makeWalletAddressRow(walletAddress, ensName) {
    const wallet = String(walletAddress || "").trim();
    const ens = String(ensName || "").trim();
    const valueEl = document.createElement("div");
    valueEl.className = "lc-profile-static lc-profile-static--mono lc-profile-static--agent";
    valueEl.textContent = wallet ? (ens ? `${ens} (${shortAddress(wallet)})` : wallet) : "—";
    if (!wallet) {
        return profileInputRow(valueEl, profileIconFilled(PROFILE_ICON_PATHS.link));
    }
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "lc-profile-icon-btn";
    copyBtn.setAttribute("aria-label", "Copy wallet address");
    copyBtn.setAttribute("title", "Copy wallet address");
    copyBtn.innerHTML = `<svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    copyBtn.addEventListener("click", async () => {
        const ok = await copyTextToClipboard(wallet);
        showProfileToast(ok ? "Address copied" : "Copy failed");
    });

    const linkBtn = document.createElement("a");
    linkBtn.className = "lc-profile-icon-btn";
    linkBtn.href = `https://etherscan.io/address/${wallet}`;
    linkBtn.target = "_blank";
    linkBtn.rel = "noopener noreferrer";
    linkBtn.setAttribute("aria-label", "View on Etherscan");
    linkBtn.setAttribute("title", "View on Etherscan");
    linkBtn.innerHTML = `<svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

    const btns = document.createElement("div");
    btns.className = "lc-agentic-btns";
    btns.appendChild(copyBtn);
    btns.appendChild(linkBtn);
    return profileInputRow(valueEl, btns);
}

function makeAgenticIdSection(tokenId, agentName, onRegistered, agentWalletAddr) {
    const wrap = document.createElement("div");
    wrap.className = "lc-agentic-id-wrap";

    if (tokenId) {
        const addr = String(agentWalletAddr || "").trim();

        // No agent wallet yet — show setup button instead of contract address
        if (!addr && onRegistered) {
            const setupBtn = document.createElement("button");
            setupBtn.type = "button";
            setupBtn.className = "lc-agentic-register-btn";
            setupBtn.textContent = "Setup Agent Wallet";

            const setBtn = (text, spinning = false) => {
                setupBtn.innerHTML = spinning
                    ? `<span class="lc-agentic-spinner"></span>${text}`
                    : text;
            };

            setupBtn.addEventListener("click", async () => {
                setupBtn.disabled = true;
                try {
                    const { agentWalletAddress, _agentWalletKeyOnce } = await setupAgentWallet(tokenId, s => {
                        const spin = s.includes("authorizing") || s.includes("delegating");
                        setBtn(spin ? s : s, spin);
                    });
                    const mp = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
                    mp.agentWalletAddress = agentWalletAddress;
                    state.myProfile = mp;
                    saveState(state);
                    if (_agentWalletKeyOnce) {
                        await encryptAndStoreKey(_agentWalletKeyOnce, "0000");
                    }
                    showProfileToast("Agent wallet ready!");
                    onRegistered(tokenId, agentWalletAddress);
                } catch (err) {
                    const msg = String(err?.message || err);
                    setupBtn.disabled = false;
                    setBtn(msg.includes("rejected") ? "Rejected — retry" : "Retry");
                    console.error("[agent-wallet]", err);
                }
            });

            wrap.appendChild(setupBtn);
            return wrap;
        }

        const addrEl = document.createElement("div");
        addrEl.className = "lc-profile-static lc-profile-static--mono lc-profile-static--agent";
        addrEl.textContent = addr || CONTRACT_ADDRESS;

        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "lc-profile-icon-btn";
        copyBtn.setAttribute("aria-label", "Copy address");
        copyBtn.setAttribute("title", "Copy address");
        copyBtn.innerHTML = `<svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        if (addr) {
            copyBtn.addEventListener("click", async () => {
                const ok = await copyTextToClipboard(addr);
                showProfileToast(ok ? "Address copied" : "Copy failed");
            });
        }

        const linkBtn = document.createElement("a");
        linkBtn.className = "lc-profile-icon-btn";
        linkBtn.href = addr ? agentWalletExplorerUrl(addr) : agenticExplorerUrl(tokenId);
        linkBtn.target = "_blank";
        linkBtn.rel = "noopener noreferrer";
        linkBtn.setAttribute("aria-label", "View agent on 0G Explorer");
        linkBtn.setAttribute("title", "View agent on 0G Explorer");
        linkBtn.innerHTML = `<svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

        const badge = document.createElement("span");
        badge.className = "lc-agentic-badge";
        badge.textContent = "0G galileo";

        // address + copy + explorer in one row
        const btns = document.createElement("div");
        btns.className = "lc-agentic-btns";
        btns.appendChild(copyBtn);
        btns.appendChild(linkBtn);

        wrap.appendChild(profileInputRow(addrEl, btns));
        wrap.appendChild(badge);
        return wrap;
    }

    const statusEl = document.createElement("div");
    statusEl.className = "lc-profile-static lc-agentic-unregistered";
    statusEl.textContent = window.ethereum ? "not registered" : "MetaMask required";

    const regBtn = document.createElement("button");
    regBtn.type = "button";
    regBtn.className = "lc-agentic-register-btn";
    regBtn.textContent = window.ethereum ? "Register Agent" : "Install MetaMask";
    regBtn.disabled = !window.ethereum;

    regBtn.addEventListener("click", async () => {
        regBtn.disabled = true;
        statusEl.textContent = "";

        const setBtn = (text, spinning = false) => {
            regBtn.innerHTML = spinning
                ? `<span class="lc-agentic-spinner"></span>${text}`
                : text;
        };

        try {
            const { tokenId: newId, walletAddress, agentWalletAddress, _agentWalletKeyOnce } = await registerAgenticId(agentName, status => {
                const spin = status === "confirming...";
                setBtn(spin ? "confirming transaction..." : status, spin);
            });
            if (newId) {
                const mp = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
                mp.agenticTokenId = newId;
                if (!mp.walletAddress && walletAddress) mp.walletAddress = walletAddress;
                if (agentWalletAddress) mp.agentWalletAddress = agentWalletAddress;
                state.myProfile = mp;
                saveState(state);
                if (_agentWalletKeyOnce) {
                    await encryptAndStoreKey(_agentWalletKeyOnce, "0000");
                }
                showProfileToast(`Agent #${newId} registered!`);
                if (onRegistered) onRegistered(newId, agentWalletAddress);
            } else {
                statusEl.textContent = "tx confirmed but no token id found";
                regBtn.disabled = false;
                regBtn.textContent = "Retry";
            }
        } catch (err) {
            const msg = String(err?.message || err);
            if (msg.includes("rejected") || msg.includes("denied")) {
                statusEl.textContent = "rejected";
            } else if (msg.includes("MetaMask")) {
                statusEl.textContent = msg;
            } else {
                statusEl.textContent = "error — check console";
                console.error("[agentic-id]", err);
            }
            regBtn.disabled = false;
            regBtn.textContent = "Retry";
        }
    });

    wrap.appendChild(profileInputRow(statusEl, profileIconFilled(PROFILE_ICON_PATHS.link)));
    wrap.appendChild(regBtn);
    return wrap;
}

/**
 * Shows a PIN setup modal, waits for the user to confirm a PIN,
 * then encrypts the private key. Resolves when done (or if skipped).
 */
function _showPinSetup(plainPrivateKey) {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "lc-pin-overlay";
        overlay.innerHTML = `
            <div class="lc-pin-modal">
                <div class="lc-pin-head">Set Agent PIN</div>
                <p class="lc-pin-desc">Your agent key will be encrypted with this PIN. You'll enter it each time your agent acts on-chain.</p>
                <input class="lc-pin-input" id="lc-pin-a" type="password" inputmode="numeric" maxlength="12" placeholder="choose a PIN" autocomplete="new-password" />
                <input class="lc-pin-input" id="lc-pin-b" type="password" inputmode="numeric" maxlength="12" placeholder="confirm PIN" autocomplete="new-password" />
                <div class="lc-pin-error" id="lc-pin-error"></div>
                <div class="lc-pin-actions">
                    <button class="lc-agentic-register-btn" id="lc-pin-confirm">Encrypt &amp; Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("lc-pin-overlay--show"));

        const errEl  = overlay.querySelector("#lc-pin-error");
        const pinA   = overlay.querySelector("#lc-pin-a");
        const pinB   = overlay.querySelector("#lc-pin-b");
        const btn    = overlay.querySelector("#lc-pin-confirm");

        const dismiss = () => {
            overlay.classList.remove("lc-pin-overlay--show");
            setTimeout(() => overlay.remove(), 300);
            resolve();
        };

        btn.addEventListener("click", async () => {
            const a = pinA.value;
            const b = pinB.value;
            if (!a) { errEl.textContent = "PIN cannot be empty."; return; }
            if (a !== b) { errEl.textContent = "PINs don't match."; return; }
            if (a.length < 4) { errEl.textContent = "PIN must be at least 4 characters."; return; }
            btn.disabled = true;
            btn.innerHTML = `<span class="lc-agentic-spinner"></span>encrypting...`;
            try {
                await encryptAndStoreKey(plainPrivateKey, a);
                dismiss();
            } catch (e) {
                errEl.textContent = "Encryption failed — try again.";
                btn.disabled = false;
                btn.textContent = "Encrypt & Save";
            }
        });

        // Allow Enter key
        [pinA, pinB].forEach(inp => inp.addEventListener("keydown", e => {
            if (e.key === "Enter") btn.click();
        }));

        setTimeout(() => pinA.focus(), 100);
    });
}

function buildOutboundProfile() {
    const mp = state.myProfile || { ...EMPTY_MY_PROFILE };
    const avatar = String(mp.avatarDataUrl || "");
    return {
        walletAddress: String(mp.walletAddress || "").trim().slice(0, 66),
        ensName: String(mp.ensName || "").trim().slice(0, 128),
        note: String(mp.note || "").trim().slice(0, 500),
        avatarDataUrl: avatar.startsWith("data:image/") ? avatar : "",
        deviceLabel: getDeviceSummary().slice(0, 400),
        agentPublicKey: String(state.myAxlKey || "").trim().slice(0, 512),
        agenticTokenId: String(mp.agenticTokenId || "").trim().slice(0, 64),
        agentWalletAddress: String(mp.agentWalletAddress || "").trim().slice(0, 42),
        instanceTag: normalizeInstanceTag(getEffectiveInstanceTag()),
    };
}

/**
 * Mesh JSON bodies are tight; always re-encode avatars small for /send.
 * (Keeps Alice→Boris and Boris→Alice symmetric even when one photo compresses smaller.)
 */
async function profileForMeshOutbound() {
    const p = buildOutboundProfile();
    const av = String(p.avatarDataUrl || "");
    if (!av.startsWith("data:image/")) {
        return p;
    }
    let out = await shrinkAvatarDataUrlForMesh(av, 80, 0.7);
    out = out || av;
    if (out.length > MAX_AVATAR_DATA_URL_CHARS) {
        const mid = await shrinkAvatarDataUrlForMesh(out, 56, 0.62);
        out = mid || out;
    }
    if (out.length > MAX_AVATAR_DATA_URL_CHARS) {
        const tiny = await shrinkAvatarDataUrlForMesh(out, 40, 0.55);
        out = tiny || "";
    }
    return { ...p, avatarDataUrl: out };
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
    if (!axl.available && String(state.partnerAxlKey || "").trim()) {
        await axl.init(state.partnerAxlKey);
    }
    const profileMesh = await profileForMeshOutbound();
    const basePayload = () => ({
        type: "coop_profile",
        from: state.myName || "me",
        coupleId: String(state.coupleId || "").trim(),
        profile: { ...profileMesh },
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
        const small = await shrinkAvatarDataUrlForMesh(p1.profile.avatarDataUrl, 96, 0.68);
        if (small) {
            const pMid = basePayload();
            pMid.profile = { ...pMid.profile, avatarDataUrl: small };
            await tryAxl(pMid);
            if (axlOk) {
                ipcSend(pMid);
            }
        }
    }

    if (axl.available && state.partnerAxlKey && !axlOk && p1.profile?.avatarDataUrl) {
        console.warn("[loveclaw] coop_profile: sending without avatar (mesh rejected full payload); try a smaller photo or save & share again.");
        const p2 = basePayload();
        p2.profile = { ...p2.profile, avatarDataUrl: "" };
        await tryAxl(p2);
        if (axlOk) {
            ipcSend(p2);
        }
    }

    const hadPhoto = Boolean(String(profileMesh.avatarDataUrl || "").trim());
    if (hadPhoto && !axl.available && !meshPhotoWarned) {
        meshPhotoWarned = true;
        showProfileToast(
            "AXL mesh offline — two separate Tauri windows cannot share photos over “local IPC”. "
            + "Run examples/axl-demo (ports 9002/9012) or use two browser tabs on the same dev server.",
        );
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
    const sheet = document.getElementById("modal-partner-profile");
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
    const coopName = (state.partnerName || "").trim() || "Coop";
    profileModalWhoOpen = who;

    headTitle.textContent = isMe ? "Your Profile" : `${coopName}'s profile`;
    headTitle.classList.toggle("lc-profile-head-title--partner-secret", who === "partner");

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
                if (state.paired) {
                    const ok = await sendMyProfileToCoop();
                    const partnerLabel = (state.partnerName || "").trim() || "partner";
                    showProfileToast(ok ? `Photo shared with ${partnerLabel}` : "Photo saved (will sync when online)");
                }
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
        rmBtn.addEventListener("click", async () => {
            const cur = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
            state.myProfile = { ...cur, avatarDataUrl: "" };
            saveState(state);
            avatar.innerHTML = "";
            avatar.textContent = nMe;
            syncRemovePhotoVisibility();
            renderTodayTab();
            if (state.paired) {
                const ok = await sendMyProfileToCoop();
                showProfileToast(ok ? "Photo removed for coop" : "Photo removed (will sync when online)");
            }
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

        const myTokenId = String(mp.agenticTokenId || "").trim();
        const myWallet = String(mp.walletAddress || "").trim();
        const myAgentWallet = String(mp.agentWalletAddress || "").trim();
        const onAgenticRegistered = (newId, newWallet) => {
            const section = body.querySelector(".lc-agentic-id-wrap");
            const wallet = newWallet || String(state.myProfile?.agentWalletAddress || "").trim();
            if (section) {
                section.replaceWith(makeAgenticIdSection(newId, state.myName || "LoveClaw", null, wallet));
            }
            const labelEl = body.querySelector(".lc-agentic-label");
            if (labelEl) {
                labelEl.innerHTML = "";
                labelEl.append("OG Agent Address ");
                const nl = document.createElement("a");
                nl.className = "lc-agentic-nft-link";
                nl.textContent = `NFT ID #${newId}`;
                nl.href = agenticExplorerUrl(newId);
                nl.target = "_blank";
                nl.rel = "noopener noreferrer";
                labelEl.appendChild(nl);
            }
            void sendMyProfileToCoop();
        };
        const agenticBlock = document.createElement("div");
        agenticBlock.className = "lc-profile-field";
        const agenticLabel = document.createElement("label");
        agenticLabel.className = "lc-profile-label lc-agentic-label";
        if (myTokenId) {
            agenticLabel.append("OG Agent Address ");
            const nftLink = document.createElement("a");
            nftLink.className = "lc-agentic-nft-link";
            nftLink.textContent = `NFT ID #${myTokenId}`;
            nftLink.href = agenticExplorerUrl(myTokenId);
            nftLink.target = "_blank";
            nftLink.rel = "noopener noreferrer";
            agenticLabel.appendChild(nftLink);
        } else {
            agenticLabel.textContent = "OG Agent Address";
        }
        agenticBlock.appendChild(agenticLabel);
        agenticBlock.appendChild(makeAgenticIdSection(myTokenId, state.myName || "LoveClaw", onAgenticRegistered, myAgentWallet));

        if (!myTokenId) {
            silentLookup().then(result => {
                if (!result) return;
                const cur = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
                if (cur.agenticTokenId) return;
                cur.agenticTokenId = result.tokenId;
                if (!cur.walletAddress && result.walletAddress) cur.walletAddress = result.walletAddress;
                state.myProfile = cur;
                saveState(state);
                const labelEl = body.querySelector(".lc-agentic-label");
                if (labelEl) labelEl.textContent = `OG Agent Address NFT ID #${result.tokenId}`;
                onAgenticRegistered(result.tokenId, result.walletAddress);
            }).catch(() => {});
        }

        const walletRowBlock = profileFieldBlock("Your wallet address", makeWalletAddressRow(mp.walletAddress, mp.ensName));
        body.appendChild(walletRowBlock);

        // Auto-resolve ENS name if wallet is set but ENS is empty
        if (mp.walletAddress && !mp.ensName) {
            resolveEns(mp.walletAddress).then(name => {
                if (!name) return;
                const cur = { ...EMPTY_MY_PROFILE, ...(state.myProfile || {}) };
                if (cur.ensName) return; // user already filled it manually
                cur.ensName = name;
                state.myProfile = cur;
                saveState(state);
                // refresh the wallet row in place
                const newRow = makeWalletAddressRow(cur.walletAddress, name);
                const oldWrap = walletRowBlock.querySelector(".lc-profile-input-wrap");
                if (oldWrap) oldWrap.replaceWith(newRow);
                showProfileToast(`ENS resolved: ${name}`);
            }).catch(() => {});
        }
        body.appendChild(profileFieldBlock("AXL Agent Address", makeAgentAddressRow(agentDisplay)));
        body.appendChild(agenticBlock);

        const devSt = document.createElement("div");
        devSt.className = "lc-profile-static lc-profile-static--device";
        devSt.textContent = getDeviceSummary();
        body.appendChild(profileFieldBlock("This device", profileInputRow(devSt, profileIconFilled(PROFILE_ICON_PATHS.monitor))));

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
        body.appendChild(profileFieldBlock(`Note to ${coopName}`, noteWrap));
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

        const partnerTag = normalizeInstanceTag(pp.instanceTag);
        if (partnerTag) {
            avatar.classList.add("lc-profile-avatar-lg--tap");
            avatar.setAttribute("role", "button");
            avatar.setAttribute("tabindex", "0");
            avatar.setAttribute("aria-label", `Open ${coopName}'s LoveClaw page in a new tab`);
            avatar.title = `Open /${partnerTag} in a new tab`;
            avatar.addEventListener("click", () => openPartnerLoveclawTabIfTagKnown());
            avatar.addEventListener("keydown", ev => {
                if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    openPartnerLoveclawTabIfTagKnown();
                }
            });
        }

        const nameEl = document.createElement("h3");
        nameEl.className = "lc-profile-name lc-profile-name--partner";
        nameEl.textContent = coopName;

        const lede = document.createElement("p");
        lede.className = "lc-profile-lede";
        lede.textContent = partnerTag
            ? "Read-only. Tap their photo or double-click the title to open their URL on this site. That tab uses its own storage (like a second account) — it only shows paired if this browser has already joined as that tag, or use it on their phone where they run LoveClaw. They update details when they save & share."
            : "Read-only. Their tag isn’t known here yet — re-pair with a fresh invite or wait for sync. Then tap their photo or double-click the title; that URL uses separate storage until paired as that tag.";

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

        const partnerTokenId = String(pp.agenticTokenId || "").trim();
        const partnerAgentWallet = String(pp.agentWalletAddress || "").trim();
        const partnerAgenticBlock = document.createElement("div");
        partnerAgenticBlock.className = "lc-profile-field";
        const partnerAgenticLabel = document.createElement("label");
        partnerAgenticLabel.className = "lc-profile-label";
        if (partnerTokenId) {
            partnerAgenticLabel.append("OG Agent Address ");
            const nftLink = document.createElement("a");
            nftLink.className = "lc-agentic-nft-link";
            nftLink.textContent = `NFT ID #${partnerTokenId}`;
            nftLink.href = agenticExplorerUrl(partnerTokenId);
            nftLink.target = "_blank";
            nftLink.rel = "noopener noreferrer";
            partnerAgenticLabel.appendChild(nftLink);
        } else {
            partnerAgenticLabel.textContent = "OG Agent Address";
        }
        const partnerWalletBlock = profileFieldBlock("Wallet address", makeWalletAddressRow(wallet, ens));
        body.appendChild(partnerWalletBlock);
        if (wallet && !ens) {
            resolveEns(wallet).then(name => {
                if (!name) return;
                const newRow = makeWalletAddressRow(wallet, name);
                const oldWrap = partnerWalletBlock.querySelector(".lc-profile-input-wrap");
                if (oldWrap) oldWrap.replaceWith(newRow);
            }).catch(() => {});
        }
        body.appendChild(profileFieldBlock("AXL Agent Address", makeAgentAddressRow(agentP)));
        partnerAgenticBlock.appendChild(partnerAgenticLabel);
        partnerAgenticBlock.appendChild(makeAgenticIdSection(partnerTokenId, coopName, null, partnerAgentWallet));
        body.appendChild(partnerAgenticBlock);
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
    if (avatarRaw.startsWith("data:image/") && avatarRaw.length > MAX_AVATAR_DATA_URL_CHARS) {
        void shrinkAvatarDataUrlForMesh(avatarRaw, 96, 0.72).then(small => {
            if (!small || !state.paired) {
                return;
            }
            applyCoopProfileFromMessage({ ...msg, profile: { ...p, avatarDataUrl: small } });
        });
        return;
    }
    const avatarOk = avatarRaw.startsWith("data:image/") && avatarRaw.length <= MAX_AVATAR_DATA_URL_CHARS
        ? avatarRaw
        : "";
    const tagFromMsg = normalizeInstanceTag(p.instanceTag);
    const tagKeep = tagFromMsg || normalizeInstanceTag(state.partnerProfile?.instanceTag);
    state.partnerProfile = {
        ...EMPTY_PARTNER_PROFILE,
        walletAddress: String(p.walletAddress || "").trim().slice(0, 66),
        ensName: String(p.ensName || "").trim().slice(0, 128),
        note: String(p.note || "").trim().slice(0, 500),
        avatarDataUrl: avatarOk,
        agentPublicKey: String(p.agentPublicKey || "").trim().slice(0, 512),
        deviceLabel: String(p.deviceLabel || "").trim().slice(0, 400),
        agenticTokenId: String(p.agenticTokenId || "").trim().slice(0, 64),
        agentWalletAddress: String(p.agentWalletAddress || "").trim().slice(0, 42),
        instanceTag: tagKeep,
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

    const headTitle = document.getElementById("profile-head-title");
    headTitle?.addEventListener("dblclick", () => {
        if (!sheet || sheet.classList.contains("hidden")) {
            return;
        }
        if (profileModalWhoOpen !== "partner") {
            return;
        }
        openPartnerLoveclawTabIfTagKnown();
    });

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
