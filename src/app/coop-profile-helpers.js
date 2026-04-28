export const PROFILE_ICON_PATHS = {
    mail: "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
    globe: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93V4.07C7.05 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-14zm2 0V4.07c3.95.49 7 3.85 7 7.93s-3.05 7.44-7 7.93v-14z",
    phone: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
    link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
    note: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
    clock: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
};

export function profileIconFilled(pathD) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "lc-profile-ico");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", pathD);
    p.setAttribute("fill", "currentColor");
    svg.appendChild(p);
    return svg;
}

export function initialsFromName(name, fallback) {
    const raw = String(name || fallback || "?").trim();
    return raw.slice(0, 2).toUpperCase() || "?";
}

export function getDeviceSummary() {
    const ua = navigator.userAgent || "";
    const platform = typeof navigator.userAgentData?.platform === "string"
        ? navigator.userAgentData.platform
        : (navigator.platform || "");
    const lang = navigator.language || "";
    const scr = typeof screen?.width === "number" ? `${screen.width}×${screen.height}` : "";
    const bits = [platform, lang, scr, ua.slice(0, 120) + (ua.length > 120 ? "…" : "")].filter(Boolean);
    return bits.join(" · ");
}

/**
 * Resize and re-encode as JPEG so avatars stay small for sync + localStorage.
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
export function compressImageToAvatarDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const maxSide = 128;
                let w = img.naturalWidth || img.width;
                let h = img.naturalHeight || img.height;
                if (!w || !h) {
                    reject(new Error("bad image"));
                    return;
                }
                if (w > maxSide || h > maxSide) {
                    const s = Math.min(maxSide / w, maxSide / h);
                    w = Math.round(w * s);
                    h = Math.round(h * s);
                }
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("no canvas"));
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.82));
            };
            img.onerror = () => reject(new Error("decode"));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
    });
}
