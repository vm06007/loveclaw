import QRCode from "qrcode";
import { wrapQrCanvas } from "../lib/invite.js";
import { isTauri } from "../lib/tauri.js";
import { bindInfoButtonWithTripleFullscreen } from "../lib/fullscreen-toggle.js";

let deferredPrompt = null;

/**
 * Show the install strip only on a desktop-class browser (mouse + wide viewport),
 * not on phones / most tablets or the Tauri shell.
 */
function isDesktopBrowserView() {
    if (typeof window === "undefined" || !window.matchMedia) {
        return false;
    }
    if (window.matchMedia("(pointer: coarse)").matches) {
        return false;
    }
    if (!window.matchMedia("(pointer: fine)").matches) {
        return false;
    }
    if (!window.matchMedia("(min-width: 768px)").matches) {
        return false;
    }
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
        return false;
    }
    return true;
}

/**
 * URL the phone should open: same page, with host swapped from loopback to LAN IP when possible
 * (Vite serves GET /local-ip; parent loveclaw also had signal-relay :9090/local-ip).
 */
async function urlForPhoneQr() {
    let url = window.location.href;
    const apply = ip => {
        if (ip && ip !== "127.0.0.1") {
            return url
                .replace(/127\.0\.0\.1/g, ip)
                .replace(/localhost/g, ip)
                .replace(/\[::1\]/g, ip);
        }
        return url;
    };
    try {
        const r = await fetch("/local-ip", { cache: "no-store" });
        if (r.ok) {
            const { ip } = await r.json();
            return apply(typeof ip === "string" ? ip : "");
        }
    } catch {
        /* dev server not running or no route */
    }
    try {
        const r = await fetch("http://127.0.0.1:9090/local-ip", { cache: "no-store" });
        if (r.ok) {
            const { ip } = await r.json();
            return apply(typeof ip === "string" ? ip : "");
        }
    } catch {
        /* loveclaw signal-relay optional */
    }
    return url;
}

function getStandalone() {
    return (
        (typeof navigator !== "undefined" && navigator.standalone === true) ||
        window.matchMedia("(display-mode: standalone)").matches
    );
}

function getIsIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function hideTopInstallBar() {
    const bar = document.getElementById("install-banner");
    if (bar) bar.classList.add("hidden");
    document.body.classList.remove("pwa-install-banner-on");
}

function hideModalInstallSection() {
    const installBlock = document.getElementById("modal-pwa-install-block");
    const installSep = document.getElementById("modal-pwa-sep");
    if (installBlock) installBlock.classList.add("hidden");
    if (installSep) installSep.classList.add("hidden");
}

/**
 * loveclaw-app.html installApp() — prompt() or ⊕ toast; iOS is handled on the bar button in initPWA, not here.
 */
async function installApp({ source = "bar" } = {}) {
    if (isTauri()) {
        return;
    }
    if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
            await deferredPrompt.userChoice;
        } catch (err) {
            /* */
        }
        deferredPrompt = null;
        sessionStorage.setItem("install-dismissed", "1");
        hideTopInstallBar();
        if (source === "modal") {
            hideModalInstallSection();
        }
        return;
    }
    showPwaToast("Use your browser's install option (⊕ in address bar)");
}

export function initDashboardShell() {
    initPwaSetupModal();
    initInstallBanner();
    registerServiceWorker();
    initDashInfoToggle();
}

function initDashInfoToggle() {
    const btn = document.getElementById("btn-dash-info");
    const hint = document.getElementById("dash-info-hint");
    if (!btn || !hint) return;
    const hintByTab = {
        today: "Trust scores and heartbeat pull live signals from LoveClaw when the desktop agent is running.",
        signals: "Pick what your on-device agent ingests vs what may be relayed to your partner. Pact rules can require agent access for specific signals.",
        diary: "Diary turns your recent activity signals into timeline entries to help you remember your day.",
        pact: "Pact shows your active rules and breach conditions agreed by both devices.",
        chat: "Chat and ping test end-to-end connection between both devices.",
    };
    const getActiveTabId = () => {
        const active = document.querySelector(".dash-tabs .tab.active");
        return active?.dataset?.tab || "today";
    };
    const updateHintForActiveTab = () => {
        const tabId = getActiveTabId();
        hint.textContent = hintByTab[tabId] || hintByTab.today;
    };
    bindInfoButtonWithTripleFullscreen(btn, () => {
        updateHintForActiveTab();
        hint.classList.toggle("hidden");
        btn.classList.toggle("is-on", !hint.classList.contains("hidden"));
    });
    document.querySelectorAll(".dash-tabs .tab").forEach(tab => {
        tab.addEventListener("click", () => {
            updateHintForActiveTab();
        });
    });
    updateHintForActiveTab();
}

