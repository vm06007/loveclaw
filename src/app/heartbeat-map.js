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

/* ── Incoming AXL/IPC handlers (called from `messages.js`) ───────────────── */

export function onShareLocationRequestMessage(msg) {
    if (typeof msg?.lat !== "number" || typeof msg?.lng !== "number") {
        return;
    }
    /** Mutual: both sides clicked share at the same time → auto-accept. */
    if (hbShareState === "outgoing") {
        const me = getMyShareCoords();
        hbPartnerSharedCoords = { lat: msg.lat, lng: msg.lng };
        hbPartnerSharedName = String(msg.name || "").trim();
        hbShareState = "active";
        refreshShareUi();
        renderPartnerMarkerFromCoords(hbPartnerSharedCoords, hbPartnerSharedName);
        if (me) {
            sendToPartner({
                type: "share_location_accept",
                from: state.myAxlKey || "",
                name: (state.myName || "").trim(),
                lat: me.lat,
                lng: me.lng,
                ts: Date.now(),
            });
        }
        return;
    }
    if (hbShareState !== "idle") {
        return;
    }
    hbPartnerSharedCoords = { lat: msg.lat, lng: msg.lng };
    hbPartnerSharedName = String(msg.name || "").trim();
    hbShareState = "incoming";
    refreshShareUi();
}

export function onShareLocationAcceptMessage(msg) {
    if (typeof msg?.lat !== "number" || typeof msg?.lng !== "number") {
        return;
    }
    if (hbShareState !== "outgoing" && hbShareState !== "active") {
        return;
    }
    hbPartnerSharedCoords = { lat: msg.lat, lng: msg.lng };
    hbPartnerSharedName = String(msg.name || "").trim();
    hbShareState = "active";
    refreshShareUi();
    renderPartnerMarkerFromCoords(hbPartnerSharedCoords, hbPartnerSharedName);
}

export function onShareLocationStopMessage() {
    hbShareState = "idle";
    hbPartnerSharedCoords = null;
    hbPartnerSharedName = "";
    refreshShareUi();
    removePartnerMarker();
}

export function onShareLocationCancelMessage() {
    if (hbShareState === "incoming") {
        hbShareState = "idle";
        hbPartnerSharedCoords = null;
        hbPartnerSharedName = "";
        refreshShareUi();
    }
}

function ensureMap() {
    const el = document.getElementById("heartbeat-leaflet-map");
    if (!el || hbMap) {
        return;
    }
    hbMap = L.map(el, {
        center: [15, 0],
        zoom: 2,
        minZoom: 1,
        maxZoom: 19,
        zoomControl: true,
        attributionControl: true,
    });
    setBasemap(hbMap, readBasemapPref());
    hbMap.on("zoomend", syncHbMarkerZoomScale);
    makeAcceptControl().addTo(hbMap);
    makeShareControl().addTo(hbMap);
}

function refreshHbMapContent() {
    ensureMap();
    if (!hbMap) {
        return;
    }

    const empty = document.getElementById("heartbeat-map-empty");
    const locVal = latestSignalValue("location");
    const coords = parseLatLngFromSignalValue(locVal);
    const battery = latestSignalValue("battery") ?? "—";
    const myRealName = (state.myName || "").trim() || "you";
    const name = "You";
    const status = coords ? "" : "no fix";
    const lastPingTs = latestSignalTs();

    if (hbMarker) {
        hbMap.removeLayer(hbMarker);
        hbMarker = null;
    }

    if (coords) {
        if (empty) {
            empty.classList.add("hidden");
        }
        hbMarker = L.marker([coords.lat, coords.lng], {
            icon: makeYouMapIcon({
                name,
                initialsName: myRealName,
                battery,
                status,
                lastPingTs,
                avatarDataUrl: state.myProfile?.avatarDataUrl || "",
            }),
        }).addTo(hbMap);
        bindMarkerBubbleClick(hbMarker);
        bindMarkerPinClick(hbMarker, "me");
        if (hbFocusedMarker === hbMarker || hbFocusedMarker === hbPartnerMarker) {
            setMarkerForeground(hbFocusedMarker);
        }
        if (hbShareState === "active" && hbPartnerSharedCoords) {
            renderPartnerMarkerFromCoords(hbPartnerSharedCoords, hbPartnerSharedName);
        } else {
            focusHbMapOnCoords(coords.lat, coords.lng);
        }
    } else {
        if (empty) {
            empty.classList.remove("hidden");
        }
        hbMap.setView([20, 0], 2, { animate: false });
    }

    requestAnimationFrame(() => {
        hbMap.invalidateSize();
        if (coords) {
            focusHbMapOnCoords(coords.lat, coords.lng);
            syncHbMarkerZoomScale();
        }
        setTimeout(() => {
            hbMap.invalidateSize();
            if (coords) {
                focusHbMapOnCoords(coords.lat, coords.lng);
                syncHbMarkerZoomScale();
            }
        }, 140);
    });
}

