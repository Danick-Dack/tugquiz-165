// Редактор квиза: информация, вопросы пяти типов (с соответствием), формулы, медиа, свой предмет, предпросмотр «как ученик».
import { h, fill, api, store, go, icon, ic, modal, toast, toastErr, ask, pickFile, uploadFile, fmtDur } from '../core.js';
import { t, lang } from '../i18n.js';
import { teacherPage } from '../app.js';
import { rich, questionEl } from '../content.js';
import { launchDialog } from './launch.js';

export const TYPES = [['choice', 'Выбор ответа'], ['truefalse', 'Верно / неверно'], ['number', 'Число'], ['open', 'Свой ответ'], ['match', 'Соответствие']];
const TIMES = [10, 15, 20, 30, 45, 60, 90, 120];
const LETTERS = 'ABCDEF';
const newQuestion = (type = 'choice') => ({
  type, text: '', image: '', video: '', time: type === 'truefalse' ? 15 : type === 'match' ? 40 : 20, double: false, explain: '',
  ...(type === 'match' ? { pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] } : {}),
  ...(type === 'choice' ? { options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correct: 0 } : {}),
  ...(type === 'truefalse' ? { correct: true } : {}),
  ...(type === 'number' || type === 'open' ? { answers: [] } : {}),
});

// ---------- предмет: список + «свой предмет» ----------
const ADD = '__add';
export function subjectSelect(value, onChange) {
  const sel = h('select', { class: 'input' });
  const draw = (v) => fill(sel, store.meta.subjects.map((x) => h('option', { value: x.key, selected: x.key === v }, x[lang()] || x.ru)),
    h('option', { value: ADD }, `+ ${t('Свой предмет…')}`));
  draw(value);
  sel.addEventListener('change', () => {
    if (sel.value !== ADD) { value = sel.value; onChange(value); return; }
    sel.value = value;
    const name = h('input', { class: 'input', maxLength: 40, placeholder: t('Например: Французский язык, Психология') });
    modal({ title: t('Свой предмет'), body: h('div', { class: 'stack' }, name,
      h('p', { class: 'small muted' }, t('Предмет появится в списке у всех учителей'))),
    actions: [{ label: t('Отмена'), kind: 'ghost' }, { label: t('Добавить'), kind: 'primary', onClick: async () => {
      try {
        const r = await api('/api/subjects', { method: 'POST', body: { name: name.value } });
        store.meta = r.meta;
        value = r.key;
        draw(value);
        onChange(value);
      } catch (e) { toastErr(e); return false; }
    } }] });
    setTimeout(() => name.focus(), 50);
  });
  return sel;
}

// ---------- формулы ----------
const FX = [
  '\\frac{a}{b}', '\\sqrt{x}', '\\sqrt[n]{x}', 'x^{2}', 'x_{1}', '\\cdot', '\\times', '\\div', '\\pm', '\\neq', '\\leq', '\\geq', '\\approx',
  '\\infty', '\\pi', '\\alpha', '\\beta', '\\gamma', '\\Delta', '\\theta', '\\lambda', '\\mu', '\\omega', '^\\circ', '\\angle', '\\vec{a}',
  '\\overline{AB}', '\\log_{a}b', '\\sin x', '\\cos x', '\\sum_{i=1}^{n}', '\\int_{a}^{b}', '\\lim_{x\\to 0}', '\\rightarrow', '\\in', '\\mathbb{R}',
  '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '\\begin{cases} x+y=1 \\\\ x-y=0 \\end{cases}', 'H_2SO_4',
];
export function formulaDialog(onInsert, initial = '') {
  const src = h('textarea', { class: 'input', rows: 3, value: initial, placeholder: '\\frac{1}{2} + x^2', style: { fontFamily: 'ui-monospace, Consolas, monospace' } });
  const prev = h('div', { class: 'preview-box center', style: { fontSize: '1.4rem' } });
  const update = () => { prev.innerHTML = src.value.trim() ? rich(`$$${src.value}$$`) : `<span class="muted small">${t('Здесь появится формула')}</span>`; };
  src.addEventListener('input', update);
  const insert = (snippet) => {
    const [a, b] = [src.selectionStart, src.selectionEnd];
    src.setRangeText(snippet, a, b, 'end');
    src.focus();
    update();
  };
  update();
  modal({
    title: t('Конструктор формул'), wide: true,
    body: h('div', { class: 'stack' },
      h('div', { class: 'fx-pal' }, FX.map((f) => h('button', { type: 'button', title: f, html: rich(`$${f}$`), onClick: () => insert(f) }))),
      h('label', { class: 'field' }, h('span', null, t('Формула (LaTeX)')), src), prev,
      h('p', { class: 'small muted' }, t('Нажимайте кнопки или пишите сами: дробь — \\frac{1}{2}, степень — x^{2}, корень — \\sqrt{x}.'))),
    actions: [{ label: t('Отмена'), kind: 'ghost' }, { label: t('Вставить'), kind: 'primary', onClick: () => { if (src.value.trim()) onInsert(`$${src.value.trim()}$`); } }],
  });
}

