/* LoveClaw PWA shell + Web Push handler */

self.addEventListener("install", event => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
    let data = { title: "LoveClaw", body: "" };
    if (event.data) {
        try { data = { ...data, ...event.data.json() }; } catch { data.body = event.data.text(); }
    }
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: "/icon.svg",
            badge: "/icon.svg",
            tag: "loveclaw-push",
            renotify: true,
        })
    );
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
            if (list.length) return list[0].focus();
            return clients.openWindow("/");
        })
    );
});
