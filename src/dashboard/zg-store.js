import { state, saveState } from "../lib/state.js";
import {
    decryptStoredKey,
    hasEncryptedKey,
    encryptAndStoreVaultKey,
    decryptStoredVaultKey,
    hasEncryptedVaultKey,
} from "../lib/agent-key-store.js";
import { DIARY_IMG_POOL } from "./diary-demo-data.js";

const ZG_RPC     = "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";
const ZG_CHAIN   = "https://chainscan-galileo.0g.ai";
const ZG_STORAGE = "https://storagescan-galileo.0g.ai";

/** One-shot PIN setup for migration: encrypt legacy plain key with a new PIN. */
function _showPinSetupInline(plainKey, encryptFn) {
    return new Promise((resolve, reject) => {
        const overlay = document.createElement("div");
        overlay.className = "lc-pin-overlay";
        overlay.innerHTML = `
            <div class="lc-pin-modal">
                <div class="lc-pin-head">Secure your agent key</div>
                <p class="lc-pin-desc">Set a PIN to encrypt your agent key. You'll need it each time your agent acts on-chain.</p>
                <input class="lc-pin-input" id="lc-mig-a" type="password" inputmode="numeric" maxlength="12" placeholder="choose a PIN" autocomplete="new-password" />
                <input class="lc-pin-input" id="lc-mig-b" type="password" inputmode="numeric" maxlength="12" placeholder="confirm PIN" autocomplete="new-password" />
                <div class="lc-pin-error" id="lc-mig-err"></div>
                <div class="lc-pin-actions">
                    <button class="lc-agentic-register-btn" id="lc-mig-ok">Set PIN &amp; Continue</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("lc-pin-overlay--show"));

        const errEl = overlay.querySelector("#lc-mig-err");
        const pinA  = overlay.querySelector("#lc-mig-a");
        const pinB  = overlay.querySelector("#lc-mig-b");
        const btn   = overlay.querySelector("#lc-mig-ok");

        btn.addEventListener("click", async () => {
            const a = pinA.value, b = pinB.value;
            if (!a)      { errEl.textContent = "PIN cannot be empty."; return; }
            if (a !== b) { errEl.textContent = "PINs don't match."; return; }
            if (a.length < 4) { errEl.textContent = "At least 4 characters."; return; }
            btn.disabled = true;
            btn.innerHTML = `<span class="lc-agentic-spinner"></span>encrypting...`;
            try {
                await encryptFn(plainKey, a);
                overlay.classList.remove("lc-pin-overlay--show");
                setTimeout(() => overlay.remove(), 300);
                resolve();
            } catch {
                errEl.textContent = "Encryption failed.";
                btn.disabled = false;
                btn.textContent = "Set PIN & Continue";
            }
        });
        [pinA, pinB].forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); }));
        setTimeout(() => pinA.focus(), 100);
    });
}

/**
 * Show a PIN unlock modal. Returns decrypted private key string on success,
 * or rejects if the user cancels.
 */
function _promptPin() {
    return new Promise((resolve, reject) => {
        const overlay = document.createElement("div");
        overlay.className = "lc-pin-overlay";
        overlay.innerHTML = `
            <div class="lc-pin-modal">
                <div class="lc-pin-head">Agent PIN</div>
                <p class="lc-pin-desc">Enter your agent PIN to authorise this action.</p>
                <input class="lc-pin-input" id="lc-pin-unlock" type="password" inputmode="numeric"
                    maxlength="12" placeholder="enter PIN" autocomplete="current-password" />
                <div class="lc-pin-error" id="lc-pin-err"></div>
                <div class="lc-pin-actions">
                    <button class="btn btn-ghost btn-sm" id="lc-pin-cancel">cancel</button>
                    <button class="lc-agentic-register-btn" id="lc-pin-ok" style="flex:1">Unlock</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("lc-pin-overlay--show"));

        const errEl  = overlay.querySelector("#lc-pin-err");
        const inp    = overlay.querySelector("#lc-pin-unlock");
        const okBtn  = overlay.querySelector("#lc-pin-ok");
        const cancel = overlay.querySelector("#lc-pin-cancel");

        const dismiss = (err) => {
            overlay.classList.remove("lc-pin-overlay--show");
            setTimeout(() => overlay.remove(), 300);
            if (err) reject(err); else reject(new Error("cancelled"));
        };

        cancel.addEventListener("click", () => dismiss(null));
        overlay.addEventListener("click", ev => { if (ev.target === overlay) dismiss(null); });

        const tryUnlock = async () => {
            const pin = inp.value;
            if (!pin) { errEl.textContent = "PIN required."; return; }
            okBtn.disabled = true;
            okBtn.innerHTML = `<span class="lc-agentic-spinner"></span>`;
            errEl.textContent = "";
            try {
                const pk = await decryptStoredKey(pin);
                overlay.classList.remove("lc-pin-overlay--show");
                setTimeout(() => overlay.remove(), 300);
                resolve(pk);
            } catch {
                errEl.textContent = "Wrong PIN — try again.";
                inp.value = "";
                inp.focus();
                okBtn.disabled = false;
                okBtn.textContent = "Unlock";
            }
        };

        okBtn.addEventListener("click", tryUnlock);
        inp.addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
        setTimeout(() => inp.focus(), 100);
    });
}