// ---------- медиа ----------
function mediaDialog(kind, onDone) {
  const url = h('input', { class: 'input', placeholder: kind === 'video' ? 'https://youtube.com/watch?v=…' : 'https://…/picture.jpg' });
  const status = h('div', { class: 'small muted' });
  const dlg = modal({
    title: kind === 'video' ? t('Видео к вопросу') : t('Картинка'),
    body: h('div', { class: 'stack' },
      h('button', { class: 'btn primary', style: { width: '100%' }, onClick: async (e) => {
        const file = await pickFile(kind === 'video' ? 'video/mp4,video/webm' : 'image/png,image/jpeg,image/gif,image/webp');
        if (!file) return;
        e.target.disabled = true;
        status.textContent = t('Загрузка…');
        try { onDone(await uploadFile(file, kind)); dlg.close(); toast(t('Загружено')); } catch (err) { status.textContent = ''; toastErr(err); } finally { e.target.disabled = false; }
      } }, ic('upload'), kind === 'video' ? t('Загрузить MP4 / WebM (до 50 МБ)') : t('Загрузить файл (JPG, PNG, GIF, WebP до 5 МБ)')),
      status,
      h('div', { class: 'center muted small' }, t('или вставьте ссылку')),
      url,
      kind === 'video' ? h('p', { class: 'small muted' }, t('Поддерживаются YouTube, Vimeo и прямые ссылки на видео. Автозапуска нет.')) : null),
    actions: [{ label: t('Отмена'), kind: 'ghost' }, { label: t('Добавить по ссылке'), kind: 'primary', onClick: () => {
      if (!/^https?:\/\//.test(url.value.trim())) { toastErr(new Error(t('Ссылка должна начинаться с https://'))); return false; }
      onDone(url.value.trim());
    } }],
  });
}

// ---------- текст с панелью форматирования ----------
function richInput(value, onChange, { rows = 3, placeholder = '' } = {}) {
  const ta = h('textarea', { class: 'input', rows, value, placeholder });
  const prev = h('div', { class: 'preview-box rich' });
  const sync = (notify = true) => { prev.innerHTML = ta.value.trim() ? rich(ta.value) : `<span class="muted small">${t('Предпросмотр')}</span>`; if (notify) onChange(ta.value); };
  ta.addEventListener('input', () => sync());
  const wrap = (a, b = a) => {
    const [s, e] = [ta.selectionStart, ta.selectionEnd];
    const sel = ta.value.slice(s, e) || t('текст');
    ta.setRangeText(`${a}${sel}${b}`, s, e, 'end');
    ta.focus(); sync();
  };
  const put = (text) => { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); sync(); };
  const link = () => {
    const url = h('input', { class: 'input', placeholder: 'https://…' });
    const label = h('input', { class: 'input', value: ta.value.slice(ta.selectionStart, ta.selectionEnd), placeholder: t('Текст ссылки') });
    const [s, e] = [ta.selectionStart, ta.selectionEnd];
    modal({ title: t('Ссылка'), body: h('div', { class: 'stack' }, label, url),
      actions: [{ label: t('Вставить'), kind: 'primary', onClick: () => {
        if (!/^https?:\/\/\S+$/.test(url.value.trim())) { toastErr(new Error(t('Ссылка должна начинаться с https://'))); return false; }
        ta.setRangeText(`[${label.value || url.value}](${url.value.trim()})`, s, e, 'end'); sync();
      } }] });
  };
  const list = () => {
    const [s, e] = [ta.selectionStart, ta.selectionEnd];
    const text = (ta.value.slice(s, e) || t('пункт')).split('\n').map((l) => `- ${l.replace(/^- /, '')}`).join('\n');
    ta.setRangeText(text, s, e, 'end'); ta.focus(); sync();
  };
  const tb = (ico, title, fn) => h('button', { type: 'button', title: t(title), html: icon(ico), onClick: fn });
  sync(false);
  return h('div', null,
    h('div', { class: 'toolbar' }, tb('bold', 'Жирный', () => wrap('**')), tb('italic', 'Курсив', () => wrap('*')), tb('under', 'Подчёркнутый', () => wrap('__')),
      tb('link', 'Ссылка', link), tb('listul', 'Список', list), tb('sigma', 'Формула', () => formulaDialog(put))),
    ta, h('div', { style: { marginTop: '8px' } }, prev));
}

