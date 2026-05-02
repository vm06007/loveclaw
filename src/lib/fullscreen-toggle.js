const TRIPLE_CLICK_WINDOW_MS = 550;

/**
 * Enter or exit browser fullscreen (best-effort; ignores permission errors).
 */
export async function tryToggleFullscreen() {
    const doc = document;
    const root = doc.documentElement;
    try {
        const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
        if (fsEl) {
            if (typeof doc.exitFullscreen === "function") {
                await doc.exitFullscreen();
            } else if (typeof doc.webkitExitFullscreen === "function") {
                doc.webkitExitFullscreen();
            }
        } else if (typeof root.requestFullscreen === "function") {
            await root.requestFullscreen();
        } else if (typeof root.webkitRequestFullscreen === "function") {
            root.webkitRequestFullscreen();
        }
    } catch {
        /* ignore fullscreen permission / API failures */
    }
}

/**
 * Single click runs `onSingleClick` immediately (toggle hint, etc.).
 * Three clicks within TRIPLE_CLICK_WINDOW_MS from the first: fullscreen only on the
 * third (no third `onSingleClick`), so two prior toggles restore hint parity.
 */
export function bindInfoButtonWithTripleFullscreen(el, onSingleClick) {
    if (!el || typeof onSingleClick !== "function") {
        return;
    }
    let burstStartMs = 0;
    let burstCount = 0;
    let idleTimer = null;

    const endBurstIdle = () => {
        burstStartMs = 0;
        burstCount = 0;
        idleTimer = null;
    };

    el.addEventListener("click", () => {
        const now = Date.now();
        if (idleTimer !== null) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }

        const burstExpired = burstStartMs === 0 || now - burstStartMs > TRIPLE_CLICK_WINDOW_MS;
        if (burstExpired) {
            burstStartMs = now;
            burstCount = 0;
        }

        burstCount += 1;

        if (burstCount >= 3) {
            endBurstIdle();
            void tryToggleFullscreen();
            return;
        }

        onSingleClick();

        idleTimer = setTimeout(endBurstIdle, TRIPLE_CLICK_WINDOW_MS);
    });
}
