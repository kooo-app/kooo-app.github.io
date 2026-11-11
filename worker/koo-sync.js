// ════════════════════════════════════════════════════════════════════
// ورکر کلودفلر کو — تمدید بی‌صدا توکن گوگل درایو
// الگو عیناً از تراز (taraz-sync). بدون سرور و دیتابیس؛ هیچ‌چیز ذخیره نمی‌شود.
//
// مسیر مقصد: Worker با نام koo-sync → https://koo-sync.<account>.workers.dev
//
// Secrets (wrangler secret put):
//   GOOGLE_CLIENT_ID      شناسه OAuth Client
//   GOOGLE_CLIENT_SECRET  رمز همان Client
//   SEAL_KEY              هر رشته ≥۱۶ کاراکتر برای رمزکردن refresh token
// Var:
//   ALLOWED_APP           https://kooo-app.github.io   (پیش‌فرض همین)
//
// مسیرها:
//   GET  /start?app=&n=    شروع ورود گوگل (state رمزشده، ۱۵ دقیقه اعتبار)
//   GET  /callback        بازگشت گوگل → توکن‌ها در fragment به برنامه
//   POST /refresh         {sealed} → access_token تازه + sealed به‌روز
//   POST /revoke          {sealed} → لغو دسترسی
//   GET  /health          {ok:true, app}
//
// scope: drive.file openid email profile
// ════════════════════════════════════════════════════════════════════

const SCOPE = 'drive.file openid email profile';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const STATE_TTL_MS = 15 * 60 * 1000;

function b64uEncode(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sealKey(env) {
  const data = new TextEncoder().encode('koo-sync|' + String(env.SEAL_KEY || ''));
  return crypto.subtle.digest('SHA-256', data);
}
async function seal(obj, env) {
  const key = await crypto.subtle.importKey('raw', await sealKey(env), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt));
  const all = new Uint8Array(iv.length + ct.length);
  all.set(iv, 0);
  all.set(ct, iv.length);
  return b64uEncode(all);
}
async function unseal(str, env) {
  const all = b64uDecode(String(str || ''));
  if (all.length < 13) throw new Error('bad_seal');
  const iv = all.slice(0, 12);
  const ct = all.slice(12);
  const key = await crypto.subtle.importKey('raw', await sealKey(env), 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

function cors(origin, env) {
  const allowed = String(env.ALLOWED_APP || 'https://kooo-app.github.io');
  const ok = origin && (origin === allowed || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'));
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ok) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
function json(origin, env, body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, cors(origin, env)),
  });
}
function html(msg, status) {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>کو</title>' +
    '<body style="font-family:system-ui,Tahoma,sans-serif;text-align:center;padding:40px 20px">' +
    '<div style="font-size:40px">کو</div><p>' + msg + '</p></body>',
    { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}
function appOf(env) {
  return String(env.ALLOWED_APP || 'https://kooo-app.github.io');
}
function redirectUri(req) {
  const u = new URL(req.url);
  return u.origin + '/callback';
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });

    if (url.pathname === '/health') return json(origin, env, { ok: true, app: appOf(env), scope: SCOPE });

    if (url.pathname === '/start' && req.method === 'GET') {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SEAL_KEY) {
        return html('ورکر تنظیم نشده است: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SEAL_KEY را ست کن.', 500);
      }
      const app = url.searchParams.get('app') || appOf(env);
      const n = (url.searchParams.get('n') || '').slice(0, 64);
      const state = await seal({ app, n, exp: Date.now() + STATE_TTL_MS }, env);
      const authUrl = new URL(AUTH);
      authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri(req));
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPE);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('include_granted_scopes', 'true');
      authUrl.searchParams.set('state', state);
      return Response.redirect(authUrl.toString(), 302);
    }

    if (url.pathname === '/callback' && req.method === 'GET') {
      const err = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      let info = null;
      try { info = await unseal(state, env); } catch (e) { info = null; }
      if (!info || !info.exp || info.exp < Date.now() || !info.app) {
        return html('درخواست ورود منقضی یا نامعتبر است. از خود برنامه دوباره وارد شو.', 400);
      }
      const app = String(info.app);
      const n = String(info.n || '');
      const back = (params) => {
        const u = new URL(app);
        u.hash = params.toString();
        return Response.redirect(u.toString(), 302);
      };
      if (err) return back(new URLSearchParams({ gerr: err, n }));
      if (!code) return back(new URLSearchParams({ gerr: 'no_code', n }));
      let tok;
      try {
        const r = await fetch(TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri(req),
            grant_type: 'authorization_code',
          }),
        });
        tok = await r.json();
        if (!r.ok) return back(new URLSearchParams({ gerr: (tok && tok.error) || 'token_exchange', n }));
      } catch (e) {
        return back(new URLSearchParams({ gerr: 'net', n }));
      }
      let email = '';
      let name = '';
      let picture = '';
      if (tok.id_token) {
        try {
          const p = JSON.parse(atob(tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          email = p.email || '';
          name = p.name || '';
          picture = p.picture || '';
        } catch (e) {}
      }
      const params = new URLSearchParams({ access_token: tok.access_token || '', expires_in: String(tok.expires_in || 3600), email, name, picture: '' });
      if (tok.refresh_token) {
        params.set('sealed', await seal({ rt: tok.refresh_token, email }, env));
      } else {
        params.set('gerr', 'no_refresh_token');
      }
      return back(params);
    }

    if (url.pathname === '/refresh' && req.method === 'POST') {
      let body = {};
      try { body = await req.json(); } catch (e) {}
      const sealed = body && body.sealed;
      if (!sealed) return json(origin, env, { error: 'missing_sealed' }, 400);
      let info;
      try { info = await unseal(sealed, env); } catch (e) { return json(origin, env, { error: 'bad_seal' }, 400); }
      if (!info || !info.rt) return json(origin, env, { error: 'bad_seal' }, 400);
      try {
        const r = await fetch(TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: info.rt,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token',
          }),
        });
        const j = await r.json();
        if (!r.ok) return json(origin, env, { error: (j && j.error) || 'refresh_failed' }, r.status === 400 ? 200 : r.status);
        const out = { access_token: j.access_token, expires_in: j.expires_in || 3600, email: info.email || '' };
        // اگر گوگل refresh_token جدید داد، آن را هم مهر و موم کن
        if (j.refresh_token) out.sealed = await seal({ rt: j.refresh_token, email: info.email || '' }, env);
        return json(origin, env, out);
      } catch (e) {
        return json(origin, env, { error: 'net' }, 502);
      }
    }

    if (url.pathname === '/revoke' && req.method === 'POST') {
      let body = {};
      try { body = await req.json(); } catch (e) {}
      let info = null;
      try { info = await unseal(body && body.sealed, env); } catch (e) {}
      if (info && info.rt) {
        try {
          await fetch(REVOKE + '?token=' + encodeURIComponent(info.rt), { method: 'POST' });
        } catch (e) {}
      }
      return json(origin, env, { ok: true });
    }

    return json(origin, env, { error: 'not_found' }, 404);
  },
};
