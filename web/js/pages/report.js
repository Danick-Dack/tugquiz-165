// Отчёт об игре: итоги команд, графики, статистика по вопросам и ученикам; печать в PDF через браузер.
import { h, api, go, ic, esc, subjChip, fmtDate, fmtDur, pct, ask, toast, toastErr } from '../core.js';
import { t } from '../i18n.js';
import { teacherPage } from '../app.js';
import { rich } from '../content.js';
import { MODE_NAMES } from './teacher.js';

const RED = '#e5484d';
const BLUE = '#3d63dd';
const GREEN = '#0f6b38';

function ropeChart(rope, names) {
  const W = 640; const H = 220; const P = 28;
  const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, rope.length - 1);
  const y = (v) => P + ((v + 100) / 200) * (H - 2 * P);
  const pts = rope.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('Позиция каната'))}">
    <rect x="${P}" y="${P}" width="${W - 2 * P}" height="${(H - 2 * P) / 2}" fill="${RED}" opacity=".08"/>
    <rect x="${P}" y="${H / 2}" width="${W - 2 * P}" height="${(H - 2 * P) / 2}" fill="${BLUE}" opacity=".08"/>
    <text x="${P + 6}" y="${P + 16}" font-size="12" font-weight="800" fill="${RED}">${esc(names[0])}</text>
    <text x="${P + 6}" y="${H - P - 8}" font-size="12" font-weight="800" fill="${BLUE}">${esc(names[1])}</text>
    <line x1="${P}" x2="${W - P}" y1="${H / 2}" y2="${H / 2}" stroke="#94a3b8" stroke-dasharray="4 4"/>
    <polyline points="${pts}" fill="none" stroke="${GREEN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${rope.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${v < 0 ? RED : v > 0 ? BLUE : '#94a3b8'}"><title>${i}: ${Number(v) || 0}</title></circle>`).join('')}
  </svg>`;
}

function donut(part, total, color = GREEN) {
  const r = 40; const C = 2 * Math.PI * r; const share = total ? part / total : 0;
  return `<svg viewBox="0 0 100 100" style="width:120px;height:120px"><circle cx="50" cy="50" r="${r}" stroke="#e2e7e0" stroke-width="14" fill="none"/>
    <circle cx="50" cy="50" r="${r}" stroke="${color}" stroke-width="14" fill="none" stroke-dasharray="${C * share} ${C}" transform="rotate(-90 50 50)" stroke-linecap="round"/>
    <text x="50" y="56" text-anchor="middle" font-size="20" font-weight="800" fill="#10231a">${Math.round(share * 100)}%</text></svg>`;
}

const bar = (value, color) => h('div', { class: 'pbar' }, h('i', { style: { width: `${Math.min(100, value)}%`, background: color } }));
const pctColor = (p) => (p >= 70 ? 'var(--ok)' : p >= 40 ? 'var(--part)' : 'var(--bad)');
const fmtAnswer = (a) => (a === 'true' ? t('Верно') : a === 'false' ? t('Неверно') : a);