// ---------- карточка вопроса ----------
function questionCard(quiz, i, redraw, markDirty) {
  const q = quiz.questions[i];
  const set = (patch, re = false) => { Object.assign(q, patch); markDirty(); if (re) redraw(); };
  const changeType = (type) => {
    if (type === q.type) return;
    const fresh = newQuestion(type);
    if (type === 'choice' && q.type === 'truefalse') fresh.options = [{ text: t('Верно') }, { text: t('Неверно') }];
    if (type === 'match' && q.type === 'choice') fresh.pairs = q.options.map((o) => ({ left: o.text, right: '' }));
    quiz.questions[i] = { ...fresh, text: q.text, image: q.image, video: q.video, explain: q.explain, double: q.double };
    markDirty(); redraw();
  };
  const move = (d) => { const qs = quiz.questions; [qs[i], qs[i + d]] = [qs[i + d], qs[i]]; markDirty(); redraw(); };

  const answersArea = () => {
    if (q.type === 'match') {
      return h('div', { class: 'stack' }, h('b', { class: 'small' }, t('Пары: слева — справа. Ученики увидят правую часть перемешанной')),
        q.pairs.map((pr, k) => h('div', { class: 'pair-row' },
          h('span', { class: 'num' }, k + 1),
          h('input', { class: 'input', value: pr.left, placeholder: t('Понятие'), onInput: (e) => { pr.left = e.target.value; markDirty(); } }),
          h('span', { class: 'muted' }, '→'),
          h('input', { class: 'input', value: pr.right, placeholder: t('Пара к нему'), onInput: (e) => { pr.right = e.target.value; markDirty(); } }),
          q.pairs.length > 2 ? h('button', { type: 'button', class: 'btn sm icon ghost', title: t('Удалить пару'), html: icon('trash'), onClick: () => { q.pairs.splice(k, 1); markDirty(); redraw(); } }) : null)),
        q.pairs.length < 6 ? h('button', { type: 'button', class: 'btn sm', onClick: () => { q.pairs.push({ left: '', right: '' }); markDirty(); redraw(); } }, ic('plus'), t('Пара')) : null,
        h('div', { class: 'small muted' }, t('Балл — доля верных пар: 2 из 3 дают ⅔ очков')));
    }
    if (q.type === 'choice') {
      return h('div', { class: 'stack' }, h('b', { class: 'small' }, t('Варианты (нажмите на букву правильного)')),
        q.options.map((o, k) => h('div', { class: 'opt-row' },
          h('button', { type: 'button', class: `mark ${q.correct === k ? 'on' : ''}`, title: t('Правильный ответ'), onClick: () => set({ correct: k }, true) }, q.correct === k ? h('span', { html: icon('check'), style: { width: '20px', display: 'inline-flex' } }) : LETTERS[k]),
          h('input', { class: 'input', value: o.text, placeholder: `${t('Вариант')} ${LETTERS[k]}  ($x^2$ — ${t('формула')})`, onInput: (e) => { o.text = e.target.value; markDirty(); } }),
          o.image ? h('img', { class: 'opt-thumb', src: o.image, alt: '' }) : null,
          h('button', { type: 'button', class: 'btn sm icon', title: o.image ? t('Убрать картинку') : t('Картинка'), html: icon(o.image ? 'x' : 'image'),
            onClick: () => {
              if (!o.image) return mediaDialog('image', (url) => { o.image = url; markDirty(); redraw(); });
              o.image = '';
              markDirty(); redraw();
            } }),
          q.options.length > 2 ? h('button', { type: 'button', class: 'btn sm icon ghost', title: t('Удалить вариант'), html: icon('trash'), onClick: () => {
            q.options.splice(k, 1);
            if (q.correct >= q.options.length) q.correct = 0; else if (q.correct > k) q.correct--;
            markDirty(); redraw();
          } }) : null)),
        q.options.length < 6 ? h('button', { type: 'button', class: 'btn sm', onClick: () => { q.options.push({ text: '' }); markDirty(); redraw(); } }, ic('plus'), t('Вариант')) : null);
    }
    if (q.type === 'truefalse') {
      return h('div', { class: 'row' }, h('b', { class: 'small' }, t('Правильно:')), h('div', { class: 'seg' },
        [[true, 'Верно'], [false, 'Неверно']].map(([v, l]) => h('button', { type: 'button', class: q.correct === v ? 'on' : '', onClick: () => set({ correct: v }, true) }, t(l)))));
    }
    const isNum = q.type === 'number';
    return h('label', { class: 'field' },
      h('span', null, isNum ? t('Правильный ответ — число (несколько через ;)') : t('Принимаемые ответы через ;')),
      h('input', { class: 'input', value: (q.answers || []).join('; '), placeholder: isNum ? '34' : t('тенге; теңге'),
        onInput: (e) => { q.answers = e.target.value.split(';').map((s) => s.trim()).filter(Boolean); markDirty(); } }),
      h('div', { class: 'small muted', style: { marginTop: '4px' } }, isNum ? t('Дробь пишите как 0,5 или 1/2. Такие вопросы удобны для игры на доске с цифровой клавиатурой.')
        : t('Регистр и знаки препинания не важны. Если оставить пустым — ответы во время игры оцените вы сами (✓, ½, ✗).')));
  };

  return h('div', { class: 'card qedit stack', id: `q${i}` },
    h('div', { class: 'qhead' },
      h('div', { class: 'num' }, i + 1),
      h('div', { class: 'seg' }, TYPES.map(([k, l]) => h('button', { type: 'button', class: q.type === k ? 'on' : '', onClick: () => changeType(k) }, t(l)))),
      h('select', { class: 'input', style: { width: 'auto', padding: '7px 10px' }, title: t('Время на ответ'), onChange: (e) => set({ time: Number(e.target.value) }) },
        [...new Set([...TIMES, q.time])].sort((a, b) => a - b).map((s) => h('option', { value: s, selected: s === q.time }, `${s} ${t('с')}`))),
      h('button', { type: 'button', class: `btn sm ${q.double ? 'primary' : ''}`, title: t('Двойные очки'), onClick: () => set({ double: !q.double }, true) }, ic('zap'), '×2'),
      h('div', { class: 'grow' }),
      i > 0 ? h('button', { type: 'button', class: 'btn sm icon ghost', title: t('Выше'), html: icon('up'), onClick: () => move(-1) }) : null,
      i < quiz.questions.length - 1 ? h('button', { type: 'button', class: 'btn sm icon ghost', title: t('Ниже'), html: icon('down'), onClick: () => move(1) }) : null,
      h('button', { type: 'button', class: 'btn sm icon ghost', title: t('Дублировать'), html: icon('copy'), onClick: () => { quiz.questions.splice(i + 1, 0, structuredClone(q)); markDirty(); redraw(); } }),
      h('button', { type: 'button', class: 'btn sm icon danger', title: t('Удалить вопрос'), html: icon('trash'), onClick: async () => {
        if (q.text && !(await ask(t('Удалить вопрос {n}?', { n: i + 1 }), { ok: t('Удалить'), danger: true }))) return;
        quiz.questions.splice(i, 1); markDirty(); redraw();
      } })),
    richInput(q.text, (v) => { q.text = v; markDirty(); }, { placeholder: t('Текст вопроса. Формулы — $x^2$, жирный — **текст**') }),
    h('div', { class: 'row' },
      q.image ? h('div', { class: 'row' }, h('img', { src: q.image, alt: '', style: { height: '64px', borderRadius: '8px' } }), h('button', { type: 'button', class: 'btn sm', onClick: () => set({ image: '' }, true) }, ic('x'), t('Убрать картинку')))
        : h('button', { type: 'button', class: 'btn sm', onClick: () => mediaDialog('image', (url) => set({ image: url }, true)) }, ic('image'), t('Картинка')),
      q.video ? h('div', { class: 'row' }, h('span', { class: 'chip' }, ic('video', { style: { width: '14px' } }), q.video.length > 40 ? `${q.video.slice(0, 40)}…` : q.video), h('button', { type: 'button', class: 'btn sm', onClick: () => set({ video: '' }, true) }, ic('x'), t('Убрать видео')))
        : h('button', { type: 'button', class: 'btn sm', onClick: () => mediaDialog('video', (url) => set({ video: url }, true)) }, ic('video'), t('Видео'))),
    answersArea(),
    h('details', { open: Boolean(q.explain) }, h('summary', { class: 'small muted', style: { cursor: 'pointer', fontWeight: 500 } }, t('Пояснение после ответа (необязательно)')),
      h('input', { class: 'input', style: { marginTop: '8px' }, value: q.explain || '', placeholder: t('Почему этот ответ правильный'), onInput: (e) => { q.explain = e.target.value; markDirty(); } })));
}

