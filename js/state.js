// state — داده‌های کو: فضاها، جاها و وسایل
// الگو از تراز: Local-First + یک فایل JSON برای گوگل درایو
import { store, uid, toast } from './utils.js';

export const KEY = 'koo_app_v1';
export const ONBOARDED_KEY = 'koo_onboarded_v1';

export const CATEGORIES = [
  { id: 'phone', label: 'موبایل و شارژر', icon: '📱' },
  { id: 'cable', label: 'کابل و آداپتور', icon: '🔌' },
  { id: 'audio', label: 'صوتی', icon: '🎧' },
  { id: 'laptop', label: 'لپ‌تاپ و کامپیوتر', icon: '💻' },
  { id: 'wear', label: 'پوشیدنی و شخصی', icon: '👕' },
  { id: 'tool', label: 'ابزار', icon: '🧰' },
  { id: 'car', label: 'لوازم خودرو', icon: '🚗' },
  { id: 'doc', label: 'مدارک', icon: '📄' },
  { id: 'other', label: 'سایر', icon: '📦' },
];

export function catById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

// ── قالب‌های آماده فضا (گام پیشنهادی: کاربر از صفر نسازه) ──
function sp(name, icon, color, places) {
  return { id: uid(), name, icon, color, places: (places || []).map((p) => ({ id: uid(), name: p })) };
}

export const TEMPLATES = [
  {
    id: 'apt1',
    title: 'آپارتمان ۱ خوابه',
    desc: 'پذیرایی، آشپزخانه، اتاق خواب، حمام، انباری',
    build() {
      return [
        sp('پذیرایی', '🛋️', '#0ea5e9', ['قفسه تلویزیون', 'میز تلویزیون', 'قفسه کتاب']),
        sp('آشپزخانه', '🍳', '#f97316', ['کابینت بالا', 'کابینت پایین', 'کشو', 'یخچال', 'فریزر']),
        sp('اتاق خواب', '🛏️', '#8b5cf6', ['کمد', 'کشوی میز تحریر', 'قفسه']),
        sp('حمام', '🚿', '#06b6d4', ['کابینت آینه', 'قفسه']),
        sp('انباری', '📦', '#64748b', ['قفسه', 'جعبه ابزار']),
      ];
    },
  },
  {
    id: 'apt2',
    title: 'آپارتمان ۲-۳ خوابه',
    desc: 'دو اتاق خواب، پذیرایی، آشپزخانه، انباری، راهرو',
    build() {
      return [
        sp('پذیرایی', '🛋️', '#0ea5e9', ['قفسه تلویزیون', 'میز تلویزیون', 'قفسه کتاب']),
        sp('آشپزخانه', '🍳', '#f97316', ['کابینت بالا', 'کابینت پایین', 'کشو', 'یخچال', 'فریزر']),
        sp('اتاق خواب اصلی', '🛏️', '#8b5cf6', ['کمد', 'کشوی میز تحریر', 'قفسه']),
        sp('اتاق خواب دوم', '🛏️', '#ec4899', ['کمد', 'میز تحریر']),
        sp('حمام', '🚿', '#06b6d4', ['کابینت آینه', 'قفسه']),
        sp('انباری', '📦', '#64748b', ['قفسه', 'جعبه ابزار']),
        sp('راهرو', '🚪', '#94a3b8', ['جاکفشی', 'قفسه']),
      ];
    },
  },
  {
    id: 'villa',
    title: 'ویلا / خانه حیاط‌دار',
    desc: 'فضاهای خانه + حیاط، پارکینگ، زیرزمین',
    build() {
      return [
        sp('پذیرایی', '🛋️', '#0ea5e9', ['قفسه تلویزیون', 'میز تلویزیون']),
        sp('آشپزخانه', '🍳', '#f97316', ['کابینت بالا', 'کابینت پایین', 'کشو', 'یخچال']),
        sp('اتاق خواب', '🛏️', '#8b5cf6', ['کمد', 'کشوی میز تحریر']),
        sp('حیاط', '🌳', '#22c55e', ['انبار حیاط', 'قفسه']),
        sp('پارکینگ', '🚗', '#475569', ['قفسه ابزار', 'جعبه ابزار', 'لاستیک']),
        sp('زیرزمین / انباری', '📦', '#64748b', ['قفسه', 'جعبه']),
      ];
    },
  },
  {
    id: 'dorm',
    title: 'خوابگاه / اتاق اجاره‌ای',
    desc: 'اتاق، آشپزخانه مشترک، انباری',
    build() {
      return [
        sp('اتاق', '🛏️', '#8b5cf6', ['کمد', 'میز تحریر', 'قفسه']),
        sp('آشپزخانه مشترک', '🍳', '#f97316', ['کابینت', 'یخچال']),
        sp('انباری', '📦', '#64748b', ['قفسه']),
        sp('کیف و کوله', '🎒', '#0ea5e9', ['جیب جلو', 'جیب اصلی']),
      ];
    },
  },
  {
    id: 'mobile',
    title: 'ماشین + کیف + دفتر',
    desc: 'برای وسایل گوشی که بیشتر تو کیف و ماشین گم می‌شن',
    build() {
      return [
        sp('خانه', '🏠', '#0ea5e9', ['کشوی میز', 'قفسه']),
        sp('ماشین', '🚗', '#475569', ['کنسول وسط', 'داشبورد', 'صندوق عقب']),
        sp('کیف / کوله', '🎒', '#f97316', ['جیب جلو', 'جیب اصلی', 'جیب لپ‌تاپ']),
        sp('دفتر کار', '💼', '#8b5cf6', ['کشوی میز', 'قفسه']),
      ];
    },
  },
  {
    id: 'blank',
    title: 'از صفر (خالی)',
    desc: 'خودم فضاها رو می‌سازم',
    build() {
      return [];
    },
  },
];

