// Окно запуска игры: выбор режима и настроек, затем экран ведущего или канат на доске.
import { h, fill, api, go, modal, icon, toastErr } from '../core.js';
import { t } from '../i18n.js';
import { levelForGrade } from '../gen.js';

const MODES = [
  ['tug', 'rope', 'Арқан тартыс', 'Две команды на телефонах тянут канат'],
  ['duel', 'swap', 'Команды по очереди', 'Вопрос одной команде, потом другой'],
  ['solo', 'trophy', 'Каждый сам за себя', 'Личный рейтинг всего класса'],
  ['board', 'monitor', 'Канат на доске', 'Без телефонов, два ученика у доски'],
];
const BOARD_TYPES = ['choice', 'truefalse', 'number'];

const load = () => { try { return JSON.parse(localStorage.getItem('tq_launch')) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem('tq_launch', JSON.stringify(v)); } catch { /* не важно */ } };

export function launchDialog(quiz) {
  const st = { mode: 'tug', teamNames: [t('Красные'), t('Синие')], autoTeams: true, timeScale: 1, shuffle: false, limit: 0,
    showOnPhone: true, manualOpen: false, duration: 90, margin: 8, ...load() };
  const hasOpen = quiz.questions.some((q) => q.type === 'open');
  const boardCount = quiz.questions.filter((q) => BOARD_TYPES.includes(q.type)).length;
  const opts = h('div', { class: 'stack', style: { marginTop: '18px' } });
  const cards = h('div', { class: 'modes', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' } });

  const seg = (values, key, fmt = (v) => v) => h('div', { class: 'seg' }, values.map((v) =>
    h('button', { type: 'button', class: st[key] === v ? 'on' : '', onClick: () => { st[key] = v; draw(); } }, fmt(v))));
  const check = (key, label) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: Boolean(st[key]), onChange: (e) => { st[key] = e.target.checked; } }), t(label));
  const teamInputs = () => h('div', { class: 'row' }, [0, 1].map((i) => h('input', {
    class: 'input grow', maxLength: 20, value: st.teamNames[i], 'aria-label': i ? t('Правая команда') : t('Левая команда'),
    style: { borderColor: i ? 'var(--blue)' : 'var(--red)', flex: '1 1 160px', width: 'auto' }, onInput: (e) => { st.teamNames[i] = e.target.value; },
  })));
  const line = (label, control) => h('div', { class: 'row between' }, h('b', null, t(label)), control);
  const section = (title, ...c) => h('div', { class: 'stack' }, h('div', { class: 'small muted', style: { fontWeight: 800, textTransform: 'none' } }, t(title)), c);

  function draw() {
    fill(cards, MODES.map(([key, ico, title, text]) => h('button', {
      type: 'button', class: 'mode-card', onClick: () => { st.mode = key; draw(); },
      style: { textAlign: 'left', cursor: 'pointer', border: 0, padding: '14px', outline: st.mode === key ? '3px solid var(--g500)' : '1px solid var(--line)',
        background: st.mode === key ? 'var(--g50)' : '#fff', borderTop: 0 },
    }, h('h3', { style: { fontSize: '.95rem', margin: '0 0 4px' } }, h('span', { html: icon(ico), style: { display: 'contents' } }), t(title)),
    h('div', { class: 'muted small' }, t(text)))));
    const m = st.mode;
    const more = h('details', { open: st.more, onToggle: (e) => { st.more = e.target.open; } },
      h('summary', { style: { cursor: 'pointer', fontWeight: 800, color: 'var(--g700)' } }, t('Дополнительно')),
      h('div', { class: 'stack', style: { marginTop: '12px' } },
        line('Время на вопрос', seg([0.75, 1, 1.5, 2], 'timeScale', (v) => `×${v}`)),
        quiz.questions.length > 5 ? line('Сколько вопросов', seg([0, 5, 10, 15, 20].filter((n) => n < quiz.questions.length), 'limit', (v) => (v || t('все')))) : null,
        check('shuffle', 'Перемешать вопросы'),
        check('showOnPhone', 'Показывать вопрос на телефонах'),
        hasOpen ? check('manualOpen', 'Открытые ответы оцениваю сам') : null));
    fill(opts,
      m !== 'solo' ? section('Команды', teamInputs(),
        m === 'board' ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !st.autoTeams, onChange: (e) => { st.autoTeams = !e.target.checked; } }), t('Ученики сами выбирают команду'))) : null,
      m === 'board'
        ? section('Игра', line('Время', seg([60, 90, 120, 180], 'duration', (v) => `${v} ${t('с')}`)),
          line('Победа при перевесе', seg([5, 8, 10, 15], 'margin', (v) => `${v}`)),
          boardCount ? null : h('p', { class: 'small muted' }, t('В квизе нет подходящих вопросов — будут примеры по уровню класса.')))
        : more);
  }
  draw();

  modal({
    title: `${t('Запуск')}: ${quiz.title}`, wide: true,
    body: h('div', null, cards, opts),
    actions: [{ label: t('Отмена'), kind: 'ghost' }, {
      label: t('Начать'), kind: 'primary', onClick: async () => {
        save(st);
        const teamNames = st.teamNames.map((n, i) => n.trim() || (i ? t('Синие') : t('Красные')));
        if (st.mode === 'board') {
          const questions = quiz.questions.filter((q) => BOARD_TYPES.includes(q.type));
          sessionStorage.setItem('tq_board', JSON.stringify({ quizId: quiz.id, title: quiz.title, subject: quiz.subject, teamNames, duration: st.duration, margin: st.margin,
            ...(questions.length ? { questions } : { gen: { level: levelForGrade(quiz.grade) } }) }));
          return go('#/board');
        }
        try {
          const { id } = await api('/api/games', { method: 'POST', body: { quizId: quiz.id, mode: st.mode, opts: { ...st, teamNames } } });
          go(`#/host/${id}`);
        } catch (e) { toastErr(e); return false; }
      },
    }],
  });
}

export async function launchById(id) {
  try { launchDialog(await api(`/api/quizzes/${id}`)); } catch (e) { toastErr(e); }
}
