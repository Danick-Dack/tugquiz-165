// Кабинет учителя: главная, мои квизы, библиотека, история, настройки, администратор.
import { h, fill, api, store, go, icon, ic, subj, subjChip, fmtDate, toast, toastErr, ask, modal, copyText, sound } from '../core.js';
import { t, lang, setLang } from '../i18n.js';
import { teacherPage, render } from '../app.js';
import { launchDialog, launchById } from './launch.js';
import { emailCard } from './auth.js';

export const MODE_NAMES = { tug: 'Арқан тартыс', duel: 'Команды по очереди', solo: 'Каждый сам за себя', board: 'Канат на доске' };
export const AI_PRESETS = {
  gemini: { name: 'Google Gemini — бесплатно', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  groq: { name: 'Groq — бесплатно', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  openrouter: { name: 'OpenRouter — бесплатные модели', base: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat-v3.1:free', keyUrl: 'https://openrouter.ai/keys' },
  deepseek: { name: 'DeepSeek — платно, очень дёшево', base: 'https://api.deepseek.com', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  custom: { name: 'Другой (OpenAI-совместимый)', base: '', model: '', keyUrl: '' },
};

const head = (title, ...actions) => h('div', { class: 'page-head' }, h('h1', null, title), h('div', { class: 'row' }, actions));
const btnIco = (ico, label, props = {}) => h(props.href ? 'a' : 'button', { class: `btn ${props.kind || ''} ${props.sm ? 'sm' : ''}`, ...props }, ic(ico), label);
const loading = () => h('div', { class: 'spinner' });
const emptyBox = (ico, text, ...actions) => h('div', { class: 'card empty' }, h('div', { html: icon(ico) }), h('p', null, text), h('div', { class: 'row', style: { justifyContent: 'center' } }, actions));

// ---------- карточка квиза ----------
function quizCard(q, { mine, onChange }) {
  const s = subj(q.subject);
  const del = async () => {
    if (!(await ask(t('Удалить квиз «{name}»?', { name: q.title }), { ok: t('Удалить'), danger: true }))) return;
    try { await api(`/api/quizzes/${q.id}`, { method: 'DELETE' }); toast(t('Удалено')); onChange(); } catch (e) { toastErr(e); }
  };
  const copy = async () => {
    try { const { id } = await api(`/api/quizzes/${q.id}/copy`, { method: 'POST' }); toast(t('Копия создана')); go(`#/t/edit/${id}`); } catch (e) { toastErr(e); }
  };
  const preview = async () => {
    const [{ previewQuiz }, full] = await Promise.all([import('./editor.js'), api(`/api/quizzes/${q.id}`)]);
    previewQuiz(full);
  };
  return h('div', { class: 'card qcard' },
    h('div', { class: 'row', style: { gap: '6px' } }, subjChip(q.subject), q.grade ? h('span', { class: 'chip' }, `${q.grade} ${t('класс')}`) : null,
      q.template ? h('span', { class: 'chip' }, t('шаблон')) : null,
      mine && q.shared ? h('span', { class: 'chip', title: t('Видят все учителя') }, ic('globe', { style: { width: '14px' } }), t('общий')) : null),
    h('h3', null, q.title),
    q.description ? h('div', { class: 'small muted' }, q.description) : null,
    h('div', { class: 'meta' }, h('span', null, `${q.count} ${t('вопр.')}`), h('span', null, `▶ ${q.plays}`), !mine && q.owner ? h('span', null, q.owner) : null,
      mine ? h('span', null, fmtDate(q.updated, false)) : null),
    h('div', { class: 'acts' },
      h('button', { class: 'btn primary sm grow', onClick: () => launchById(q.id) }, ic('play'), t('Запустить')),
      mine ? h('a', { class: 'btn sm icon', href: `#/t/edit/${q.id}`, title: t('Изменить'), html: icon('edit') })
        : h('button', { class: 'btn sm icon', title: t('Предпросмотр'), html: icon('eye'), onClick: preview }),
      h('button', { class: 'btn sm icon', title: mine ? t('Копировать') : t('Копировать себе'), html: icon('copy'), onClick: copy }),
      mine || store.me.role === 'admin' ? h('button', { class: 'btn sm icon danger', title: t('Удалить'), html: icon('trash'), onClick: del }) : null));
}

function filteredGrid(list, opts) {
  const st = { q: '', subject: '' };
  const grid = h('div', { class: 'grid' });
  const subjects = [...new Set(list.map((q) => q.subject))];
  const chips = h('div', { class: 'chips' });
  const draw = () => {
    const needle = st.q.toLowerCase();
    const items = list.filter((q) => (!st.subject || q.subject === st.subject) && (!needle || `${q.title} ${q.description}`.toLowerCase().includes(needle)));
    fill(grid, ...(items.length ? items.map((q) => quizCard(q, opts)) : [h('p', { class: 'muted' }, t('Ничего не найдено'))]));
    fill(chips, h('button', { class: `chip ${st.subject ? '' : 'on'}`, onClick: () => { st.subject = ''; draw(); } }, t('Все')),
      ...subjects.map((k) => { const s = subj(k); return h('button', { class: `chip ${st.subject === k ? 'on' : ''}`, onClick: () => { st.subject = k; draw(); } }, h('i', { class: 'dot', style: { background: s.color } }), s.name); }));
  };
  draw();
  return h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('div', { style: { position: 'relative', flex: '1', minWidth: '220px', maxWidth: '360px' } },
      h('input', { class: 'input', placeholder: t('Поиск по названию'), onInput: (e) => { st.q = e.target.value; draw(); }, style: { paddingLeft: '40px' } }),
      h('span', { html: icon('search'), style: { position: 'absolute', left: '12px', top: '12px', width: '20px', color: 'var(--muted)' } }))),
    subjects.length > 1 ? chips : null, grid);
}

// ---------- главная ----------
export async function dashboard() {
  const [quizzes, games, live] = await Promise.all([api('/api/quizzes'), api('/api/games'), api('/api/games/live')]);
  const me = store.me;
  const quick = (cls, ico, title, text, href) => h('button', { class: cls, onClick: () => go(href), 'data-tour': cls },
    h('span', { html: icon(ico), style: { display: 'contents' } }), h('b', null, t(title)), h('span', null, t(text)));
  const reached = games.reduce((s, g) => s + (g.mode === 'board' ? 0 : g.players), 0);
  const node = teacherPage('',
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('Главная')),
      h('div', { class: 'muted' }, `${me.name} · ${fmtDate(Date.now(), false)}`))),
    live.length ? h('div', { class: 'card', style: { marginBottom: '16px' } }, live.map((g) => h('div', { class: 'row between' },
      h('div', { class: 'row', style: { gap: '12px' } }, h('span', { class: 'ribbon' }), h('div', null, h('b', null, `${t('Идёт игра')}: ${g.title}`), h('div', { class: 'small muted' }, `PIN ${g.pin} · ${g.players} ${t('игроков')}`))),
      h('a', { class: 'btn primary sm', href: `#/host/${g.id}` }, t('Вернуться к игре'))))) : null,
    !me.tour_done ? h('div', { class: 'card row between', style: { marginBottom: '16px' } },
      h('div', null, h('b', null, t('Впервые здесь?')), h('div', { class: 'muted small' }, t('Короткий тур покажет всё меню за минуту.'))),
      h('button', { class: 'btn sm', onClick: () => import('./guide.js').then((m) => m.startTour()) }, t('Начать тур'))) : null,
    h('div', { class: 'quick' },
      quick('q1', 'plus', 'Создать квиз', 'Свои вопросы, формулы, картинки', '#/t/edit/new'),
      quick('q2', 'msg', 'ИИ-генератор', 'Вопросы по теме за минуту', '#/t/ai'),
      quick('q5', 'spark', 'Набор тестов по теме', 'ИИ составит 3–5 тестов от простого к сложному', '#/t/ai?pack'),
      quick('q3', 'rope', 'Канат на доске', 'Арқан тартыс без телефонов', '#/t/board'),
      quick('q4', 'book', 'Библиотека', 'Шаблоны и квизы коллег', '#/t/library')),
    !games.length ? h('div', { style: { height: '18px' } }) : h('div', { class: 'card row', style: { margin: '16px 0', gap: '40px' } },
      h('div', { class: 'stat' }, h('b', null, quizzes.length), h('span', null, t('квизов'))),
      h('div', { class: 'stat' }, h('b', null, games.length), h('span', null, t('игр проведено'))),
      h('div', { class: 'stat' }, h('b', null, reached), h('span', null, t('участий учеников')))),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' } },
      h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, t('Мои квизы')), h('a', { href: '#/t/quizzes', class: 'small' }, t('все →'))),
        quizzes.length ? quizzes.slice(0, 5).map((q) => h('div', { class: 'list-row' },
          h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: subj(q.subject).color, flex: 'none' } }),
          h('a', { href: `#/t/edit/${q.id}`, class: 'grow', style: { color: 'inherit', fontWeight: 500, textDecoration: 'none' } }, q.title),
          h('span', { class: 'small muted' }, `${q.count}`),
          h('button', { class: 'btn primary sm icon', title: t('Запустить'), html: icon('play'), onClick: () => launchById(q.id) })))
          : h('p', { class: 'muted' }, t('Пока пусто. Создайте первый квиз или возьмите шаблон из библиотеки.'))),
      h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, t('Последние игры')), h('a', { href: '#/t/history', class: 'small' }, t('все →'))),
        games.length ? games.slice(0, 5).map(gameRow) : h('p', { class: 'muted' }, t('Здесь появятся результаты игр.')))));
  return node;
}

