import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://koo-app.github.io/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage; globalThis.sessionStorage = dom.window.sessionStorage;
const Y = await import(new URL('../../js/sync.js', import.meta.url).href);
let fails = 0;
const ok = (n, f) => { try { f(); console.log('✓', n); } catch (e) { fails++; console.log('✗', n, '—', e.message); } };

ok('local only → push', () => {
  const r = Y.decideSync({ bookId: 'b', updatedAt: 5, spaces: [{ id: 's' }], items: [] }, { bookId: 'b', updatedAt: 9, spaces: [], items: [] });
  if (r.action !== 'push') throw new Error(r.action);
});
ok('remote only → pull', () => {
  const r = Y.decideSync({ bookId: 'b', updatedAt: 5, spaces: [], items: [] }, { bookId: 'b', updatedAt: 9, spaces: [{ id: 's' }], items: [] });
  if (r.action !== 'pull') throw new Error(r.action);
});
ok('remote newer → pull', () => {
  const r = Y.decideSync({ bookId: 'b', updatedAt: 5, spaces: [{ id: 's' }], items: [] }, { bookId: 'b', updatedAt: 9, spaces: [{ id: 's' }], items: [] });
  if (r.action !== 'pull') throw new Error(r.action);
});
ok('local newer → push', () => {
  const r = Y.decideSync({ bookId: 'b', updatedAt: 50, spaces: [{ id: 's' }], items: [] }, { bookId: 'b', updatedAt: 9, spaces: [{ id: 's' }], items: [] });
  if (r.action !== 'push') throw new Error(r.action);
});
ok('equal content → noop', () => {
  const r = Y.decideSync({ version: 1, bookId: 'b', updatedAt: 5, rev: 2, spaces: [{ id: 's', name: 'x', places: [] }], items: [] }, { version: 1, bookId: 'b', updatedAt: 5, rev: 1, spaces: [{ id: 's', name: 'x', places: [] }], items: [] });
  if (r.action !== 'noop') throw new Error(r.action);
});
ok('merge keeps both sides when equal timestamps but different items', () => {
  const r = Y.decideSync({ bookId: 'b', updatedAt: 5, spaces: [], items: [{ id: 'a', updatedAt: 1 }] }, { bookId: 'b', updatedAt: 5, spaces: [], items: [{ id: 'b', updatedAt: 1 }] });
  if (r.action !== 'push') throw new Error(r.action);
  if (r.next.items.length !== 2) throw new Error('items ' + r.next.items.length);
});
ok('sign-in state starts empty', () => {
  if (Y.isGoogleLinked()) throw new Error('should be unlinked');
  if (Y.googleSyncOk()) throw new Error('should not be synced');
});
ok('sync card is honest about setup state', () => {
  const h = Y.renderSyncCard();
  if (Y.googleConfigured()) {
    if (!h.includes('ورود با گوگل')) throw new Error(h.slice(0, 80));
  } else {
    if (!h.includes('راه‌اندازی نشده')) throw new Error('should say not configured: ' + h.slice(0, 120));
  }
});
console.log(fails ? fails + ' failed' : 'all sync tests passed');
process.exit(fails ? 1 : 0);
