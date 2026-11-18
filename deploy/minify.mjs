// Сжатие фронтенда перед выкладкой: убирает комментарии и переименовывает внутренние переменные,
// чтобы исходник на сайте было трудно читать. Исходники в репозитории не меняются — правится только копия для сервера.
//   node deploy/minify.mjs <папка распакованной копии проекта>
import { transform } from 'esbuild';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const web = path.join(root, 'web');
let count = 0;
let before = 0;
let after = 0;

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') await walk(p); continue; }
    const ext = path.extname(e.name);
    if (ext !== '.js' && ext !== '.css') continue;
    const src = await readFile(p, 'utf8');
    const out = await transform(src, {
      loader: ext.slice(1), minify: true, format: ext === '.js' ? 'esm' : undefined, target: 'es2022', legalComments: 'none', charset: 'utf8',
    });
    await writeFile(p, out.code);
    count++; before += src.length; after += out.code.length;
  }
}

await walk(web);
console.log(`Сжато файлов: ${count}, ${Math.round(before / 1024)} КБ → ${Math.round(after / 1024)} КБ`);