const winnerText = (g) => {
  if (!g.winner) return '';
  if (g.winner === 'draw') return t('ничья');
  return `${t('победа')}: ${g.teams?.[g.winner]?.name || g.winner}`;
};
const gameRow = (g) => h('a', { class: 'list-row', href: `#/t/report/${g.id}`, style: { color: 'inherit', textDecoration: 'none' } },
  h('span', { html: icon(g.mode === 'board' ? 'monitor' : g.mode === 'solo' ? 'trophy' : g.mode === 'duel' ? 'swap' : 'rope'), style: { width: '22px', color: 'var(--muted)', flex: 'none' } }),
  h('div', { class: 'grow' }, h('b', null, g.title), h('div', { class: 'small muted' }, `${fmtDate(g.finished)} · ${t(MODE_NAMES[g.mode])}${g.mode !== 'board' ? ` · ${g.players} ${t('игроков')}` : ''}`)),
  h('span', { class: 'small', style: { fontWeight: 500 } }, winnerText(g)));

// ---------- мои квизы и библиотека ----------
export async function quizzes() {
  const list = await api('/api/quizzes');
  const node = teacherPage('quizzes',
    head(t('Мои квизы'), btnIco('spark', t('С помощью ИИ'), { href: '#/t/ai' }), btnIco('plus', t('Создать квиз'), { href: '#/t/edit/new', kind: 'primary' })),
    list.length ? filteredGrid(list, { mine: true, onChange: render })
      : emptyBox('grid', t('У вас пока нет квизов.'), btnIco('plus', t('Создать квиз'), { href: '#/t/edit/new', kind: 'primary' }),
        btnIco('spark', t('Сгенерировать с ИИ'), { href: '#/t/ai' }), btnIco('book', t('Взять шаблон'), { href: '#/t/library' })));
  return node;
}

