/* LoveClaw minimal PWA shell — cache is intentionally light. */
self.addEventListener("install", event => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});
