// sync — گوگل درایو کو: الگو از تراز
// Local-First + یک فایل koo-data.json در درایو کاربر + ورکر کلودفلر برای تمدید توکن
// ورکر: worker/koo-sync.js → https://koo-sync.koo.workers.dev
// پل ورسل پشتیبان: https://koo-api.vercel.app
import { store, toast, esc, agoText } from './utils.js';
import { state, persistLocal, replaceState, mergeStates, fingerprint, hasLocalData, hasRemoteData } from './state.js';
// import چرخه‌ای با app.js را عمداً با import پویا حل می‌کنیم
const render = () => import('./app.js').then((m) => m.render()).catch(() => {});

// ⚠️ برای فعال شدن ورود گوگل: در Google Cloud یک OAuth Client بساز و
// Origin مجاز را https://koo-app.github.io بگذار، بعد ID را اینجا بگذار.
export const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILENAME = 'koo-data.json';
const DRIVE_FILE_KEY = 'koo_app_drive_file_id';
const TOKEN_KEY = 'koo_app_g_token';
const SYNC_WORKER = 'https://koo-sync.koo.workers.dev';
const SEALED_KEY = 'koo_app_g_sealed';
const SYNC_ROUTES = [
  { id: 'cf', base: SYNC_WORKER, p: { ping: '/health', start: '/start', refresh: '/refresh', revoke: '/revoke' } },
  { id: 'vercel', base: 'https://koo-api.vercel.app', p: { ping: '/ping', start: '/auth/start', refresh: '/token/refresh', revoke: '/token/revoke' } },
];
const ROUTE_KEY = 'koo_app_sync_route';
const LASTSYNC_KEY = 'koo_app_g_lastsync';

export let gUser = null;
let gToken = null;
let tokenClient = null;
let tokenRequesting = false;
let lastTokenError = '';
let pendingLocalSave = false;
let pushInFlight = false;
let pullInFlight = false;
const routeHealthy = {};

function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
function avatarBg(email) {
  let h = 0;
  for (const ch of String(email || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 'hsl(' + (h % 360) + ' 55% 45%)';
}
export function avatarHTML(u, size) {
  size = size || 32;
  const bg = avatarBg(u && u.email);
  const ini = esc(initials((u === gUser ? displayName() : (u && u.name)) || (u && u.email)));
  const fb = '<span class="av-ini" style="background:' + bg + '">' + ini + '</span>';
  if (u && u.picture) {
    return '<span class="av" style="width:' + size + 'px;height:' + size + 'px"><img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">' + fb + '</span>';
  }
  return '<span class="av" style="width:' + size + 'px;height:' + size + 'px">' + fb + '</span>';
}

export function syncStatusText() {
  if (!gUser) return 'وارد نشده‌ای';
  const ls = Number(store.get(LASTSYNC_KEY) || 0);
  if (tokenRequesting) return 'در حال تمدید اتصال…';
  if (!tokenAlive() && !store.get(SEALED_KEY)) return 'اتصال قطع است؛ ورود دوباره لازم است';
  if (pendingLocalSave) return 'تغییرات محلی هنوز ارسال نشده';
  return ls ? 'آخرین همگام‌سازی: ' + agoText(ls) : 'هنوز همگام نشده';
}

export function updateAvatar() {
  if (typeof document === 'undefined') return;
  let b = document.getElementById('btnProfile');
  if (!b) return;
  if (gUser) {
    b.innerHTML = avatarHTML(gUser, 30);
    b.title = gUser.email || displayName();
    b.classList.add('signed');
  } else {
    b.innerHTML = '👤';
    b.title = 'ورود با گوگل';
    b.classList.remove('signed');
  }
}

function decodeJWT(tok) {
  try {
    const b64 = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch (e) { return {}; }
}
function tokenAlive() {
  return !!(gToken && gToken.token && (!gToken.expiresAt || Date.now() < gToken.expiresAt - 60000));
}
function rememberToken(tok) {
  gToken = tok;
  try {
    if (tok && tok.token) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tok));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
}
function loadSavedToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (t && t.token && (!t.expiresAt || Date.now() < t.expiresAt)) gToken = t;
    }
  } catch (e) {}
}
function setSignedIn(u) {
  gUser = u;
  updateAvatar();
}
function clearSignedIn() {
  gUser = null;
  rememberToken(null);
  updateAvatar();
}

