// app — رابط کاربری کو
import { store, toast, uid, esc, toFa, APP_VERSION } from './utils.js';
import {
  state, loadState, persistLocal, replaceState, TEMPLATES, CATEGORIES, catById,
  getSpace, getPlace, locationText, ONBOARDED_KEY,
} from './state.js';
import {
  hasGeminiKey, saveGeminiKey, clearGeminiKey, testGeminiConnection, recognizeItem, makeThumb,
} from './scan.js';
import { renderSyncCard, initGoogleOnLoad, syncStatusText, updateAvatar, gUser } from './sync.js';

let tab = 'items'; // items | spaces | settings
let searchQ = '';
let filterCat = 'all';
let filterSpace = 'all';
let expandedSpace = null;
let editingItemId = null;
let tempPhotoFile = null;
let tempPhotoData = '';
let tempSpaceId = '';
let aiBusy = false;

const $ = (id) => document.getElementById(id);

// ── تم: روشن / تاریک / خودکار (پیش‌فرض روشن) ──
const THEME_KEY = 'koo_theme';
export function getTheme() {
  const t = store.get(THEME_KEY);
  return t === 'dark' || t === 'light' ? t : 'light';
}
export function applyTheme() {
  const t = store.get(THEME_KEY) || 'light'; // پیش‌فرض روشن؛ تنها «خودکار» از سیستم پیروی می‌کند
  const root = document.documentElement;
  if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t);
  else root.removeAttribute('data-theme');
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0f17' : '#0e7490');
}
window.setTheme = (t) => {
  store.set(THEME_KEY, t);
  applyTheme();
  render();
};
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (store.get(THEME_KEY) === 'auto') applyTheme(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

export function render() {
  const root = $('app');
  if (!root) return;
  const onboarded = store.get(ONBOARDED_KEY) === '1';
  if (!onboarded && (!state.spaces || !state.spaces.length)) {
    root.innerHTML = onboardingHTML();
    return;
  }
  root.innerHTML = `
    <header class="hdr">
      <div class="logo">کو</div>
      <div class="hdr-actions">
        <button class="hdr-btn" id="btnProfile" onclick="goSettings()" title="ورود با گوگل">👤</button>
        <button class="hdr-btn" onclick="goSettings()" title="تنظیمات">⚙️</button>
      </div>
    </header>
    <main class="main">
      ${tab === 'items' ? itemsHTML() : tab === 'spaces' ? spacesHTML() : settingsHTML()}
    </main>
    <button class="fab" onclick="openAddItem()" title="افزودن وسیله">＋</button>
    <nav class="bottom-nav">
      <button class="${tab === 'items' ? 'on' : ''}" onclick="switchTab('items')"><span>📦</span>وسایل</button>
      <button class="${tab === 'spaces' ? 'on' : ''}" onclick="switchTab('spaces')"><span>🏠</span>فضاها</button>
      <button class="${tab === 'settings' ? 'on' : ''}" onclick="switchTab('settings')"><span>⚙️</span>تنظیمات</button>
    </nav>
    <div id="modalRoot"></div>
  `;
  updateAvatar();
  bindSearch();
}

function onboardingHTML() {
  return `
    <div class="onboard">
      <div class="onboard-hero">
        <div class="logo-big">کو</div>
        <h1>وسایلم کجاست؟</h1>
        <p>کو بهت می‌گه هر وسیله کجاست؛ تو کدوم اتاق، تو کدوم کشو.</p>
      </div>
      <h2>اول بگو خونه‌ت چطوریه؟</h2>
      <p class="muted">فضاها و جاهای پیش‌فرض ساخته می‌شن؛ بعداً هر وقت خواستی ویرایش می‌کنی.</p>
      <div class="tpl-list">
        ${TEMPLATES.map((t) => `
          <button class="tpl-card" onclick="pickTemplate('${t.id}')">
            <b>${t.title}</b>
            <span>${t.desc}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

window.pickTemplate = (id) => {
  const tpl = TEMPLATES.find((t) => t.id === id);
  if (!tpl) return;
  state.spaces = tpl.build();
  store.set(ONBOARDED_KEY, '1');
  persistLocal();
  toast('فضاها ساخته شد؛ حالا وسیله اضافه کن');
  render();
};

window.switchTab = (t) => { tab = t; render(); };
window.goSettings = () => { tab = 'settings'; render(); };

// ── وسایل ──
function filteredItems() {
  let list = state.items.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (filterCat !== 'all') list = list.filter((it) => it.category === filterCat);
  if (filterSpace !== 'all') list = list.filter((it) => it.spaceId === filterSpace);
  if (searchQ) {
    const q = searchQ.trim().toLowerCase();
    list = list.filter((it) => (it.name || '').toLowerCase().includes(q) || (it.note || '').toLowerCase().includes(q) || locationText(it).toLowerCase().includes(q));
  }
  return list;
}

function itemsHTML() {
  const list = filteredItems();
  const total = state.items.length;
  return `
    <div class="search-row">
      <input class="input search" id="searchInput" placeholder="دنبال چی می‌گردی؟ مثلاً کابل..." value="${esc(searchQ)}">
    </div>
    <div class="chips">
      <button class="chip ${filterCat === 'all' ? 'on' : ''}" onclick="setCat('all')">همه (${toFa(total)})</button>
      ${CATEGORIES.map((c) => {
        const n = state.items.filter((it) => it.category === c.id).length;
        if (!n) return '';
        return `<button class="chip ${filterCat === c.id ? 'on' : ''}" onclick="setCat('${c.id}')">${c.icon} ${c.label} (${toFa(n)})</button>`;
      }).join('')}
    </div>
    ${state.spaces.length ? `
      <select class="input" id="spaceFilter" onchange="setSpaceFilter(this.value)">
        <option value="all">همه فضاها</option>
        ${state.spaces.map((s) => `<option value="${s.id}" ${filterSpace === s.id ? 'selected' : ''}>${s.icon} ${esc(s.name)}</option>`).join('')}
      </select>
    ` : ''}
    ${list.length === 0 ? emptyItemsHTML() : `
      <div class="item-list">
        ${list.map((it) => itemCardHTML(it)).join('')}
      </div>
    `}
  `;
}

function emptyItemsHTML() {
  if (total0()) {
    return `<div class="empty"><div class="empty-icon">📦</div><h3>هنوز وسیله‌ای ثبت نکردی</h3><p>دکمه + رو بزن و اولین وسیله رو اضافه کن؛ مثلاً کابل شارژرت کجاست؟</p><button class="btn primary" onclick="openAddItem()">＋ افزودن وسیله</button></div>`;
  }
  return `<div class="empty"><div class="empty-icon">🔍</div><h3>چیزی پیدا نشد</h3><p>جستجو یا فیلتر رو عوض کن.</p></div>`;
}
function total0() { return state.items.length === 0; }

function itemCardHTML(it) {
  const cat = catById(it.category);
  return `
    <div class="item-card" onclick="openEditItem('${it.id}')">
      ${it.photo ? `<img class="item-thumb" src="${it.photo}" alt="">` : `<div class="item-thumb ph">${cat.icon}</div>`}
      <div class="item-info">
        <b>${esc(it.name)}</b>
        <span class="loc">📍 ${esc(locationText(it))}</span>
        <span class="cat">${cat.icon} ${cat.label}</span>
      </div>
      <span class="chev">›</span>
    </div>
  `;
}

window.setCat = (id) => { filterCat = id; render(); };
window.setSpaceFilter = (id) => { filterSpace = id; render(); };

function bindSearch() {
  const el = $('searchInput');
  if (el) {
    el.addEventListener('input', (e) => {
      searchQ = e.target.value;
      const pos = el.selectionStart;
      render();
      const n = $('searchInput');
      if (n) { n.focus(); n.setSelectionRange(pos, pos); }
    });
  }
}

// ── فضاها ──
function spacesHTML() {
  return `
    <div class="row between">
      <h2>فضاها و جاها</h2>
      <button class="btn primary sm" onclick="openAddSpace()">＋ فضا</button>
    </div>
    <div class="root-row">🏠 خانه <span class="muted small">› ${toFa(state.spaces.length)} فضا</span></div>
    <p class="muted">هر فضا (مثل آشپزخانه) چند جای دقیق داره (مثل کابینت بالا، کشو). وسیله‌ها تو همین جاها ثبت می‌شن.</p>
    ${state.spaces.length === 0 ? `<div class="empty"><div class="empty-icon">🏠</div><h3>فضایی نداری</h3><p>یه فضا بساز؛ مثلاً «آشپزخانه».</p></div>` : ''}
    <div class="space-list">
      ${state.spaces.map((s) => {
        const open = expandedSpace === s.id;
        const count = state.items.filter((it) => it.spaceId === s.id).length;
        return `
        <div class="space-card">
          <div class="space-head" onclick="toggleSpace('${s.id}')">
            <span class="space-icon" style="background:${s.color}22">${s.icon}</span>
            <div class="space-title"><b>${esc(s.name)}</b><span>${toFa((s.places || []).length)} جا · ${toFa(count)} وسیله</span></div>
            <span class="chev">${open ? '▾' : '›'}</span>
          </div>
          ${open ? `
            <div class="space-body">
              <div class="row gap">
                <button class="btn sm" onclick="openEditSpace('${s.id}')">✏️ ویرایش فضا</button>
                <button class="btn sm" onclick="openAddPlace('${s.id}')">＋ جا</button>
                <button class="btn danger sm" onclick="deleteSpace('${s.id}')">حذف</button>
              </div>
              ${(s.places || []).length === 0 ? '<p class="muted">هنوز جایی نداره؛ + جا رو بزن.</p>' : ''}
              ${(s.places || []).map((p) => {
                const items = state.items.filter((it) => it.spaceId === s.id && it.placeId === p.id);
                return `
                <div class="place-row">
                  <div class="place-head">
                    <b>📂 ${esc(p.name)}</b>
                    <span class="muted">${toFa(items.length)} وسیله</span>
                    <button class="mini" onclick="renamePlace('${s.id}','${p.id}')">✏️</button>
                    <button class="mini danger" onclick="deletePlace('${s.id}','${p.id}')">🗑</button>
                  </div>
                  ${items.length ? items.map((it) => `<div class="place-item" onclick="openEditItem('${it.id}')">${it.photo ? `<img src="${it.photo}" class="mini-thumb">` : ''}<span>${esc(it.name)}</span></div>`).join('') : '<span class="muted small">خالی</span>'}
                </div>`;
              }).join('')}
            </div>
          ` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
}

window.toggleSpace = (id) => { expandedSpace = expandedSpace === id ? null : id; render(); };

// ── تنظیمات ──
function settingsHTML() {
  const hasKey = hasGeminiKey();
  const theme = store.get(THEME_KEY);
  return `
    <h2>تنظیمات</h2>
    <div class="card">
      <h3>🎨 ظاهر</h3>
      <p class="muted small">تم روشن پیش‌فرض است؛ تاریک هم هست و حالت خودکار از تنظیم گوشی پیروی می‌کند.</p>
      <div class="seg">
        <button class="${!theme || theme === 'light' ? 'on' : ''}" onclick="setTheme('light')">☀️ روشن</button>
        <button class="${theme === 'dark' ? 'on' : ''}" onclick="setTheme('dark')">🌙 تاریک</button>
        <button class="${theme === 'auto' ? 'on' : ''}" onclick="setTheme('auto')">🌗 خودکار</button>
      </div>
    </div>
    <div class="card">
      <h3>✨ هوش مصنوعی</h3>
      <p class="muted">با کلید رایگان گوگل، کو عکس وسیله رو می‌خونه و اسم و دسته‌بندی رو خودش پر می‌کنه. کلید فقط روی گوشی تو می‌مونه.</p>
      <div id="aiState">${hasKey ? '<span class="badge ok">کلید فعال است</span>' : '<span class="badge">کلید خاموش است</span>'}</div>
      <div class="row gap">
        <button class="btn" onclick="testAiConnection()">آزمایش اتصال</button>
        <a class="btn" href="help-gemini.html" target="_blank" rel="noopener">چطور کلید بگیرم؟</a>
      </div>
      <input class="input" id="geminiKey" type="password" autocomplete="off" placeholder="AIza...">
      <div class="row gap">
        <button class="btn primary" onclick="saveGeminiKey()">ذخیره کلید</button>
        ${hasKey ? '<button class="btn danger" onclick="clearGeminiKey()">حذف کلید</button>' : ''}
      </div>
      <p class="muted small">دو مسیر امتحان می‌شود: گوگل مستقیم و پل ورسل. اگر در ایران هستی و مسیر مستقیم بسته بود، پل ورسل بدون فیلترشکن کار می‌کند.</p>
    </div>

    ${renderSyncCard()}

    <div class="card">
      <h3>💾 داده‌ها</h3>
      <div class="row gap">
        <button class="btn" onclick="exportData()">خروجی JSON</button>
        <button class="btn" onclick="document.getElementById('importFile').click()">ورودی JSON</button>
        <input type="file" id="importFile" accept=".json,application/json" hidden onchange="importData(this)">
      </div>
      <button class="btn danger block" onclick="resetAll()">حذف همه داده‌ها</button>
      <p class="muted small">وضعیت همگام‌سازی: ${esc(syncStatusText())}</p>
    </div>

    <div class="card">
      <h3>ℹ️ درباره کو</h3>
      <p class="muted">کو — وسایلم کجاست؟ داده‌ها اول روی گوشی ذخیره می‌شن و با ورود گوگل، در Google Drive همگام می‌شن.</p>
      <div class="row gap between">
        <span class="small">نسخه <b>${esc(APP_VERSION)}</b> <span id="updStateText" class="muted"></span></span>
        <button class="btn sm" id="btnCheckUpd" onclick="checkUpdateNow()">بررسی به‌روزرسانی</button>
      </div>
    </div>
  `;
}

window.openSettingsAI = () => { tab = 'settings'; render(); };
window.testAiConnection = async () => {
  const el = $('aiState');
  if (el) el.innerHTML = '⏳ در حال آزمایش…';
  const rep = await testGeminiConnection();
  if (el) {
    el.innerHTML = `<div class="pc-status ${rep.verdict === 'ok' ? 'ok' : 'bad'}"><span class="dot"></span>${esc(rep.hint)}</div><div class="muted small">${esc(rep.detail || '')}</div><button class="btn sm" onclick="testAiConnection()">آزمایش دوباره</button>`;
  }
};

window.exportData = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'koo-data.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
window.importData = (input) => {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(r.result);
      if (!parsed || !Array.isArray(parsed.spaces)) throw new Error('bad');
      replaceState(parsed);
      store.set(ONBOARDED_KEY, '1');
      toast('وارد شد ✓');
      render();
    } catch (e) { toast('فایل معتبر نیست'); }
  };
  r.readAsText(f);
};
window.resetAll = () => {
  if (!confirm('همه وسایل و فضاها پاک بشن؟')) return;
  replaceState({ version: 1, bookId: uid(), updatedAt: Date.now(), rev: 0, spaces: [], items: [] });
  store.set(ONBOARDED_KEY, '');
  render();
};

// ── مودال‌ها ──
function openModal(html) {
  const root = $('modalRoot');
  if (root) root.innerHTML = `<div class="sheet-back" onclick="closeModal()"><div class="sheet" onclick="event.stopPropagation()">${html}</div></div>`;
}
window.closeModal = () => { const r = $('modalRoot'); if (r) r.innerHTML = ''; editingItemId = null; tempPhotoFile = null; tempPhotoData = ''; };

function spaceOptions(selected) {
  return state.spaces.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.icon} ${esc(s.name)}</option>`).join('');
}
function placeOptions(spaceId, selected) {
  const s = getSpace(spaceId);
  if (!s || !s.places || !s.places.length) return '<option value="">— جایی نیست —</option>';
  return s.places.map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

window.openAddItem = () => {
  editingItemId = null;
  tempPhotoFile = null;
  tempPhotoData = '';
  tempSpaceId = state.spaces[0] ? state.spaces[0].id : '';
  openModal(`
    <h3>＋ وسیله جدید</h3>
    <div class="photo-row">
      <label class="photo-box" id="photoBox">
        <input type="file" id="itemPhoto" accept="image/*" hidden onchange="onPhotoChange(this)">
        <span id="photoHint">📷<br>عکس بگیر</span>
      </label>
      <div class="flex1">
        <input class="input" id="itemName" placeholder="اسم وسیله؛ مثلاً کابل شارژر">
        <button class="btn sm" id="aiBtn" onclick="runAI()">✨ تشخیص با هوش مصنوعی</button>
        <div id="aiMsg" class="muted small"></div>
      </div>
    </div>
    <label>دسته‌بندی</label>
    <select class="input" id="itemCat">${CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}</select>
    <label>فضا</label>
    <select class="input" id="itemSpace" onchange="onSpaceChange(this.value)">${spaceOptions(tempSpaceId)}</select>
    <label>جا</label>
    <select class="input" id="itemPlace">${placeOptions(tempSpaceId, '')}</select>
    <label>یادداشت (اختیاری)</label>
    <input class="input" id="itemNote" placeholder="مثلاً تو جیب زیپ‌دار">
    <div class="row gap">
      <button class="btn primary flex1" onclick="saveItem()">ذخیره</button>
      <button class="btn" onclick="closeModal()">لغو</button>
    </div>
  `);
};

window.openEditItem = (id) => {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  editingItemId = id;
  tempPhotoData = it.photo || '';
  tempSpaceId = it.spaceId || (state.spaces[0] ? state.spaces[0].id : '');
  openModal(`
    <h3>✏️ ${esc(it.name)}</h3>
    <div class="photo-row">
      <label class="photo-box" id="photoBox">
        <input type="file" id="itemPhoto" accept="image/*" hidden onchange="onPhotoChange(this)">
        ${it.photo ? `<img src="${it.photo}" class="photo-preview">` : '<span id="photoHint">📷<br>عکس بگیر</span>'}
      </label>
      <div class="flex1">
        <input class="input" id="itemName" value="${esc(it.name)}">
        <button class="btn sm" onclick="runAI()">✨ تشخیص با هوش مصنوعی</button>
        <div id="aiMsg" class="muted small"></div>
      </div>
    </div>
    <label>دسته‌بندی</label>
    <select class="input" id="itemCat">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === it.category ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}</select>
    <label>فضا</label>
    <select class="input" id="itemSpace" onchange="onSpaceChange(this.value)">${spaceOptions(tempSpaceId)}</select>
    <label>جا</label>
    <select class="input" id="itemPlace">${placeOptions(tempSpaceId, it.placeId)}</select>
    <label>یادداشت</label>
    <input class="input" id="itemNote" value="${esc(it.note || '')}">
    <div class="row gap">
      <button class="btn primary flex1" onclick="saveItem()">ذخیره</button>
      <button class="btn danger" onclick="deleteItem('${id}')">حذف</button>
      <button class="btn" onclick="closeModal()">لغو</button>
    </div>
  `);
};

window.onSpaceChange = (spaceId) => {
  tempSpaceId = spaceId;
  const el = $('itemPlace');
  if (el) el.innerHTML = placeOptions(spaceId, '');
};
window.onPhotoChange = async (input) => {
  const f = input.files && input.files[0];
  if (!f) return;
  tempPhotoFile = f;
  try {
    tempPhotoData = await makeThumb(f, 480);
    const box = $('photoBox');
    if (box) box.innerHTML = `<input type="file" id="itemPhoto" accept="image/*" hidden onchange="onPhotoChange(this)"><img src="${tempPhotoData}" class="photo-preview">`;
  } catch (e) { toast('خواندن عکس نشد'); }
};

window.runAI = async () => {
  if (!hasGeminiKey()) { toast('اول در تنظیمات کلید گوگل را بگذار'); return; }
  if (!tempPhotoFile && !tempPhotoData) { toast('اول عکس بگیر'); return; }
  const msg = $('aiMsg');
  if (msg) msg.textContent = '⏳ در حال تشخیص…';
  try {
    // اگر فایل اصلی هست از همون استفاده کن، وگرنه از عکس فشرده
    let file = tempPhotoFile;
    if (!file && tempPhotoData) {
      const res = await fetch(tempPhotoData);
      const blob = await res.blob();
      file = new File([blob], 'item.jpg', { type: 'image/jpeg' });
    }
    const out = await recognizeItem(file);
    const nameEl = $('itemName');
    const catEl = $('itemCat');
    if (nameEl && out.name) nameEl.value = out.name;
    if (catEl && out.category) catEl.value = out.category;
    if (msg) msg.textContent = '✓ تشخیص داده شد؛ بررسی کن و ذخیره کن.';
  } catch (e) {
    if (msg) msg.textContent = '✗ ' + (e.message || 'نشد');
  }
};

window.saveItem = () => {
  const name = ($('itemName') && $('itemName').value || '').trim();
  if (!name) { toast('اسم وسیله رو بنویس'); return; }
  const cat = $('itemCat') ? $('itemCat').value : 'other';
  const spaceId = $('itemSpace') ? $('itemSpace').value : '';
  const placeId = $('itemPlace') ? $('itemPlace').value : '';
  const note = $('itemNote') ? $('itemNote').value.trim() : '';
  const now = Date.now();
  if (editingItemId) {
    const it = state.items.find((x) => x.id === editingItemId);
    if (it) Object.assign(it, { name, category: cat, spaceId, placeId, note, photo: tempPhotoData || it.photo || '', updatedAt: now });
  } else {
    state.items.push({ id: uid(), name, category: cat, spaceId, placeId, note, photo: tempPhotoData || '', createdAt: now, updatedAt: now });
  }
  persistLocal();
  closeModal();
  toast('ذخیره شد ✓');
  render();
};

window.deleteItem = (id) => {
  if (!confirm('این وسیله حذف بشه؟')) return;
  state.items = state.items.filter((x) => x.id !== id);
  persistLocal();
  closeModal();
  render();
};

// فضا و جا
window.openAddSpace = () => {
  openModal(`
    <h3>＋ فضای جدید</h3>
    <label>اسم فضا</label>
    <input class="input" id="spaceName" placeholder="مثلاً آشپزخانه">
    <label>آیکون (یه ایموجی)</label>
    <input class="input" id="spaceIcon" value="🏠" maxlength="4">
    <div class="row gap">
      <button class="btn primary flex1" onclick="saveSpace()">ذخیره</button>
      <button class="btn" onclick="closeModal()">لغو</button>
    </div>
  `);
};
window.saveSpace = () => {
  const name = ($('spaceName') && $('spaceName').value || '').trim();
  if (!name) { toast('اسم فضا رو بنویس'); return; }
  const icon = ($('spaceIcon') && $('spaceIcon').value || '🏠').trim() || '🏠';
  state.spaces.push({ id: uid(), name, icon, color: '#0ea5e9', places: [] });
  persistLocal();
  closeModal();
  render();
};
window.openEditSpace = (id) => {
  const s = getSpace(id);
  if (!s) return;
  openModal(`
    <h3>✏️ ${esc(s.name)}</h3>
    <label>اسم فضا</label>
    <input class="input" id="spaceName" value="${esc(s.name)}">
    <label>آیکون</label>
    <input class="input" id="spaceIcon" value="${esc(s.icon)}" maxlength="4">
    <div class="row gap">
      <button class="btn primary flex1" onclick="updateSpace('${id}')">ذخیره</button>
      <button class="btn" onclick="closeModal()">لغو</button>
    </div>
  `);
};
window.updateSpace = (id) => {
  const s = getSpace(id);
  if (!s) return;
  const name = ($('spaceName') && $('spaceName').value || '').trim();
  if (!name) { toast('اسم رو بنویس'); return; }
  s.name = name;
  s.icon = ($('spaceIcon') && $('spaceIcon').value || '🏠').trim() || '🏠';
  persistLocal();
  closeModal();
  render();
};
window.deleteSpace = (id) => {
  if (!confirm('این فضا و جاهاش حذف بشن؟ (وسایلش بدون مکان می‌مونن)')) return;
  state.spaces = state.spaces.filter((s) => s.id !== id);
  state.items.forEach((it) => { if (it.spaceId === id) { it.spaceId = ''; it.placeId = ''; } });
  persistLocal();
  render();
};
window.openAddPlace = (spaceId) => {
  openModal(`
    <h3>＋ جای جدید</h3>
    <label>اسم جا</label>
    <input class="input" id="placeName" placeholder="مثلاً کشوی دوم">
    <div class="row gap">
      <button class="btn primary flex1" onclick="savePlace('${spaceId}')">ذخیره</button>
      <button class="btn" onclick="closeModal()">لغو</button>
    </div>
  `);
};
window.savePlace = (spaceId) => {
  const s = getSpace(spaceId);
  if (!s) return;
  const name = ($('placeName') && $('placeName').value || '').trim();
  if (!name) { toast('اسم جا رو بنویس'); return; }
  s.places = s.places || [];
  s.places.push({ id: uid(), name });
  persistLocal();
  closeModal();
  render();
};
window.renamePlace = (spaceId, placeId) => {
  const p = getPlace(spaceId, placeId);
  if (!p) return;
  const name = prompt('اسم جدید جا:', p.name);
  if (!name || !name.trim()) return;
  p.name = name.trim();
  persistLocal();
  render();
};
window.deletePlace = (spaceId, placeId) => {
  if (!confirm('این جا حذف بشه؟')) return;
  const s = getSpace(spaceId);
  if (!s) return;
  s.places = (s.places || []).filter((p) => p.id !== placeId);
  state.items.forEach((it) => { if (it.spaceId === spaceId && it.placeId === placeId) it.placeId = ''; });
  persistLocal();
  render();
};

// راه‌اندازی
applyTheme();
loadState();
initGoogleOnLoad();
render();

// ── نسخه و به‌روزرسانی (الگوی تراز: شبکه‌اول + skipWaiting + reload یک‌بار) ──
const SEEN_VERSION_KEY = 'koo_seen_version';

function setUpdState(st) {
  window.__appUpdate = st;
  const el = $('updStateText');
  if (el) {
    el.textContent =
      st === 'ready' ? '· نسخهٔ جدید آماده است' :
      st === 'installing' ? '· در حال گرفتن نسخهٔ جدید…' :
      st === 'latest' ? '· به‌روز است' :
      st === 'offline' ? '· آفلاین' : '';
  }
  if (st === 'ready') showUpdateBar();
}

function showUpdateBar() {
  if (document.getElementById('updBar')) return;
  const d = document.createElement('div');
  d.id = 'updBar';
  d.className = 'upd-bar';
  d.innerHTML =
    '<span>✨ نسخهٔ جدید آماده است</span>' +
    '<button class="upd-go" onclick="applyUpdate()">به‌روزرسانی</button>' +
    '<button class="upd-x" aria-label="بستن" onclick="this.parentElement.remove()">×</button>';
  document.body.appendChild(d);
}

window.applyUpdate = () => {
  const reg = window.__swReg;
  if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting');
  else if (window.__applyUpdate) window.__applyUpdate();
  else location.reload();
};

window.checkUpdateNow = async () => {
  const btn = $('btnCheckUpd');
  if (btn) btn.disabled = true;
  let st = 'offline';
  try {
    if (window.__checkUpdate) st = await window.__checkUpdate();
  } catch (e) { st = 'offline'; }
  if (btn) btn.disabled = false;
  toast(
    st === 'ready' ? 'نسخهٔ جدید آماده است؛ دکمهٔ به‌روزرسانی را بزن' :
    st === 'latest' ? 'نسخهٔ نصب‌شده جدیدترین است ✓' :
    st === 'installing' ? 'در حال گرفتن نسخهٔ جدید…' :
    'آفلاین هستی؛ بعداً دوباره امتحان کن'
  );
};

function setupUpdates() {
  // بعد از به‌روزرسانی، یک‌بار خبر بده
  try {
    const seen = store.get(SEEN_VERSION_KEY);
    if (seen && seen !== APP_VERSION) toast('به نسخه ' + toFa(APP_VERSION) + ' به‌روزرسانی شد ✓');
    store.set(SEEN_VERSION_KEY, APP_VERSION);
  } catch (e) {}

  const host = location.hostname;
  const allowSW = host === 'localhost' || host === '127.0.0.1' || /\.github\.io$/.test(host) || /\.e2b\.app$/.test(host);

  if (!('serviceWorker' in navigator) || !allowSW) {
    // بدون سرویس‌ورکر: نسخهٔ روی سرور را با utils.js مقایسه می‌کنیم
    window.__checkUpdate = () =>
      fetch('js/utils.js?u=' + Date.now(), { cache: 'no-store' })
        .then((r) => r.text())
        .then((txt) => {
          const m = txt.match(/APP_VERSION\s*=\s*'([^']+)'/);
          const remote = m && m[1];
          const st = remote && remote !== APP_VERSION ? 'ready' : 'latest';
          setUpdState(st);
          return st;
        })
        .catch(() => { setUpdState('offline'); return 'offline'; });
    window.__applyUpdate = () => {
      const u = new URL(location.href);
      u.searchParams.set('r', String(Date.now()));
      location.replace(u.toString());
    };
    return;
  }

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        window.__swReg = reg;
        const kick = (w) => { if (w) w.postMessage('skipWaiting'); };
        // نسخهٔ جدید از قبل دانلود شده ولی فعال نشده
        if (reg.waiting) { setUpdState('ready'); kick(reg.waiting); }
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) setUpdState('ready');
          });
        });
        window.__checkUpdate = () =>
          reg.update()
            .then(() => {
              if (reg.waiting) setUpdState('ready');
              else if (reg.installing) setUpdState('installing');
              else setUpdState('latest');
              return window.__appUpdate || 'latest';
            })
            .catch(() => { setUpdState('offline'); return 'offline'; });
        setTimeout(() => window.__checkUpdate(), 1500);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') window.__checkUpdate();
        });
        setInterval(() => {
          if (document.visibilityState === 'visible') window.__checkUpdate();
        }, 5 * 60 * 1000);
      })
      .catch(() => {});
  });
}

setupUpdates();