/**
 * If vault key is not yet stored, shows a setup modal to enter the private key + pick a PIN.
 * If already stored, shows a PIN prompt.
 * Returns the PIN string (not the key) so swap.js can decrypt on its own.
 */
function _promptVaultPin() {
    return new Promise((resolve, reject) => {
        const overlay = document.createElement("div");
        overlay.className = "lc-pin-overlay";

        if (!hasEncryptedVaultKey()) {
            overlay.innerHTML = `
                <div class="lc-pin-modal">
                    <div class="lc-pin-head">Vault key setup</div>
                    <p class="lc-pin-desc">Paste the mutual vault private key, then set a PIN to encrypt it locally.</p>
                    <input class="lc-pin-input" id="lc-vk-key" type="password" maxlength="128"
                        placeholder="0x… vault private key" autocomplete="off" />
                    <input class="lc-pin-input" id="lc-vk-pin-a" type="password" inputmode="numeric"
                        maxlength="12" placeholder="choose a vault PIN" autocomplete="new-password" />
                    <input class="lc-pin-input" id="lc-vk-pin-b" type="password" inputmode="numeric"
                        maxlength="12" placeholder="confirm vault PIN" autocomplete="new-password" />
                    <div class="lc-pin-error" id="lc-vk-err"></div>
                    <div class="lc-pin-actions">
                        <button class="btn btn-ghost btn-sm" id="lc-vk-cancel">cancel</button>
                        <button class="lc-agentic-register-btn" id="lc-vk-ok" style="flex:1">Save &amp; Execute</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add("lc-pin-overlay--show"));

            const errEl = overlay.querySelector("#lc-vk-err");
            const keyInp = overlay.querySelector("#lc-vk-key");
            const pinA   = overlay.querySelector("#lc-vk-pin-a");
            const pinB   = overlay.querySelector("#lc-vk-pin-b");
            const okBtn  = overlay.querySelector("#lc-vk-ok");
            const cancel = overlay.querySelector("#lc-vk-cancel");

            const dismiss = () => {
                overlay.classList.remove("lc-pin-overlay--show");
                setTimeout(() => overlay.remove(), 300);
                reject(new Error("cancelled"));
            };
            cancel.addEventListener("click", dismiss);
            overlay.addEventListener("click", ev => { if (ev.target === overlay) dismiss(); });

            okBtn.addEventListener("click", async () => {
                const pk   = keyInp.value.trim();
                const pinV = pinA.value;
                if (!pk)        { errEl.textContent = "Private key required."; return; }
                if (!pinV)      { errEl.textContent = "PIN required."; return; }
                if (pinV !== pinB.value) { errEl.textContent = "PINs don't match."; return; }
                okBtn.disabled = true;
                okBtn.innerHTML = `<span class="lc-agentic-spinner"></span>encrypting…`;
                try {
                    await encryptAndStoreVaultKey(pk, pinV);
                    overlay.classList.remove("lc-pin-overlay--show");
                    setTimeout(() => overlay.remove(), 300);
                    resolve(pinV);
                } catch (e) {
                    errEl.textContent = `Error: ${e.message}`;
                    okBtn.disabled = false;
                    okBtn.textContent = "Save & Execute";
                }
            });
            setTimeout(() => keyInp.focus(), 100);
        } else {
            overlay.innerHTML = `
                <div class="lc-pin-modal">
                    <div class="lc-pin-head">Vault PIN</div>
                    <p class="lc-pin-desc">Enter your vault PIN to authorise this swap.</p>
                    <input class="lc-pin-input" id="lc-vp-unlock" type="password" inputmode="numeric"
                        maxlength="12" placeholder="vault PIN" autocomplete="current-password" />
                    <div class="lc-pin-error" id="lc-vp-err"></div>
                    <div class="lc-pin-actions">
                        <button class="btn btn-ghost btn-sm" id="lc-vp-cancel">cancel</button>
                        <button class="lc-agentic-register-btn" id="lc-vp-ok" style="flex:1">Execute swap</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add("lc-pin-overlay--show"));

            const errEl  = overlay.querySelector("#lc-vp-err");
            const inp    = overlay.querySelector("#lc-vp-unlock");
            const okBtn  = overlay.querySelector("#lc-vp-ok");
            const cancel = overlay.querySelector("#lc-vp-cancel");

            const dismiss = () => {
                overlay.classList.remove("lc-pin-overlay--show");
                setTimeout(() => overlay.remove(), 300);
                reject(new Error("cancelled"));
            };
            cancel.addEventListener("click", dismiss);
            overlay.addEventListener("click", ev => { if (ev.target === overlay) dismiss(); });

            const tryUnlock = async () => {
                const pin = inp.value;
                if (!pin) { errEl.textContent = "PIN required."; return; }
                okBtn.disabled = true;
                okBtn.innerHTML = `<span class="lc-agentic-spinner"></span>`;
                try {
                    await decryptStoredVaultKey(pin); // verify PIN is correct
                    overlay.classList.remove("lc-pin-overlay--show");
                    setTimeout(() => overlay.remove(), 300);
                    resolve(pin);
                } catch {
                    errEl.textContent = "Wrong PIN — try again.";
                    inp.value = "";
                    inp.focus();
                    okBtn.disabled = false;
                    okBtn.textContent = "Execute swap";
                }
            };
            okBtn.addEventListener("click", tryUnlock);
            inp.addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
            setTimeout(() => inp.focus(), 100);
        }
    });
}