export async function report(id) {
  const g = await api(`/api/games/${id}`);
  const teams = g.teams;
  const names = teams ? [teams.A.name, teams.B.name] : [];
  const duration = g.duration || Math.round((g.finished - g.started) / 1000);
  const players = g.players || [];
  const questions = g.questions || [];
  const totalAnswers = players.reduce((s, p) => s + p.answered, 0);
  const totalCorrect = players.reduce((s, p) => s + p.correct, 0);

  const card = (title, ...c) => h('div', { class: 'card stack' }, title ? h('h3', null, title) : null, c);
  const stat = (v, label) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, label));

  const teamCards = teams ? h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' } }, ['A', 'B'].map((tm) => {
    const x = teams[tm];
    return h('div', { class: 'card stack', style: { borderTop: `6px solid ${tm === 'A' ? RED : BLUE}` } },
      h('div', { class: 'row between' }, h('h3', { style: { margin: 0, color: tm === 'A' ? RED : BLUE } }, x.name), g.winner === tm ? h('span', { class: 'chip' }, h('span', { class: 'ribbon', style: { width: '6px', height: '12px' } }), t('победа')) : null),
      h('div', { class: 'row', style: { gap: '26px' } },
        g.mode === 'board' ? [stat(x.correct, t('верных')), stat(x.wrong, t('ошибок'))] : [stat(x.score, t('очков')), stat(`${x.correct}/${x.answered}`, t('верных'))],
        stat(x.avgTime ? `${x.avgTime} ${t('с')}` : '—', g.mode === 'board' ? t('на пример') : t('ср. время')),
        g.mode === 'board' ? null : stat(x.players, t('игроков'))));
  })) : null;

  // Самые сложные и лёгкие вопросы, быстрые и точные ученики.
  const rated = questions.map((q, i) => ({ ...q, i, p: pct(q.all.correct, q.all.total) })).filter((q) => q.all.total);
  const hardest = [...rated].sort((a, b) => a.p - b.p)[0];
  const easiest = [...rated].sort((a, b) => b.p - a.p)[0];
  const regular = players.filter((p) => p.answered >= Math.max(1, questions.length / 2));
  const fastest = [...regular].filter((p) => p.avgTime !== null).sort((a, b) => a.avgTime - b.avgTime).slice(0, 3);
  const accurate = [...regular].sort((a, b) => b.correct / b.answered - a.correct / a.answered).slice(0, 3);
  const teamScore = (tm) => players.filter((p) => p.team === tm).reduce((s, p) => s + p.score, 0) || 1;

  const del = async () => {
    if (!(await ask(t('Удалить этот отчёт из истории?'), { ok: t('Удалить'), danger: true }))) return;
    try { await api(`/api/games/${id}`, { method: 'DELETE' }); toast(t('Удалено')); go('#/t/history'); } catch (e) { toastErr(e); }
  };

  return teacherPage('history',
    h('div', { class: 'print-head' }, h('img', { src: '/img/icon-192.png', alt: '' }),
      h('div', null, h('b', null, '№165 мамандандырылған лицей · TugQuiz'), h('div', { class: 'small muted' }, `${t('Отчёт об игре')} · ${fmtDate(g.finished)}`))),
    h('div', { class: 'page-head' },
      h('div', null, h('a', { href: '#/t/history', class: 'small no-print' }, `← ${t('История игр')}`), h('h1', null, g.title),
        h('div', { class: 'row', style: { gap: '8px', marginTop: '6px' } }, subjChip(g.subject), h('span', { class: 'chip' }, t(MODE_NAMES[g.mode])),
          h('span', { class: 'small muted' }, `${fmtDate(g.finished)} · ${fmtDur(duration)}`))),
      h('div', { class: 'row no-print' },
        h('button', { class: 'btn primary', onClick: () => { toast(t('В окне печати выберите «Сохранить как PDF»')); setTimeout(() => window.print(), 300); } }, ic('print'), t('Скачать PDF')),
        h('button', { class: 'btn danger', onClick: del }, ic('trash'), t('Удалить')))),
    h('div', { class: 'stack' },
      g.winner ? h('div', { class: 'card dark' },
        h('div', { class: 'row between' }, h('h2', { class: 'row', style: { margin: 0, gap: '12px' } }, g.winner === 'draw' ? null : h('span', { class: 'ribbon' }), g.winner === 'draw' ? t('Ничья') : `${t('Победила команда')} «${teams[g.winner].name}»`),
          h('div', { class: 'row', style: { gap: '26px' } }, g.mode === 'board' ? null : stat(players.length, t('участников')), stat(fmtDur(duration), t('длительность'))))) : null,
      !teams && players.length ? card(null, h('div', { class: 'row', style: { gap: '30px' } }, stat(players.length, t('участников')), stat(fmtDur(duration), t('длительность')),
        stat(`${pct(totalCorrect, totalAnswers)}%`, t('верных ответов')), stat(players[0]?.name || '—', t('победитель')))) : null,
      teamCards,
      h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' } },
        teams && g.rope?.length > 1 ? card(t('Позиция каната по ходу игры'), h('div', { html: ropeChart(g.rope, names) })) : null,
        totalAnswers ? card(t('Правильные ответы'), h('div', { class: 'row', style: { gap: '24px' } }, h('div', { html: donut(totalCorrect, totalAnswers) }),
          h('div', { class: 'stack small' }, h('div', null, `✓ ${t('верно')}: `, h('b', null, Math.round(totalCorrect))), h('div', null, `✗ ${t('неверно / нет ответа')}: `, h('b', null, Math.round(totalAnswers - totalCorrect))),
            hardest ? h('div', null, `${t('Самый сложный')}: `, h('b', null, `№${hardest.i + 1} (${hardest.p}%)`)) : null,
            easiest ? h('div', null, `${t('Самый лёгкий')}: `, h('b', null, `№${easiest.i + 1} (${easiest.p}%)`)) : null))) : null,
        players.length ? card(t('Лучшие'),
          h('div', { class: 'small' }, h('b', null, `${t('Топ-5')}: `), players.slice(0, 5).map((p) => `${p.name} (${p.score})`).join(', ')),
          fastest.length ? h('div', { class: 'small' }, h('b', null, `${t('Самые быстрые')}: `), fastest.map((p) => `${p.name} (${p.avgTime} ${t('с')})`).join(', ')) : null,
          accurate.length ? h('div', { class: 'small' }, h('b', null, `${t('Самые точные')}: `), accurate.map((p) => `${p.name} (${pct(p.correct, p.answered)}%)`).join(', ')) : null,
          h('div', { class: 'small' }, h('b', null, `${t('Лучшая серия')}: `), (() => { const b = [...players].sort((a, c) => c.bestStreak - a.bestStreak)[0]; return b ? `${b.name} (${b.bestStreak})` : '—'; })())) : null),
      questions.length ? card(t('Статистика по вопросам'), h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, '№'), h('th', null, t('Вопрос')), h('th', null, t('Ответ')), h('th', null, t('Верно')), h('th', null, t('Ср. время')),
          teams ? [h('th', { style: { color: RED } }, names[0]), h('th', { style: { color: BLUE } }, names[1])] : null)),
        h('tbody', null, questions.map((q, i) => {
          const p = pct(q.all.correct, q.all.total);
          const teamCell = (x) => h('td', { class: 'small' }, x?.total ? `${pct(x.correct, x.total)}%` : '—');
          return h('tr', null, h('td', null, h('b', null, i + 1), q.team ? h('div', { class: 'small', style: { color: q.team === 'A' ? RED : BLUE } }, '●') : null),
            h('td', { class: 'rich', style: { maxWidth: '360px' }, html: rich(q.text) }), h('td', { class: 'small rich', html: rich(fmtAnswer(q.answer)) }),
            h('td', null, h('div', { class: 'row', style: { gap: '8px', flexWrap: 'nowrap' } }, bar(p, pctColor(p)), h('b', { class: 'small' }, `${p}%`)), h('div', { class: 'small muted' }, `${q.all.correct}/${q.all.total}`)),
            h('td', { class: 'small' }, q.all.avgTime !== null ? `${q.all.avgTime} ${t('с')}` : '—'),
            teams ? [teamCell(q.A), teamCell(q.B)] : null);
        }))))) : null,
      players.length ? card(t('Ученики'), h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, t('Имя')), teams ? h('th', null, t('Команда')) : null, h('th', null, t('Очки')),
          h('th', null, t('Верно')), h('th', null, t('Ср. время')), h('th', null, t('Серия')), teams ? h('th', null, t('Вклад')) : null)),
        h('tbody', null, players.map((p) => h('tr', null, h('td', null, p.place), h('td', null, h('b', null, p.name)),
          teams ? h('td', { style: { color: p.team === 'A' ? RED : BLUE, fontWeight: 500 } }, teams[p.team]?.name || '—') : null,
          h('td', null, h('b', null, p.score)), h('td', null, `${p.correct}/${questions.length} (${pct(p.correct, questions.length)}%)`),
          h('td', null, p.avgTime !== null ? `${p.avgTime} ${t('с')}` : '—'), h('td', null, p.bestStreak),
          teams ? h('td', null, `${pct(p.score, teamScore(p.team))}%`) : null)))))) : null,
      players.length && questions.length ? h('details', { class: 'card' }, h('summary', { style: { cursor: 'pointer', fontWeight: 500 } }, t('Ответы каждого ученика')),
        h('div', { class: 'tbl-wrap', style: { marginTop: '12px' } }, h('table', { class: 'tbl' },
          h('thead', null, h('tr', null, h('th', null, t('Имя')), questions.map((_, i) => h('th', null, i + 1)))),
          h('tbody', null, players.map((p) => h('tr', null, h('td', null, h('b', null, p.name)), p.answers.map((a) => h('td', {
            title: a ? `${fmtAnswer(a.v)} · ${a.t} ${t('с')} · +${a.p}` : t('нет ответа'),
            style: { background: !a ? '#f1f5f9' : a.g === 1 ? 'var(--ok-s)' : a.g > 0 ? 'var(--part-s)' : 'var(--bad-s)', textAlign: 'center', fontSize: '.8rem' },
          }, a ? (a.g === 1 ? '✓' : a.g > 0 ? '½' : '✗') : '—')))))))) : null,
      h('div', { class: 'small muted center', style: { marginTop: '10px' } }, 'TugQuiz · SL165 · Developed by Daniyar Dauletuly')));
}
