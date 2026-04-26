/* 网络优先：刷新即可拿到最新 HTML/JS/CSS/图片；离线时再用缓存 */
const CACHE = 'pixel-love-v9-netfirst';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll([
        './index.html',
        './style.css',
        './styles.css',
        './animations.css',
        './app.js',
        './map.js',
        './manifest.json',
        './app/toast.js',
        './app/routing.js',
        './app/home.js',
        './app/sparkle.js',
        './app/tap.js',
        './app/bottle.js',
        './app/movies.js',
        './app/countdown.js',
        './app/pwa.js'
      ]).catch(() => {})
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) => {
            if (k !== CACHE) return caches.delete(k);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method !== 'GET') return;

  const p = url.pathname;
  if (p === '/' || p.endsWith('/index.html') || p.endsWith('.html')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (!res || !res.ok) return res;
        const clone = res.clone();
        if (
          p.endsWith('.js') ||
          p.endsWith('.css') ||
          p.endsWith('.json') ||
          /\.(png|jpe?g|webp|gif|svg)$/i.test(p)
        ) {
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
