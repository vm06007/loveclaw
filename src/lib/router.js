export function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(`screen-${id}`);
    if (target) {
        target.classList.add("active");
    }
}
