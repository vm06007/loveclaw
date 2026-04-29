import L from "leaflet";

/** DivIcon box must match CSS layout so the map pin sits on the sprite’s feet. */
export const HB_ICON_W = 100;
export const HB_ICON_H = 136;
export const HB_ANCHOR_X = HB_ICON_W / 2;
export const HB_ANCHOR_Y = HB_ICON_H;

function pickVariantForName(name) {
    const n = String(name || "").trim().toLowerCase();
    if (!n) {
        return "boy";
    }
    if (n.startsWith("alice")) {
        return "girl";
    }
    if (n.startsWith("boris")) {
        return "boy";
    }
    let h = 0;
    for (let i = 0; i < n.length; i += 1) {
        h = (h * 31 + n.charCodeAt(i)) | 0;
    }
    return (h & 1) ? "girl" : "boy";
}

function esc(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
}

function normalizeAvatarDataUrl(value) {
    const url = String(value || "").trim();
    return url.startsWith("data:image/") ? url : "";
}

function initialsForName(name, fallback) {
    const raw = String(name || fallback || "?").trim();
    if (!raw) {
        return "?";
    }
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
}

function parseBattery(value) {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") {
        return { pct: null, charging: false, raw };
    }
    const m = raw.match(/(\d{1,3})\s*%/);
    const pct = m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null;
    const charging = /charg/i.test(raw);
    return { pct, charging, raw };
}

function formatRelTime(ts) {
    if (!ts) {
        return "no ping yet";
    }
    const diff = Math.max(0, Date.now() - ts);
    const sec = Math.floor(diff / 1000);
    if (sec < 10) {
        return "just now";
    }
    if (sec < 60) {
        return `${sec}s ago`;
    }
    const min = Math.floor(sec / 60);
    if (min < 60) {
        return `${min}m ago`;
    }
    const hr = Math.floor(min / 60);
    if (hr < 24) {
        return `${hr}h ago`;
    }
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
}

function batteryIconSvg({ pct, charging }) {
    const has = typeof pct === "number" && Number.isFinite(pct);
    const fillW = has ? Math.max(1, Math.round((pct / 100) * 14)) : 0;
    let fillColor = "#3daa6a";
    if (has) {
        if (pct <= 15 && !charging) {
            fillColor = "#c93c50";
        } else if (pct <= 35 && !charging) {
            fillColor = "#e0a23a";
        }
    } else {
        fillColor = "#7a7a8a";
    }
    const fillRect = has
        ? `<rect x="2" y="2" width="${fillW}" height="6" fill="${fillColor}"/>`
        : "";
    const bolt = charging
        ? `<g shape-rendering="crispEdges">
             <rect x="8" y="2" width="2" height="3" fill="#fff36b"/>
             <rect x="6" y="3" width="2" height="2" fill="#fff36b"/>
             <rect x="9" y="4" width="2" height="2" fill="#fff36b"/>
             <rect x="7" y="5" width="2" height="3" fill="#fff36b"/>
             <rect x="5" y="6" width="2" height="2" fill="#fff36b"/>
             <rect x="8" y="2" width="2" height="3" stroke="#1a1a2e" stroke-width="0.6" fill="none"/>
           </g>`
        : "";
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" width="20" height="10" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="0" y="0" width="18" height="10" fill="none" stroke="#1a1a2e" stroke-width="1"/>
  <rect x="18" y="3" width="2" height="4" fill="#1a1a2e"/>
  ${fillRect}
  ${bolt}
</svg>`;
}

function makeChibiMapIcon({ name, initialsName, battery, status, lastPingTs, variant, avatarDataUrl }) {
    const rawN = (name || "").trim() || (variant === "girl" ? "partner" : "you");
    const rawSt = String(status ?? "").trim();
    const bat = parseBattery(battery);
    const n = esc(rawN.slice(0, 22));
    const batPctText = bat.pct !== null ? `${bat.pct}%` : "—";
    const timeText = formatRelTime(lastPingTs);
    const ariaParts = [
        rawN.slice(0, 22),
        bat.pct !== null
            ? `${bat.pct}% battery${bat.charging ? ", charging" : ""}`
            : "battery unavailable",
        `last ping ${timeText}`,
    ];
    if (rawSt) {
        ariaParts.push(rawSt.slice(0, 24));
    }
    const aria = esc(ariaParts.join(", "));
    const statRow = rawSt
        ? `<div class="hb-map-pin-stat">${esc(rawSt.slice(0, 24))}</div>`
        : "";
    const batSvg = batteryIconSvg(bat);
    const batRow = `
    <div class="hb-map-pin-bat">
      <span class="hb-map-pin-bat-icon">${batSvg}</span>
      <span class="hb-map-pin-bat-pct">${esc(batPctText)}</span>
    </div>`;
    const timeRow = `<div class="hb-map-pin-time">${esc(timeText)}</div>`;
    const avatarUrl = normalizeAvatarDataUrl(avatarDataUrl);
    const initialsSource = String(initialsName || rawN || "").trim();
    const fallbackInitials = initialsForName(initialsSource, variant === "girl" ? "PT" : "ME");
    const avatarInner = avatarUrl
        ? `<img src="${esc(avatarUrl)}" alt="" loading="lazy" decoding="async"
            style="width:100%;height:100%;object-fit:cover;display:block;"/>`
        : `<span style="font-family:var(--font-pixel, monospace);font-size:20px;font-weight:900;letter-spacing:0.5px;color:#f5f5ff;">${esc(fallbackInitials)}</span>`;
    const avatarBg = variant === "girl" ? "#7e63ff" : "#31c59e";
    const avatarOutline = variant === "girl" ? "#2f1e91" : "#0d5b4b";
    const sprite = `
<div style="position:relative;width:58px;height:68px;display:flex;align-items:flex-start;justify-content:center;">
  <div style="position:relative;width:50px;height:50px;border-radius:50%;overflow:hidden;background:${avatarBg};border:3px solid #ffffff;box-shadow:0 0 0 3px ${avatarOutline};display:flex;align-items:center;justify-content:center;">
    ${avatarInner}
  </div>
  <div aria-hidden="true" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-top:18px solid ${avatarOutline};"></div>
  <div aria-hidden="true" style="position:absolute;left:50%;bottom:3px;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:13px solid #ffffff;"></div>
</div>`;
    const variantClass = variant === "girl" ? " hb-map-pin--partner" : "";
    const html = `
<div class="hb-map-pin${variantClass}">
  <div class="hb-map-pin-meta" role="img" aria-label="${aria}">
    <div class="hb-map-pin-name">${n}</div>
    ${batRow}
    ${timeRow}
    ${statRow}
  </div>
  <div class="hb-map-pin-tail" aria-hidden="true"></div>
  <div class="hb-map-pin-sprite" aria-hidden="true">${sprite}</div>
</div>`;
    return L.divIcon({
        className: "hb-map-divicon",
        html,
        iconSize: [HB_ICON_W, HB_ICON_H],
        iconAnchor: [HB_ANCHOR_X, HB_ANCHOR_Y],
        popupAnchor: [0, -HB_ANCHOR_Y],
    });
}

export function makeYouMapIcon(opts) {
    return makeChibiMapIcon({
        ...opts,
        // Keep "you" marker color consistent with Today header (green/teal side).
        variant: "boy",
    });
}

export function makePartnerMapIcon(opts) {
    return makeChibiMapIcon({
        ...opts,
        // Keep partner marker color consistent with Today header (purple side).
        variant: "girl",
    });
}