function showPwaToast(msg) {
    const existing = document.getElementById("pwa-toast");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = "pwa-toast";
    el.className = "pwa-toast";
    el.setAttribute("role", "status");
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        el.classList.add("pwa-toast--show");
    });
    setTimeout(() => {
        el.classList.remove("pwa-toast--show");
        setTimeout(() => el.remove(), 300);
    }, 3200);
}

function initInstallBanner() {
    const bar = document.getElementById("install-banner");
    const textEl = document.getElementById("install-banner-text");
    const installBtn = document.getElementById("install-banner-btn");
    const no = document.getElementById("install-banner-dismiss");
    const qrBtn = document.getElementById("install-banner-qr");
    if (!bar || !no) return;

    if (qrBtn) {
        qrBtn.addEventListener("click", () => {
            const openQr = document.getElementById("btn-qr-phone");
            if (openQr) openQr.click();
        });
    }

    const tauri = isTauri();
    const isIOS = getIsIOS();

    if (textEl) {
        textEl.textContent = "Add LoveClaw as Application";
    }

    const canShowStrip = () =>
        !tauri && !getStandalone() && !sessionStorage.getItem("install-dismissed") && isDesktopBrowserView();

    const applyStripVisibility = () => {
        if (canShowStrip()) {
            bar.classList.remove("hidden");
            document.body.classList.add("pwa-install-banner-on");
        } else {
            bar.classList.add("hidden");
            document.body.classList.remove("pwa-install-banner-on");
        }
    };

    applyStripVisibility();
    window.addEventListener("resize", applyStripVisibility);
    window.addEventListener("orientationchange", applyStripVisibility);

    /* loveclaw-app: Install → prompt or ⊕ toast; iOS (desktop iPad only here) → Share. Tauri → toast. */
    if (installBtn) {
        if (tauri) {
            installBtn.addEventListener("click", () => {
                showPwaToast(
                    "PWA “Install” works in Chrome or Safari in the browser — not inside this desktop app."
                );
            });
        } else if (isIOS) {
            installBtn.addEventListener("click", () => {
                showPwaToast('Tap Share ⬆ then "Add to Home Screen"');
            });
        } else {
            installBtn.addEventListener("click", () => installApp({ source: "bar" }));
        }
    }

    window.addEventListener("beforeinstallprompt", e => {
        if (tauri) return;
        e.preventDefault();
        deferredPrompt = e;
        applyStripVisibility();
    });

    no.addEventListener("click", () => {
        sessionStorage.setItem("install-dismissed", "1");
        applyStripVisibility();
    });

    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        sessionStorage.setItem("install-dismissed", "1");
        applyStripVisibility();
        showPwaToast("LoveClaw installed!");
    });
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const local =
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1" ||
        location.hostname === "[::1]";
    if (location.protocol !== "https:" && !local) return;
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    });
}

function initPwaSetupModal() {
    const modal = document.getElementById("modal-pwa-setup");
    const target = document.getElementById("modal-qr-target");
    const urlEl = document.getElementById("modal-qr-url");
    const closeBtn = document.getElementById("modal-pwa-close");
    const installBlock = document.getElementById("modal-pwa-install-block");
    const installSep = document.getElementById("modal-pwa-sep");
    const installBtn = document.getElementById("modal-pwa-install-btn");
    const installHint = document.getElementById("modal-pwa-install-hint");

    if (!modal || !target || !urlEl || !closeBtn) return;

    const isIOS = getIsIOS();

    if (installBtn) {
        installBtn.addEventListener("click", () => {
            if (isTauri()) return;
            if (isIOS) {
                showPwaToast('Tap Share ⬆ then "Add to Home Screen"');
            } else {
                installApp({ source: "modal" });
            }
        });
    }
    if (installHint) {
        installHint.textContent = isIOS
            ? 'On this device: tap Share ⬆, then "Add to Home Screen".'
            : "On this device: add LoveClaw to your home screen or app list when your browser offers it.";
    }

    const close = () => {
        modal.classList.add("hidden");
        target.innerHTML = "";
    };

    const open = async () => {
        const tauri = isTauri();
        const standalone = getStandalone();
        if (installBlock) {
            installBlock.classList.toggle("hidden", tauri || standalone);
        }
        if (installSep) {
            installSep.classList.toggle("hidden", tauri || standalone);
        }

        const url = await urlForPhoneQr();
        urlEl.textContent = url;
        target.innerHTML = "";
        modal.classList.remove("hidden");
        try {
            const canvas = await QRCode.toCanvas(url, {
                width: 200,
                margin: 1,
                color: { dark: "#07070fff", light: "#ffffffff" },
            });
            target.appendChild(wrapQrCanvas(canvas));
        } catch (e) {
            urlEl.textContent = "Could not build QR — copy the URL from the address bar.";
        }
    };

    for (const id of ["home-qr-btn", "btn-qr-phone"]) {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", open);
    }

    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", e => {
        if (e.target === modal) close();
    });
}
