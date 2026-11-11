import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://koo-app.github.io/' });
const w = dom.window;
globalThis.window = w;
globalThis.document = w.document;
globalThis.localStorage = w.localStorage;

const S = await import(new URL('../../js/state.js', import.meta.url).href);
const SC = await import(new URL('../../js/scan.js', import.meta.url).href);

let fails = 0;
function ok(name, fn) {
  try { fn(); console.log('✓', name); } catch (e) { fails++; console.log('✗', name, '—', e.message); }
}

// ── merge ──
ok('merge same book merges items by id, newer wins', () => {
  const base = { version: 1, bookId: 'b1', updatedAt: 10, rev: 1, spaces: [{ id: 's1', name: 'آشپزخانه', places: [] }], items: [] };
  const local = JSON.parse(JSON.stringify(base));
  local.items = [{ id: 'i1', name: 'کابل', updatedAt: 20 }];
  local.updatedAt = 100;
  const remote = JSON.parse(JSON.stringify(base));
  remote.items = [{ id: 'i1', name: 'کابل قدیمی', updatedAt: 5 }, { id: 'i2', name: 'پاوربانک', updatedAt: 30 }];
  remote.spaces.push({ id: 's2', name: 'اتاق', places: [] });
  remote.updatedAt = 50;
  const m = S.mergeStates(local, remote);
  if (m.items.length !== 2) throw new Error('items ' + m.items.length);
  if (m.items.find((x) => x.id === 'i1').name !== 'کابل') throw new Error('newer item lost');
  if (m.spaces.length !== 2) throw new Error('spaces ' + m.spaces.length);
});

ok('different bookId → newer whole state wins', () => {
  const a = { version: 1, bookId: 'a', updatedAt: 200, rev: 2, spaces: [{ id: 'x', name: 'قدیمی', places: [] }], items: [] };
  const b = { version: 1, bookId: 'b', updatedAt: 100, rev: 1, spaces: [{ id: 'y', name: 'دیگری', places: [] }], items: [] };
  const m = S.mergeStates(a, b);
  if (m.spaces[0].name !== 'قدیمی') throw new Error('wrong winner');
});

ok('fingerprint ignores updatedAt/rev', () => {
  const a = { bookId: 'b', updatedAt: 1, rev: 1, spaces: [], items: [] };
  const b = { bookId: 'b', updatedAt: 99, rev: 9, spaces: [], items: [] };
  if (S.fingerprint(a) !== S.fingerprint(b)) throw new Error('fingerprint differs');
});

ok('locationText combines space › place', () => {
  S.state.spaces = [{ id: 's1', name: 'آشپزخانه', places: [{ id: 'p1', name: 'کشو' }] }];
  if (S.locationText({ spaceId: 's1', placeId: 'p1' }) !== 'آشپزخانه › کشو') throw new Error(S.locationText({ spaceId: 's1', placeId: 'p1' }));
  if (S.locationText({ spaceId: '', placeId: '' }) !== 'بدون مکان') throw new Error('no-space text');
});

// ── AI routing ──
const realFetch = globalThis.fetch;
let calls = [];
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return handler(String(url), init || {});
  };
}
const jsonRes = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const geminiOk = (text) => jsonRes({ candidates: [{ content: { parts: [{ text }] } }] });

ok('fallback: proxy first when direct unreachable, item parsed', async () => {
  // direct probe fails → order = proxy first
  mockFetch((url) => {
    if (url.includes('generativelanguage')) throw new Error('net down');
    if (url.includes('/api/gemini')) return geminiOk('```json\n{"name":"کابل تایپ‌سی","category":"cable"}\n```');
    return jsonRes({}, 404);
  });
  SC.saveDirectOk(false);
  localStorage.setItem('koo_gemini_key', 'AIzaTEST');
  const out = await SC.recognizeImageB64('AAAA');
  if (out.name !== 'کابل تایپ‌سی') throw new Error('name ' + out.name);
  if (out.category !== 'cable') throw new Error('cat ' + out.category);
  if (!calls.some((u) => u.includes('/api/gemini'))) throw new Error('proxy not used');
});

ok('fallback: proxy fails → direct succeeds', async () => {
  mockFetch((url) => {
    if (url.includes('/api/gemini')) return jsonRes({ error: { message: 'boom' } }, 500);
    if (url.includes('generativelanguage')) return geminiOk('{"name":"پاوربانک","category":"phone"}');
    return jsonRes({}, 404);
  });
  SC.saveDirectOk(false);
  localStorage.setItem('koo_gemini_key', 'AIzaTEST');
  const out = await SC.recognizeImageB64('AAAA');
  if (out.name !== 'پاوربانک') throw new Error(out.name);
  if (!calls.some((u) => u.includes('generativelanguage'))) throw new Error('direct not tried');
});

ok('unknown category falls back to other', async () => {
  mockFetch(() => geminiOk('{"name":"چیز","category":"food"}'));
  SC.saveDirectOk(true);
  const out = await SC.recognizeImageB64('AAAA');
  if (out.category !== 'other') throw new Error(out.category);
});

ok('region block message mentions VPN (both routes)', async () => {
  mockFetch((url) => jsonRes({ error: { message: 'User location is not supported for the API use.' } }, 403));
  SC.saveDirectOk(false);
  localStorage.setItem('koo_gemini_key', 'AIzaTEST');
  let msg = '';
  try { await SC.recognizeImageB64('AAAA'); } catch (e) { msg = e.message; }
  if (!/فیلترشکن|منطقه/.test(msg)) throw new Error('msg=' + msg);
});

ok('connection test without key → no-key', async () => {
  localStorage.setItem('koo_gemini_key', '');
  const rep = await SC.testGeminiConnection();
  if (rep.verdict !== 'no-key') throw new Error(rep.verdict);
});

ok('connection test reports both routes', async () => {
  mockFetch((url) => {
    if (url.includes('generativelanguage')) return jsonRes({ models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }] });
    if (url.includes('/api/gemini')) return jsonRes({ models: [] });
    return jsonRes({}, 404);
  });
  localStorage.setItem('koo_gemini_key', 'AIzaTEST');
  const rep = await SC.testGeminiConnection();
  if (rep.verdict !== 'ok') throw new Error(rep.verdict + ' ' + rep.detail);
  if (!rep.direct || !rep.proxy) throw new Error('missing route info');
  if (!/direct=/.test(rep.detail) || !/proxy=/.test(rep.detail)) throw new Error(rep.detail);
  if (!calls.some((u) => u.includes('generativelanguage')) || !calls.some((u) => u.includes('/api/gemini'))) throw new Error('routes: ' + calls.join(','));
});

ok('model list filters non text models', async () => {
  mockFetch(() => jsonRes({ models: [
    { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.5-flash-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
  ] }));
  SC.saveDirectOk(true);
  localStorage.setItem('koo_gemini_key', 'AIzaTEST');
  localStorage.removeItem('koo_gemini_models_v1');
  const out = await SC.recognizeImageB64('AAAA');
  if (calls.length === 0) throw new Error('no calls');
});

globalThis.fetch = realFetch;
console.log(fails ? '\n' + fails + ' failed' : '\nall logic tests passed');
process.exit(fails ? 1 : 0);
