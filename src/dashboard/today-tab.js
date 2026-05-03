import { state, saveState } from "../lib/state.js";
import { refreshVaultDisplay, getVaultAddress } from "../app/ping.js";

const _streakClickTracker = { index: -1, count: 0, timer: null };

function setTodayAvatarButton(el, initials, avatarDataUrl) {
    if (!el) {
        return;
    }
    el.replaceChildren();
    el.style.color = "";
    const url = typeof avatarDataUrl === "string" && avatarDataUrl.startsWith("data:image/")
        ? avatarDataUrl
        : "";
    if (url) {
        const img = document.createElement("img");
        img.className = "lc-today-avatar-img";
        img.alt = "";
        img.draggable = false;
        img.src = url;
        el.appendChild(img);
    } else {
        el.textContent = initials;
    }
}

function trustNameLabel(raw, fallback) {
    const s = String(raw != null && raw !== "" ? raw : fallback)
        .trim()
        .slice(0, 10) || fallback;
    if (!s) {
        return fallback;
    }
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function renderTodayTab() {
    const meAv = document.getElementById("today-avatar-me");
    const ptAv = document.getElementById("today-avatar-partner");
    const la = document.getElementById("today-label-me");
    const lb = document.getElementById("today-label-partner");
    const rawMe = (state.myName || "?").trim();
    const rawPt = (state.partnerName || "?").trim();
    const nMe = rawMe.slice(0, 2).toUpperCase() || "?";
    const nPt = rawPt.slice(0, 2).toUpperCase() || "?";
    const myPh = state.myProfile?.avatarDataUrl;
    const ptPh = state.partnerProfile?.avatarDataUrl;
    setTodayAvatarButton(meAv, nMe, myPh);
    if (state.paired) {
        setTodayAvatarButton(ptAv, nPt, ptPh);
    } else {
        setTodayAvatarButton(ptAv, "?", "");
    }
    if (ptAv) {
        ptAv.disabled = !state.paired;
    }
    if (la) la.textContent = state.myName || "You";
    if (lb) lb.textContent = state.paired ? (state.partnerName || "Partner") : "Partner";
    const coupleId = document.getElementById("today-couple-id");
    const pairedSince = document.getElementById("today-paired-since");
    if (coupleId) {
        coupleId.textContent = `couple id: ${state.coupleId || "—"}`;
    }
    if (pairedSince) {
        pairedSince.textContent = `paired since: ${state.createdAt ? new Date(state.createdAt).toLocaleDateString() : "—"}`;
    }
    const heartBtn = document.getElementById("today-heart-btn");
    const coupleInfo = document.getElementById("today-couple-info");
    if (heartBtn && coupleInfo && !heartBtn.dataset.bound) {
        heartBtn.addEventListener("click", () => {
            const willOpen = coupleInfo.classList.contains("hidden");
            coupleInfo.classList.toggle("hidden", !willOpen);
            heartBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        });
        heartBtn.dataset.bound = "1";
    }
    const budgetToggle = document.getElementById("today-budget-toggle");
    const budgetBreakdown = document.getElementById("today-budget-breakdown");
    const budgetRow = document.getElementById("today-budget-row");
    if (budgetToggle && budgetBreakdown && !budgetToggle.dataset.bound) {
        const toggleBudgetBreakdown = () => {
            const willOpen = budgetBreakdown.classList.contains("hidden");
            budgetBreakdown.classList.toggle("hidden", !willOpen);
            budgetToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
            budgetToggle.classList.toggle("today-budget-toggle--open", willOpen);
        };
        budgetToggle.addEventListener("click", (ev) => {
            ev.stopPropagation();
            toggleBudgetBreakdown();
        });
        budgetRow?.addEventListener("click", (ev) => {
            if (ev.target instanceof Element && ev.target.closest("#today-budget-swap-btn")) {
                return;
            }
            if (ev.target instanceof Element && ev.target.closest("#today-budget-qr-btn")) {
                return;
            }
            if (ev.target instanceof Element && ev.target.closest("#today-budget-send-btn")) {
                return;
            }
            toggleBudgetBreakdown();
        });
        budgetToggle.dataset.bound = "1";
    }
    const qrBtn = document.getElementById("today-budget-qr-btn");
    const vaultModal = document.getElementById("modal-vault-deposit");
    const vaultClose = document.getElementById("vault-deposit-close");
    const vaultCopy = document.getElementById("vault-deposit-copy");
    const vaultCopied = document.getElementById("vault-deposit-copied");
    const vaultAddr = document.getElementById("vault-deposit-addr");
    if (qrBtn && vaultModal && !qrBtn.dataset.bound) {
        qrBtn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            const vaultAddrStr = getVaultAddress();
            vaultModal.classList.remove("hidden");
            if (vaultAddr) vaultAddr.textContent = vaultAddrStr;
            const qrWrap = document.getElementById("vault-deposit-qr-wrap");
            if (qrWrap) {
                // Re-render QR each open so address changes are reflected
                qrWrap.innerHTML = "";
                delete qrWrap.dataset.rendered;
            }
            if (qrWrap && !qrWrap.dataset.rendered) {
                qrWrap.dataset.rendered = "1";
                try {
                    const { default: QRCode } = await import("qrcode");
                    const canvas = await QRCode.toCanvas(vaultAddrStr, {
                        width: 132,
                        margin: 1,
                        color: { dark: "#000000ff", light: "#ffffffff" },
                    });
                    qrWrap.appendChild(canvas);
                } catch {
                    qrWrap.textContent = vaultAddrStr;
                }
            }
        });
        vaultClose?.addEventListener("click", () => vaultModal.classList.add("hidden"));
        vaultModal.addEventListener("click", (ev) => {
            if (ev.target === vaultModal) vaultModal.classList.add("hidden");
        });
        vaultCopy?.addEventListener("click", () => {
            navigator.clipboard.writeText(vaultAddr?.textContent?.trim() || getVaultAddress()).then(() => {
                vaultCopied?.classList.remove("hidden");
                setTimeout(() => vaultCopied?.classList.add("hidden"), 1800);
            });
        });
        qrBtn.dataset.bound = "1";
    }
    const trustMe = document.getElementById("today-trust-me");
    const trustPt = document.getElementById("today-trust-partner");
    const labMe = document.getElementById("today-trust-label-me");
    const labPt = document.getElementById("today-trust-label-partner");
    if (trustMe) trustMe.textContent = String(state.trustScore ?? 100);
    if (trustPt) {
        if (state.paired) {
            const p = state.partnerTrustScore;
            const n = p != null && p !== "" && !Number.isNaN(Number(p)) ? Number(p) : 100;
            trustPt.textContent = String(n);
            trustPt.classList.remove("today-trust-score--muted");
        } else {
            trustPt.textContent = "—";
            trustPt.classList.add("today-trust-score--muted");
        }
    }
    if (labMe) {
        labMe.textContent = trustNameLabel(state.myName, "you");
    }
    if (labPt) {
        if (state.paired) {
            labPt.textContent = trustNameLabel(state.partnerName, "Partner");
        } else {
            labPt.textContent = "Partner";
        }
    }
    const dayPill = document.getElementById("today-day-pill");
    let days = 1;
    if (state.paired && state.createdAt) {
        const t = typeof state.createdAt === "number" ? state.createdAt : Date.parse(state.createdAt);
        if (!Number.isNaN(t)) {
            days = Math.max(1, Math.floor((Date.now() - t) / 86400000) + 1);
        }
    }
    if (dayPill) dayPill.textContent = `day ${days}`;
    const streakDays = document.getElementById("today-streak-days");
    if (streakDays) {
        streakDays.textContent = days === 1 ? "1 day" : `${days} days`;
    }
    document.querySelectorAll("#today-streak-cells .today-streak-cell").forEach((el, i) => {
        el.classList.toggle("filled", i < Math.min(7, days));
        if (!el.dataset.streakBound) {
            el.dataset.streakBound = "1";
            el.style.cursor = "pointer";
            el.addEventListener("click", () => {
                const targetDays = i + 1;
                const t = _streakClickTracker;
                if (t.index !== i) {
                    t.index = i;
                    t.count = 1;
                } else {
                    t.count += 1;
                }
                clearTimeout(t.timer);
                if (t.count >= 3) {
                    t.count = 0;
                    t.index = -1;
                    state.createdAt = Date.now() - (targetDays - 1) * 86400000;
                    saveState(state);
                    renderTodayTab();
                } else {
                    t.timer = setTimeout(() => { t.count = 0; t.index = -1; }, 800);
                }
            });
        }
    });

    const sendBtn = document.getElementById("today-budget-send-btn");
    if (sendBtn && !sendBtn.dataset.bound) {
        sendBtn.dataset.bound = "1";
        sendBtn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            if (!window.ethereum) {
                alert("No wallet found. Connect a wallet to send ETH.");
                return;
            }
            try {
                const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
                await window.ethereum.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: "0x1" }],
                });
                const from = accounts[0];
                const to = getVaultAddress();
                // 0.001 ETH = 1_000_000_000_000_000 wei = 0x38D7EA4C68000
                const txHash = await window.ethereum.request({
                    method: "eth_sendTransaction",
                    params: [{ from, to, value: "0x38D7EA4C68000" }],
                });
                sendBtn.title = `Sent! tx: ${txHash}`;
                setTimeout(() => void refreshVaultDisplay(), 4000);
            } catch (err) {
                if (err?.code !== 4001) {
                    // eslint-disable-next-line no-console
                    console.error("MetaMask send failed:", err);
                    alert(`Send failed: ${err?.message || err}`);
                }
            }
        });
    }

    void refreshVaultDisplay();
}

export function appendTodayHeartbeatEntry(line) {
    const sub = document.getElementById("today-hb-sub");
    if (sub) {
        sub.textContent = "today / last check just now";
    }
    const log = document.getElementById("today-hb-log");
    if (!log || !line) {
        return;
    }
    const row = document.createElement("div");
    row.className = "today-hb-entry";
    row.textContent = line;
    log.prepend(row);
    while (log.children.length > 24) {
        log.removeChild(log.lastChild);
    }
}

export function clearTodayHeartbeatLog() {
    const log = document.getElementById("today-hb-log");
    if (log) {
        log.replaceChildren();
    }
    const sub = document.getElementById("today-hb-sub");
    if (sub) {
        sub.textContent = "today / log cleared";
    }
}
