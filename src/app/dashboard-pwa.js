import QRCode from "qrcode";
import { isTauri } from "../lib/tauri.js";

let deferredPrompt = null;

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

export function initDashboardShell() {
    initPwaSetupModal();
    if (!isTauri()) {
        initInstallBanner();
        initHomePwaCta();
    }
    registerServiceWorker();
    initDashInfoToggle();
}

function initHomePwaCta() {
    const wrap = document.getElementById("home-pwa-cta");
    if (wrap) wrap.classList.remove("hidden");
}

function initDashInfoToggle() {
    const btn = document.getElementById("btn-dash-info");
    const hint = document.getElementById("dash-info-hint");
    if (!btn || !hint) return;
    btn.addEventListener("click", () => {
        hint.classList.toggle("hidden");
        btn.classList.toggle("is-on", !hint.classList.contains("hidden"));
    });
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
    const no = document.getElementById("install-banner-dismiss");
    if (!bar || !no) return;

    const isIOS = getIsIOS();
    const isStandalone = getStandalone();

    if (textEl) {
        textEl.textContent = isIOS
            ? "Add to home and open on your phone"
            : "Add the app and open on your phone";
    }

    const showBar = () => {
        bar.classList.remove("hidden");
        document.body.classList.add("pwa-install-banner-on");
    };
    const hideBar = () => {
        bar.classList.add("hidden");
        document.body.classList.remove("pwa-install-banner-on");
    };

    if (!isStandalone && !sessionStorage.getItem("install-dismissed")) {
        showBar();
    }

    window.addEventListener("beforeinstallprompt", e => {
        e.preventDefault();
        deferredPrompt = e;
        if (!isStandalone && !sessionStorage.getItem("install-dismissed")) {
            showBar();
        }
    });

    no.addEventListener("click", () => {
        sessionStorage.setItem("install-dismissed", "1");
        hideBar();
    });

    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        sessionStorage.setItem("install-dismissed", "1");
        hideBar();
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

    const hideTopInstallBar = () => {
        const bar = document.getElementById("install-banner");
        if (bar) bar.classList.add("hidden");
        document.body.classList.remove("pwa-install-banner-on");
    };

    const runModalInstall = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            try {
                await deferredPrompt.userChoice;
            } catch (err) {
                /* */
            }
            deferredPrompt = null;
            sessionStorage.setItem("install-dismissed", "1");
            if (installBlock) installBlock.classList.add("hidden");
            if (installSep) installSep.classList.add("hidden");
            hideTopInstallBar();
            return;
        }
        if (isIOS) {
            showPwaToast('Tap Share ⬆ then "Add to Home Screen"');
        } else {
            showPwaToast("Use your browser's install option (⊕ in the address bar)");
        }
    };

    if (installBtn) {
        installBtn.addEventListener("click", runModalInstall);
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
            target.appendChild(canvas);
        } catch (e) {
            urlEl.textContent = "Could not build QR — copy the URL from the address bar.";
        }
    };

    const ids = [
        "install-banner-open",
        "home-btn-pwa-setup",
        "btn-qr-phone",
    ];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", open);
    }

    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", e => {
        if (e.target === modal) close();
    });
}
