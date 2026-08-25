const CACHE = 'pm-cache-v2';
const APP_VERSION = '20260825-1800';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  `./app.js?v=${APP_VERSION}`,
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Always fetch the current application shell and JavaScript first.
  // This prevents GitHub Pages/PWA from serving an old app.js.
  const isAppShell =
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/style.css');

  if (request.method === 'GET' && isAppShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [100, 50, 100]
      })
    );
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'pm-reminder-check') {
    event.waitUntil(checkReminders());
  }
});

async function checkReminders() {
  const clientsList = await self.clients.matchAll();
  if (clientsList.length > 0) return;
}
