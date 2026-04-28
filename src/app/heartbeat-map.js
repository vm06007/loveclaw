import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { state } from "../lib/state.js";
import { openCoopProfile } from "./coop-profile.js";
import { axl } from "../axl/client.js";
import { ipcSend } from "./ipc-send.js";
import { clearTodayHeartbeatLog } from "../dashboard/render.js";
import {
    MAPTILER_KEY,
    readBasemapPref,
    setBasemap,
    writeBasemapPref,
} from "./heartbeat-map-basemap.js";
import { makePartnerMapIcon, makeYouMapIcon } from "./heartbeat-map-icons.js";
import { parseLatLngFromSignalValue } from "./heartbeat-map-utils.js";

/** ~street level on OSM (maxZoom 19). */
const STREET_ZOOM = 17;

let hbMap = null;
let hbMarker = null;
let hbPartnerMarker = null;
let hbFocusedMarker = null;
let mapPaneVisible = false;
/** Periodic re-render so the relative ping time stays fresh while the pane is open. */
let hbTimeTicker = null;
/** Location-share state machine.
 *  - idle:      no sharing.
 *  - outgoing:  we sent a request, waiting for the partner to accept.
 *  - incoming:  partner sent us a request, our accept button is visible.
 *  - active:    both sides are sharing; partner marker is rendered.
 */
let hbShareState = "idle";
let hbShareControlEl = null;
let hbAcceptControlEl = null;
/** Coords reported by the partner (from share_location_request / _accept). */
let hbPartnerSharedCoords = null;
/** Name reported by the partner so the bubble shows the right label. */
let hbPartnerSharedName = "";
/** Stable simulated partner offset (~45m radius, randomized once per session). */
let hbPartnerOffset = null;
function getPartnerOffset() {
    if (hbPartnerOffset) {
        return hbPartnerOffset;
    }
    /** ~45m → 45 / 111_000 ≈ 0.000405°. Random direction so Alice/Boris don't always
     *  spawn on top of each other in side-by-side demos. */
    const angle = Math.random() * Math.PI * 2;
    const r = 0.0004;
    hbPartnerOffset = {
        dLat: Math.sin(angle) * r,
        dLng: Math.cos(angle) * r,
    };
    return hbPartnerOffset;
}
/** Simulated partner battery for the demo. */
const HB_PARTNER_BATTERY = "62%";

function latestSignalValue(type) {
    const hit = [...state.signals].reverse().find(x => x.type === type);
    return hit?.value ?? null;
}

/** Most recent timestamp across all signal types. */
function latestSignalTs() {
    let best = 0;
    for (const s of state.signals) {
        if (s && typeof s.ts === "number" && s.ts > best) {
            best = s.ts;
        }
    }
    return best || null;
}

export { parseLatLngFromSignalValue };

/** ~20% smaller per zoom level below `STREET_ZOOM` (stops at a floor so it stays visible). */
function hbMarkerScaleForZoom(zoom) {
    if (zoom >= STREET_ZOOM) {
        return 1;
    }
    const steps = STREET_ZOOM - zoom;
    return Math.max(0.44, Math.pow(0.8, steps));
}

/** Sprite SVG height in CSS px (must match the inline `height=` on the SVG). */
const HB_SPRITE_PX = 68;

function applyZoomScaleToMarker(marker, scale) {
    const el = typeof marker?.getElement === "function" ? marker.getElement() : null;
    if (!el) {
        return;
    }
    const sprite = el.querySelector?.(".hb-map-pin-sprite");
    const tail = el.querySelector?.(".hb-map-pin-tail");
    const meta = el.querySelector?.(".hb-map-pin-meta");
    if (sprite) {
        sprite.style.transform = `scale(${scale})`;
        sprite.style.transformOrigin = "50% 100%";
    }
    const drop = HB_SPRITE_PX * (1 - scale);
    if (tail) {
        tail.style.transform = `translateY(${drop}px)`;
    }
    if (meta) {
        meta.style.transform = `translateY(${drop}px)`;
    }
}

function syncHbMarkerZoomScale() {
    if (!hbMap) {
        return;
    }
    const s = hbMarkerScaleForZoom(hbMap.getZoom());
    /** Only the sprite shrinks with zoom; bubble + tail stay readable but slide
     * down to keep the bubble hugging the character's head instead of floating. */
    applyZoomScaleToMarker(hbMarker, s);
    applyZoomScaleToMarker(hbPartnerMarker, s);
}

function setMarkerForeground(marker) {
    if (!marker) {
        return;
    }
    const foregroundOffset = 1000;
    if (hbMarker && hbMarker !== marker) {
        hbMarker.setZIndexOffset(0);
    }
    if (hbPartnerMarker && hbPartnerMarker !== marker) {
        hbPartnerMarker.setZIndexOffset(0);
    }
    marker.setZIndexOffset(foregroundOffset);
    hbFocusedMarker = marker;
}

