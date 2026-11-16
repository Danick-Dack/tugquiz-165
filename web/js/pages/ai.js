// ИИ-генератор: одной кнопкой через API или бесплатно через любой чат (промт → ответ → вопросы).
import { h, fill, api, store, go, icon, ic, toast, toastErr, copyText, pickFile, compressImage } from '../core.js';
import { t, lang } from '../i18n.js';
import { teacherPage } from '../app.js';
import { questionEl } from '../content.js';

const CHATS = [
  ['ChatGPT', 'https://chatgpt.com/'], ['DeepSeek', 'https://chat.deepseek.com/'], ['Gemini', 'https://gemini.google.com/app'],
  ['Qwen', 'https://chat.qwen.ai/'], ['Claude', 'https://claude.ai/new'],
];
const BOARD = ['choice', 'truefalse', 'number'];
const TYPE_LABELS = [['choice', 'Выбор ответа'], ['truefalse', 'Верно / неверно'], ['number', 'Число'], ['open', 'Свой ответ']];
const correctLabel = (q) => (q.type === 'choice' ? q.options[q.correct].text : q.type === 'truefalse' ? (q.correct ? t('Верно') : t('Неверно')) : q.answers.join(' / '));

export async function aiPage() {
  const status = await api('/api/ai/status');
  const forBoard = location.hash.includes('board');
  const p = { subject: 'mat', grade: 8, topic: '', examples: '', image: '', count: forBoard ? 20 : 10, types: forBoard ? ['number'] : ['choice', 'truefalse', 'number'],
    lang: lang(), difficulty: 'средняя', notes: '' };
  let tab = status.enabled ? 'api' : 'chat';
  const tabBox = h('div');
  const result = h('div');

  const field = (label, el) => h('label', { class: 'field' }, h('span', null, t(label)), el);
  const seg = (key, values) => {
    const el = h('div', { class: 'seg' }, values.map(([v, l]) => h('button', { type: 'button', class: p[key] === v ? 'on' : '',
      onClick: (e) => { p[key] = v; el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, t(l))));
    return el;
  };
  const typeChips = h('div', { class: 'chips' }, TYPE_LABELS.map(([v, l]) => h('button', {
    type: 'button', class: `chip ${p.types.includes(v) ? 'on' : ''}`,
    onClick: (e) => {
      p.types = p.types.includes(v) ? p.types.filter((x) => x !== v) : [...p.types, v];
      if (!p.types.length) p.types = [v];
      e.currentTarget.classList.toggle('on', p.types.includes(v));
    },
  }, t(l))));

  const photo = h('div', { class: 'row' });
  const drawPhoto = () => fill(photo, p.image
    ? [h('img', { src: p.image, alt: '', style: { height: '84px', borderRadius: '10px', border: '2px solid var(--line)' } }),
      h('button', { type: 'button', class: 'btn sm', onClick: () => { p.image = ''; drawPhoto(); drawTab(); } }, ic('x'), t('Убрать фото'))]
    : h('button', { type: 'button', class: 'btn', onClick: async () => {
      const file = await pickFile('image/png,image/jpeg,image/webp');
      if (!file) return;
      const blob = await compressImage(file);
      if (blob.size > 5 * 1024 * 1024) return toastErr(new Error(t('Файл больше {n} МБ', { n: 5 })));
      p.image = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      drawPhoto(); drawTab();
    } }, ic('image'), t('Фото с примерами (учебник, доска)')));
  drawPhoto();

  const form = h('div', { class: 'card stack' },
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, field('Предмет', h('select', { class: 'input', onChange: (e) => { p.subject = e.target.value; } },
        store.meta.subjects.map((s) => h('option', { value: s.key, selected: s.key === p.subject }, (s[lang()] || s.ru)))))),
      field('Класс', h('select', { class: 'input', onChange: (e) => { p.grade = Number(e.target.value); } },
        store.meta.grades.map((g) => h('option', { value: g, selected: g === p.grade }, g))))),
    field('Тема — любая, своими словами', h('input', { class: 'input', placeholder: t('Например: логарифмы; Абай Құнанбаев; Present Perfect'), onInput: (e) => { p.topic = e.target.value; } })),
    field('Какие задания нужны (пример)', h('textarea', { class: 'input', rows: 3,
      placeholder: t('Например: log_2 8 = ?, найти x: 3x − 7 = 20. ИИ составит похожие с другими числами.'), onInput: (e) => { p.examples = e.target.value; } })),
    photo,
    h('div', { class: 'row' }, h('b', null, t('Сколько')), seg('count', [[5, '5'], [10, '10'], [15, '15'], [20, '20'], [30, '30']])),
    h('div', { class: 'row' }, h('b', null, t('Типы')), typeChips),
    h('details', null, h('summary', { style: { cursor: 'pointer', fontWeight: 800, color: 'var(--g700)' } }, t('Дополнительно')),
      h('div', { class: 'stack', style: { marginTop: '12px' } },
        h('div', { class: 'row' }, h('b', null, t('Язык')), seg('lang', [['ru', 'Русский'], ['kk', 'Қазақша'], ['en', 'English']])),
        h('div', { class: 'row' }, h('b', null, t('Сложность')), seg('difficulty', [['лёгкая', 'лёгкая'], ['средняя', 'средняя'], ['сложная', 'сложная'], ['олимпиадная', 'олимпиадная']])),
        field('Пожелания', h('input', { class: 'input', placeholder: t('Например: больше задач с формулами, без дат'), onInput: (e) => { p.notes = e.target.value; } })))));

  function showResult(data) {
    const keep = new Set(data.questions.map((_, i) => i));
    const title = h('input', { class: 'input', value: data.title || p.topic || t('Квиз от ИИ') });
    fill(result, h('div', { class: 'card stack', style: { marginTop: '18px' } },
      h('h2', { style: { margin: 0 } }, `✨ ${t('Готово')}: ${data.questions.length} ${t('вопросов')}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onClick: () => {
          const questions = data.questions.filter((_, i) => keep.has(i));
          if (!questions.length) return toastErr(new Error(t('Отметьте хотя бы один вопрос')));
          sessionStorage.setItem('tq_draft', JSON.stringify({ title: title.value, subject: p.subject, grade: p.grade, lang: p.lang, description: p.topic, shared: 0, questions }));
          go('#/t/edit/new');
        } }, ic('edit'), t('Открыть в редакторе')),
        data.questions.some((q) => BOARD.includes(q.type)) ? h('button', { class: 'btn yellow', onClick: async () => {
          const questions = data.questions.filter((q, i) => keep.has(i) && BOARD.includes(q.type));
          if (!questions.length) return toastErr(new Error(t('Отметьте хотя бы один вопрос')));
          try {
            const { id } = await api('/api/quizzes', { method: 'POST', body: { title: title.value, subject: p.subject, grade: p.grade, lang: p.lang, description: p.topic, questions } });
            sessionStorage.setItem('tq_board', JSON.stringify({ quizId: id, title: title.value, subject: p.subject, questions,
              teamNames: [t('1-команда'), t('2-команда')], duration: 90, margin: 8 }));
            toast(t('Квиз сохранён'));
            go('#/board');
          } catch (e) { toastErr(e); }
        } }, ic('rope'), t('Играть на доске')) : null),
      field('Название', title),
      data.errors?.length ? h('div', { class: 'small', style: { color: 'var(--bad)' } }, `${t('Пропущено')}: ${data.errors.join('; ')}`) : null,
      h('p', { class: 'small muted' }, t('ИИ может ошибаться — проверьте ответы. Снимите галочку с лишних вопросов.')),
      data.questions.map((q, i) => h('label', { class: 'list-row', style: { alignItems: 'flex-start', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: true, style: { width: '20px', height: '20px', marginTop: '4px', accentColor: 'var(--g600)' },
          onChange: (e) => (e.target.checked ? keep.add(i) : keep.delete(i)) }),
        h('div', { class: 'grow' }, h('div', { class: 'row', style: { gap: '6px' } }, h('b', null, `${i + 1}.`), h('span', { class: 'chip' }, t(TYPE_LABELS.find(([x]) => x === q.type)[1]))),
          questionEl(q),
          q.type === 'choice' ? h('div', { class: 'small muted' }, q.options.map((o, k) => `${'ABCDEF'[k]}) ${o.text}`).join('   ')) : null,
          h('div', { class: 'small', style: { color: 'var(--ok)', fontWeight: 800 } }, `✓ ${correctLabel(q) || t('оценивает учитель')}`))))));
    result.scrollIntoView({ behavior: 'smooth' });
  }

  function drawTab() {
    if (tab === 'api') {
      const btn = h('button', { class: 'btn primary big', disabled: !status.enabled, onClick: async () => {
        btn.disabled = true;
        fill(btn, h('span', { class: 'wait-dots' }, t('ИИ думает')));
        try { showResult(await api('/api/ai/generate', { method: 'POST', body: p })); } catch (e) { toastErr(e); } finally {
          btn.disabled = false; fill(btn, h('span', { html: icon('spark'), style: { display: 'contents' } }), t('Сгенерировать'));
        }
      } }, h('span', { html: icon('spark'), style: { display: 'contents' } }), t('Сгенерировать'));
      fill(tabBox, h('div', { class: 'stack' },
        status.enabled ? h('p', { class: 'muted' }, t('Вопросы появятся через 10–40 секунд. Ничего платить не нужно.'))
          : h('p', null, t('Администратор ещё не подключил ключ ИИ. Используйте способ «Через любой чат» — он бесплатный и работает сразу.'),
            store.me.role === 'admin' ? [' ', h('a', { href: '#/t/admin' }, t('Подключить ключ →'))] : null),
        btn));
      return;
    }
    const answer = h('textarea', { class: 'input', rows: 7, placeholder: t('Вставьте сюда весь ответ нейросети (JSON)') });
    const promptBox = h('pre', { class: 'prompt-box' });
    const getPrompt = async () => (await api('/api/ai/prompt', { method: 'POST', body: { ...p, image: undefined, hasImage: Boolean(p.image) } })).prompt;
    fill(tabBox, h('div', { class: 'stack' },
      h('div', { class: 'guide-step' }, h('div', { class: 'n' }, '1'), h('div', { class: 'stack' },
        h('b', null, t('Скопируйте промт')),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', onClick: async () => { try { await copyText(await getPrompt()); } catch (e) { toastErr(e); } } }, ic('copy'), t('Скопировать промт')),
          h('button', { class: 'btn ghost sm', onClick: async () => { promptBox.textContent = await getPrompt(); } }, ic('eye'), t('Показать'))),
        promptBox)),
      h('div', { class: 'guide-step' }, h('div', { class: 'n' }, '2'), h('div', { class: 'stack' },
        h('b', null, t('Вставьте его в любой бесплатный чат с ИИ')),
        p.image ? h('div', { class: 'chip', style: { background: 'var(--y100)', color: '#7a6a00' } }, ic('image', { style: { width: '14px' } }), t('Прикрепите в чат то же фото с примерами')) : null,
        h('div', { class: 'row' }, CHATS.map(([name, url]) => h('a', { class: 'btn sm', href: url, target: '_blank', rel: 'noopener' }, name, ' ↗'))))),
      h('div', { class: 'guide-step' }, h('div', { class: 'n' }, '3'), h('div', { class: 'stack' },
        h('b', null, t('Скопируйте ответ и вставьте сюда')), answer,
        h('button', { class: 'btn primary', onClick: async () => {
          try { showResult(await api('/api/ai/parse', { method: 'POST', body: { text: answer.value } })); } catch (e) { toastErr(e); }
        } }, ic('check'), t('Распознать вопросы'))))));
    promptBox.textContent = t('Нажмите «Показать», чтобы увидеть промт.');
  }

  const tabs = h('div', { class: 'seg' }, [['api', 'Одной кнопкой'], ['chat', 'Через любой чат (без ключа)']].map(([k, l]) =>
    h('button', { class: tab === k ? 'on' : '', onClick: (e) => { tab = k; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawTab(); } }, t(l))));
  drawTab();

  return teacherPage('ai',
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, `✨ ${t('ИИ-генератор вопросов')}`),
      h('p', { class: 'muted', style: { margin: '6px 0 0' } }, t('Опишите тему — нейросеть составит вопросы, а вы проверите и запустите игру. Бесплатно.')))),
    h('div', { class: 'editor', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' } }, form, h('div', { class: 'card stack' }, tabs, tabBox)),
    result);
}
