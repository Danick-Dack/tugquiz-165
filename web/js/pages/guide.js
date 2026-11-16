// Интерактивный гайд для учителя и тур с подсветкой пунктов меню.
import { h, fill, api, store, go, icon, ic } from '../core.js';
import { t } from '../i18n.js';
import { teacherPage } from '../app.js';
import { Tug } from '../rope.js';
import { rich } from '../content.js';

// ---------- тур ----------
const STEPS = [
  ['create', 'Создать квиз', 'Вопросы четырёх типов: выбор, верно/неверно, число и свой ответ. Формулы, картинки, видео и ссылки.'],
  ['quizzes', 'Мои квизы', 'Все ваши квизы. Зелёная кнопка ▶ запускает игру в одном из четырёх режимов.'],
  ['library', 'Библиотека', 'Готовые шаблоны по предметам лицея и квизы коллег. Копируйте себе и меняйте.'],
  ['ai', 'ИИ-генератор', 'Тема → нейросеть пишет вопросы. Бесплатно: промт копируется в любой чат, ответ вставляется обратно.'],
  ['board', 'Канат на доске', 'Арқан тартыс без телефонов: две половины интерактивной доски, у каждой команды свои примеры.'],
  ['history', 'История игр', 'Отчёты: графики каната, сложные вопросы, лучшие ученики. Сохраняются в PDF.'],
  ['guide', 'Гайд', 'Подробные инструкции и примеры. Тур можно пройти заново в «Настройках».'],
  ['admin', 'Администратор', 'Код для регистрации учителей, ключ ИИ и список пользователей.'],
];

