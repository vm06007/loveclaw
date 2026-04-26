import QRCode from "qrcode";

let deferredPrompt = null;

export function initDashboardShell() {
    initInstallBanner();
    initQrModal();
    registerServiceWorker();
    initDashInfoToggle();
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

function initInstallBanner() {
    const bar = document.getElementById("install-banner");
    const yes = document.getElementById("install-banner-btn");
    const no = document.getElementById("install-banner-dismiss");
    if (!bar || !yes || !no) return;

    window.addEventListener("beforeinstallprompt", e => {
        e.preventDefault();
        deferredPrompt = e;
        bar.classList.remove("hidden");
    });

    yes.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
            await deferredPrompt.userChoice;
        } catch (err) {
            /* */
        }
        deferredPrompt = null;
        bar.classList.add("hidden");
    });

    no.addEventListener("click", () => {
        bar.classList.add("hidden");
    });

    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        bar.classList.add("hidden");
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

function initQrModal() {
    const openBtn = document.getElementById("btn-qr-phone");
    const modal = document.getElementById("modal-qr-phone");
    const closeBtn = document.getElementById("modal-qr-close");
    const target = document.getElementById("modal-qr-target");
    const urlEl = document.getElementById("modal-qr-url");
    if (!openBtn || !modal || !closeBtn || !target || !urlEl) return;

    const close = () => {
        modal.classList.add("hidden");
        target.innerHTML = "";
    };

    openBtn.addEventListener("click", async () => {
        const url = window.location.href;
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
    });

    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", e => {
        if (e.target === modal) close();
    });
}
