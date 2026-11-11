#!/usr/bin/env node
// بالا بردن نسخه در دو جا: js/utils.js (APP_VERSION) و sw.js (CACHE)
// استفاده:  node tools/bump-version.mjs 0.3.0
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const next = String(process.argv[2] || '').trim();

if (!/^\d+(\.\d+){1,3}$/.test(next)) {
  console.error('نسخه را به شکل 0.3.0 بده: node tools/bump-version.mjs 0.3.0');
  process.exit(1);
}

const utilsPath = join(root, 'js/utils.js');
const swPath = join(root, 'sw.js');
const utils = readFileSync(utilsPath, 'utf8');
const sw = readFileSync(swPath, 'utf8');

const prev = (utils.match(/APP_VERSION = '([^']+)'/) || [])[1] || '?';
const utilsNext = utils.replace(/APP_VERSION = '[^']+'/, `APP_VERSION = '${next}'`);
const swNext = sw.replace(/const CACHE = 'koo-v[^']+';/, `const CACHE = 'koo-v${next}';`);

if (utilsNext === utils && swNext === sw) {
  console.error('جای نسخه پیدا نشد.');
  process.exit(1);
}

writeFileSync(utilsPath, utilsNext);
writeFileSync(swPath, swNext);
console.log(`نسخه: ${prev} → ${next}`);
console.log('یادت نره: git add -A && git commit && git push');
