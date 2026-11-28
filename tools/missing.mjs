// Показывает русские фразы из кода (t('…') и серверные fail(…, '…')), которых нет в kk.js
import fs from 'node:fs'; import path from 'node:path';
import { KK } from '../web/js/kk.js';
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.js') && !/[\\/](kk|en|names-data)\.js$/.test(p)) files.push(p); } })('web/js');
const used = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) used.add(m[1].replace(/\\'/g, "'"));
for (const f of fs.readdirSync('server').filter((x) => x.endsWith('.js')))
  for (const m of fs.readFileSync('server/' + f, 'utf8').matchAll(/fail\(\d+,\s*'((?:[^'\\]|\\.)*)'/g)) used.add(m[1].replace(/\\'/g, "'"));
const miss = [...used].filter((u) => /[А-Яа-я]/.test(u) && !(u in KK));
console.log(used.size, 'фраз, без перевода', miss.length);
console.log(miss.map((s, i) => `${i}|${s}`).join('\n'));
