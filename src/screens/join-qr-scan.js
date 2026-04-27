import jsQR from "jsqr";
import { parsePactFromInviteField } from "../lib/invite.js";

let stream = null;
let scanRafId = null;
let videoEl = null;
let lastInvalidQrPayload = "";
let lastQrFeedback = "";
let acceptTimer = null;
/** @type {AudioContext | null} */
let qrAudioCtx = null;

function clearAcceptTimer() {
    if (acceptTimer != null) {
        clearTimeout(acceptTimer);
        acceptTimer = null;
    }
}

function hidePickedQr() {
    const wrap = document.getElementById("join-qr-picked-wrap");
    const pre = document.getElementById("join-qr-picked-data");
    if (wrap) {
        wrap.classList.add("hidden");
    }
    if (pre) {
        pre.textContent = "";
    }
}

/**
 * @param {string} raw
 */
function showPickedQrData(raw) {
    const wrap = document.getElementById("join-qr-picked-wrap");
    const pre = document.getElementById("join-qr-picked-data");
    if (!wrap || !pre) {
        return;
    }
    const max = 4000;
    const shown =
        raw.length > max ? `${raw.slice(0, max)}\n… (${raw.length} chars total)` : raw;
    pre.textContent = shown;
    wrap.classList.remove("hidden");
}

function playQrPickedSound() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
            return;
        }
        if (!qrAudioCtx || qrAudioCtx.state === "closed") {
            qrAudioCtx = new AC();
        }
        const ctx = qrAudioCtx;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(784, ctx.currentTime);
        o.frequency.setValueAtTime(1048, ctx.currentTime + 0.07);
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + 0.2);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.22);
        ctx.resume().catch(() => {});
    } catch (_) {
        /* ignore */
    }
}

function feedbackForNewQrPayload(raw) {
    if (!raw || raw === lastQrFeedback) {
        return;
    }
    lastQrFeedback = raw;
    playQrPickedSound();
    showPickedQrData(raw);
}

function hasCameraApi() {
    return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

function styleHostMessage(host, text) {
    host.textContent = text;
    host.style.color = "var(--text-dim)";
    host.style.fontSize = "8px";
    host.style.padding = "12px";
    host.style.display = "flex";
    host.style.alignItems = "center";
    host.style.justifyContent = "center";
}

function stopScanner() {
    clearAcceptTimer();
    if (scanRafId != null) {
        cancelAnimationFrame(scanRafId);
        scanRafId = null;
    }
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
    if (videoEl) {
        videoEl.srcObject = null;
        videoEl.remove();
        videoEl = null;
    }
    const host = document.getElementById("join-qr-video-host");
    if (host) {
        host.replaceChildren();
        host.style.color = "";
        host.style.fontSize = "";
        host.style.padding = "";
        host.style.display = "";
        host.style.alignItems = "";
        host.style.justifyContent = "";
    }
    lastInvalidQrPayload = "";
    lastQrFeedback = "";
    hidePickedQr();
}

function tryDecodeFromCanvas(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) {
        return null;
    }
    const imageData = ctx.getImageData(0, 0, w, h);
    return jsQR(imageData.data, w, h, { inversionAttempts: "attemptBoth" });
}

/**
 * @param {string} raw
 * @param {() => HTMLTextAreaElement | null} getTextarea
 * @param {HTMLElement} modal
 * @returns {boolean} true if accepted
 */
function acceptDecodedPayload(raw, getTextarea, modal) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return false;
    }
    const pact = parsePactFromInviteField(trimmed);
    if (!pact) {
        return false;
    }
    const ta = getTextarea();
    if (ta) {
        ta.value = trimmed;
        ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    modal.classList.add("hidden");
    stopScanner();
    return true;
}

async function requestVideoStream() {
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
        });
    } catch (e) {
        if (e?.name === "OverconstrainedError" || e?.name === "ConstraintNotSatisfiedError") {
            return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        throw e;
    }
}

