// Сборка автономного демо: один HTML-файл (скрипты, стили, шрифты и картинки внутри), открывается двойным кликом без сервера.
// Запуск: node demo/build.mjs  ->  demo/TugQuiz-SL165-demo.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, '..', 'web');
const read = (p, enc) => readFileSync(path.join(web, p), enc);
const b64 = (p) => read(p).toString('base64');
const noScriptEnd = (s) => s.replace(/<\/script/gi, '<\\/script');

const bundle = await build({
  entryPoints: [path.join(here, 'demo.js')], bundle: true, minify: true, write: false, format: 'iife', charset: 'utf8',
  plugins: [{ name: 'stub-app', setup: (b) => b.onResolve({ filter: /\/app\.js$/ }, () => ({ path: path.join(here, 'app-stub.js') })) }],
});

// Шрифты и KaTeX: url(...woff2) заменяем на data: URI. Ненужные начертания KaTeX отбрасываем.
const inlineFonts = (css, dir) => css.replace(/url\(['"]?([^)'"]+?\.woff2)['"]?\)/g,
  (_, f) => `url(data:font/woff2;base64,${b64(`${dir}/${path.posix.basename(f)}`)})`);
const fontsCss = read('vendor/fonts/fonts.css', 'utf8').replace(/@font-face \{[^}]*latin-ext[^}]*\}/g, '');
const KEEP = /Main-(Regular|Bold|Italic)|Math-Italic|Size[12]-Regular|AMS/;
const katexCss = read('vendor/katex/katex.min.css', 'utf8').replace(/@font-face\{[^}]*\}/g, (f) => (KEEP.test(f) ? f : ''));
const dropFallbacks = (s) => s.replace(/,url\([^)]*\.(?:woff|ttf)\) format\("[a-z]+"\)/g, '');
const css = [
  inlineFonts(fontsCss, 'vendor/fonts'),
  dropFallbacks(inlineFonts(katexCss.replace(/url\(fonts\//g, 'url(vendor/katex/fonts/'), 'vendor/katex/fonts')),
  read('css/app.css', 'utf8'),
  '.toasts{display:none!important}',
].join('\n');

const logo = `data:image/png;base64,${b64('img/icon-192.png')}`;
const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>TugQuiz · SL165 — демо</title><link rel="icon" href="${logo}">
<style>${css}</style></head>
<body><div id="app"></div>
<script>window.TQ_LOGO=${JSON.stringify(logo)};</script>
<script>${noScriptEnd(read('vendor/katex/katex.min.js', 'utf8'))}</script>
<script>${noScriptEnd(bundle.outputFiles[0].text)}</script>
</body></html>`;
const out = path.join(here, 'TugQuiz-SL165-demo.html');
writeFileSync(out, html);
console.log(`${out}\n${(html.length / 1024).toFixed(0)} КБ`);
