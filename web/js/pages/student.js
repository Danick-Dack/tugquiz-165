// Кабинет ученика: уровень, награды, история игр и рейтинг класса/лицея.
import { h, fill, api, store, subjChip, fmtDate, pct, toast, toastErr, icon, classPicker } from '../core.js';
import { t } from '../i18n.js';
import { page } from '../app.js';
import { pinForm } from './home.js';
import { emailCard } from './auth.js';
import { MODE_NAMES } from './teacher.js';

// Каждая награда своего цвета: серые, пока не получены.
const BADGE_COLORS = ['#138a49', '#c98a00', '#0a7f99', '#d83c41', '#e2620f', '#7d4bb7', '#3657c9', '#946b10'];
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
    ['play', 'Первая игра', g.length >= 1], ['trophy', 'Первая победа', wins >= 1], ['zap', 'Молния', g.some((x) => x.avg_time && x.avg_time < 3 && x.correct > 0)],
    ['target', 'Снайпер', g.some((x) => x.total >= 5 && x.correct === x.total)], ['flame', 'Серия 5', g.some((x) => x.best_streak >= 5)],
    ['medal', 'Чемпион', g.some((x) => x.place === 1)], ['book', '20 игр', g.length >= 20], ['chart', 'Знаток', stats.xp >= 5000],
  ];
  const stat = (v, label) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, t(label)));
  const lb = h('div');
  const drawLb = (list) => fill(lb, ...(list.length ? list.map((u, i) => h('div', { class: 'list-row', style: { background: u.name === store.me.name && u.class_name === store.me.class_name ? 'var(--raised)' : '' } },
    h('b', { style: { width: '32px', color: 'var(--muted)', fontWeight: 500 } }, i + 1), h('span', { class: 'grow' }, u.name), h('span', { class: 'chip' }, u.class_name), h('b', null, `${u.xp} XP`)))
    : [h('p', { class: 'muted' }, t('Пока никого'))]));
  drawLb(mine);
  const lbTabs = h('div', { class: 'seg' }, [[mine, `${t('Мой класс')} ${store.me.class_name}`], [school, t('Вся школа')]].map(([list, label], i) =>
    h('button', { class: i ? '' : 'on', onClick: (e) => { lbTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawLb(list); } }, label)));
  const cls = classPicker(store.me.class_name, async (v) => {
    try { store.me = (await api('/api/me', { method: 'PATCH', body: { class_name: v } })).user; toast(t('Сохранено')); } catch (err) { toastErr(err); }
  }, { width: 'auto', color: 'var(--ink)', padding: '4px 10px', minHeight: '32px' });

  return page(h('div', { class: 'wrap stack' },
    h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' } },
      h('div', { class: 'card dark pad-lg stack' },
        h('div', { class: 'row between' }, h('div', null, h('h1', { style: { margin: 0 } }, store.me.name), h('div', { style: { color: 'var(--d-sub)' } }, `${t('Класс')}: `, cls)),
          h('div', { class: 'lvl-medal' }, h('div', null, h('b', null, lvl), h('span', null, t('уровень'))))),
        h('div', null, h('div', { class: 'lvl' }, h('i', { style: { width: `${progress}%` } })), h('div', { class: 'small', style: { marginTop: '8px', color: 'var(--d-sub)' } },
          `${stats.xp} XP · ${t('до уровня')} ${lvl + 1}: ${levelXp(lvl + 1) - stats.xp} XP`)),
        h('div', { class: 'row', style: { gap: '30px' } }, [[`#${stats.rank}`, 'в лицее'], [g.length, 'игр'], [wins, 'побед'], [`${accuracy}%`, 'точность']].map(([v, l]) =>
          h('div', { class: 'stat' }, h('b', null, v), h('span', null, t(l)))))),
      h('div', { class: 'stack', style: { marginTop: 0 } }, h('div', { class: 'card stack' }, h('h3', null, t('Войти в игру')), pinForm(true)), store.me.email ? null : emailCard())),
    h('div', { class: 'card stack' }, h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, t('Награды')), h('span', { class: 'small muted' }, `${badges.filter((b) => b[2]).length} / ${badges.length}`)),
      h('div', { class: 'badges' }, badges.map(([ico, label, on], i) => h('div', { class: `badge-big ${on ? '' : 'off'}`, style: `--bc: ${BADGE_COLORS[i]}` }, h('i', { html: icon(ico) }), t(label))))),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' } },
      h('div', { class: 'card stack' }, h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, t('Рейтинг')), lbTabs), lb),
      h('div', { class: 'card' }, h('h3', null, t('Мои игры')), g.length ? g.slice(0, 30).map((x) => h('div', { class: 'list-row' },
        h('div', { class: 'grow' }, h('b', null, x.title), h('div', { class: 'row small muted', style: { gap: '6px' } }, subjChip(x.subject), `${t(MODE_NAMES[x.mode])} · ${fmtDate(x.finished)}`)),
        h('div', { style: { textAlign: 'right' } }, h('b', null, x.score), h('div', { class: 'small muted' }, `${x.won ? `${t('победа')} · ` : ''}#${x.place} · ${x.correct}/${x.total}`))))
        : h('p', { class: 'muted' }, t('Сыграйте первую игру — введите PIN с доски.'))))));
}