export async function library() {
  const list = await api('/api/quizzes?scope=library');
  return teacherPage('library',
    head(t('Библиотека')),
    h('p', { class: 'muted', style: { marginTop: '-10px' } }, t('Готовые шаблоны и квизы, которыми поделились коллеги. Скопируйте себе, чтобы изменить.')),
    filteredGrid(list, { mine: false, onChange: render }));
}

// ---------- история ----------
export async function history() {
  const list = await api('/api/games');
  const st = { q: '', mode: '' };
  const box = h('div', { class: 'card' });
  const draw = () => {
    const items = list.filter((g) => (!st.mode || g.mode === st.mode) && (!st.q || g.title.toLowerCase().includes(st.q.toLowerCase())));
    fill(box, ...(items.length ? items.map(gameRow) : [h('p', { class: 'muted' }, t('Игр не найдено'))]));
  };
  draw();
  const modeSeg = h('div', { class: 'seg' }, [['', 'Все'], ...Object.entries(MODE_NAMES)].map(([k, label]) => h('button', {
    class: k === '' ? 'on' : '', onClick: (e) => { st.mode = k; modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); draw(); },
  }, t(label))));
  return teacherPage('history', head(t('История игр')),
    list.length ? h('div', { class: 'stack' }, h('div', { class: 'row' },
      h('input', { class: 'input', style: { maxWidth: '320px' }, placeholder: t('Поиск по названию'), onInput: (e) => { st.q = e.target.value; draw(); } }), modeSeg), box)
      : emptyBox('chart', t('Проведите первую игру — здесь появятся отчёты с графиками.'), btnIco('grid', t('К моим квизам'), { href: '#/t/quizzes', kind: 'primary' })));
}

