// utils — ابزارهای مشترک کو

// نسخهٔ برنامه — با هر انتشار بالا ببر (و همان را در sw.js → CACHE بگذار)
export const APP_VERSION = '0.2.1';
export const store = {
  get(k) {
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  },
  set(k, v) {
    try { localStorage.setItem(k, String(v)); } catch (e) {}
  },
  del(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  },
};

export function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toFa(v) {
  return String(v == null ? '' : v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

export function faToEn(s) {
  return String(s == null ? '' : s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}

export function toast(msg) {
  let root = document.getElementById('toastRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toastRoot';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

export function agoText(ms) {
  const d = Math.max(0, Date.now() - ms);
  const m = Math.round(d / 60000);
  if (m < 1) return 'همین الان';
  if (m < 60) return toFa(m) + ' دقیقه پیش';
  const h = Math.round(m / 60);
  if (h < 24) return toFa(h) + ' ساعت پیش';
  return toFa(Math.round(h / 24)) + ' روز پیش';
}