export function handleCredential(resp) {
  if (!resp || !resp.credential) return;
  const p = decodeJWT(resp.credential);
  setSignedIn({ email: p.email || '', name: p.name || '', picture: p.picture || '' });
  loadFromDrive(function () { render(); }, false, true);
}

function savedRoute() {
  try { return store.get(ROUTE_KEY) || ''; } catch (e) { return ''; }
}
function saveRoute(id) {
  try { store.set(ROUTE_KEY, id); } catch (e) {}
}
function fetchTimeout(url, opts, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, ms || 8000);
  return fetch(url, Object.assign({}, opts || {}, { signal: ctl.signal })).finally(() => clearTimeout(timer));
}
function routeOrder() {
  const saved = savedRoute();
  const ids = SYNC_ROUTES.map((r) => r.id);
  if (saved && ids.includes(saved)) return [saved, ...ids.filter((x) => x !== saved)];
  return ids;
}
async function routeFetch(kind, opts, ms) {
  const order = routeOrder();
  let lastErr = null;
  for (const id of order) {
    const route = SYNC_ROUTES.find((r) => r.id === id);
    if (!route) continue;
    const path = route.p[kind];
    if (!path) continue;
    try {
      const r = await fetchTimeout(route.base + path, opts, ms || 12000);
      routeHealthy[id] = true;
      saveRoute(id);
      return r;
    } catch (e) {
      routeHealthy[id] = false;
      lastErr = e;
    }
  }
  throw lastErr || new Error('no-route');
}

export function requestAccessToken(cb, interactive) {
  cb = cb || function () {};
  if (tokenAlive()) { cb(true); return; }
  const sealed = store.get(SEALED_KEY);
  if (sealed) {
    tokenRequesting = true;
    routeFetch('refresh', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ sealed }) }, 15000)
      .then((r) => r.json().catch(() => ({})))
      .then((j) => {
        tokenRequesting = false;
        if (j && j.access_token) {
          rememberToken({ token: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 });
          if (j.sealed) store.set(SEALED_KEY, j.sealed);
          if (j.email && !gUser) setSignedIn({ email: j.email, name: '', picture: '' });
          lastTokenError = '';
          cb(true);
        } else {
          const err = (j && j.error) || 'refresh_failed';
          lastTokenError = err;
          if (err === 'invalid_grant') store.set(SEALED_KEY, '');
          cb(false);
        }
      })
      .catch(() => { tokenRequesting = false; lastTokenError = 'net'; cb(false); });
    return;
  }
  if (!interactive) { cb(false); return; }
  // ورود تعاملی با GIS Token Client
  try {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      toast('گوگل هنوز بارگذاری نشده؛ اینترنت را چک کن');
      cb(false);
      return;
    }
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (resp) => {
          tokenRequesting = false;
          if (resp && resp.access_token) {
            rememberToken({ token: resp.access_token, expiresAt: Date.now() + (resp.expires_in || 3600) * 1000 });
            lastTokenError = '';
            cb(true);
          } else {
            lastTokenError = (resp && resp.error) || 'token_failed';
            cb(false);
          }
        },
        error_callback: () => { tokenRequesting = false; lastTokenError = 'popup'; cb(false); },
      });
    }
    tokenRequesting = true;
    tokenClient.requestAccessToken({ prompt: '' });
  } catch (e) {
    tokenRequesting = false;
    cb(false);
  }
}

function startWorkerLogin() {
  const app = location.origin + location.pathname;
  const n = Math.random().toString(36).slice(2);
  try { sessionStorage.setItem('koo_app_g_nonce', n); } catch (e) {}
  const route = SYNC_ROUTES[0];
  location.href = route.base + route.p.start + '?app=' + encodeURIComponent(app) + '&n=' + encodeURIComponent(n);
}

