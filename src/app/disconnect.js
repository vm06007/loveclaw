export function initDisconnect() {
    document.getElementById("btn-disconnect").addEventListener("click", () => {
        if (!confirm("Disconnect and reset pairing?")) {
            return;
        }
        Object.keys(localStorage)
            .filter(k => k.startsWith("loveclaw-"))
            .forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
        const rp = new URLSearchParams(location.search);
        const role = rp.get("role");
        location.href = role ? `${location.pathname}?role=${role}` : location.pathname;
    });
}