/**
 * @param {HTMLElement} modal
 * @param {() => HTMLTextAreaElement | null} getTextarea
 */
async function startScanner(modal, getTextarea) {
    const host = document.getElementById("join-qr-video-host");
    if (!host) {
        return;
    }
    stopScanner();

    if (!window.isSecureContext) {
        styleHostMessage(
            host,
            "The camera API is blocked on plain http:// (except localhost). Use https:// to open this app, or use “use camera photo” / paste the invite code.",
        );
        return;
    }
    if (!hasCameraApi()) {
        styleHostMessage(
            host,
            "This page does not expose getUserMedia (often insecure http). Use https://, or “use camera photo”, or paste the code.",
        );
        return;
    }

    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("autoplay", "");
    video.muted = true;
    video.playsInline = true;
    video.className = "join-qr-video";
    host.appendChild(video);
    videoEl = video;
    try {
        stream = await requestVideoStream();
    } catch (e) {
        stopScanner();
        const h = document.getElementById("join-qr-video-host");
        if (!h) {
            return;
        }
        let msg =
            "Could not open the camera. Use “use camera photo” or paste the code.";
        if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
            msg =
                "Camera access was blocked. Tap the lock or “AA” in the address bar → allow Camera for this site, then tap “start camera” again. Or use “use camera photo”.";
        } else if (e?.name === "NotFoundError" || e?.name === "DevicesNotFoundError") {
            msg = "No camera found on this device. Use “use camera photo” or paste the invite code.";
        }
        styleHostMessage(h, msg);
        return;
    }
    video.srcObject = stream;
    await new Promise((resolve, reject) => {
        const ok = () => {
            video.removeEventListener("loadedmetadata", ok);
            video.removeEventListener("error", bad);
            resolve();
        };
        const bad = () => {
            video.removeEventListener("loadedmetadata", ok);
            video.removeEventListener("error", bad);
            reject(new Error("video"));
        };
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            resolve();
            return;
        }
        video.addEventListener("loadedmetadata", ok, { once: true });
        video.addEventListener("error", bad, { once: true });
    });
    await video.play().catch(() => {});

    /*
     * Live decode: match simple-payment-link-verse/components/qr-scanner.tsx —
     * full camera frame + requestAnimationFrame (downscaled setInterval missed phone-screen QRs).
     */
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
        return;
    }

    function scanFrame() {
        if (!video.isConnected) {
            return;
        }
        if (video.readyState < video.HAVE_ENOUGH_DATA) {
            scanRafId = requestAnimationFrame(scanFrame);
            return;
        }
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) {
            scanRafId = requestAnimationFrame(scanFrame);
            return;
        }
        canvas.width = vw;
        canvas.height = vh;
        ctx.drawImage(video, 0, 0, vw, vh);
        const imageData = ctx.getImageData(0, 0, vw, vh);
        let r = jsQR(imageData.data, imageData.width, imageData.height);
        if (!r) {
            r = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth",
            });
        }
        if (r?.data) {
            const raw = r.data.trim();
            if (!raw) {
                scanRafId = requestAnimationFrame(scanFrame);
                return;
            }
            const pact = parsePactFromInviteField(raw);
            if (pact) {
                feedbackForNewQrPayload(raw);
                if (scanRafId != null) {
                    cancelAnimationFrame(scanRafId);
                    scanRafId = null;
                }
                clearAcceptTimer();
                acceptTimer = window.setTimeout(() => {
                    acceptTimer = null;
                    acceptDecodedPayload(raw, getTextarea, modal);
                }, 900);
                return;
            }
            if (raw !== lastInvalidQrPayload) {
                lastInvalidQrPayload = raw;
                feedbackForNewQrPayload(raw);
                alert("That QR is not a LoveClaw invite — try another or paste the code.");
            }
        }
        scanRafId = requestAnimationFrame(scanFrame);
    }
    scanRafId = requestAnimationFrame(scanFrame);
}

