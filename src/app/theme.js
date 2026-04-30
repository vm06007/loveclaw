const STORAGE_KEY = "loveclaw-theme";

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
}

export function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY) || "dark";
    applyTheme(saved);

    for (const id of ["btn-theme-toggle", "home-theme-toggle"]) {
        document.getElementById(id)?.addEventListener("click", toggleTheme);
    }
}
