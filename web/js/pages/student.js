// Кабинет ученика: уровень, награды, история игр и рейтинг класса/лицея.
import { h, fill, api, store, subjChip, fmtDate, pct, toast, toastErr } from '../core.js';
import { t } from '../i18n.js';
import { page } from '../app.js';
import { pinForm } from './home.js';
import { MODE_NAMES } from './teacher.js';

const level = (xp) => Math.floor(Math.sqrt(xp / 50)) + 1;
const levelXp = (lvl) => 50 * (lvl - 1) ** 2;

export async function cabinet() {
  if (store.me.role !== 'student') { location.hash = '#/t'; return h('div'); }
  const [stats, school, mine] = await Promise.all([api('/api/student/stats'), api('/api/leaderboard'), api(`/api/leaderboard?class=${encodeURIComponent(store.me.class_name)}`)]);
  const g = stats.games;
  const lvl = level(stats.xp);
  const progress = pct(stats.xp - levelXp(lvl), levelXp(lvl + 1) - levelXp(lvl));
  const wins = g.filter((x) => x.won).length;
  const accuracy = pct(g.reduce((s, x) => s + x.correct, 0), g.reduce((s, x) => s + x.total, 0));
  const badges = [
    ['🎮', 'Первая игра', g.length >= 1], ['🏆', 'Первая победа', wins >= 1], ['⚡', 'Молния', g.some((x) => x.avg_time && x.avg_time < 3 && x.correct > 0)],
    ['🎯', 'Снайпер', g.some((x) => x.total >= 5 && x.correct === x.total)], ['🔥', 'Серия 5', g.some((x) => x.best_streak >= 5)],
    ['🥇', 'Чемпион', g.some((x) => x.place === 1)], ['📚', '20 игр', g.length >= 20], ['🧠', 'Знаток', stats.xp >= 5000],
  ];
  const stat = (v, label) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, t(label)));
  const lb = h('div');
  const drawLb = (list) => fill(lb, ...(list.length ? list.map((u, i) => h('div', { class: 'list-row', style: { background: u.name === store.me.name && u.class_name === store.me.class_name ? 'var(--y100)' : '' } },
    h('b', { style: { width: '30px', color: 'var(--g600)', fontFamily: 'var(--display)' } }, i + 1), h('span', { class: 'grow' }, u.name), h('span', { class: 'chip' }, u.class_name), h('b', null, `${u.xp} XP`)))
    : [h('p', { class: 'muted' }, t('Пока никого'))]));
  drawLb(mine);
  const lbTabs = h('div', { class: 'seg' }, [[mine, `${t('Мой класс')} ${store.me.class_name}`], [school, t('Весь лицей')]].map(([list, label], i) =>
    h('button', { class: i ? '' : 'on', onClick: (e) => { lbTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawLb(list); } }, label)));
  const cls = h('select', { class: 'input', style: { width: 'auto', color: 'var(--ink)', padding: '4px 10px' }, onChange: async (e) => {
    try { store.me = (await api('/api/me', { method: 'PATCH', body: { class_name: e.target.value } })).user; toast(t('Сохранено')); } catch (err) { toastErr(err); }
  } }, store.meta.classes.map((c) => h('option', { value: c, selected: c === store.me.class_name }, c)));

  return page(h('div', { class: 'wrap stack' },
    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' } },
      h('div', { class: 'card pad-lg stack', style: { background: 'linear-gradient(135deg, var(--g700), var(--g950))', color: '#fff' } },
        h('div', { class: 'row between' }, h('div', null, h('h1', { style: { margin: 0 } }, store.me.name), h('div', { style: { color: '#cfe6d6' } }, `${t('Класс')}: `, cls)),
          h('div', { style: { textAlign: 'center' } }, h('div', { style: { fontFamily: 'var(--display)', fontSize: '2.6rem', color: 'var(--y)' } }, lvl), h('div', { class: 'small' }, t('уровень')))),
        h('div', null, h('div', { class: 'lvl' }, h('i', { style: { width: `${progress}%` } })), h('div', { class: 'small', style: { marginTop: '4px', color: '#cfe6d6' } },
          `${stats.xp} XP · ${t('до уровня')} ${lvl + 1}: ${levelXp(lvl + 1) - stats.xp} XP`)),
        h('div', { class: 'row', style: { gap: '30px' } }, [[`#${stats.rank}`, 'в лицее'], [g.length, 'игр'], [wins, 'побед'], [`${accuracy}%`, 'точность']].map(([v, l]) =>
          h('div', { class: 'stat' }, h('b', { style: { color: '#fff' } }, v), h('span', { style: { color: '#cfe6d6' } }, t(l)))))),
      h('div', { class: 'card stack' }, h('h3', null, t('Войти в игру')), pinForm(true))),
    h('div', { class: 'card' }, h('h3', null, t('Награды')), h('div', { class: 'row', style: { gap: '8px' } },
      badges.map(([e, label, on]) => h('div', { class: `badge-big ${on ? '' : 'off'}` }, h('i', null, e), t(label))))),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' } },
      h('div', { class: 'card stack' }, h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, t('Рейтинг')), lbTabs), lb),
      h('div', { class: 'card' }, h('h3', null, t('Мои игры')), g.length ? g.slice(0, 30).map((x) => h('div', { class: 'list-row' },
        h('div', { class: 'grow' }, h('b', null, x.title), h('div', { class: 'row small muted', style: { gap: '6px' } }, subjChip(x.subject), `${t(MODE_NAMES[x.mode])} · ${fmtDate(x.finished)}`)),
        h('div', { style: { textAlign: 'right' } }, h('b', null, x.score), h('div', { class: 'small muted' }, `${x.won ? '🏆 ' : ''}#${x.place} · ${x.correct}/${x.total}`))))
        : h('p', { class: 'muted' }, t('Сыграйте первую игру — введите PIN с доски.'))))));
}