function bindMarkerBubbleClick(marker) {
    const root = typeof marker?.getElement === "function" ? marker.getElement() : null;
    if (!root) {
        return;
    }
    const bubble = root.querySelector?.(".hb-map-pin-meta");
    if (!bubble || bubble.dataset.markerBubbleBound === "1") {
        return;
    }
    bubble.dataset.markerBubbleBound = "1";
    const onBubblePointer = (ev) => {
        L.DomEvent.stopPropagation(ev);
        setMarkerForeground(marker);
    };
    L.DomEvent.on(bubble, "click", onBubblePointer);
    L.DomEvent.on(bubble, "dblclick", onBubblePointer);
    L.DomEvent.on(bubble, "mousedown", onBubblePointer);
    L.DomEvent.on(bubble, "touchstart", onBubblePointer);
}

function bindMarkerPinClick(marker, who) {
    const root = typeof marker?.getElement === "function" ? marker.getElement() : null;
    if (!root) {
        return;
    }
    const pin = root.querySelector?.(".hb-map-pin-sprite");
    if (!pin || pin.dataset.markerPinBound === "1") {
        return;
    }
    pin.dataset.markerPinBound = "1";
    const onPinPointer = (ev) => {
        L.DomEvent.stopPropagation(ev);
        setMarkerForeground(marker);
        openCoopProfile(who);
    };
    L.DomEvent.on(pin, "click", onPinPointer);
    L.DomEvent.on(pin, "touchstart", onPinPointer);
}

function focusHbMapOnCoords(lat, lng) {
    if (!hbMap) {
        return;
    }
    const eps = 0.000008;
    const b = L.latLngBounds([lat - eps, lng - eps], [lat + eps, lng + eps]);
    hbMap.fitBounds(b, {
        maxZoom: STREET_ZOOM,
        paddingTopLeft: L.point(32, 96),
        paddingBottomRight: L.point(32, 40),
        animate: false,
    });
}

/** Send a signed payload to the paired partner over both AXL (cross-device) and
 *  same-origin IPC (browser tabs). Mirrors the pattern used by other modules. */
function sendToPartner(payload) {
    try {
        if (axl.available && state.partnerAxlKey) {
            axl.send(state.partnerAxlKey, payload);
        }
    } catch {
        /* ignore network errors; IPC mirror still runs below */
    }
    try {
        ipcSend(payload);
    } catch {
        /* ignore */
    }
}

function getMyShareCoords() {
    return parseLatLngFromSignalValue(latestSignalValue("location"));
}