export function startTour() {
  if (!location.hash.match(/^#\/t\/?$/)) { go('#/t'); setTimeout(startTour, 500); return; }
  const steps = STEPS.filter(([nav]) => document.querySelector(`.side [data-nav="${nav}"]`) || matchMedia('(max-width: 980px)').matches)
    .filter(([nav]) => nav !== 'admin' || store.me.role === 'admin');
  let i = 0;
  const hole = h('div', { class: 'tour-hole' });
  const tip = h('div', { class: 'tour-tip', role: 'dialog' });
  const finish = () => {
    hole.remove(); tip.remove(); window.removeEventListener('resize', place); document.removeEventListener('keydown', onKey);
    if (!store.me.tour_done) api('/api/me', { method: 'PATCH', body: { tour_done: 1 } }).then((r) => { store.me = r.user; }).catch(() => {});
  };
  const onKey = (e) => { if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight') next(); };
  const next = () => { if (++i >= steps.length) { finish(); celebrate(); } else place(); };
  function place() {
    const [nav, title, text] = steps[i];
    const target = document.querySelector(`.side [data-nav="${nav}"]`);
    const r = target?.getBoundingClientRect();
    if (r?.width) Object.assign(hole.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`, opacity: 1 });
    else Object.assign(hole.style, { left: '50%', top: '40%', width: '0px', height: '0px' });
    fill(tip, 
      h('div', { class: 'small muted' }, `${i + 1} / ${steps.length}`), h('h3', null, t(title)), h('p', null, t(text)),
      h('div', { class: 'row between' }, h('button', { class: 'btn ghost sm', onClick: finish }, t('Пропустить')),
        h('div', { class: 'row' }, i ? h('button', { class: 'btn sm', onClick: () => { i--; place(); } }, t('Назад')) : null,
          h('button', { class: 'btn primary sm', onClick: next }, i === steps.length - 1 ? t('Готово') : t('Дальше')))));
    const tw = Math.min(340, innerWidth - 24);
    const left = r?.width && r.right + tw + 24 < innerWidth ? r.right + 18 : Math.max(12, (innerWidth - tw) / 2);
    const top = r?.width && r.right + tw + 24 < innerWidth ? Math.min(Math.max(12, r.top - 20), innerHeight - 260) : r?.width ? Math.min(r.bottom + 16, innerHeight - 260) : innerHeight / 3;
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
  }
  const celebrate = () => {
    const m = h('div', { class: 'tour-tip', style: { left: '50%', top: '30%', transform: 'translateX(-50%)' } },
      h('h3', null, `🎉 ${t('Готово!')}`), h('p', null, t('Совет: начните с библиотеки — запустите готовый шаблон и посмотрите, как играют ученики.')),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary sm', onClick: () => { m.remove(); go('#/t/library'); } }, t('Открыть библиотеку')),
        h('button', { class: 'btn sm', onClick: () => m.remove() }, t('Закрыть'))));
    document.body.append(m);
  };
  document.body.append(hole, tip);
  window.addEventListener('resize', place);
  document.addEventListener('keydown', onKey);
  place();
}

// ---------- страница гайда ----------
const TOPICS = [
  ['start', 'Быстрый старт'], ['create', 'Создание квиза'], ['formula', 'Формулы и оформление'], ['ai', 'ИИ бесплатно'],
  ['modes', 'Режимы игры'], ['students', 'Как подключаются ученики'], ['board', 'Канат на доске'], ['reports', 'Отчёты и PDF'], ['faq', 'Частые вопросы'],
];

const steps = (list) => h('div', { class: 'stack' }, list.map(([title, text], i) => h('div', { class: 'guide-step' },
  h('div', { class: 'n' }, i + 1), h('div', null, h('h3', null, t(title)), h('p', { class: 'muted' }, t(text))))));

function topic(key) {
  switch (key) {
    case 'start': return h('div', { class: 'stack' },
      steps([['Возьмите квиз', 'Из библиотеки (готовые шаблоны), создайте сам или попросите ИИ.'],
        ['Нажмите ▶ «Запустить»', 'Выберите режим: Арқан тартыс, команды по очереди, каждый сам за себя или канат на доске.'],
        ['Покажите экран на доске', 'Ученики заходят на сайт с телефона, вводят PIN или сканируют QR-код.'],
        ['Нажмите «Начать игру»', 'Дальше — пробел или кликер: следующий вопрос, итоги, финал с победителем.']]),
      h('div', { class: 'row' }, h('button', { class: 'btn yellow', onClick: startTour }, ic('help'), t('Пройти тур по меню')), h('a', { class: 'btn primary', href: '#/t/library' }, t('Открыть библиотеку'))));
    case 'create': return steps([
      ['Название, предмет и класс', 'Предметы — как в расписании лицея. Можно поделиться квизом с коллегами галочкой внизу.'],
      ['Тип вопроса', '«Выбор ответа» — 2–6 вариантов, нажмите на букву правильного. «Верно / неверно». «Число» — для примеров и игры на доске. «Свой ответ» — ученик пишет текст.'],
      ['Время и двойные очки', '⏱ — время на ответ, ⚡×2 — вопрос приносит двойные очки.'],
      ['Картинки и видео', 'Картинка — файл или ссылка, сайт сам сожмёт её. Видео — YouTube, Vimeo или файл до 50 МБ.'],
      ['Предпросмотр', 'Кнопка «Предпросмотр» — пройдите квиз как ученик с таймером, увидите все вопросы и общее время.']]);
    case 'formula': {
      const ta = h('textarea', { class: 'input', rows: 3, value: 'Найдите **корни** уравнения $x^2 - 5x + 6 = 0$\n- подсказка: теорема *Виета*\n- [справка](https://ru.wikipedia.org/wiki/Теорема_Виета)' });
      const prev = h('div', { class: 'preview-box rich', style: { fontSize: '1.15rem' } });
      const sync = () => { prev.innerHTML = rich(ta.value); };
      ta.addEventListener('input', sync);
      sync();
      return h('div', { class: 'stack' }, h('p', null, t('Попробуйте прямо здесь — пишите слева, справа сразу видно, как увидят ученики:')),
        h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' } }, ta, prev),
        h('table', { class: 'tbl' }, h('tbody', null, [['**текст**', 'жирный'], ['*текст*', 'курсив'], ['__текст__', 'подчёркнутый'], ['[текст](https://…)', 'ссылка, откроется в новой вкладке'],
          ['- пункт', 'список'], ['$\\frac{a}{b}$', 'дробь'], ['$x^{2}$, $x_{1}$', 'степень и индекс'], ['$\\sqrt{x}$', 'корень'], ['$$...$$', 'формула отдельной строкой']]
          .map(([code, what]) => h('tr', null, h('td', null, h('span', { class: 'code' }, code)), h('td', null, t(what)), h('td', { class: 'rich', html: code.includes('…') ? '' : rich(code.replace('текст', t('текст'))) }))))),
        h('p', { class: 'muted' }, t('В редакторе есть кнопка Σ — конструктор формул с готовыми кнопками: дроби, корни, греческие буквы, интегралы, матрицы.')),
        h('button', { class: 'btn', onClick: () => import('./editor.js').then((m) => m.formulaDialog((f) => { ta.value += ` ${f}`; sync(); })) }, ic('sigma'), t('Открыть конструктор формул')));
    }
    case 'ai': return h('div', { class: 'stack' },
      h('div', { class: 'card', style: { background: 'var(--g50)' } }, h('h3', null, `${t('Способ 1')}: ${t('через любой чат — без ключа, всегда бесплатно')}`),
        steps([['Заполните тему', 'Предмет, класс, тема, сколько вопросов и какие типы.'], ['Скопируйте промт', 'Кнопка «Скопировать промт» — в нём уже описан нужный формат.'],
          ['Вставьте в чат', 'ChatGPT, DeepSeek, Gemini, Qwen или Claude — любой бесплатный.'], ['Вставьте ответ обратно', 'Сайт сам распознает вопросы. Проверьте их и откройте в редакторе.']])),
      h('div', { class: 'card', style: { background: 'var(--y100)' } }, h('h3', null, `${t('Способ 2')}: ${t('одной кнопкой')}`),
        h('p', null, t('Администратор один раз вставляет бесплатный ключ Google Gemini или Groq в «Администратор → ИИ». После этого вопросы появляются по кнопке «Сгенерировать».'))),
      h('a', { class: 'btn primary', href: '#/t/ai' }, ic('spark'), t('Открыть ИИ-генератор')));
    case 'modes': {
      const tug = new Tug({ names: [t('Красные'), t('Синие')] });
      let pos = 0;
      const pullBtn = (team, label, cls) => h('button', { class: `btn ${cls}`, style: { color: '#fff' }, onClick: () => { pos += team === 'A' ? -20 : 20; tug.set(pos, team); if (Math.abs(pos) >= 100) { tug.win(team); setTimeout(() => { pos = 0; tug.reset(); }, 2500); } } }, t(label));
      return h('div', { class: 'stack' },
        h('div', { class: 'card stack' }, h('h3', null, t('Попробуйте: нажимайте — так тянут канат верные ответы')),
          h('div', { style: { borderRadius: '14px', overflow: 'hidden' } }, tug.el),
          h('div', { class: 'row', style: { justifyContent: 'center' } }, pullBtn('A', 'Рывок красных', 'bgA'), pullBtn('B', 'Рывок синих', 'bgB'))),
        h('div', { class: 'modes' }, [
          ['rope', 'Арқан тартыс', 'Две команды на телефонах. Каждый верный ответ тянет канат, быстрый — сильнее. Сила делится на размер команды, поэтому неравные команды честно соревнуются. Победа — когда лента дошла до линии или по итогам.'],
          ['swap', 'Команды по очереди', 'Нечётные вопросы — первой команде, чётные — второй. Очки команды = среднее очков её игроков, так что размер команды не важен.'],
          ['trophy', 'Каждый сам за себя', 'Весь класс отвечает на каждый вопрос. Очки: до 500 за правильность и до 500 за скорость, бонус за серию. Открытые ответы можно оценить самому: ✓, ½ или ✗.'],
          ['monitor', 'Канат на доске', 'Без телефонов. Два ученика у доски, у каждого свои вопросы и цифровая клавиатура. Ошибка — пауза 1,2 секунды.'],
        ].map(([ico, title, text]) => h('div', { class: 'mode-card' }, h('h3', null, h('span', { html: icon(ico), style: { display: 'contents' } }), t(title)), h('p', { class: 'muted' }, t(text))))));
    }
    case 'students': return steps([
      ['Открыть сайт', 'С любого телефона или планшета, без установки приложений. Адрес и QR-код показаны на доске.'],
      ['Ввести PIN', '6 цифр с доски. Если у ученика есть аккаунт — очки попадут в рейтинг лицея и его кабинет.'],
      ['Выбрать команду', 'Если вы разрешили выбор. Иначе сайт распределит поровну. Перевести ученика — нажмите на его имя в лобби.'],
      ['Отвечать', 'После ответа ученик видит, верно ли, сколько очков и своё место. Если связь пропала — он вернётся в игру с теми же очками.']]);
    case 'board': return steps([
      ['Откройте «Канат на доске»', 'Выберите уровень примеров (7, 8–9 или 10–11 класс), свой квиз или любую тему через ИИ.'],
      ['Назовите команды и время', 'Например «1-команда» и «2-команда», 90 секунд, перевес 8 ответов.'],
      ['Нажмите «Во весь экран» и «Старт»', 'Слева и справа у команд свои вопросы и клавиатуры. Верно — рывок каната, ошибка — пауза.'],
      ['Итоги сохранятся в историю', 'Сколько верных и ошибок у каждой команды и средняя скорость.']]);
    case 'reports': return steps([
      ['История игр', 'Все проведённые игры с победителями. Нажмите на игру — откроется отчёт.'],
      ['Что в отчёте', 'График каната, процент верных, самые сложные вопросы, топ-5, самые быстрые и точные ученики, вклад в команду, ответы каждого ученика.'],
      ['PDF', 'Кнопка «Скачать PDF» → в окне печати выберите «Сохранить как PDF». Казахские буквы и формулы сохранятся.']]);
    default: return h('div', { class: 'stack' }, [
      ['Сколько учеников может играть?', 'До 300 в одной игре. Для класса и даже актового зала хватает.'],
      ['Ученик закрыл вкладку или пропал интернет', 'Пусть снова откроет сайт и введёт тот же PIN — вернётся с теми же очками.'],
      ['Нужно ли ученикам регистрироваться?', 'Нет, можно играть по имени. Аккаунт нужен для рейтинга, уровней и наград.'],
      ['Как поменять язык?', 'Переключатель RU / ҚАЗ в шапке сайта. Язык вопросов выбирается в квизе.'],
      ['Ученик написал неприличное имя', 'Нажмите на имя в лобби → «Удалить из игры».'],
      ['Вопросы от ИИ с ошибками', 'ИИ может ошибаться. Всегда проверяйте вопросы перед игрой — они открываются в редакторе.'],
    ].map(([q, a]) => h('details', { class: 'card' }, h('summary', { style: { cursor: 'pointer', fontWeight: 800 } }, t(q)), h('p', { class: 'muted', style: { marginTop: '8px' } }, t(a)))));
  }
}

export function guide() {
  let current = 'start';
  const body = h('div');
  const nav = h('div', { class: 'guide-nav chips' });
  const draw = () => {
    fill(nav, ...TOPICS.map(([k, label]) => h('button', { class: `chip ${current === k ? 'on' : ''}`, onClick: () => { current = k; draw(); } }, t(label))));
    fill(body, h('div', { class: 'card pad-lg' }, h('h2', null, t(TOPICS.find(([k]) => k === current)[1])), topic(current)));
  };
  draw();
  return teacherPage('guide',
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('Гайд для учителя')), h('p', { class: 'muted', style: { margin: '6px 0 0' } }, t('Всё о TugQuiz за 5 минут. Примеры можно пробовать прямо здесь.'))),
      h('button', { class: 'btn yellow', onClick: startTour }, ic('help'), t('Тур по меню'))),
    nav, body);
}