function updateToggleUi(showMap) {
    const btn = document.getElementById("btn-hb-map");
    const clearBtn = document.getElementById("btn-hb-clear");
    const title = document.querySelector(".today-hb-card-head .today-card-title");
    const pin = btn?.querySelector(".today-hb-map-icon-pin");
    const list = btn?.querySelector(".today-hb-map-icon-list");
    const styleSel = document.getElementById("hb-style-select");
    if (!btn) {
        return;
    }
    const hasPendingIncoming = hbShareState === "incoming" && !showMap;
    btn.classList.toggle("today-hb-map-btn--pending", hasPendingIncoming);
    if (showMap) {
        btn.classList.add("today-hb-map-btn--active");
        btn.setAttribute("aria-label", "Show heartbeat log");
        btn.setAttribute("title", "Log");
        pin?.classList.add("hidden");
        list?.classList.remove("hidden");
        styleSel?.classList.remove("hidden");
        clearBtn?.classList.add("hidden");
        if (title) {
            title.textContent = "Heartbeat map";
        }
    } else {
        btn.classList.remove("today-hb-map-btn--active");
        btn.setAttribute("aria-label", "Show heartbeat map");
        btn.setAttribute("title", "Map");
        pin?.classList.remove("hidden");
        list?.classList.add("hidden");
        styleSel?.classList.add("hidden");
        clearBtn?.classList.remove("hidden");
        if (title) {
            title.textContent = "Heartbeat log";
        }
    }
}

function startTimeTicker() {
    if (hbTimeTicker) {
        return;
    }
    hbTimeTicker = setInterval(() => {
        if (mapPaneVisible) {
            refreshHbMapContent();
        }
    }, 30 * 1000);
}

function stopTimeTicker() {
    if (hbTimeTicker) {
        clearInterval(hbTimeTicker);
        hbTimeTicker = null;
    }
}

function setMapPaneVisible(show) {
    const log = document.getElementById("today-hb-log");
    const pane = document.getElementById("today-hb-map-pane");
    if (!log || !pane) {
        return;
    }

    mapPaneVisible = show;
    if (show) {
        log.classList.add("hidden");
        pane.classList.remove("hidden");
        pane.setAttribute("aria-hidden", "false");
        updateToggleUi(true);
        refreshHbMapContent();
        startTimeTicker();
    } else {
        pane.classList.add("hidden");
        pane.setAttribute("aria-hidden", "true");
        log.classList.remove("hidden");
        updateToggleUi(false);
        stopTimeTicker();
    }
}

function toggleHbMap() {
    setMapPaneVisible(!mapPaneVisible);
}

/** Call after a new heartbeat so the map marker stays current while the pane is open. */
export function refreshHeartbeatMapIfOpen() {
    if (mapPaneVisible) {
        refreshHbMapContent();
    }
}

export function initHeartbeatMap() {
    const btn = document.getElementById("btn-hb-map");
    if (btn && !btn.dataset.bound) {
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => toggleHbMap());
    }
    const clearBtn = document.getElementById("btn-hb-clear");
    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = "1";
        clearBtn.addEventListener("click", () => {
            clearTodayHeartbeatLog();
        });
    }
    const styleSel = document.getElementById("hb-style-select");
    if (styleSel && !styleSel.dataset.bound) {
        styleSel.dataset.bound = "1";
        /** Hide non-OSM options when no MapTiler key is configured so the dropdown
         *  does not advertise styles that would 401. */
        if (!MAPTILER_KEY) {
            for (const opt of Array.from(styleSel.options)) {
                if (opt.value !== "osm") {
                    opt.disabled = true;
                }
            }
        }
        styleSel.value = readBasemapPref();
        styleSel.addEventListener("change", () => {
            const v = styleSel.value || "osm";
            writeBasemapPref(v);
            if (hbMap) {
                setBasemap(hbMap, v);
            }
        });
    }
}

