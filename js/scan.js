// scan — هوش مصنوعی کو: شناسایی وسیله از عکس با Gemini
// الگو عیناً از تراز: کلید خود کاربر (BYOK) + دو مسیر (مستقیم گوگل / پل ورسل)
// پل ورسل: tools/api-gemini.js در ریپوی koo-api → https://koo-api.vercel.app/api/gemini
import { store, toast } from './utils.js';

const KEY = 'koo_gemini_key';
const GEMINI_PROXY = 'https://koo-api.vercel.app/api/gemini';

const MODELS_CACHE_KEY = 'koo_gemini_models_v1';
const GOOD_MODEL_KEY = 'koo_gemini_model_ok';
const MODELS_CACHE_TTL = 7 * 24 * 3600 * 1000;

const GAPI_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DIRECT_OK_KEY = 'koo_gemini_direct_ok';
const DIRECT_OK_TTL = 10 * 60 * 1000;
const REGION_BLOCKED = /user location is not supported|unavailable in your country|not supported in your (country|region)/i;

function readDirectOk() {
  try {
    const raw = store.get(DIRECT_OK_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || Date.now() - (o.at || 0) > DIRECT_OK_TTL) return null;
    return !!o.ok;
  } catch (e) { return null; }
}
export function saveDirectOk(ok) {
  try { store.set(DIRECT_OK_KEY, JSON.stringify({ at: Date.now(), ok: !!ok })); } catch (e) {}
}
async function probeDirect(timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, timeoutMs || 4000);
  try {
    const r = await fetch(GAPI_ROOT, { signal: ctl.signal });
    const body = await r.text().catch(() => '');
    if (r.status === 403 && REGION_BLOCKED.test(body)) return false;
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
export async function directRouteOk(force) {
  if (!force) { const cached = readDirectOk(); if (cached !== null) return cached; }
  const ok = await probeDirect();
  saveDirectOk(ok);
  return ok;
}

function readModelsCache() {
  try {
    const raw = store.get(MODELS_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.list) || !o.list.length) return null;
    if (Date.now() - (o.at || 0) > MODELS_CACHE_TTL) return null;
    return o.list;
  } catch (e) { return null; }
}

async function geminiProxy(payload) {
  const resp = await fetch(GEMINI_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (resp.status === 404 || resp.status === 408 || resp.status === 413 || resp.status === 425 || resp.status >= 500)
    throw Object.assign(new Error('proxy-down'), { proxyDown: true, status: resp.status });
  return resp;
}

const MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
];

export function hasGeminiKey() { return !!store.get(KEY); }
export function getGeminiKey() { return (store.get(KEY) || '').trim(); }

export function saveGeminiKey() {
  const el = document.getElementById('geminiKey');
  const v = (el && el.value ? el.value : '').trim();
  if (!v) { toast('کلید را بچسبان'); return; }
  store.set(KEY, v);
  toast('کلید ذخیره شد');
  if (typeof window.openSettingsAI === 'function') window.openSettingsAI();
}
export function clearGeminiKey() {
  store.set(KEY, '');
  toast('کلید پاک شد');
  if (typeof window.openSettingsAI === 'function') window.openSettingsAI();
}

export function fileToJpeg(file, max, quality) {
  max = max || 1280;
  quality = quality || 0.72;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > max || h > max) {
        const s = max / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', quality);
      resolve(data.split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('خواندن عکس نشد'));
    };
    img.src = url;
  });
}

// عکس کوچک برای ذخیره دائمی در لیست وسایل (فاز ۱: داخل JSON درایو)
export async function makeThumb(file, max) {
  const b64 = await fileToJpeg(file, max || 480, 0.72);
  return 'data:image/jpeg;base64,' + b64;
}

const ITEM_PROMPT = `این یک عکس از یک وسیله یا شیء شخصی است (مثل کابل شارژر، هندزفری، پاوربانک، قاب گوشی، لپ‌تاپ، ابزار و...).
فقط یک JSON معتبر برگردان، بدون متن اضافه.
نام را کوتاه و فارسی بنویس (مثلاً «کابل شارژر تایپ‌سی»، «هندزفری بلوتوثی»، «پاوربانک»).
دسته‌بندی (category) فقط یکی از این‌هاست: phone, cable, audio, laptop, wear, tool, doc, other
- phone = موبایل و شارژر و پاوربانک
- cable = کابل و آداپتور
- audio = هندزفری و هدفون و اسپیکر
- laptop = لپ‌تاپ و کامپیوتر و لوازم جانبی
- wear = پوشیدنی و شخصی
- tool = ابزار
- doc = مدارک و کارت
- other = بقیه
اگر مطمئن نیستی، other بگذار.
شکل JSON:
{"name":"نام وسیله","category":"cable","note":"توضیح کوتاه اختیاری"}`;

function parseModelJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const startObj = s.indexOf('{');
  if (startObj >= 0) {
    const end = s.lastIndexOf('}');
    if (end > startObj) {
      try { return JSON.parse(s.slice(startObj, end + 1)); } catch (e) {}
    }
  }
  return null;
}

function genBody(prompt, b64, jsonMode) {
  const generationConfig = { temperature: 0.1 };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';
  const parts = [{ text: prompt }];
  if (b64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
  return JSON.stringify({ contents: [{ parts }], generationConfig });
}

async function directGenerate(model, key, prompt, b64, jsonMode) {
  const url = GAPI_ROOT + '/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: genBody(prompt, b64, jsonMode),
    });
  } catch (e) { return null; }
}
async function proxyGenerate(key, model, prompt, b64, jsonMode) {
  try {
    return await geminiProxy({ key, model, prompt, imageB64: b64, jsonMode: !!jsonMode });
  } catch (e) { return null; }
}

function bestRouteError(errs) {
  if (!errs.length) return Object.assign(new Error('no-route'), { noRoute: true });
  const real = errs.filter((e) => e.status);
  const pick = real.length ? real[0] : errs[0];
  const err = new Error(pick.message || 'خطای ' + pick.status);
  err.status = pick.status;
  err.route = pick.route;
  err.errs = errs;
  if (!real.length) err.noRoute = true;
  if (errs.some((x) => x.route === 'proxy' && REGION_BLOCKED.test(x.message || ''))) err.regionViaProxy = true;
  if (errs.some((x) => x.route === 'direct' && REGION_BLOCKED.test(x.message || ''))) err.regionViaDirect = true;
  return err;
}

async function callGemini(model, key, b64, prompt, jsonMode) {
  const order = (await directRouteOk()) === true ? ['direct', 'proxy'] : ['proxy', 'direct'];
  const errs = [];
  let resp = null;
  let data = null;
  for (const route of order) {
    const r = route === 'direct'
      ? await directGenerate(model, key, prompt, b64, jsonMode)
      : await proxyGenerate(key, model, prompt, b64, jsonMode);
    if (!r) { errs.push({ route, status: 0, message: '' }); continue; }
    const d = await r.json().catch(() => ({}));
    if (r.ok) { resp = r; data = d; saveDirectOk(route === 'direct'); break; }
    const gmsg = String((d && d.error && d.error.message) || '');
    errs.push({ route, status: r.status, message: gmsg });
    if (route === 'direct') saveDirectOk(false);
  }
  if (!resp) throw bestRouteError(errs);
  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts.map((p) => p.text || '').join('\n');
  return parseModelJson(text);
}

async function fetchTimeout(url, init, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, ms || 8000);
  try {
    return await fetch(url, Object.assign({}, init, { signal: ctl.signal }));
  } finally { clearTimeout(timer); }
}

