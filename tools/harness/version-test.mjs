// تست هم‌خوانی نسخه و رفتار سرویس‌ورکر (بدون مرورگر)
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const sw = read('sw.js');
const app = read('js/app.js');
const utils = read('js/utils.js');
const html = read('index.html');

let fails = 0;
const ok = (name, fn) => {
  try { fn(); console.log('✓', name); } catch (e) { fails++; console.log('✗', name, '—', e.message); }
};

const appVersion = (utils.match(/APP_VERSION = '([^']+)'/) || [])[1];
const swVersion = (sw.match(/const CACHE = 'koo-v([^']+)'/) || [])[1];

ok('APP_VERSION exists', () => {
  if (!appVersion) throw new Error('no APP_VERSION');
});

ok('sw CACHE version equals APP_VERSION', () => {
  if (!swVersion) throw new Error('no sw cache version');
  if (swVersion !== appVersion) throw new Error(`app=${appVersion} sw=${swVersion} — tools/bump-version.mjs را بزن`);
});

ok('service worker is network-first (updates arrive fast)', () => {
  if (!/fetch\(e\.request, \{ cache: 'no-store' \}\)/.test(sw)) throw new Error('fetch is not cache-busting');
  if (!/\.catch\(\(\) =>/.test(sw)) throw new Error('no offline fallback');
});

ok('install uses cache:reload and skipWaiting', () => {
  if (!/new Request\(a, \{ cache: 'reload' \}\)/.test(sw)) throw new Error('precache may be stale');
  if (!/skipWaiting\(\)/.test(sw)) throw new Error('no skipWaiting');
});

ok('activate deletes old caches and claims clients', () => {
  if (!/caches\.delete\(k\)/.test(sw)) throw new Error('old caches not deleted');
  if (!/clients\.claim\(\)/.test(sw)) throw new Error('clients not claimed');
});

ok('page registers sw with updateViaCache none', () => {
  if (!/updateViaCache: 'none'/.test(app)) throw new Error('missing updateViaCache');
  if (!/controllerchange/.test(app)) throw new Error('no controllerchange reload');
  if (!/reg\.update\(\)/.test(app)) throw new Error('no manual update check');
});

ok('precache list covers every js/css asset', () => {
  const js = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => './js/' + f);
  for (const f of js) if (!sw.includes(`'${f}'`)) throw new Error('missing from ASSETS: ' + f);
  if (!sw.includes("'./css/app.css'")) throw new Error('missing css');
  if (!sw.includes("'./index.html'")) throw new Error('missing index');
  if (!sw.includes("'./help-gemini.html'")) throw new Error('missing help page');
});

ok('index loads theme before paint', () => {
  const head = html.split('</head>')[0];
  if (!head.includes('koo_theme')) throw new Error('theme script not in head');
});

console.log(fails ? `\n${fails} failed` : '\nversion/sync tests passed');
process.exit(fails ? 1 : 0);
