// اجرای همه تست‌های کو: node run-all.mjs
import { spawnSync } from 'node:child_process';
const files = ['ui-test.mjs', 'logic-test.mjs', 'sync-test.mjs'];
let bad = 0;
for (const f of files) {
  console.log('\n▶ ' + f);
  const r = spawnSync(process.execPath, [new URL(f, import.meta.url).pathname], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
console.log(bad ? '\n' + bad + ' فایل تست رد شد' : '\nهمه تست‌ها پاس شد ✓');
process.exit(bad ? 1 : 0);
