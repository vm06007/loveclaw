/** Parses `13.7101°, 100.4543°` from heartbeat / signal grid. */
export function parseLatLngFromSignalValue(value) {
    if (!value || typeof value !== "string") {
        return null;
    }
    const m = value.trim().match(/^(-?\d+\.?\d*)\s*°\s*,\s*(-?\d+\.?\d*)\s*°/);
    if (!m) {
        return null;
    }
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }
    return { lat, lng };
}