// ---------- настройки ----------
export function settings() {
  const me = store.me;
  const name = h('input', { class: 'input', value: me.name });
  const oldPw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const newPw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minLength: 8, maxLength: 128 });
  const saveName = async () => {
    try { store.me = (await api('/api/me', { method: 'PATCH', body: { name: name.value } })).user; toast(t('Сохранено')); render(); } catch (e) { toastErr(e); }
  };
  const savePw = async () => {
    try { await api('/api/me', { method: 'PATCH', body: { oldPassword: oldPw.value, password: newPw.value } }); toast(t('Пароль изменён')); oldPw.value = newPw.value = ''; } catch (e) { toastErr(e); }
  };
  const field = (label, input) => h('label', { class: 'field' }, h('span', null, t(label)), input);
  return teacherPage('settings', head(t('Настройки')),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' } },
      h('div', { class: 'card stack' }, h('h3', null, t('Профиль')), h('div', { class: 'muted small' }, `${t('Логин')}: ${me.login}`),
        field('Имя', name), h('button', { class: 'btn primary', onClick: saveName }, t('Сохранить'))),
      h('div', { class: 'card stack' }, h('h3', null, t('Смена пароля')), field('Старый пароль', oldPw), field('Новый пароль', newPw),
        h('button', { class: 'btn', onClick: savePw }, t('Изменить пароль'))),
      emailCard(),
      h('div', { class: 'card stack' }, h('h3', null, t('Интерфейс')),
        h('div', { class: 'row between' }, h('b', null, t('Язык')), h('div', { class: 'seg' },
          ['ru', 'kk'].map((l) => h('button', { class: lang() === l ? 'on' : '', onClick: () => { setLang(l); render(); } }, l === 'ru' ? 'Русский' : 'Қазақша')))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: sound.on, onChange: (e) => { sound.on = e.target.checked; if (sound.on) sound.good(); } }), t('Звуки в игре')),
        h('button', { class: 'btn', onClick: () => import('./guide.js').then((m) => m.startTour()) }, ic('help'), t('Пройти тур заново')))));
}