export function consumeWorkerCallback() {
  const h = location.hash || '';
  if (!h.includes('access_token=') && !h.includes('sealed=') && !h.includes('gerr=')) return false;
  const params = new URLSearchParams(h.slice(1));
  const err = params.get('gerr');
  const n = params.get('n');
  try {
    const savedN = sessionStorage.getItem('koo_app_g_nonce');
    if (n && savedN && n !== savedN) return false;
  } catch (e) {}
  if (params.get('access_token')) {
    rememberToken({ token: params.get('access_token'), expiresAt: Date.now() + (Number(params.get('expires_in')) || 3600) * 1000 });
  }
  if (params.get('sealed')) store.set(SEALED_KEY, params.get('sealed'));
  if (params.get('email')) setSignedIn({ email: params.get('email'), name: params.get('name') || '', picture: params.get('picture') || '' });
  if (err === 'no_refresh_token') toast('گوگل کلید تمدید نداد؛ در myaccount.google.com دسترسی «کو» را حذف و دوباره وارد شو');
  history.replaceState(null, '', location.pathname + location.search);
  if (gUser || tokenAlive()) loadFromDrive(function () { render(); }, false, true);
  return true;
}

export function googleConfigured() {
  return GOOGLE_CLIENT_ID.indexOf('YOUR_') !== 0;
}

export function googleSignIn() {
  if (!googleConfigured()) {
    toast('ورود گوگل هنوز تنظیم نشده؛ مراحل راه‌اندازی در SETUP.md هست');
    return;
  }
  if (store.get(SEALED_KEY)) {
    requestAccessToken(function (ok) {
      if (ok) loadFromDrive(function () { render(); }, false, true);
      else startWorkerLogin();
    }, false);
    return;
  }
  // اول GIS، اگر نشد ورکر
  requestAccessToken(function (ok) {
    if (ok) loadFromDrive(function () { render(); }, false, true);
    else startWorkerLogin();
  }, true);
}

export function googleSignOut() {
  clearSignedIn();
  toast('از گوگل خارج شدی (داده‌های گوشی می‌ماند)');
  render();
}
export function googleSignOutDo() {
  const sealed = store.get(SEALED_KEY);
  store.set(SEALED_KEY, '');
  if (sealed) {
    routeFetch('revoke', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ sealed }) }, 8000).catch(() => {});
  }
  clearSignedIn();
  toast('خروج کامل انجام شد');
  render();
}

function driveFetch(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  const doFetch = () => {
    opts.headers.Authorization = 'Bearer ' + (gToken ? gToken.token : '');
    return fetch(url, opts);
  };
  if (!gToken || !gToken.token) {
    return new Promise((res) => {
      requestAccessToken(function (ok) {
        if (!ok || !gToken) return res(new Response('', { status: 401 }));
        res(doFetch());
      }, false);
    });
  }
  return doFetch().then((r) => {
    if (r.status === 401) {
      rememberToken(null);
      return new Promise((res) => {
        requestAccessToken(function (ok) {
          if (!ok) return res(r);
          res(doFetch());
        }, false);
      });
    }
    return r;
  });
}

function driveFindFile() {
  const savedId = store.get(DRIVE_FILE_KEY);
  if (savedId) {
    return driveFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(savedId) + '?fields=id,name,trashed')
      .then((r) => {
        if (r.ok) return r.json();
        store.set(DRIVE_FILE_KEY, '');
        return null;
      })
      .then((f) => {
        if (f && !f.trashed) return f;
        return driveFindFileByName();
      });
  }
  return driveFindFileByName();
}
function driveFindFileByName() {
  const q = "name='" + DRIVE_FILENAME + "' and trashed=false";
  return driveFetch(
    'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
    '&spaces=drive&corpora=user&orderBy=modifiedTime%20desc&pageSize=100&fields=files(id,name,modifiedTime)'
  )
    .then((r) => {
      if (!r.ok) throw new Error('Drive list ' + r.status);
      return r.json();
    })
    .then((d) => {
      const f = (d.files && d.files[0]) || null;
      if (f) store.set(DRIVE_FILE_KEY, f.id);
      return f;
    });
}
function driveRead(id) {
  return driveFetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media').then((r) => {
    if (!r.ok) throw new Error('Drive read ' + r.status);
    return r.text();
  });
}
function driveCreate(content) {
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ name: DRIVE_FILENAME, mimeType: 'application/json' })], { type: 'application/json' }));
  fd.append('file', new Blob([content], { type: 'application/json' }));
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', body: fd })
    .then((r) => {
      if (!r.ok) throw new Error('Drive create ' + r.status);
      return r.json();
    })
    .then((d) => {
      if (d.id) store.set(DRIVE_FILE_KEY, d.id);
      return d;
    });
}
function driveUpdate(id, content) {
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ name: DRIVE_FILENAME, mimeType: 'application/json' })], { type: 'application/json' }));
  fd.append('file', new Blob([content], { type: 'application/json' }));
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=multipart&fields=id,name', { method: 'PATCH', body: fd })
    .then((r) => {
      if (r.ok) return r;
      return driveCreate(content);
    });
}

