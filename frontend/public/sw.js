// =====================================================================
// GROT Service Worker — офлайн-оболочка PWA + приём Web Push.
// =====================================================================
const CACHE = 'grot-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// API — всегда сеть (свежие данные). Статика — cache-first с фолбэком в сеть.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // не кэшируем API
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/index.html'))
    )
  );
});

// Приём пуша
self.addEventListener('push', (e) => {
  let data = { title: 'GROT', body: 'Уведомление' };
  try { data = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(data.title || 'GROT', {
    body: data.body, icon: '/logo.png', badge: '/logo.png', vibrate: [80, 40, 80],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cl) => cl[0] ? cl[0].focus() : self.clients.openWindow('/')));
});
