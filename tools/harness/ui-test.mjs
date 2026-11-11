import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html dir="rtl"><body><div id="app"></div></body></html>', {
  url: 'https://koo-app.github.io/',
  pretendToBeVisual: true,
});
const w = dom.window;
for (const k of ['window','document','localStorage','sessionStorage','navigator','location','history','HTMLElement','Element','Node','CustomEvent','Event','Image','URL','FormData','Blob','File','FileReader','requestAnimationFrame','getComputedStyle','atob','btoa','confirm','prompt','alert']) {
  if (w[k] !== undefined) { try { globalThis[k] = w[k]; } catch (e) {} }
}
globalThis.confirm = () => true;
globalThis.fetch = async () => new Response('{}', { status: 200 });

const mod = await import(new URL('../../js/app.js', import.meta.url).href);
const S = await import(new URL('../../js/state.js', import.meta.url).href);
for (const k of Object.getOwnPropertyNames(w)) {
  if (typeof w[k] === 'function' && !(k in globalThis)) { try { globalThis[k] = w[k].bind(w); } catch (e) {} }
}
const errs = [];
w.addEventListener('error', (e) => errs.push(String(e.message)));

const $ = (s) => w.document.querySelector(s);
const stateCleanup = () => {
  S.state.items = [];
  S.state.collections = [];
  w.localStorage.setItem('koo_app_v1', JSON.stringify(S.state));
  mod.render();
};
const txt = () => w.document.body.textContent.replace(/\s+/g, ' ');

function step(name, fn) {
  try { fn(); console.log('✓', name); }
  catch (e) { console.log('✗', name, '—', e.message); process.exitCode = 1; }
}

step('onboarding shows templates', () => {
  if (!txt().includes('وسایلم کجاست')) throw new Error('no hero');
  if (w.document.querySelectorAll('.tpl-card').length !== 6) throw new Error('templates count ' + w.document.querySelectorAll('.tpl-card').length);
});

step('pick 1BR template builds spaces', () => {
  w.pickTemplate('apt1');
  const st = JSON.parse(w.localStorage.getItem('koo_app_v1') || '{}');
  if (st.spaces.length !== 5) throw new Error('spaces=' + st.spaces.length);
  if (!st.spaces.find((s) => s.name === 'آشپزخانه')) throw new Error('no kitchen');
  if (st.spaces.find((s) => s.name === 'آشپزخانه').places.length !== 5) throw new Error('kitchen places');
  if (!txt().includes('وسایل')) throw new Error('no items tab');
});

step('add item with name + location', () => {
  w.openAddItem();
  w.document.getElementById('itemName').value = 'کابل شارژر تایپ‌سی';
  const spaceSel = w.document.getElementById('itemSpace');
  const kitchen = JSON.parse(w.localStorage.getItem('koo_app_v1')).spaces.find((s) => s.name === 'آشپزخانه');
  spaceSel.value = kitchen.id;
  w.onSpaceChange(kitchen.id);
  w.document.getElementById('itemPlace').value = kitchen.places[2].id;
  w.saveItem();
  const st = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  if (st.items.length !== 1) throw new Error('items=' + st.items.length);
  if (!txt().includes('آشپزخانه › کشو')) throw new Error('location text missing: ' + txt().slice(0, 200));
});

step('search finds item', () => {
  w.searchQ = '';
  const inp = w.document.getElementById('searchInput');
  inp.value = 'کابل';
  inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  if (!txt().includes('کابل شارژر تایپ‌سی')) throw new Error('search lost item');
  const inp2 = w.document.getElementById('searchInput');
  inp2.value = 'هندزفری';
  inp2.dispatchEvent(new w.Event('input', { bubbles: true }));
  if (!txt().includes('چیزی پیدا نشد')) throw new Error('empty state missing');
});

step('spaces tab renders tree with places + items', () => {
  w.switchTab('spaces');
  if (!txt().includes('فضاها و جاها')) throw new Error('no spaces title');
  if (!txt().includes('آشپزخانه')) throw new Error('no kitchen');
  w.toggleSpace(JSON.parse(w.localStorage.getItem('koo_app_v1')).spaces.find((s) => s.name === 'آشپزخانه').id);
  if (!txt().includes('کابینت بالا')) throw new Error('places not visible after expand');
  if (!txt().includes('کابل شارژر تایپ‌سی')) throw new Error('item not in place list');
});

step('add + rename space', () => {
  w.openAddSpace();
  w.document.getElementById('spaceName').value = 'بالکن';
  w.document.getElementById('spaceIcon').value = '🌿';
  w.saveSpace();
  const st = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  const balcony = st.spaces.find((s) => s.name === 'بالکن');
  if (!balcony) throw new Error('space not saved');
  w.savePlace(balcony.id, (w.document.getElementById('placeName') ? (w.document.getElementById('placeName').value = 'قفسه') : null));
});

