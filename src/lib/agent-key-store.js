/**
 * Agent wallet key encryption — Web Crypto API (PBKDF2 + AES-GCM).
 * The private key is NEVER stored in plain text. Only the encrypted blob
 * {salt, iv, data} is persisted. PIN is only held in memory during a single
 * operation and then discarded.
 */

const PBKDF2_ITERATIONS = 150_000;
const STORAGE_KEY       = "lc-agent-key-enc";
const VAULT_STORAGE_KEY = "lc-vault-key-enc";

function b64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function unb64(s) {
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function _deriveKey(pin, salt) {
    const raw = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(String(pin)),
        "PBKDF2",
        false,
        ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        raw,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

/** Encrypt privateKey with PIN and persist the blob. */
export async function encryptAndStoreKey(privateKey, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await _deriveKey(pin, salt);
    const ct   = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(privateKey),
    );
    const blob = { salt: b64(salt), iv: b64(iv), data: b64(ct) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

/**
 * Decrypt stored key with PIN. Returns plain private key string.
 * Throws DOMException if PIN is wrong (AES-GCM auth tag fails).
 */
export async function decryptStoredKey(pin) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("No encrypted agent key found. Re-register your agent.");
    const { salt, iv, data } = JSON.parse(raw);
    const key = await _deriveKey(pin, unb64(salt));
    const pt  = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(iv) },
        key,
        unb64(data),
    );
    return new TextDecoder().decode(pt);
}

/** True if an encrypted key blob exists in storage. */
export function hasEncryptedKey() {
    return !!localStorage.getItem(STORAGE_KEY);
}

/** Remove the encrypted key (e.g. on unregister / key rotation). */
export function clearEncryptedKey() {
    localStorage.removeItem(STORAGE_KEY);
}

// ── Vault key (shared couple wallet) ────────────────────────────────────────

export async function encryptAndStoreVaultKey(privateKey, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await _deriveKey(pin, salt);
    const ct   = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(privateKey),
    );
    const blob = { salt: b64(salt), iv: b64(iv), data: b64(ct) };
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(blob));
}

export async function decryptStoredVaultKey(pin) {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) throw new Error("No vault key stored. Set it up in Settings → Mutual Vault.");
    const { salt, iv, data } = JSON.parse(raw);
    const key = await _deriveKey(pin, unb64(salt));
    const pt  = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(iv) },
        key,
        unb64(data),
    );
    return new TextDecoder().decode(pt);
}

export function hasEncryptedVaultKey() {
    return !!localStorage.getItem(VAULT_STORAGE_KEY);
}

export function clearEncryptedVaultKey() {
    localStorage.removeItem(VAULT_STORAGE_KEY);
}