// ---------- страница редактора ----------
export async function editor(id) {
  let quiz;
  if (id === 'new') {
    const draft = sessionStorage.getItem('tq_draft');
    sessionStorage.removeItem('tq_draft');
    quiz = draft ? JSON.parse(draft) : { title: '', subject: 'mat', grade: 7, lang: 'ru', description: '', shared: 0, questions: [newQuestion()] };
  } else quiz = await api(`/api/quizzes/${id}`);
  let dirty = id === 'new' && quiz.questions.some((q) => q.text);
  const markDirty = () => { dirty = true; drawAside(); };
  const list = h('div', { class: 'stack' });
  const aside = h('div', { class: 'card stack' });

  const redraw = () => { fill(list, ...quiz.questions.map((_, i) => questionCard(quiz, i, redraw, markDirty))); drawAside(); };
  function drawAside() {
    const total = quiz.questions.reduce((s, q) => s + (Number(q.time) || 0), 0);
    fill(aside, 
      h('div', { class: 'row', style: { gap: '28px' } }, h('div', { class: 'stat' }, h('b', null, quiz.questions.length), h('span', null, t('вопросов'))),
        h('div', { class: 'stat' }, h('b', null, fmtDur(total)), h('span', null, t('время ответов')))),
      h('div', { style: { maxHeight: '260px', overflow: 'auto' } }, quiz.questions.map((q, i) => h('a', {
        href: `#q${i}`, class: 'list-row', style: { color: 'inherit', textDecoration: 'none', padding: '6px 2px' },
        onClick: (e) => { e.preventDefault(); document.getElementById(`q${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      }, h('b', { style: { color: 'var(--muted)', width: '24px' } }, i + 1), h('span', { class: 'small grow', style: { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } }, q.text.replace(/[$*_]/g, '') || t('(без текста)'))))),
      dirty ? h('div', { class: 'chip' }, t('есть несохранённые изменения')) : null);
  }

  const save = async () => {
    try {
      if (quiz.id) await api(`/api/quizzes/${quiz.id}`, { method: 'PUT', body: quiz });
      else quiz.id = (await api('/api/quizzes', { method: 'POST', body: quiz })).id;
      dirty = false;
      drawAside();
      toast(t('Квиз сохранён'));
      history.replaceState(null, '', `#/t/edit/${quiz.id}`);
      return true;
    } catch (e) { toastErr(e); return false; }
  };
  const field = (label, el) => h('label', { class: 'field' }, h('span', null, t(label)), el);
  const add = (type) => { quiz.questions.push(newQuestion(type)); markDirty(); redraw(); setTimeout(() => document.getElementById(`q${quiz.questions.length - 1}`)?.scrollIntoView({ behavior: 'smooth' }), 50); };

  const info = h('div', { class: 'card stack' },
    field('Название квиза', h('input', { class: 'input', value: quiz.title, maxLength: 120, placeholder: t('Например: Квадратные уравнения, 8 класс'), onInput: (e) => { quiz.title = e.target.value; markDirty(); } })),
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, field('Предмет', subjectSelect(quiz.subject, (v) => { quiz.subject = v; markDirty(); }))),
      field('Класс', h('select', { class: 'input', onChange: (e) => { quiz.grade = Number(e.target.value); markDirty(); } },
        [0, ...store.meta.grades].map((g) => h('option', { value: g, selected: g === quiz.grade }, g ? `${g}` : t('любой'))))),
      field('Язык', h('select', { class: 'input', onChange: (e) => { quiz.lang = e.target.value; markDirty(); } },
        [['ru', 'Русский'], ['kk', 'Қазақша'], ['en', 'English']].map(([v, l]) => h('option', { value: v, selected: v === quiz.lang }, l))))),
    field('Описание (необязательно)', h('input', { class: 'input', value: quiz.description || '', maxLength: 500, onInput: (e) => { quiz.description = e.target.value; markDirty(); } })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(quiz.shared), onChange: (e) => { quiz.shared = e.target.checked ? 1 : 0; markDirty(); } }),
      t('Поделиться с коллегами (появится в библиотеке)')));

  redraw();
  const node = teacherPage('quizzes',
    h('div', { class: 'page-head' },
      h('div', null, h('a', { href: '#/t/quizzes', class: 'small', onClick: async (e) => { if (dirty) { e.preventDefault(); if (await ask(t('Выйти без сохранения?'))) { dirty = false; go('#/t/quizzes'); } } } }, `← ${t('Мои квизы')}`),
        h('h1', null, quiz.id ? t('Редактирование') : t('Новый квиз'))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onClick: () => previewQuiz(quiz) }, ic('eye'), t('Предпросмотр')),
        h('button', { class: 'btn', onClick: save }, ic('check'), t('Сохранить')),
        h('button', { class: 'btn primary', onClick: async () => { if (await save()) launchDialog(await api(`/api/quizzes/${quiz.id}`)); } }, ic('play'), t('Сохранить и запустить')))),
    h('div', { class: 'editor' },
      h('div', { class: 'stack' }, info, list,
        h('div', { class: 'card row', style: { justifyContent: 'center', borderStyle: 'dashed' } }, h('b', null, t('Добавить вопрос:')),
          TYPES.map(([k, l]) => h('button', { class: 'btn sm', onClick: () => add(k) }, ic('plus'), t(l))))),
      h('aside', null, aside)));
  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  node.cleanup = () => window.removeEventListener('beforeunload', beforeUnload);
  return node;
}

