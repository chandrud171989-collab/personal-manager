const CACHE = 'pm-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Show a notification when told to by the app
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = e.data;
    self.registration.showNotification(title, {
      body,
      tag,
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [100, 50, 100]
    });
  }
});

// Best-effort: if the browser supports periodic background sync and the
// user granted it, check reminders even when the app isn't open.
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'pm-reminder-check') {
    e.waitUntil(checkReminders());
  }
});

async function checkReminders() {
  const clientsList = await self.clients.matchAll();
  if (clientsList.length > 0) return; // app is open, it'll handle it itself
  // Background checks without the app open need IndexedDB access here.
  // Kept intentionally minimal; the app performs the full check on every open.
}
