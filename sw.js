// sw — کش آفلاین کو (الگو از تراز)
const CACHE = 'koo-v1';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/state.js',
  './js/utils.js',
  './js/scan.js',
  './js/sync.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './help-gemini.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // گوگل و پل ورسل کش نمی‌شن
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