function _showCopyToast(msg) {
    const id = "lc-profile-toast";
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.className = "lc-profile-toast";
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("lc-profile-toast--show");
    window.clearTimeout(_showCopyToast._t);
    _showCopyToast._t = window.setTimeout(() => el?.classList.remove("lc-profile-toast--show"), 1800);
}

function _showZgStoreModal(data, dateLabel) {
    const modal = document.getElementById("modal-zg-store");
    const body  = document.getElementById("zg-modal-body");
    const head  = modal?.querySelector(".lc-zg-store-head-title");
    if (!modal || !body) return;

    const clean = v => String(v || "").trim();
    const errMsg        = clean(data.error);
    const rootHash      = clean(data.rootHash);
    const txHash        = clean(data.txHash);
    const l1Url         = clean(data.l1TxUrl);
    const agentAddr     = clean(data.agentAddress);
    const retrieveUrl   = clean(data.retrieveUrl);
    const imageRootHash = clean(data.imageRootHash);
    const imageRetrUrl  = clean(data.imageRetrieveUrl);
    const storeUrl      = agentAddr ? `${ZG_STORAGE}/address/${agentAddr}` : "";

    if (errMsg) {
        if (head) head.textContent = "⚠ agent error";
        body.innerHTML = `
            <div class="zg-modal-label" style="color:var(--red)">storage failed</div>
            <div class="zg-modal-section">
                <div class="zg-modal-hash-row" style="border-color:rgba(226,75,74,0.4)">
                    <span class="zg-modal-hash" style="color:var(--red)">${errMsg}</span>
                </div>
            </div>`;
    } else {
        if (head) head.innerHTML = `<svg class="zg-head-heart" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> stored on 0G`;
        body.innerHTML = `
            <div class="zg-modal-label">episode stored on 0G</div>
            ${dateLabel ? `<div class="zg-modal-date">${dateLabel}</div>` : ""}
            <div class="zg-modal-section">
                <span class="zg-modal-key">journal root hash</span>
                <div class="zg-modal-hash-row">
                    <span class="zg-modal-hash">${rootHash || "—"}</span>
                    ${rootHash ? `<button class="lc-profile-icon-btn zg-copy-btn" data-copy="${rootHash}" title="copy"><svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : ""}
                </div>
            </div>
            ${imageRootHash ? `<div class="zg-modal-section">
                <span class="zg-modal-key">image root hash</span>
                <div class="zg-modal-hash-row">
                    <span class="zg-modal-hash">${imageRootHash}</span>
                    <button class="lc-profile-icon-btn zg-copy-btn" data-copy="${imageRootHash}" title="copy"><svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                    ${imageRetrUrl ? `<a class="lc-profile-icon-btn" href="${imageRetrUrl}" target="_blank" rel="noopener noreferrer" title="retrieve image"><svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ""}
                </div>
            </div>` : ""}
            ${txHash ? `<div class="zg-modal-section">
                <span class="zg-modal-key">transaction hash</span>
                <div class="zg-modal-hash-row">
                    <span class="zg-modal-hash">${txHash}</span>
                    <button class="lc-profile-icon-btn zg-copy-btn" data-copy="${txHash}" title="copy"><svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                    ${l1Url ? `<a class="lc-profile-icon-btn" href="${l1Url}" target="_blank" rel="noopener noreferrer" title="view on 0G Explorer"><svg class="lc-profile-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ""}
                </div>
            </div>` : ""}
            <div class="zg-modal-links">
                ${retrieveUrl ? `<a class="zg-modal-scan-link" href="${retrieveUrl}" target="_blank" rel="noopener noreferrer">retrieve journal →</a>` : ""}
                ${storeUrl ? `<a class="zg-modal-scan-link" href="${storeUrl}" target="_blank" rel="noopener noreferrer">view on StorageScan →</a>` : ""}
            </div>
        `;
    }

    body.querySelectorAll(".zg-copy-btn[data-copy]").forEach(btn => {
        btn.addEventListener("click", () => {
            const val = btn.dataset.copy;
            const doCopy = navigator.clipboard?.writeText
                ? navigator.clipboard.writeText(val)
                : Promise.reject();
            doCopy
                .then(() => _showCopyToast("Copied!"))
                .catch(() => _showCopyToast("Copy failed"));
        });
    });

    const closeBtn = document.getElementById("zg-modal-close");
    if (closeBtn) {
        const dismiss = () => modal.classList.add("hidden");
        closeBtn.onclick = dismiss;
        modal.onclick = ev => { if (ev.target === modal) dismiss(); };
    }

    modal.classList.remove("hidden");
}

export async function onDiaryStoreClick(btn) {
    const feed = document.getElementById("diary-feed");
    const selectedKey = feed?.dataset.selectedDate;
    if (!selectedKey) return;

    const mp = state.myProfile || {};
    if (!mp.agentWalletAddress) {
        _showZgStoreModal({ error: "No agent wallet — register your agent in your profile first." }, null);
        return;
    }

    // Migration: old key was stored plain in state — silently encrypt with default PIN
    const legacyKey = mp.agentWalletKey;
    if (!hasEncryptedKey() && legacyKey) {
        const { encryptAndStoreKey } = await import("../lib/agent-key-store.js");
        await encryptAndStoreKey(legacyKey, "0000");
        const cur = { ...state.myProfile };
        delete cur.agentWalletKey;
        state.myProfile = cur;
        saveState(state);
    }

    if (!hasEncryptedKey()) {
        _showZgStoreModal({ error: "Agent key not found — re-register your agent in your profile." }, null);
        return;
    }

    // Decrypt with default PIN (user-selectable PIN comes later)
    let decryptedKey;
    try {
        decryptedKey = await decryptStoredKey("0000");
    } catch {
        _showZgStoreModal({ error: "Could not decrypt agent key — please re-register your agent." }, null);
        return;
    }

    const [sy, sm, sd] = selectedKey.split("-").map(Number);
    const dateStr = new Date(sy, sm, sd).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    const myName      = state.myName      || "me";
    const partnerName = state.partnerName || "partner";

    // Build diary entries for this day with real author names
    const dayEntries = (state.diary || []).filter(e => {
        const d = new Date(e.ts);
        return d.getFullYear() === sy && d.getMonth() === sm && d.getDate() === sd;
    }).sort((a, b) => a.ts - b.ts);

    let noteEntries = state.calNotes?.[selectedKey] || [];
    if (typeof noteEntries === "string") noteEntries = noteEntries ? [{ text: noteEntries }] : [];

    // Resolve image path for this day
    const imgIdx  = sd % DIARY_IMG_POOL.length;
    const imgFile = DIARY_IMG_POOL[imgIdx];
    const imgPath = `/prototype/diary/images/${imgFile}`;

    const prevHTML = btn.innerHTML;
    btn.disabled = true;

    try {
        // Step 1: upload image
        btn.innerHTML = `<span class="lc-agentic-spinner"></span>uploading image...`;
        const imgResp  = await fetch(imgPath);
        if (!imgResp.ok) throw new Error(`image fetch failed: ${imgResp.status}`);
        const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
        const imgData  = await _zgUpload(imgBytes, decryptedKey);
        const imageRootHash = imgData.rootHash;

        // Step 2: upload JSON snapshot (references the image by hash)
        btn.innerHTML = `<span class="lc-agentic-spinner"></span>uploading journal...`;
        const snapshot = {
            schemaVersion: 2,
            coupleId: state.coupleId || "loveclaw",
            date: selectedKey,
            dateLabel: dateStr,
            myName,
            partnerName,
            agentWalletAddress: mp.agentWalletAddress || "",
            image: { file: imgFile, rootHash: imageRootHash, retrieveUrl: imgData.retrieveUrl },
            entries: dayEntries.map(e => ({
                ts: e.ts,
                author: e.author || myName,
                text: e.text,
            })),
            notes: noteEntries.map(n => ({
                ...n,
                author: (!n.author || n.author === "you") ? myName : n.author,
            })),
            storedAt: Date.now(),
        };
        const data = await _zgUpload(JSON.stringify(snapshot, null, 2), decryptedKey, imgData._deps);
        decryptedKey = null;
        data.agentAddress    = mp.agentWalletAddress || "";
        data.imageRootHash   = imageRootHash;
        data.imageRetrieveUrl= imgData.retrieveUrl;
        btn.innerHTML = "✓ stored on 0G!";
        setTimeout(() => { btn.innerHTML = prevHTML; btn.disabled = false; }, 4000);
        _showZgStoreModal(data, dateStr);
    } catch (err) {
        decryptedKey = null;
        console.error("[0g-store]", err);
        _showZgStoreModal({ error: String(err?.message || err) }, dateStr);
        btn.innerHTML = prevHTML;
        btn.disabled = false;
    }
}

async function _zgUpload(data, privateKey, _cachedDeps) {
    const deps = _cachedDeps ?? await Promise.all([
        import("https://esm.sh/@0gfoundation/0g-ts-sdk@1.2.6/browser"),
        import("https://esm.sh/ethers@6.13.0"),
    ]);
    const [{ Indexer, MemData }, { ethers }] = deps;

    const provider = new ethers.JsonRpcProvider(ZG_RPC);
    const signer   = new ethers.Wallet(privateKey, provider);
    const indexer  = new Indexer(ZG_INDEXER);
    const bytes    = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const mem      = new MemData(bytes);

    const [, treeErr] = await mem.merkleTree();
    if (treeErr) throw new Error(`merkle: ${treeErr}`);

    const [tx, uploadErr] = await indexer.upload(mem, ZG_RPC, signer);
    if (uploadErr) throw new Error(`upload: ${uploadErr}`);

    const t        = tx;
    const rootHash = t.rootHash ?? t.rootHashes?.[0] ?? "";
    const txHash   = t.txHash ?? t.txHashes?.[0] ?? null;
    const txSeq    = t.txSeq  ?? t.txSeqs?.[0]  ?? null;
    const clean    = v => (String(v ?? "").trim().length > 2 ? String(v) : null);

    return {
        rootHash,
        txHash:              clean(txHash),
        txSeq,
        l1TxUrl:             clean(txHash) ? `${ZG_CHAIN}/tx/${clean(txHash)}` : null,
        retrieveUrl:         rootHash ? `${ZG_INDEXER}/file?root=${encodeURIComponent(rootHash)}` : null,
        _deps:               deps,
    };
}