export function defaultState() {
  return {
    version: 1,
    bookId: uid(),
    updatedAt: Date.now(),
    rev: 0,
    spaces: [],
    collections: [],
    items: [],
  };
}

export let state = defaultState();

export function loadState() {
  try {
    const raw = store.get(KEY);
    if (!raw) {
      state = defaultState();
      return state;
    }
    const parsed = JSON.parse(raw);
    state = Object.assign(defaultState(), parsed);
    if (!Array.isArray(state.spaces)) state.spaces = [];
    if (!Array.isArray(state.collections)) state.collections = [];
    if (!Array.isArray(state.items)) state.items = [];
    return state;
  } catch (e) {
    state = defaultState();
    return state;
  }
}

function writeState() {
  return store.set(KEY, JSON.stringify(state));
}

export function persistLocal() {
  state.updatedAt = Date.now();
  state.rev = (state.rev || 0) + 1;
  if (!writeState()) {
    // حافظهٔ گوشی پر شده (عکس‌های زیاد): اول عکس وسایل قدیمی‌تر، بعد همهٔ عکس‌ها
    const keep = new Set(
      state.items.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8).map((it) => it.id)
    );
    state.items.forEach((it) => { if (!keep.has(it.id)) it.photo = ''; });
    if (!writeState()) {
      state.items.forEach((it) => { it.photo = ''; });
      if (!writeState()) {
        toast('حافظهٔ گوشی پر است؛ این تغییر ذخیره نشد. چند وسیلهٔ قدیمی را حذف کن یا از خروجی JSON استفاده کن.');
        return;
      }
      toast('حافظهٔ گوشی پر شد؛ عکس‌ها ذخیره نشدند ولی نام و مکان وسایل حفظ شد');
    } else {
      toast('حافظهٔ گوشی پر شد؛ عکس وسایل قدیمی‌تر حذف شد');
    }
  }
  // همگام‌سازی بی‌صدا با درایو (اگر لاگین است)
  try {
    import('./sync.js').then((m) => { if (m.scheduleSync) m.scheduleSync(); }).catch(() => {});
  } catch (e) {}
}