// ---------- предпросмотр «как ученик» ----------
export function previewQuiz(quiz) {
  const box = h('div');
  let i = -1;
  let timer;
  const total = quiz.questions.reduce((s, q) => s + q.time, 0);
  const summary = () => {
    clearInterval(timer);
    fill(box, h('div', { class: 'stack' },
      h('div', { class: 'row', style: { gap: '28px' } }, h('div', { class: 'stat' }, h('b', null, quiz.questions.length), h('span', null, t('вопросов'))),
        h('div', { class: 'stat' }, h('b', null, fmtDur(total)), h('span', null, t('общее время')))),
      h('div', { style: { maxHeight: '45vh', overflow: 'auto' } }, quiz.questions.map((q, k) => h('div', { class: 'list-row' }, h('b', { style: { width: '24px', color: 'var(--muted)' } }, k + 1),
        h('div', { class: 'grow rich small', html: rich(q.text) }), h('span', { class: 'chip' }, `${t(TYPES.find(([x]) => x === q.type)[1])} · ${q.time} ${t('с')}`)))),
      h('button', { class: 'btn primary big', onClick: () => show(0) }, ic('play'), t('Пройти как ученик'))));
  };
  const reveal = (q, value, area, left) => {
    clearInterval(timer);
    const ok = value === undefined ? false
      : q.type === 'match' ? value.every((v, k) => v === k)
      : q.type === 'choice' ? value === q.correct
        : q.type === 'truefalse' ? value === q.correct
          : q.type === 'number' ? q.answers.some((a) => Math.abs(a - Number(String(value).replace(',', '.'))) < 1e-6)
            : q.answers.some((a) => a.toLowerCase().trim() === String(value).toLowerCase().trim());
    const right = q.type === 'match' ? q.pairs.map((pr) => `${pr.left} → ${pr.right}`).join('; ')
      : q.type === 'choice' ? q.options[q.correct].text : q.type === 'truefalse' ? (q.correct ? t('Верно') : t('Неверно')) : q.answers.join(' / ') || t('оценивает учитель');
    fill(area, h('div', { class: 'card center', style: { background: ok ? 'var(--ok-s)' : 'var(--bad-s)' } },
      h('div', { class: 'big-mark', style: { color: ok ? 'var(--ok)' : 'var(--bad)', fontSize: '3rem' } }, ok ? '✓' : '✗'),
      h('div', null, value === undefined ? t('Время вышло') : ok ? `${t('Верно')} ${left > 0 ? `· ${t('осталось')} ${left} ${t('с')}` : ''}` : t('Неверно')),
      h('div', { class: 'rich', style: { marginTop: '6px' } }, t('Правильный ответ:'), ' ', h('b', { html: rich(right) })),
      q.explain ? h('div', { class: 'small muted rich', style: { marginTop: '6px' }, html: rich(q.explain) }) : null));
  };
  function show(k) {
    clearInterval(timer);
    i = k;
    const q = quiz.questions[i];
    const area = h('div');
    let left = q.time;
    const bar = h('i', { style: { transform: 'scaleX(1)', transition: 'transform 1s linear' } });
    const clock = h('b');
    timer = setInterval(() => { left--; clock.textContent = `${left} ${t('с')}`; bar.style.transform = `scaleX(${left / q.time})`; if (left <= 0) reveal(q, undefined, area, 0); }, 1000);
    clock.textContent = `${left} ${t('с')}`;
    const answer = (v) => reveal(q, v, area, left);
    if (q.type === 'choice') area.append(h('div', { class: 'opts' }, q.options.map((o, n) => h('button', { class: `opt o${n}`, onClick: () => answer(n) }, h('span', { class: 'L' }, LETTERS[n]), h('span', { class: 'rich', html: rich(o.text) }), o.image ? h('img', { src: o.image, alt: '' }) : null))));
    else if (q.type === 'match') {
      const order = q.pairs.map((_, k) => k).sort(() => Math.random() - 0.5);
      const pick = q.pairs.map(() => null);
      const go2 = h('button', { class: 'btn primary', disabled: true, onClick: () => answer(pick) }, t('Ответить'));
      area.append(h('div', { class: 'stack' },
        h('div', { class: 'card match-key' }, order.map((j, k) => h('div', { class: 'mrow' }, h('span', { class: 'L' }, LETTERS[k]), h('span', { class: 'rich', html: rich(q.pairs[j].right) })))),
        q.pairs.map((pr, i) => {
          const btns = order.map((j, k) => h('button', { type: 'button', class: 'mpick', onClick: () => {
            pick[i] = pick[i] === j ? null : j;
            btns.forEach((b, n) => b.classList.toggle('on', pick[i] === order[n]));
            go2.disabled = pick.some((v) => v === null);
          } }, LETTERS[k]));
          return h('div', { class: 'mq' }, h('div', { class: 'mq-l' }, h('span', { class: 'L' }, i + 1), h('span', { class: 'rich', html: rich(pr.left) })), h('div', { class: 'mq-r' }, btns));
        }), go2));
    } else if (q.type === 'truefalse') area.append(h('div', { class: 'opts' }, h('button', { class: 'opt o3', onClick: () => answer(true) }, t('Верно')), h('button', { class: 'opt o0', onClick: () => answer(false) }, t('Неверно'))));
    else {
      const inp = h('input', { class: 'input', inputmode: q.type === 'number' ? 'decimal' : 'text', placeholder: t('Ваш ответ'), style: { fontSize: '1.3rem' } });
      area.append(h('form', { class: 'row', onSubmit: (e) => { e.preventDefault(); answer(inp.value); } }, h('div', { class: 'grow' }, inp), h('button', { class: 'btn primary' }, t('Ответить'))));
    }
    fill(box, h('div', { class: 'stack' },
      h('div', { class: 'row between' }, h('b', null, `${t('Вопрос')} ${i + 1} / ${quiz.questions.length}${q.double ? ' · ×2' : ''}`), clock),
      h('div', { class: 'timebar', style: { background: 'var(--line)' } }, bar),
      h('div', { class: 'qbox', style: { boxShadow: 'none', border: '2px solid var(--line)' } }, questionEl(q)),
      area,
      h('div', { class: 'row between' },
        h('button', { class: 'btn', disabled: i === 0, onClick: () => show(i - 1) }, ic('left'), t('Назад')),
        h('button', { class: 'btn ghost', onClick: summary }, t('Список')),
        i < quiz.questions.length - 1 ? h('button', { class: 'btn primary', onClick: () => show(i + 1) }, t('Дальше'), ic('right'))
          : h('button', { class: 'btn primary', onClick: summary }, t('Готово')))));
  }
  summary();
  modal({ title: `${t('Предпросмотр')}: ${quiz.title || t('без названия')}`, body: box, wide: true, onClose: () => clearInterval(timer) });
}

