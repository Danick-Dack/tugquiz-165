// Собирает web/js/en.js из tools/en-*.txt (строки «номер|английский», порядок ключей = порядок в kk.js)
import fs from 'node:fs';
import { KK } from '../web/js/kk.js';
const keys = Object.keys(KK);
const en = {};
for (const f of fs.readdirSync('tools').filter((x) => /^en-\d+\.txt$/.test(x)).sort()) {
  for (const line of fs.readFileSync('tools/' + f, 'utf8').split('\n')) {
    const m = line.match(/^(\d+)\|(.*)$/); if (!m) continue;
    const k = keys[+m[1]]; if (k === undefined) throw new Error('нет ключа ' + m[1]);
    en[k] = m[2];
    for (const p of k.match(/\{\w+\}/g) || []) if (!m[2].includes(p)) throw new Error('потерян ' + p + ' в ' + m[1]);
  }
}
const miss = keys.filter((k) => !(k in en));
if (miss.length) console.warn('без перевода:', miss.length, miss.slice(0, 5));
fs.writeFileSync('web/js/en.js', '// Английский перевод интерфейса: ключ — русская фраза из кода.\nexport const EN = ' + JSON.stringify(en, null, 1) + ';\n');
console.log('en.js', Object.keys(en).length);