export async function testGeminiConnection() {
  const key = getGeminiKey();
  const rep = { key: !!key, direct: null, proxy: null, models: 0, verdict: '', hint: '' };
  if (!key) {
    rep.verdict = 'no-key';
    rep.hint = 'اول کلید را در همین بخش ذخیره کن.';
    return rep;
  }
  try {
    const r = await fetchTimeout(GAPI_ROOT + '?key=' + encodeURIComponent(key), null, 8000);
    const body = await r.text().catch(() => '');
    rep.direct = { status: r.status, ok: !!r.ok, region: REGION_BLOCKED.test(body), body: body.slice(0, 160) };
    if (r.ok) { try { rep.models = (JSON.parse(body).models || []).length; } catch (e) {} }
  } catch (e) {
    rep.direct = { status: 0, ok: false, region: false, error: String((e && e.message) || e).slice(0, 80) };
  }
  try {
    const r = await fetchTimeout(GEMINI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', key }),
    }, 20000);
    const data = await r.json().catch(() => ({}));
    const msg = String((data && data.error && data.error.message) || '');
    rep.proxy = { status: r.status, ok: !!r.ok, region: REGION_BLOCKED.test(msg), msg: (msg || (data && data.error ? JSON.stringify(data.error).slice(0, 120) : '')).slice(0, 160) };
    if (r.ok && data && data.models) rep.models = Math.max(rep.models, data.models.length);
  } catch (e) {
    rep.proxy = { status: 0, ok: false, region: false, error: String((e && e.message) || e).slice(0, 80) };
  }
  saveDirectOk(!!(rep.direct && rep.direct.ok));
  if (rep.direct.ok || rep.proxy.ok) {
    rep.verdict = 'ok';
    rep.hint = rep.direct.ok
      ? 'هر دو مسیر کار می‌کند؛ از گوگل مستقیم می‌رویم.' + (rep.models ? ' (' + rep.models + ' مدل)' : '')
      : 'مسیر مستقیم بسته است ولی پل ورسل کار می‌کند؛ از پل می‌رویم.' + (rep.models ? ' (' + rep.models + ' مدل)' : '');
  } else if (rep.proxy.region || rep.direct.region) {
    rep.verdict = 'region';
    rep.hint = rep.proxy.region
      ? 'سرویس هوش مصنوعی گوگل این درخواست را به دلیل منطقه رد کرد — هم از اینترنت تو هم از سرور پل. فیلترشکن را با یک کشور/سرور دیگر عوض کن و دوباره آزمایش کن. (ورود به گوگل و همگام‌سازی درایو این محدودیت را ندارند.)'
      : 'مسیر مستقیم گوگل به دلیل منطقه بسته است و پل هم خطا داد؛ فیلترشکن را با یک کشور/سرور دیگر عوض کن.';
  } else if ([rep.direct.status, rep.proxy.status].indexOf(429) >= 0) {
    rep.verdict = 'quota';
    rep.hint = 'سهمیه رایگان کلید تمام شده؛ فردا دوباره امتحان کن.';
  } else if ([rep.direct.status, rep.proxy.status].some((x) => x === 400 || x === 403)) {
    rep.verdict = 'key';
    rep.hint = 'کلید معتبر نیست یا اجازه این کار را ندارد؛ دوباره کلید بساز و ذخیره کن.';
  } else {
    rep.verdict = 'net';
    rep.hint = 'نه گوگل جواب داد نه پل ورسل؛ اینترنت یا فیلترشکن را چک کن.';
  }
  rep.detail = 'direct=' + (rep.direct ? rep.direct.status + (rep.direct.region ? '/region' : '') : '-') +
    ' proxy=' + (rep.proxy ? rep.proxy.status + (rep.proxy.region ? '/region' : '') : '-') +
    ((rep.proxy && rep.proxy.msg) ? ' :: ' + rep.proxy.msg : ((rep.proxy && rep.proxy.error) ? ' :: ' + rep.proxy.error : ''));
  return rep;
}

function shortErr(e) {
  const raw = (e && e.message) || String(e || '');
  const s = raw.toLowerCase();
  if (e && e.noRoute) return 'نه گوگل جواب داد نه پل ورسل؛ اینترنت را چک کن و در تنظیمات «آزمایش اتصال» را بزن';
  if (e && e.regionViaProxy) return 'سرویس هوش مصنوعی گوگل از منطقه تو و از سرور پل هم جواب نمی‌دهد؛ فیلترشکن را با یک کشور/سرور دیگر عوض کن';
  if (s.includes('api key') || s.includes('api_key')) return 'کلید نامعتبر است؛ در تنظیمات دوباره ذخیره کن';
  if (s.includes('quota') || s.includes('resource exhausted')) return 'سهمیه رایگان گوگل تمام شده';
  if (REGION_BLOCKED.test(raw)) return 'سرویس هوش مصنوعی گوگل از این منطقه جواب نمی‌دهد؛ فیلترشکن را با یک کشور/سرور دیگر امتحان کن';
  if (s.includes('permission') || s.includes('403')) return 'کلید اجازه این کار را ندارد';
  if (s.includes('413') || s.includes('payload too large')) return 'عکس خیلی سنگین است؛ از نزدیک‌تر و با نور بهتر بگیر';
  if (s.includes('failed to fetch') || s.includes('network') || s.includes('aborted')) return 'اتصال برقرار نشد؛ اینترنت را چک کن';
  const cut = raw.replace(/\s+/g, ' ').trim();
  return cut.length > 80 ? cut.slice(0, 80) + '…' : cut || 'شناسایی نشد';
}

