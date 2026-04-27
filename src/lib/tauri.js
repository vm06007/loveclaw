let tauriInvoke = null;

/**
 * True only in the Tauri webview. Do not infer from the API package loading — Vite
 * can import @tauri-apps/api in plain Chrome, which would incorrectly set tauriInvoke.
 */
export function isTauri() {
    if (typeof window === "undefined") {
        return false;
    }
    return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export async function initTauri() {
    if (!isTauri()) {
        return;
    }
    try {
        const tauri = await import("@tauri-apps/api/core");
        tauriInvoke = tauri.invoke;
    } catch {
        /* */
    }
}

export function invoke(name, args) {
    if (!tauriInvoke) {
        return Promise.reject(new Error("Tauri not available"));
    }
    return tauriInvoke(name, args);
}