function makeShareControl() {
    const ShareControl = L.Control.extend({
        options: { position: "topright" },
        onAdd() {
            const container = L.DomUtil.create("div", "leaflet-bar leaflet-control hb-share-control");
            const a = L.DomUtil.create("a", "hb-share-btn", container);
            a.href = "#";
            a.role = "button";
            a.title = "Ask partner to share location";
            a.setAttribute("aria-label", "Ask partner to share location");
            /** Classic Material "share" glyph — three nodes connected with lines. */
            a.innerHTML = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path fill="currentColor"
        d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
</svg>`;
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(a, "click", (e) => {
                L.DomEvent.preventDefault(e);
                onShareControlClick();
            });
            hbShareControlEl = container;
            updateShareControlUi();
            return container;
        },
        onRemove() {
            hbShareControlEl = null;
        },
    });
    return new ShareControl();
}

/** Green-check accept control — shown only while we have an incoming request. */
function makeAcceptControl() {
    const AcceptControl = L.Control.extend({
        options: { position: "topright" },
        onAdd() {
            const container = L.DomUtil.create(
                "div",
                "leaflet-bar leaflet-control hb-accept-control hidden",
            );
            const a = L.DomUtil.create("a", "hb-accept-btn", container);
            a.href = "#";
            a.role = "button";
            a.title = "Accept partner's share request";
            a.setAttribute("aria-label", "Accept partner's share request");
            a.innerHTML = `
<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
  <path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
</svg>`;
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(a, "click", (e) => {
                L.DomEvent.preventDefault(e);
                onAcceptControlClick();
            });
            hbAcceptControlEl = container;
            updateAcceptControlUi();
            return container;
        },
        onRemove() {
            hbAcceptControlEl = null;
        },
    });
    return new AcceptControl();
}

function updateShareControlUi() {
    if (!hbShareControlEl) {
        return;
    }
    hbShareControlEl.classList.remove(
        "hb-share-control--idle",
        "hb-share-control--outgoing",
        "hb-share-control--incoming",
        "hb-share-control--active",
    );
    hbShareControlEl.classList.add(`hb-share-control--${hbShareState}`);
    const a = hbShareControlEl.querySelector(".hb-share-btn");
    if (a) {
        const titles = {
            idle: "Ask partner to share location",
            outgoing: "Waiting for partner to accept… (click to cancel)",
            incoming: "Partner is asking to share — click ✓ to accept",
            active: "Stop sharing locations",
        };
        a.title = titles[hbShareState] || titles.idle;
        a.setAttribute("aria-label", a.title);
    }
}

function updateAcceptControlUi() {
    if (!hbAcceptControlEl) {
        return;
    }
    if (hbShareState === "incoming") {
        hbAcceptControlEl.classList.remove("hidden");
    } else {
        hbAcceptControlEl.classList.add("hidden");
    }
}

function refreshShareUi() {
    updateShareControlUi();
    updateAcceptControlUi();
    updateToggleUi(mapPaneVisible);
}

function onShareControlClick() {
    if (hbShareState === "idle") {
        const me = getMyShareCoords();
        if (!me) {
            return;
        }
        hbShareState = "outgoing";
        refreshShareUi();
        sendToPartner({
            type: "share_location_request",
            from: state.myAxlKey || "",
            name: (state.myName || "").trim(),
            lat: me.lat,
            lng: me.lng,
            ts: Date.now(),
        });
    } else if (hbShareState === "outgoing") {
        hbShareState = "idle";
        refreshShareUi();
        sendToPartner({
            type: "share_location_cancel",
            from: state.myAxlKey || "",
        });
    } else if (hbShareState === "active") {
        hbShareState = "idle";
        hbPartnerSharedCoords = null;
        hbPartnerSharedName = "";
        refreshShareUi();
        removePartnerMarker();
        sendToPartner({
            type: "share_location_stop",
            from: state.myAxlKey || "",
        });
    }
    /** "incoming" state ignores clicks here — use the green-check button. */
}

function onAcceptControlClick() {
    if (hbShareState !== "incoming" || !hbPartnerSharedCoords) {
        return;
    }
    const me = getMyShareCoords();
    if (!me) {
        return;
    }
    const partnerCoords = hbPartnerSharedCoords;
    const partnerName = hbPartnerSharedName;
    hbShareState = "active";
    refreshShareUi();
    renderPartnerMarkerFromCoords(partnerCoords, partnerName);
    sendToPartner({
        type: "share_location_accept",
        from: state.myAxlKey || "",
        name: (state.myName || "").trim(),
        lat: me.lat,
        lng: me.lng,
        ts: Date.now(),
    });
}

function removePartnerMarker() {
    if (hbPartnerMarker && hbMap) {
        hbMap.removeLayer(hbPartnerMarker);
    }
    if (hbFocusedMarker === hbPartnerMarker) {
        hbFocusedMarker = null;
    }
    hbPartnerMarker = null;
}

/** If the partner reports coords almost identical to ours (same machine in a
 *  side-by-side demo), shift them by the cached random ~45m offset so the two
 *  characters don't render on top of each other. */
function dejitterPartnerCoords(partnerLat, partnerLng) {
    const me = getMyShareCoords();
    if (!me) {
        return { lat: partnerLat, lng: partnerLng };
    }
    const dLat = Math.abs(partnerLat - me.lat);
    const dLng = Math.abs(partnerLng - me.lng);
    if (dLat < 0.0001 && dLng < 0.0001) {
        const offset = getPartnerOffset();
        return { lat: partnerLat + offset.dLat, lng: partnerLng + offset.dLng };
    }
    return { lat: partnerLat, lng: partnerLng };
}

function renderPartnerMarkerFromCoords(partnerCoords, partnerName) {
    if (!hbMap || !partnerCoords) {
        return;
    }
    const { lat, lng } = dejitterPartnerCoords(partnerCoords.lat, partnerCoords.lng);
    const me = getMyShareCoords();
    removePartnerMarker();
    const name = (partnerName || state.partnerName || "partner").trim() || "partner";
    hbPartnerMarker = L.marker([lat, lng], {
        icon: makePartnerMapIcon({
            name,
            battery: HB_PARTNER_BATTERY,
            status: "shared",
            lastPingTs: Date.now(),
                avatarDataUrl: state.partnerProfile?.avatarDataUrl || "",
        }),
    }).addTo(hbMap);
    bindMarkerBubbleClick(hbPartnerMarker);
    bindMarkerPinClick(hbPartnerMarker, "partner");
    if (me) {
        const bounds = L.latLngBounds([me.lat, me.lng], [lat, lng]);
        hbMap.fitBounds(bounds, {
            maxZoom: STREET_ZOOM,
            paddingTopLeft: L.point(48, 110),
            paddingBottomRight: L.point(48, 60),
            animate: true,
        });
    }
    syncHbMarkerZoomScale();
}

