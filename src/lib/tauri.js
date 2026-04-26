let tauriInvoke = null;

export async function initTauri() {
    try {
        const tauri = await import("@tauri-apps/api/core");
        tauriInvoke = tauri.invoke;
    } catch {
        // running in plain browser
    }
}

export function isTauri() {
    return !!tauriInvoke;
}

export function invoke(name, args) {
    if (!tauriInvoke) {
        return Promise.reject(new Error("Tauri not available"));
    }
    return tauriInvoke(name, args);
}