// ---------- администратор ----------
export async function admin() {
  const [conf, users] = await Promise.all([api('/api/admin/settings'), api('/api/admin/users')]);
  const invite = h('input', { class: 'input', value: conf.invite_code, style: { fontFamily: 'var(--display)' } });
  const ai = { provider: conf.ai.provider || 'gemini', base: conf.ai.base || AI_PRESETS.gemini.base, model: conf.ai.model || AI_PRESETS.gemini.model };
  const base = h('input', { class: 'input', value: ai.base });
  const model = h('input', { class: 'input', value: ai.model });
  const key = h('input', { class: 'input', type: 'password', placeholder: conf.ai.hasKey ? `${t('сохранён')}: ${conf.ai.key}` : t('вставьте ключ'), autocomplete: 'off' });
  const keyLink = h('a', { target: '_blank', rel: 'noopener' });
  const setPreset = (p) => {
    ai.provider = p;
    const pr = AI_PRESETS[p];
    if (pr.base) { base.value = pr.base; model.value = pr.model; }
    keyLink.href = pr.keyUrl || '#';
    keyLink.textContent = pr.keyUrl ? t('Получить ключ →') : '';
  };
  const provider = h('select', { class: 'input', onChange: (e) => setPreset(e.target.value) },
    Object.entries(AI_PRESETS).map(([k, p]) => h('option', { value: k, selected: k === ai.provider }, t(p.name))));
  setPreset(ai.provider);
  if (conf.ai.base) { base.value = conf.ai.base; model.value = conf.ai.model; }

  const saveAi = async () => {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { ai: { provider: ai.provider, base: base.value, model: model.value, ...(key.value ? { key: key.value } : {}) } } });
      toast(t('Настройки ИИ сохранены'));
      render();
    } catch (e) { toastErr(e); }
  };
  const field = (label, input, extra) => h('label', { class: 'field' }, h('span', null, t(label), extra ? [' ', extra] : null), input);

  const userRow = (u) => h('tr', null,
    h('td', null, h('b', null, u.name), h('div', { class: 'small muted' }, u.login, u.email ? ` · ${u.email}` : '')),
    h('td', null, h('span', { class: 'chip' }, t({ admin: 'админ', teacher: 'учитель', student: 'ученик' }[u.role])), u.class_name ? ` ${u.class_name}` : ''),
    h('td', { class: 'small' }, u.role === 'student' ? `${u.xp} XP` : `${u.quizzes} ${t('квизов')} · ${u.games} ${t('игр')}`),
    h('td', null, u.active ? '' : h('span', { class: 'chip', style: { background: 'var(--bad-s)', color: 'var(--bad)' } }, t('отключён'))),
    h('td', null, u.id === store.me.id ? null : h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } },
      h('button', { class: 'btn sm', title: t('Сбросить пароль'), html: icon('key'), onClick: () => resetPw(u) }),
      h('button', { class: 'btn sm', onClick: () => patchUser(u, { active: !u.active }) }, u.active ? t('Отключить') : t('Включить')),
      u.role !== 'admin' ? h('select', { class: 'input', style: { padding: '4px 8px', width: 'auto' }, onChange: (e) => patchUser(u, { role: e.target.value }) },
        ['student', 'teacher', 'admin'].map((r) => h('option', { value: r, selected: r === u.role }, t({ admin: 'админ', teacher: 'учитель', student: 'ученик' }[r])))) : null)));
  const patchUser = async (u, body) => { try { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body }); toast(t('Сохранено')); render(); } catch (e) { toastErr(e); } };
  const resetPw = (u) => {
    const pw = h('input', { class: 'input', value: [...crypto.getRandomValues(new Uint8Array(10))].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('') });
    modal({ title: `${t('Новый пароль')}: ${u.name}`, body: h('div', { class: 'stack' }, pw, h('p', { class: 'small muted' }, t('Передайте пароль лично. Все входы пользователя будут сброшены.'))),
      actions: [{ label: t('Отмена'), kind: 'ghost' }, { label: t('Сохранить'), kind: 'primary', onClick: async () => { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { password: pw.value } }); await copyText(pw.value); } }] });
  };
  const roles = ['teacher', 'admin'];
  return teacherPage('admin', head(t('Администратор')),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' } },
      h('div', { class: 'card stack', 'data-tour': 'invite' }, h('h3', null, t('Код для учителей')),
        h('p', { class: 'small muted' }, t('Учитель вводит этот код при регистрации. Смените его, если код попал к ученикам.')),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, invite), h('button', { class: 'btn icon', html: icon('copy'), title: t('Копировать'), onClick: () => copyText(invite.value) })),
        h('button', { class: 'btn primary', onClick: async () => { try { await api('/api/admin/settings', { method: 'PUT', body: { invite_code: invite.value } }); toast(t('Сохранено')); } catch (e) { toastErr(e); } } }, t('Сохранить код'))),
      h('div', { class: 'card stack' }, h('h3', null, t('ИИ для генерации вопросов')),
        h('p', { class: 'small muted' }, conf.ai.hasKey ? t('ИИ подключён. Учителя могут генерировать вопросы одной кнопкой.')
          : t('Сейчас работает бесплатный ИИ без ключа: он медленнее, проще и не читает фото. С бесплатным ключом Gemini или Groq вопросы точнее и быстрее.')),
        field('Сервис', provider), field('Ключ API', key, keyLink),
        h('details', null, h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, t('Адрес и модель (для опытных)')),
          h('div', { class: 'stack', style: { marginTop: '10px' } }, field('Адрес API', base), field('Модель', model))),
        h('button', { class: 'btn primary', onClick: saveAi }, t('Сохранить настройки ИИ'))),
      mailSettings(conf.mail)),
    h('h2', { style: { marginTop: '28px' } }, t('Пользователи')),
    ['teachers', 'students'].map((group) => {
      const list = users.filter((u) => (group === 'teachers') === roles.includes(u.role));
      return h('div', { class: 'card', style: { marginBottom: '16px' } }, h('h3', null, `${group === 'teachers' ? t('Учителя') : t('Ученики')} · ${list.length}`),
        list.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('tbody', null, list.map(userRow)))) : h('p', { class: 'muted' }, t('Пока никого')));
    }));
}