/**
 * @param {File} file
 * @param {() => HTMLTextAreaElement | null} getTextarea
 * @param {HTMLElement} modal
 */
function decodeFromFile(file, getTextarea, modal) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const max = 1200;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const s = Math.min(1, max / w, max / h);
        w = Math.floor(w * s);
        h = Math.floor(h * s);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const r = tryDecodeFromCanvas(canvas);
        if (!r?.data) {
            alert("No QR found in that image — try again.");
            return;
        }
        const raw = r.data.trim();
        feedbackForNewQrPayload(raw);
        const pact = parsePactFromInviteField(raw);
        if (pact) {
            clearAcceptTimer();
            acceptTimer = window.setTimeout(() => {
                acceptTimer = null;
                acceptDecodedPayload(raw, getTextarea, modal);
            }, 900);
            return;
        }
        alert("That image is not a LoveClaw invite QR — try again or paste the code.");
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        alert("Could not read that image.");
    };
    img.src = url;
}

function updateStartCameraButton(startCam, canUseLive) {
    if (!startCam) {
        return;
    }
    if (canUseLive) {
        startCam.classList.remove("hidden");
        startCam.disabled = false;
    } else {
        startCam.classList.add("hidden");
        startCam.disabled = true;
    }
}

/**
 * @param {() => HTMLTextAreaElement | null} getTextarea
 */
export function initJoinQrScan(getTextarea) {
    const btn = document.getElementById("btn-join-scan-qr");
    const modal = document.getElementById("join-qr-scan-modal");
    const cancel = document.getElementById("btn-join-scan-cancel");
    const photo = document.getElementById("join-qr-photo");
    const startCam = document.getElementById("btn-join-start-camera");
    if (!btn || !modal || typeof getTextarea !== "function") {
        return;
    }

    const close = () => {
        modal.classList.add("hidden");
        stopScanner();
        if (qrAudioCtx && qrAudioCtx.state !== "closed") {
            qrAudioCtx.close().catch(() => {});
            qrAudioCtx = null;
        }
        updateStartCameraButton(startCam, window.isSecureContext && hasCameraApi());
    };

    btn.addEventListener("click", () => {
        modal.classList.remove("hidden");
        stopScanner();
        const host = document.getElementById("join-qr-video-host");
        const canLive = window.isSecureContext && hasCameraApi();
        updateStartCameraButton(startCam, canLive);

        if (!canLive && host) {
            if (!window.isSecureContext) {
                styleHostMessage(
                    host,
                    "Live camera needs https:// (or http://localhost). This URL is not secure, so the browser hides the camera. Use HTTPS, or “use camera photo”, or paste the code.",
                );
            } else {
                styleHostMessage(
                    host,
                    "Camera API is not available in this browser. Use “use camera photo” or paste the code.",
                );
            }
        }
    });

    if (startCam) {
        startCam.addEventListener("click", async () => {
            startCam.disabled = true;
            try {
                await startScanner(modal, getTextarea);
            } catch (e) {
                console.warn("[join-qr] camera", e);
                const host = document.getElementById("join-qr-video-host");
                if (host && !host.querySelector("video") && !String(host.textContent ?? "").trim()) {
                    styleHostMessage(host, "Camera error — use “use camera photo” or paste the code.");
                }
            } finally {
                const host = document.getElementById("join-qr-video-host");
                if (!host?.querySelector("video")) {
                    startCam.disabled = false;
                }
            }
        });
    }

    if (cancel) {
        cancel.addEventListener("click", close);
    }
    modal.addEventListener("click", e => {
        if (e.target === modal) {
            close();
        }
    });

    if (photo) {
        photo.addEventListener("change", e => {
            const f = e.target.files?.[0];
            if (f) {
                decodeFromFile(f, getTextarea, modal);
            }
            e.target.value = "";
        });
    }
}