export function decideSync(local, remote) {
  const localHas = hasLocalData(local);
  const remoteHas = hasRemoteData(remote);
  if (localHas && !remoteHas) return { action: 'push', next: local };
  if (remoteHas && !localHas) return { action: 'pull', next: remote };
  const lAt = local.updatedAt || 0;
  const rAt = remote.updatedAt || 0;
  if (lAt > rAt) return { action: 'push', next: local };
  if (rAt > lAt) return { action: 'pull', next: remote };
  const merged = mergeStates(local, remote);
  if (fingerprint(merged) !== fingerprint(local)) return { action: 'push', next: merged };
  return { action: 'noop', next: local };
}

export function loadFromDrive(cb, interactive, quiet) {
  cb = cb || function () {};
  if (pushInFlight || pendingLocalSave) { cb(); return; }
  if (pullInFlight) { cb(); return; }
  pullInFlight = true;
  const done = () => { pullInFlight = false; cb(); };
  const run = () => {
    driveFindFile()
      .then((f) => {
        if (!f) {
          if (hasLocalData(state)) {
            return driveCreate(JSON.stringify(state)).then(() => {
              store.set(LASTSYNC_KEY, String(Date.now()));
              if (!quiet) toast('اطلاعات در Google Drive ذخیره شد ✓');
            });
          }
          return null;
        }
        return driveRead(f.id).then((text) => {
          let remote;
          try { remote = JSON.parse(text); } catch (e) { throw new Error('bad json'); }
          const decision = decideSync(state, remote);
          if (decision.action === 'pull') {
            replaceState(decision.next);
            if (!quiet) toast('از Google Drive خوانده شد ✓');
          } else if (decision.action === 'push') {
            return driveUpdate(f.id, JSON.stringify(decision.next)).then(() => {
              store.set(LASTSYNC_KEY, String(Date.now()));
              if (!quiet) toast('در Google Drive ذخیره شد ✓');
            });
          } else if (decision.action === 'noop') {
            store.set(LASTSYNC_KEY, String(Date.now()));
          }
          return null;
        });
      })
      .catch(() => {
        if (!quiet && interactive) toast('مجوز Google Drive داده نشد');
      })
      .then(done);
  };
  if (!tokenAlive()) {
    requestAccessToken(function (ok) {
      if (ok) run();
      else done();
    }, interactive === true);
  } else run();
}

function syncContent() {
  return JSON.stringify(state);
}

export function scheduleSync() {
  if (!gUser && !tokenAlive()) return;
  pendingLocalSave = true;
  pushToDrive(false);
}

export function archiveToDrive(name, plainJson) {
  return new Promise((resolve, reject) => {
    const go = () => {
      const fd = new FormData();
      fd.append('metadata', new Blob([JSON.stringify({ name, mimeType: 'application/json' })], { type: 'application/json' }));
      fd.append('file', new Blob([plainJson], { type: 'application/json' }));
      driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', body: fd })
        .then((r) => {
          if (!r.ok) throw new Error('Drive archive ' + r.status);
          resolve(true);
        })
        .catch(reject);
    };
    if (tokenAlive()) go();
    else requestAccessToken((ok) => { if (ok) go(); else reject(new Error('no token')); }, true);
  });
}