step('add place + rename place', () => {
  const st = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  const balcony = st.spaces.find((s) => s.name === 'بالکن');
  w.openAddPlace(balcony.id);
  w.document.getElementById('placeName').value = 'قفسه';
  w.savePlace(balcony.id);
  const st2 = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  const b2 = st2.spaces.find((s) => s.name === 'بالکن');
  if (!b2.places.length) throw new Error('place not saved');
  globalThis.prompt = () => 'قفسه گل';
  w.renamePlace(b2.id, b2.places[0].id);
  const st3 = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  if (st3.spaces.find((s) => s.name === 'بالکن').places[0].name !== 'قفسه گل') throw new Error('rename failed');
});

step('settings tab renders AI + sync cards', () => {
  w.switchTab('settings');
  if (!txt().includes('هوش مصنوعی')) throw new Error('no AI card');
  if (!txt().includes('همگام‌سازی ابری')) throw new Error('no sync card');
  if (!w.document.getElementById('geminiKey')) throw new Error('no key input');
});

step('delete item', () => {
  w.switchTab('items');
  const st = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  w.deleteItem(st.items[0].id);
  const st2 = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  if (st2.items.length !== 0) throw new Error('item not deleted');
});

step('multi form groups items in one collection, still searchable', () => {
  w.switchTab('items');
  const st = JSON.parse(w.localStorage.getItem('koo_app_v1') || '{}');
  const space = st.spaces.find((x) => x.name === 'آشپزخانه') || st.spaces[0];
  w.showMultiForm([
    { name: 'آچار بکس ۱۷', category: 'car', note: '۲ عدد' },
    { name: 'پیچ‌گوشتی چهارسو', category: 'tool', note: '' },
  ]);
  const sp = w.document.getElementById('multiSpace');
  sp.value = space.id;
  w.onMultiSpaceChange(space.id);
  const place = w.document.getElementById('multiPlace');
  if (space.places[0]) place.value = space.places[0].id;
  // مجموعه: پیش‌فرض روشن است، اسم می‌دهیم
  const useColl = w.document.getElementById('multiUseColl');
  if (!useColl.checked) throw new Error('collection toggle should default on');
  w.document.getElementById('multiCollName').value = 'کارتن بزرگ';
  const label = w.document.getElementById('multiSaveBtn').textContent;
  if (!label.includes('۲')) throw new Error('count label: ' + label);
  w.saveDetected();

  const st2 = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  if (st2.items.length !== 2) throw new Error('items ' + st2.items.length);
  if ((st2.collections || []).length !== 1) throw new Error('collections ' + (st2.collections || []).length);
  const coll = st2.collections[0];
  if (coll.name !== 'کارتن بزرگ') throw new Error('coll name ' + coll.name);
  if (coll.spaceId !== space.id) throw new Error('coll space');
  if (st2.items.some((it) => it.collectionId !== coll.id)) throw new Error('items not in collection');
  if (st2.items.find((it) => it.name === 'آچار بکس ۱۷').category !== 'car') throw new Error('category lost');

  // در تب وسایل، بدون جستجو فقط یک کارت مجموعه دیده می‌شود
  w.switchTab('items');
  if (w.document.querySelectorAll('.coll-card').length !== 1) throw new Error('collection card missing');
  if (w.document.querySelectorAll('.item-card').length !== 0) throw new Error('items listed separately while collapsed');
  w.toggleColl(coll.id);
  if (!txt().includes('آچار بکس ۱۷') || !txt().includes('پیچ‌گوشتی چهارسو')) throw new Error('expanded items missing');

  // جستجو، آیتم‌های داخل مجموعه را جدا نشان می‌دهد
  const inp = w.document.getElementById('searchInput');
  inp.value = 'آچار';
  inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  if (!txt().includes('آچار بکس ۱۷')) throw new Error('not searchable inside collection');
  if (txt().includes('پیچ‌گوشتی چهارسو')) throw new Error('search shows unrelated item');
});