export function replaceState(next) {
  state = Object.assign(defaultState(), next);
  if (!Array.isArray(state.spaces)) state.spaces = [];
  if (!Array.isArray(state.collections)) state.collections = [];
  if (!Array.isArray(state.items)) state.items = [];
  store.set(KEY, JSON.stringify(state));
}

export function hasLocalData(s) {
  s = s || state;
  return !!(s && ((s.spaces && s.spaces.length) || (s.items && s.items.length)));
}

export function hasRemoteData(r) {
  return !!(r && ((r.spaces && r.spaces.length) || (r.items && r.items.length)));
}

function mergeById(a, b) {
  const map = new Map();
  for (const x of b || []) if (x && x.id) map.set(x.id, x);
  for (const x of a || []) {
    if (!x || !x.id) continue;
    const y = map.get(x.id);
    if (!y || (x.updatedAt || 0) >= (y.updatedAt || 0)) map.set(x.id, x);
  }
  return [...map.values()];
}

export function mergeStates(local, remote) {
  const lb = local.bookId || '';
  const rb = remote.bookId || '';
  if (lb && rb && lb !== rb) {
    const win = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
    const copy = JSON.parse(JSON.stringify(win));
    copy.rev = Math.max(local.rev || 0, remote.rev || 0);
    return copy;
  }
  return {
    version: 1,
    bookId: lb || rb,
    spaces: mergeById(local.spaces, remote.spaces),
    collections: mergeById(local.collections || [], remote.collections || []),
    items: mergeById(local.items, remote.items),
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
    rev: Math.max(local.rev || 0, remote.rev || 0),
  };
}

export function fingerprint(s) {
  // اثر انگشت باید به ترتیب لیست‌ها حساس نباشد، وگرنه هر merge بی‌دلیل push می‌شود
  const byId = (a, b) => String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
  const canon = {
    version: s.version || 1,
    bookId: s.bookId || '',
    spaces: (s.spaces || []).map((sp) => ({
      id: sp.id, name: sp.name, icon: sp.icon, color: sp.color,
      places: (sp.places || []).slice().sort(byId).map((p) => ({ id: p.id, name: p.name })),
    })).sort(byId),
    collections: (s.collections || []).map((c) => ({
      id: c.id, name: c.name, spaceId: c.spaceId || '', placeId: c.placeId || '',
      note: c.note || '', photo: c.photo || '', createdAt: c.createdAt || 0, updatedAt: c.updatedAt || 0,
    })).sort(byId),
    items: (s.items || []).map((it) => ({
      id: it.id, name: it.name, category: it.category, spaceId: it.spaceId || '',
      placeId: it.placeId || '', collectionId: it.collectionId || '', note: it.note || '',
      photo: it.photo || '', createdAt: it.createdAt || 0, updatedAt: it.updatedAt || 0,
    })).sort(byId),
  };
  return JSON.stringify(canon);
}

// ── کمک‌کننده‌های فضا/جا/وسیله ──
export function getSpace(id) {
  return state.spaces.find((s) => s.id === id) || null;
}
export function getPlace(spaceId, placeId) {
  const s = getSpace(spaceId);
  if (!s) return null;
  return (s.places || []).find((p) => p.id === placeId) || null;
}
export function getCollection(id) {
  return (state.collections || []).find((c) => c.id === id) || null;
}
export function collectionsIn(spaceId, placeId) {
  const pid = placeId || '';
  return (state.collections || []).filter((c) => c.spaceId === spaceId && (c.placeId || '') === pid);
}
export function locationText(item) {
  const s = getSpace(item.spaceId);
  const p = getPlace(item.spaceId, item.placeId);
  const c = item.collectionId ? getCollection(item.collectionId) : null;
  const parts = [];
  if (s) parts.push(s.name);
  if (p) parts.push(p.name);
  if (c && (!item.spaceId || c.spaceId === item.spaceId)) parts.push(c.name);
  return parts.length ? parts.join(' › ') : 'بدون مکان';
}
export function itemsInPlace(spaceId, placeId) {
  return state.items.filter((it) => it.spaceId === spaceId && it.placeId === placeId);
}
