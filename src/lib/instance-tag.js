/** Reserved one-segment paths (must not become storage keys or profile tags). */
export const RESERVED_INSTANCE_TAGS = new Set([
    "api",
    "assets",
    "welcome",
    "favicon.ico",
    "robots.txt",
    "index.html",
]);

/**
 * `?role=mytag` or a single path segment `https://loveclaw.app/mytag` (see `vercel.json`).
 * Tag: lowercase letters, digits, `_`, `-`, max 48 chars. Query `role` wins if present.
 */
export function parseInstanceTagFromLocation() {
    const q = new URLSearchParams(location.search).get("role");
    if (q && String(q).trim()) {
        const t = String(q).trim().toLowerCase();
        return /^[a-z0-9_-]{1,48}$/.test(t) && !RESERVED_INSTANCE_TAGS.has(t) ? t : null;
    }
    const raw = (location.pathname || "/").replace(/\/+$/, "") || "/";
    if (raw === "/") {
        return null;
    }
    const m = /^\/([a-zA-Z0-9_-]{1,48})$/.exec(raw);
    if (!m) {
        return null;
    }
    const tag = m[1].toLowerCase();
    if (RESERVED_INSTANCE_TAGS.has(tag)) {
        return null;
    }
    return tag;
}

/** Tauri / bare `/`: set from boot after `get_instance_config` when URL has no tag. */
let bootResolvedTag = null;

export function setBootInstanceTag(tag) {
    const n = normalizeInstanceTag(tag);
    bootResolvedTag = n || null;
}

export function getEffectiveInstanceTag() {
    const fromUrl = parseInstanceTagFromLocation();
    if (fromUrl) {
        return fromUrl;
    }
    return bootResolvedTag || "";
}

/** Sanitize for outbound payloads and inbound coop_profile fields. */
export function normalizeInstanceTag(raw) {
    const t = String(raw ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,48}$/.test(t) || RESERVED_INSTANCE_TAGS.has(t)) {
        return "";
    }
    return t.slice(0, 48);
}