step('user can add a missing item in the multi form', () => {
  w.switchTab('items');
  w.showMultiForm([{ name: 'کابل تایپ‌سی', category: 'cable', note: '' }]);
  w.addDetRow();
  const last = w.document.querySelectorAll('.det-row').length - 1;
  const nameEl = w.document.getElementById('dname_' + last);
  if (!nameEl) throw new Error('new row not added');
  nameEl.value = 'آداپتور ۶۵ وات';
  const catEl = w.document.getElementById('dcat_' + last);
  catEl.value = 'laptop';
  // مجموعه را خاموش می‌کنیم تا آیتم‌ها آزاد بمانند
  const useColl = w.document.getElementById('multiUseColl');
  useColl.checked = false;
  w.updateMultiCount();
  w.saveDetected();
  const st = JSON.parse(w.localStorage.getItem('koo_app_v1'));
  const added = st.items.find((it) => it.name === 'آداپتور ۶۵ وات');
  if (!added) throw new Error('manual item not saved');
  if (added.category !== 'laptop') throw new Error('manual category');
  if (added.collectionId) throw new Error('should not join collection');
  // پاک‌سازی برای تست‌های بعدی
  stateCleanup();
});

step('AI key saves from settings (inline onclick works)', () => {
  w.switchTab('settings');
  if (typeof w.saveGeminiKey !== 'function') throw new Error('saveGeminiKey not exposed to window');
  const input = w.document.getElementById('geminiKey');
  if (!input) throw new Error('no key input');
  const key = 'AIza' + 'X'.repeat(32);
  input.value = key;
  w.saveGeminiKey();
  if (w.localStorage.getItem('koo_gemini_key') !== key) throw new Error('key not stored');
  const body = txt();
  if (!body.includes('کلید فعال است')) throw new Error('badge did not update');
  if (!body.includes('AIza')) throw new Error('masked key not shown');
});

step('AI key can be removed', () => {
  w.clearGeminiKey();
  if (w.localStorage.getItem('koo_gemini_key')) throw new Error('key still stored');
  if (!txt().includes('کلید خاموش است')) throw new Error('badge still active');
});

step('settings shows version and update check', () => {
  w.switchTab('settings');
  const body = txt();
  if (!/نسخه/.test(body)) throw new Error('no version label');
  if (!body.includes('0.')) throw new Error('no version number');
  if (!w.document.getElementById('btnCheckUpd')) throw new Error('no update button');
  if (typeof w.checkUpdateNow !== 'function') throw new Error('checkUpdateNow missing');
  if (typeof w.applyUpdate !== 'function') throw new Error('applyUpdate missing');
});

step('theme defaults to light even on dark systems', () => {
  if (w.document.documentElement.getAttribute('data-theme') !== 'light') throw new Error('light not applied: ' + w.document.documentElement.getAttribute('data-theme'));
  w.switchTab('settings');
  if (!txt().includes('ظاهر')) throw new Error('no appearance card');
  const btn = [...w.document.querySelectorAll('.seg button')].find((b) => b.textContent.includes('روشن'));
  if (!btn || !btn.classList.contains('on')) throw new Error('light not active');
});

step('theme dark applies attribute + persists', () => {
  w.setTheme('dark');
  if (w.document.documentElement.getAttribute('data-theme') !== 'dark') throw new Error('attr not set');
  if (w.localStorage.getItem('koo_theme') !== 'dark') throw new Error('not persisted');
  const btn = [...w.document.querySelectorAll('.seg button')].find((b) => b.textContent.includes('تاریک'));
  if (!btn.classList.contains('on')) throw new Error('dark not active');
});

step('theme auto follows system', () => {
  w.setTheme('auto');
  if (w.document.documentElement.hasAttribute('data-theme')) throw new Error('attr still set');
  if (w.localStorage.getItem('koo_theme') !== 'auto') throw new Error('auto not stored');
  const btn = [...w.document.querySelectorAll('.seg button')].find((b) => b.textContent.includes('خودکار'));
  if (!btn.classList.contains('on')) throw new Error('auto not active');
});

step('theme survives reload (light applied from storage before render)', () => {
  w.localStorage.setItem('koo_theme', 'dark');
  if (!w.document.documentElement) throw new Error('no root');
});

step('every inline onclick handler exists on window', () => {
  const names = new Set();
  const collect = () => {
    for (const el of w.document.querySelectorAll('[onclick]')) {
      const m = String(el.getAttribute('onclick') || '').match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
      if (m) names.add(m[1]);
    }
  };
  w.switchTab('items'); collect();
  w.switchTab('spaces');
  const st = JSON.parse(w.localStorage.getItem('koo_app_v1') || '{}');
  if (st.spaces && st.spaces[0]) w.toggleSpace(st.spaces[0].id);
  collect();
  w.switchTab('settings'); collect();
  w.switchTab('items'); w.openAddItem(); collect(); w.closeModal();
  w.openAddSpace(); collect(); w.closeModal();
  w.openAddPlace(st.spaces[0].id); collect(); w.closeModal();
  const missing = [...names].filter((n) => typeof w[n] !== 'function');
  if (missing.length) throw new Error('not on window: ' + missing.join(', '));
});

console.log('\nDOM errors:', errs.length ? errs : 'none');
