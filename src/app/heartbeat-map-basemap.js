import L from "leaflet";

/** Optional MapTiler key from `.env` (`VITE_MAPTILER_KEY`). When set, the basemap
 *  dropdown enables MapTiler raster styles in addition to the OSM default. */
export const MAPTILER_KEY = import.meta.env?.VITE_MAPTILER_KEY ?? "";

/** Persisted basemap selection across sessions. */
const BASEMAP_STORAGE_KEY = "loveclaw.heartbeatMap.style";

let hbBaseLayer = null;

export function readBasemapPref() {
    try {
        return localStorage.getItem(BASEMAP_STORAGE_KEY) || "osm";
    } catch {
        return "osm";
    }
}

export function writeBasemapPref(value) {
    try {
        localStorage.setItem(BASEMAP_STORAGE_KEY, value);
    } catch {
        /* ignore quota / privacy mode */
    }
}

function buildOsmLayer() {
    return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        crossOrigin: true,
    });
}

function buildMaptilerLayer(styleId) {
    return L.tileLayer(
        `https://api.maptiler.com/maps/${styleId}/{z}/{x}/{y}{r}.png?key=${MAPTILER_KEY}`,
        {
            attribution:
                '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' +
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 22,
            crossOrigin: true,
        },
    );
}

export function setBasemap(map, styleId) {
    const next = (styleId === "osm" || !MAPTILER_KEY)
        ? buildOsmLayer()
        : buildMaptilerLayer(styleId);
    if (hbBaseLayer) {
        map.removeLayer(hbBaseLayer);
    }
    next.addTo(map);
    hbBaseLayer = next;
}
