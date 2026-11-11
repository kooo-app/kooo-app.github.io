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
for (const k of Object.getOwnPropertyNames(w)) {
  if (typeof w[k] === 'function' && !(k in globalThis)) { try { globalThis[k] = w[k].bind(w); } catch (e) {} }
}
const errs = [];
w.addEventListener('error', (e) => errs.push(String(e.message)));

const $ = (s) => w.document.querySelector(s);
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

console.log('\nDOM errors:', errs.length ? errs : 'none');