async function listModels(key) {
  const directUrl = GAPI_ROOT + '?key=' + encodeURIComponent(key);
  const direct = () => fetch(directUrl).catch(() => null);
  const proxy = () => geminiProxy({ action: 'list', key }).catch(() => null);
  const routes = (await directRouteOk()) === true ? [direct, proxy] : [proxy, direct];
  let resp = null;
  for (const run of routes) {
    resp = await run();
    if (resp) break;
  }
  if (!resp) throw Object.assign(new Error('no-route'), { noRoute: true });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error((data.error && data.error.message) || 'لیست مدل نیامد');
    err.status = resp.status;
    throw err;
  }
  const names = [];
  for (const m of data.models || []) {
    const name = String(m.name || '').replace(/^models\//, '');
    const methods = m.supportedGenerationMethods || [];
    if (!name || methods.indexOf('generateContent') < 0) continue;
    if (/tts|image|live|embed|audio|imagen|veo|native/i.test(name)) continue;
    names.push(name);
  }
  names.sort((a, b) => {
    const score = (n) => {
      let s = 0;
      if (/flash/i.test(n)) s += 10;
      if (/lite/i.test(n)) s += 2;
      if (/^gemini-3/.test(n)) s += 30;
      if (/^gemini-2\.5/.test(n)) s += 20;
      return s;
    };
    return score(b) - score(a);
  });
  return names;
}

async function runGemini(prompt, b64, opts) {
  const key = getGeminiKey();
  if (!key) throw new Error('NO_KEY');
  let models = MODELS.slice();
  const cachedList = readModelsCache();
  if (cachedList && cachedList.length) {
    models = cachedList;
  } else {
    try {
      const listed = await listModels(key);
      if (listed.length) {
        models = listed;
        store.set(MODELS_CACHE_KEY, JSON.stringify({ at: Date.now(), list: listed }));
      }
    } catch (e) {}
  }
  const good = String(store.get(GOOD_MODEL_KEY) || '');
  if (good && models.indexOf(good) >= 0) models = [good].concat(models.filter((m) => m !== good));
  let lastErr = null;
  const jsonMode = !!(opts && opts.jsonMode);
  for (const model of models.slice(0, 6)) {
    try {
      let raw = await callGemini(model, key, b64, prompt, jsonMode);
      if (!raw && jsonMode) raw = await callGemini(model, key, b64, prompt, false);
      if (raw) {
        store.set(GOOD_MODEL_KEY, model);
        return raw;
      }
      lastErr = new Error('جواب قابل فهم نبود');
    } catch (e) {
      lastErr = e;
      if (jsonMode) {
        try {
          const raw = await callGemini(model, key, b64, prompt, false);
          if (raw) {
            store.set(GOOD_MODEL_KEY, model);
            return raw;
          }
        } catch (e2) { lastErr = e2; }
      }
      const msg = ((lastErr && lastErr.message) || '').toLowerCase();
      const skip = lastErr.status === 404 || msg.includes('not found') || msg.includes('supported methods');
      if (skip) {
        if (good === model) store.set(GOOD_MODEL_KEY, '');
        store.set(MODELS_CACHE_KEY, '');
      }
      if (lastErr.noRoute) break;
      if (lastErr.status === 429 || msg.includes('quota') || msg.includes('resource exhausted')) break;
      if (!skip && lastErr.status) break;
    }
  }
  throw new Error(shortErr(lastErr || new Error(b64 ? 'شناسایی نشد' : 'خواندن نشد')));
}

// شناسایی وسیله از عکس — خروجی: {name, category, note}
export async function recognizeItem(file) {
  let b64 = await fileToJpeg(file, 1280, 0.72);
  if (b64.length > 3400000) {
    try {
      const smaller = await fileToJpeg(file, 1600, 0.8);
      if (smaller && smaller.length < b64.length) b64 = smaller;
    } catch (e) {}
  }
  return recognizeImageB64(b64);
}

// جدا شده تا تست‌پذیر باشد (بدون وابستگی به canvas)
export async function recognizeImageB64(b64) {
  const raw = await runGemini(ITEM_PROMPT, b64, { jsonMode: true });
  if (!raw || !raw.name) throw new Error('در عکس وسیله‌ای پیدا نشد');
  const validCats = ['phone', 'cable', 'audio', 'laptop', 'wear', 'tool', 'doc', 'other'];
  const cat = validCats.includes(raw.category) ? raw.category : 'other';
  return { name: String(raw.name).slice(0, 80), category: cat, note: String(raw.note || '').slice(0, 200) };
}
