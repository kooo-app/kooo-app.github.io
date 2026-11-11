// sw — کش آفلاین کو (الگو از تراز)
// ⚠️ با هر انتشار: CACHE را با APP_VERSION در js/utils.js یکی نگه دار
// (یا از tools/bump-version.mjs استفاده کن)
const CACHE = 'koo-v0.4.0';

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
  // cache:'reload' یعنی فایل‌ها از شبکه با نسخهٔ تازه گرفته می‌شوند، نه از کش HTTP
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// صفحه می‌تواند صریحاً بگوید «نسخهٔ جدید را فعال کن»
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting' || (e.data && e.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

function sameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; } catch (err) { return false; }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!sameOrigin(e.request.url)) return; // گوگل، درایو و پل ورسل کش نمی‌شن

  // شبکه‌اول: آپدیت‌ها فوراً می‌رسند؛ فقط در حالت آفلاین از کش می‌خوانیم
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => {
            if (e.request.mode === 'navigate') c.put('./index.html', copy);
            else c.put(e.request, copy);
          }).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        e.request.mode === 'navigate' ? caches.match('./index.html') : caches.match(e.request)
      )
  );
});