// Почта, с которой сайт отправляет ссылки для нового пароля. Проще всего — Gmail с паролем приложения.
function mailSettings(m) {
  const host = h('input', { class: 'input', value: m.host || 'smtp.gmail.com' });
  const port = h('input', { class: 'input', inputmode: 'numeric', value: m.port || 465 });
  const user = h('input', { class: 'input', type: 'email', value: m.user || '', placeholder: 'tugquiz.school@gmail.com' });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: m.hasPass ? t('сохранён') : 'abcd efgh ijkl mnop' });
  const field = (label, input) => h('label', { class: 'field' }, h('span', null, t(label)), input);
  const save = async () => {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { mail: { host: host.value, port: port.value, user: user.value, ...(pass.value ? { pass: pass.value } : {}) } } });
      toast(t('Сохранено'));
      render();
    } catch (e) { toastErr(e); }
  };
  const test = async () => {
    try { const r = await api('/api/admin/mail-test', { method: 'POST' }); toast(`${t('Письмо отправлено')}: ${r.to}`); } catch (e) { toastErr(e); }
  };
  return h('div', { class: 'card stack' }, h('h3', null, t('Почта для восстановления паролей')),
    h('p', { class: 'small muted' }, m.ready ? t('Почта подключена: по кнопке «Забыли пароль?» придёт письмо со ссылкой.')
      : t('Создайте Gmail для школы, включите двухэтапную проверку и получите «Пароль приложения» (16 букв). Его и адрес вставьте сюда.')),
    m.ready ? null : h('a', { class: 'small', href: 'https://myaccount.google.com/apppasswords', target: '_blank', rel: 'noopener' }, t('Получить пароль приложения Google →')),
    field('Адрес почты', user), field('Пароль приложения', pass),
    h('details', null, h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, t('Сервер и порт (для опытных)')),
      h('div', { class: 'stack', style: { marginTop: '10px' } }, field('Сервер', host), field('Порт', port))),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onClick: save }, t('Сохранить почту')), m.ready ? h('button', { class: 'btn', onClick: test }, t('Отправить проверочное письмо')) : null));
}