export function pushToDrive(interactive, onDone) {
  let pushOk = false;
  const finish = () => { pushInFlight = false; if (onDone) onDone(pushOk); };
  const run = () => {
    pushInFlight = true;
    const content = syncContent();
    driveFindFile()
      .then((f) => (f ? driveUpdate(f.id, content) : driveCreate(content)))
      .then(() => {
        pendingLocalSave = false;
        pushOk = true;
        store.set(LASTSYNC_KEY, String(Date.now()));
        updateAvatar();
        if (interactive) toast('در Google Drive ذخیره شد ✓');
      })
      .catch(() => {
        if (interactive) toast('ذخیره در گوگل نشد؛ یک‌بار دیگر ثبت را بزن');
      })
      .then(finish);
  };
  if (!tokenAlive()) {
    requestAccessToken((ok) => {
      if (ok) run();
      else {
        if (interactive) toast('برای ذخیره در گوگل دوباره ثبت را بزن');
        finish();
      }
    }, interactive === true);
    return;
  }
  run();
}

export function isGoogleLinked() { return !!(gUser || tokenAlive() || store.get(SEALED_KEY)); }
export function googleSyncOk() { return tokenAlive(); }

export function renderSyncCard() {
  if (gUser && tokenAlive()) {
    return '<div class="card"><h3>☁️ همگام‌سازی ابری</h3><div class="pc-status ok"><span class="dot"></span>' + esc(syncStatusText()) + '</div>' +
      '<div class="row gap"><button class="btn" onclick="syncNow()">همگام‌سازی الان</button><button class="btn" onclick="backupNow()">بکاپ آرشیو</button></div>' +
      '<button class="btn danger block" onclick="googleSignOutDo()">خروج کامل از گوگل</button></div>';
  }
  if (gUser) {
    return '<div class="card"><h3>☁️ اتصال به گوگل</h3><div class="small muted">اتصال به گوگل درایو برقرار نیست. برای ادامه همگام‌سازی یک بار دیگر وارد شو.</div>' +
      '<button class="btn primary block" onclick="googleSignIn()">اتصال دوباره</button></div>';
  }
  if (!googleConfigured()) {
    return '<div class="card"><h3>☁️ همگام‌سازی ابری</h3>' +
      '<div class="pc-status"><span class="dot"></span>هنوز راه‌اندازی نشده</div>' +
      '<div class="small muted">داده‌ها فعلاً فقط روی همین گوشی ذخیره می‌شوند (بدون اینترنت هم کار می‌کند). برای همگام‌سازی با Google Drive، یک OAuth Client بساز و ID را در <b>js/sync.js</b> بگذار؛ مراحل کامل در <b>SETUP.md</b>.</div></div>';
  }
  return '<div class="card"><h3>☁️ همگام‌سازی ابری</h3><div class="small muted">با حساب گوگل وارد شو تا وسایلت خودکار در Google Drive ذخیره شود و از هر دستگاهی در دسترس باشد. فقط فایل <b>koo-data.json</b> ساخته می‌شود.</div>' +
    '<button class="btn primary block" onclick="googleSignIn()">ورود با گوگل</button></div>';
}

export function initGoogleOnLoad() {
  loadSavedToken();
  consumeWorkerCallback();
  if (typeof window !== 'undefined') {
    window.googleSignIn = googleSignIn;
    window.googleSignOut = googleSignOut;
    window.googleSignOutDo = googleSignOutDo;
    window.handleCredential = handleCredential;
    window.syncNow = () => { pushToDrive(true); };
    window.backupNow = () => {
      const stamp = new Date().toISOString().slice(0, 10);
      archiveToDrive('koo-backup-' + stamp + '.json', JSON.stringify(state))
        .then(() => toast('بکاپ آرشیو در درایو ذخیره شد ✓'))
        .catch(() => toast('بکاپ نشد؛ اول وارد گوگل شو'));
    };
  }
  // GIS Credential (برای نمایش دکمه ورود در صورت نیاز)
  try {
    if (window.google && google.accounts && google.accounts.id && GOOGLE_CLIENT_ID.indexOf('YOUR_') !== 0) {
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential, auto_select: false });
    }
  } catch (e) {}
  if (tokenAlive() || store.get(SEALED_KEY)) {
    loadFromDrive(function () { render(); }, false, true);
  }
}
