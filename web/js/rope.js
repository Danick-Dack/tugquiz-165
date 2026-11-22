// Сцена «Арқан тартыс»: степь, Алатау, киіз үй, беркут и две команды в шапанах и бөріках.
// pos от -100 (победа левых, A) до 100 (правых, B).
// Вся анимация — один цикл requestAnimationFrame: канат догоняет цель пружиной, наклон, шаги и руки
// считаются каждый кадр из скорости и «усилия» команд, поэтому рывки плавные и ничего не перезапускается.
import { h } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
const SHIFT = 1.6; // пикселей сдвига на единицу pos: при ±100 лента доходит до линии победы
const GROUND = 300;
const XS = [190, 256, 322]; // ступни игроков левой команды; правая — зеркально
const ROPE = { x0: 168, x1: 832, y: 211 };
const COLORS = { A: ['#cf3b40', '#8f1f25'], B: ['#3559c7', '#1f368a'] };
const GOLD = '#e7b52c';
// Режим читаем каждый кадр: энергосбережение на телефоне включают и посреди игры.
const reduceQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let reduce = !!reduceQ?.matches;
reduceQ?.addEventListener?.('change', (e) => { reduce = e.matches; });

// Орнамент «қошқар мүйіз»: пара рогов вверх и пара вниз, плитка 48×20.
export const HORNS = 'M12 19V11M12 11C12 5 8 3 5 3 1.5 3 .5 7 2.5 9 4 10.5 6.5 9.5 6 7.5M12 11C12 5 16 3 19 3 22.5 3 23.5 7 21.5 9 20 10.5 17.5 9.5 18 7.5'
  + 'M36 1V9M36 9C36 15 32 17 29 17 25.5 17 24.5 13 26.5 11 28 9.5 30.5 10.5 30 12.5M36 9C36 15 40 17 43 17 46.5 17 47.5 13 45.5 11 44 9.5 41.5 10.5 42 12.5';

const f1 = (n) => Math.round(n * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/** Сустав двухзвенной конечности (колено, локоть). pick выбирает из двух решений. */
function joint(ax, ay, bx, by, l1, l2, pick) {
  const dx = bx - ax; const dy = by - ay;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const len = Math.hypot(dx, dy) || 1;
  const mx = ax + (dx / len) * a; const my = ay + (dy / len) * a;
  const p1 = [mx - (dy / len) * hh, my + (dx / len) * hh];
  const p2 = [mx + (dy / len) * hh, my - (dx / len) * hh];
  return pick(p1, p2) ? p1 : p2;
}
/** Кисть не дальше длины руки от плеча. */
function reach(sx, sy, tx, ty, max) {
  const d = Math.hypot(tx - sx, ty - sy);
  return d <= max ? [tx, ty] : [sx + ((tx - sx) / d) * max, sy + ((ty - sy) / d) * max];
}

// Эмблема лицея SL165 на груди; у правой команды слой отзеркален, поэтому надпись разворачиваем обратно.
const badgeSvg = (mirror) => `
  <g transform="translate(-1.5 -27)${mirror ? ' scale(-1 1)' : ''}">
    <circle r="10" fill="#f2d50f"/><circle r="8.6" fill="#0f6b38"/>
    <circle r="7.3" fill="none" stroke="#f2d50f" stroke-width=".7" stroke-dasharray="1.2 1"/>
    <text y="0" text-anchor="middle" font-family="Montserrat,Onest,sans-serif" font-weight="800" font-size="7.4" fill="#f2d50f">SL</text>
    <text y="5.4" text-anchor="middle" font-family="Montserrat,Onest,sans-serif" font-weight="800" font-size="4.4" fill="#f2d50f">165</text>
  </g>`;
// Статичная часть человечка: шапан (в осях торса, бедро в 0,0) с эмблемой лицея и голова с бөріком и үкі.
const torsoSvg = (c, d, mirror) => `
  <path d="M-12 -47Q0 -51 12 -47L17 13Q0 18 -17 13Z" fill="${c}"/>
  <path d="M-16.4 9.5Q0 14 16.4 9.5" stroke="${GOLD}" stroke-width="3" fill="none"/>
  <path d="M12 -46L16.6 11" stroke="${GOLD}" stroke-width="2.4" fill="none"/>
  <path d="M-14.6 -7H14.6" stroke="${GOLD}" stroke-width="4.5"/>
  ${badgeSvg(mirror)}
  <path d="M-6 -48L2 -41L9 -48" stroke="${d}" stroke-width="3" fill="none" stroke-linejoin="round"/>`;
const headSvg = (d) => `
  <circle r="15" fill="#efc39b"/>
  <circle cx="-4" cy="2" r="3.2" fill="#e3b48a"/>
  <circle cx="7" cy="-1" r="2.1" fill="#1b1b1b"/>
  <path d="M3.5 -6.5l7 1.6" stroke="#1b1b1b" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M7 8.2h5" stroke="#8a4b2a" stroke-width="2" stroke-linecap="round"/>
  <circle cx="3" cy="5" r="3" fill="#f39b8b" opacity=".5"/>
  <path d="M-15 -5Q-14 -25 2 -25Q16 -23 15.5 -7Z" fill="${d}"/>
  <path d="M-6 -16c0-3 -3-4 -4.2-2.6s0 2.6 1.1 1.9M-6 -16c0-3 3-4 4.2-2.6s0 2.6-1.1 1.9" stroke="${GOLD}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <path d="M-16.5 -8Q0 -12.5 16.5 -8L16.5 -1.5Q0 -6 -16.5 -1.5Z" fill="#f4e9d2" stroke="#d9c6a1" stroke-width="1"/>
  <path d="M1 -25q-3 -9 -8 -12M2 -25q0 -10 -3 -15M3 -25q3 -8 7 -11" stroke="#fbfaf6" stroke-width="2.4" stroke-linecap="round" fill="none"/>`;
const BOOT = 'M-6 0L13 0Q18 0 16.5 -4L9 -6L9 -15L-6 -15Z';

const TEMPLATE = `
<defs>
  <linearGradient id="tq-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe3f2"/><stop offset=".75" stop-color="#f7efd6"/></linearGradient>
  <pattern id="tq-orn" width="48" height="20" patternUnits="userSpaceOnUse">
    <path d="${HORNS}" fill="none" stroke="${GOLD}" stroke-width="1.7" stroke-linecap="round"/>
  </pattern>
  <pattern id="tq-orn-s" width="24" height="10" patternUnits="userSpaceOnUse"><g transform="scale(.5)">
    <path d="${HORNS}" fill="none" stroke="${GOLD}" stroke-width="2.6" stroke-linecap="round"/></g>
  </pattern>
</defs>
<rect width="1000" height="380" fill="url(#tq-sky)"/>
<g transform="translate(712 92)">
  <circle r="30" fill="#f4c31a"/>
  ${Array.from({ length: 32 }, (_, i) => `<path d="M-2.4 -36L0 -50L2.4 -36Z" fill="#f4c31a" transform="rotate(${i * 11.25})"/>`).join('')}
</g>
<g class="cloud c1"><path d="M0 0q8-16 26-10q10-14 30-4q18-4 20 12z" fill="#fff" opacity=".85"/></g>
<g class="cloud c2"><path d="M0 0q6-12 20-8q8-11 24-3q14-3 15 9z" fill="#fff" opacity=".7"/></g>
<g class="eagle"><path d="M0 0C-10 -6 -22 -7 -34 -3C-24 -3 -16 0 -10 3L-4 3L-2 7L2 7L4 3L10 3C16 0 24 -3 34 -3C22 -7 10 -6 0 0Z M-2 -1L0 -5L2 -1Z" fill="#c8901a"/></g>
<path d="M0 226L80 168L136 196L238 112L318 186L410 146L494 192L600 98L700 182L792 136L884 194L1000 156V300H0Z" fill="#a7c4cf"/>
<path d="M238 112L258 128L247 126L238 135L228 127L220 130ZM600 98L622 116L608 113L598 122L588 114L578 117ZM792 136L808 148L798 147L789 153L780 147Z" fill="#fff"/>
<path d="M0 258Q120 222 260 246T540 242T820 236T1000 248V300H0Z" fill="#9cb86e"/>
<path d="M0 276Q200 256 420 270T1000 266V300H0Z" fill="#c4b468"/>
<g transform="translate(26 232)">
  <path d="M0 64V30H104V64Z" fill="#f6eedb" stroke="#cdb88f" stroke-width="2"/>
  <path d="M-4 31Q52 -16 108 31Z" fill="#efe4c8" stroke="#cdb88f" stroke-width="2"/>
  <rect x="0" y="30" width="104" height="10" fill="#9e2a2b"/><rect x="0" y="30" width="104" height="10" fill="url(#tq-orn-s)" opacity=".9"/>
  <path d="M8 26L52 6L96 26M24 18L52 6L80 18" stroke="#b9a274" stroke-width="1.6" fill="none"/>
  <ellipse cx="52" cy="6" rx="9" ry="3.5" fill="#8a5a2b"/><path d="M45 6H59M52 3V9" stroke="#f6eedb" stroke-width="1.4"/>
  <path d="M40 64V44Q52 38 64 44V64Z" fill="#c0392b"/><path d="M45 50h14M45 56h14" stroke="${GOLD}" stroke-width="1.6"/>
</g>
<g transform="translate(902 258) scale(.62)">
  <path d="M0 64V30H104V64Z" fill="#f6eedb" stroke="#cdb88f" stroke-width="2.5"/>
  <path d="M-4 31Q52 -16 108 31Z" fill="#efe4c8" stroke="#cdb88f" stroke-width="2.5"/>
  <rect x="0" y="30" width="104" height="10" fill="#1f5c8a"/>
  <path d="M40 64V44Q52 38 64 44V64Z" fill="#1f5c8a"/>
</g>
<rect y="296" width="1000" height="84" fill="#cda76a"/>
<rect y="292" width="1000" height="8" rx="4" fill="#8db35f"/>
<rect y="352" width="1000" height="24" fill="#8c1d22"/>
<rect y="354" width="1000" height="20" fill="url(#tq-orn)"/>
<path d="M500 248V306" stroke="#fff" stroke-width="4" stroke-dasharray="8 6" opacity=".9"/>
<g transform="translate(340 0)"><path d="M0 224V306" stroke="#6b4423" stroke-width="5"/><path d="M0 226h30l-8 11 8 11H0Z" fill="#cf3b40"/><path d="M5 237h14" stroke="${GOLD}" stroke-width="2"/></g>
<g transform="translate(660 0)"><path d="M0 224V306" stroke="#6b4423" stroke-width="5"/><path d="M0 226h-30l8 11-8 11H0Z" fill="#3559c7"/><path d="M-5 237h-14" stroke="${GOLD}" stroke-width="2"/></g>
<text class="nameA" x="24" y="40" font-family="Montserrat,Onest,sans-serif" font-weight="700" font-size="26" fill="#a32025"></text>
<text class="nameB" x="976" y="40" text-anchor="end" font-family="Montserrat,Onest,sans-serif" font-weight="700" font-size="26" fill="#22399a"></text>
<g class="shift"></g>`;

export class Tug {
  constructor({ names = ['', ''], labels = true } = {}) {
    this.el = el('svg', { viewBox: '0 0 1000 380', class: 'tug', role: 'img', 'aria-label': 'Арқан тартыс' });
    this.el.innerHTML = TEMPLATE;
    this.shift = this.el.querySelector('.shift');
    this.eagle = this.el.querySelector('.eagle');
    this.clouds = [...this.el.querySelectorAll('.cloud')];
    this.build();
    Object.assign(this, { pos: 0, target: 0, vel: 0, eff: { A: 0, B: 0 }, drag: { A: 0, B: 0 }, step: { A: 0, B: 0 }, vib: 0, won: null, t0: performance.now() / 1000 });
    if (labels) this.setNames(names);
    this.visible = false;
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.kick(); });
    this.io.observe(this.el);
    this.frame(performance.now(), true);
  }

  build() {
    const layer = (team, mirror) => this.shift.appendChild(el('g', mirror ? { transform: 'translate(1000 0) scale(-1 1)' } : {}));
    const back = { A: layer('A'), B: layer('B', true) };
    const body = { A: layer('A'), B: layer('B', true) };
    this.ropeG = this.shift.appendChild(el('g'));
    this.ropeBase = this.ropeG.appendChild(el('path', { stroke: '#7d5019', 'stroke-width': 9, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    this.ropeTwist = this.ropeG.appendChild(el('path', { stroke: '#dba559', 'stroke-width': 3.5, fill: 'none', 'stroke-dasharray': '7 7' }));
    this.flag = this.shift.appendChild(el('g'));
    this.flag.innerHTML = `<g class="ribbon-swing"><path d="M-9 2h18l4 38l-13 -8l-13 8z" fill="${GOLD}" stroke="#a37a10" stroke-width="2"/><path d="M-5 14h10M-5 22h10" stroke="#8c1d22" stroke-width="2"/><circle r="6" fill="#cf3b40"/></g>`;
    this.swing = this.flag.firstChild;
    const front = { A: layer('A'), B: layer('B', true) };
    this.dustG = this.shift.appendChild(el('g'));
    this.figs = { A: [], B: [] };
    for (const team of ['A', 'B']) {
      const [c, d] = COLORS[team];
      this.figs[team] = XS.map((x, i) => {
        const g = (parent) => parent.appendChild(el('g', { transform: `translate(${x} ${GROUND})` }));
        const gb = g(back[team]); const gm = g(body[team]); const gf = g(front[team]);
        const limb = (parent, color, w) => parent.appendChild(el('path', { stroke: color, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        const fig = {
          x, i, root: [gb, gm, gf],
          armB: limb(gb, d, 10), handB: gb.appendChild(el('circle', { r: 5.5, fill: '#e3b48a' })),
          legB: limb(gm, '#2a2f36', 11), bootB: gm.appendChild(el('path', { d: BOOT, fill: '#2b1d14' })),
          legF: limb(gm, '#353b44', 11), bootF: gm.appendChild(el('path', { d: BOOT, fill: '#3a281b' })),
          torso: gm.appendChild(el('g')), head: gm.appendChild(el('g')),
          armF: limb(gf, c, 10), handF: gf.appendChild(el('circle', { r: 6, fill: '#efc39b' })),
        };
        fig.torso.innerHTML = torsoSvg(c, d, team === 'B');
        fig.head.innerHTML = headSvg(d);
        return fig;
      });
    }
  }

  setNames([a, b]) {
    this.el.querySelector('.nameA').textContent = a;
    this.el.querySelector('.nameB').textContent = b;
  }

  /** Сдвинуть канат; by = 'A' | 'B' — какая команда сделала рывок. */
  set(pos, by) {
    pos = clamp(Number(pos) || 0, -100, 100);
    if (by === undefined && Math.abs(pos - this.target) > 0.5) by = pos < this.target ? 'A' : 'B';
    this.target = pos;
    if (by) this.jerk(by);
    this.kick();
  }

  jerk(team) {
    const other = team === 'A' ? 'B' : 'A';
    this.eff[team] = Math.min(1.6, this.eff[team] + 0.9);
    this.drag[other] = Math.min(1.2, this.drag[other] + 0.8);
    this.vib = 5;
    this.dust(team);
    this.kick();
  }

  dust(team) {
    if (reduce) return;
    const puff = el('g', { class: 'dust' });
    puff.innerHTML = XS.flatMap((x, i) => [0, 1, 2].map((k) => {
      const cx = team === 'A' ? x - 18 + k * 6 : 1000 - x + 18 - k * 6;
      return `<circle cx="${cx}" cy="${GROUND - 2 - k * 3}" r="${4 + k * 2}" fill="#e2c79a" style="--dx:${(team === 'A' ? -1 : 1) * (14 + k * 10)}px;animation-delay:${k * 60 + i * 40}ms"/>`;
    })).join('');
    this.dustG.append(puff);
    setTimeout(() => puff.remove(), 1100);
  }

  win(team) {
    if (team !== 'A' && team !== 'B') return;
    this.won = team;
    this.wonAt = performance.now() / 1000;
    this.kick();
  }

  reset() {
    Object.assign(this, { won: null, pos: 0, target: 0, vel: 0, vib: 0, eff: { A: 0, B: 0 }, drag: { A: 0, B: 0 } });
    this.kick();
  }

  kick() {
    if (this.raf || !this.visible) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  frame(now, once = false) {
    this.raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    const t = now / 1000 - this.t0;

    // Пружина: канат догоняет цель без рывков, с лёгким «перетягиванием» в конце.
    if (reduce) { this.pos = this.target; this.vel = 0; } else {
      const acc = 20 * (this.target - this.pos) - 7.5 * this.vel;
      this.vel += acc * dt;
      this.pos += this.vel * dt;
    }
    const decay = Math.exp(-dt * 2.4);
    for (const k of ['A', 'B']) { this.eff[k] *= decay; this.drag[k] *= Math.exp(-dt * 3.2); }
    this.vib *= Math.exp(-dt * 5);
    this.shift.setAttribute('transform', `translate(${f1(this.pos * SHIFT)} 0)`);

    // Канат: провисает, когда команды тянут слабо, и дрожит после рывка.
    const tension = clamp(0.45 + 0.3 * (this.eff.A + this.eff.B), 0, 1);
    const sag = this.won ? 0 : 5 + 9 * (1 - tension);
    const wave = reduce ? 0 : this.vib * Math.sin(t * 30);
    const fallen = this.won ? clamp((t - (this.wonAt - this.t0)) / 0.6, 0, 1) : 0;
    const ropeY = (x) => {
      const u = clamp((x - ROPE.x0) / (ROPE.x1 - ROPE.x0), 0, 1);
      const y = ROPE.y + sag * 4 * u * (1 - u) + wave * Math.sin(Math.PI * u);
      return y + (GROUND - 4 - y) * fallen;
    };
    // Хвосты каната плавно ложатся на землю за последними игроками.
    const tail = (x0, dir) => {
      const y0 = ropeY(x0);
      return [6, 5, 4, 3, 2, 1].map((k) => {
        const u = k / 6;
        return [x0 + dir * (56 * u + 10 * u * (1 - u)), y0 + (GROUND - 4 - y0) * u * u];
      });
    };
    const pts = tail(ROPE.x0, -1);
    for (let k = 0; k <= 24; k++) { const x = ROPE.x0 + ((ROPE.x1 - ROPE.x0) * k) / 24; pts.push([x, ropeY(x)]); }
    pts.push(...tail(ROPE.x1, 1).reverse());
    const d = `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}`;
    this.ropeBase.setAttribute('d', d);
    this.ropeTwist.setAttribute('d', d);
    this.flag.setAttribute('transform', `translate(500 ${f1(ropeY(500))})`);
    this.swing.setAttribute('transform', `rotate(${f1(reduce ? 0 : Math.sin(t * 2.6) * 5 - clamp(this.vel, -60, 60) * 0.12)})`);

    // Беркут парит над степью, облака плывут.
    if (!reduce) {
      const ex = ((t * 18) % 1300) - 150;
      this.eagle.setAttribute('transform', `translate(${f1(ex)} ${f1(70 + Math.sin(t * 0.7) * 12)}) rotate(${f1(Math.sin(t * 0.7 + 1) * 4)})`);
      this.clouds.forEach((c, i) => c.setAttribute('transform', `translate(${f1(((t * (6 + i * 3) + i * 520) % 1200) - 100)} ${44 + i * 46})`));
    } else this.eagle.setAttribute('transform', 'translate(700 70)');

    for (const team of ['A', 'B']) this.pose(team, t, dt, ropeY);
    if (!once && this.visible) this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  pose(team, t, dt, ropeY) {
    const other = team === 'A' ? 'B' : 'A';
    const sign = team === 'A' ? -1 : 1; // команда A тянет влево (vel < 0)
    const pulling = clamp((sign * this.vel) / 45, 0, 1);
    const dragged = clamp((-sign * this.vel) / 45, 0, 1);
    const eff = this.eff[team];
    const won = this.won === team; const lost = this.won === other;
    const since = this.won ? t - (this.wonAt - this.t0) : 0;
    // Шаги: тянущие пятятся, проигрывающих тащит вперёд.
    this.step[team] += dt * (reduce ? 0 : 7 * Math.max(pulling, dragged) + 3 * eff);
    for (const fig of this.figs[team]) {
      const ph = this.step[team] * 1.6 + fig.i * 1.9;
      const idle = reduce ? 0 : Math.sin(t * 2.3 + fig.i * 1.4) * 0.025;
      let lean = -(0.22 + 0.13 * Math.min(eff, 1.2) + 0.1 * pulling) + 0.16 * (dragged + this.drag[team] * 0.5) + idle;
      let lift = 0;
      if (won) { lean = 0.04 + Math.sin(t * 7 + fig.i) * 0.04; lift = -Math.abs(Math.sin(t * 7 + fig.i * 0.9)) * 14 * clamp(since * 3, 0, 1); }
      if (lost) lean = 0.2 + 0.85 * clamp(since / 0.8, 0, 1) ** 2;
      const amp = Math.max(pulling, dragged) > 0.05 || eff > 0.3 ? 5 : 0;
      const stepF = reduce ? 0 : Math.sin(ph) * amp; const stepB = reduce ? 0 : Math.sin(ph + Math.PI) * amp;
      const footF = [24 + stepF, Math.min(0, -Math.max(0, Math.cos(ph)) * amp * 0.9) + lift];
      const footB = [-22 + stepB, Math.min(0, -Math.max(0, Math.cos(ph + Math.PI)) * amp * 0.9) + lift];
      const crouch = lost ? 18 * clamp(since / 0.8, 0, 1) : 6 * clamp(-lean - 0.15, 0, 0.4) / 0.4 + 2 * Math.min(eff, 1);
      const hx = 3 + Math.sin(lean) * 26; const hy = -57 + crouch + lift;
      const [s, c] = [Math.sin(lean), Math.cos(lean)];
      const sh = [hx + 44 * s, hy - 44 * c];
      const head = [hx + 2 * c + 62 * s, hy + 2 * s - 62 * c];
      const knee = (foot) => joint(hx, hy, foot[0], foot[1] - 6, 31, 31, (a, b) => a[0] > b[0]);
      const leg = (path, boot, foot) => {
        const k = knee(foot);
        path.setAttribute('d', `M${f1(hx)} ${f1(hy)}L${f1(k[0])} ${f1(k[1])}L${f1(foot[0])} ${f1(foot[1] - 6)}`);
        boot.setAttribute('transform', `translate(${f1(foot[0] - 3)} ${f1(foot[1])})`);
      };
      leg(fig.legB, fig.bootB, footB);
      leg(fig.legF, fig.bootF, footF);
      fig.torso.setAttribute('transform', `translate(${f1(hx)} ${f1(hy)}) rotate(${f1((lean * 180) / Math.PI)})`);
      fig.head.setAttribute('transform', `translate(${f1(head[0])} ${f1(head[1])}) rotate(${f1((lean * 120) / Math.PI)})`);
      // Руки: на канате, в победе — вверх, при падении тянутся вперёд.
      const worldX = (lx) => (team === 'A' ? fig.x + lx : 1000 - fig.x - lx);
      const ropeAt = (lx) => ropeY(worldX(lx)) - GROUND;
      const target = (lx, up) => (won ? [sh[0] + up, sh[1] - 40] : lost ? [sh[0] + 40, sh[1] + 20] : [lx, ropeAt(lx)]);
      const arm = (path, hand, from, tg) => {
        const [tx, ty] = reach(from[0], from[1], tg[0], tg[1], 46.5);
        const e = joint(from[0], from[1], tx, ty, 24, 23, (a, b) => a[1] > b[1]);
        path.setAttribute('d', `M${f1(from[0])} ${f1(from[1])}L${f1(e[0])} ${f1(e[1])}L${f1(tx)} ${f1(ty)}`);
        hand.setAttribute('cx', f1(tx));
        hand.setAttribute('cy', f1(ty));
      };
      arm(fig.armB, fig.handB, [sh[0] - 2, sh[1] + 1], target(4, -8));
      arm(fig.armF, fig.handF, [sh[0] + 1, sh[1] + 2], target(20, 10));
    }
  }
}

/** Небольшая подпись под сценой со счётом команд. */
export const tugLegend = (names, scores) => h('div', { class: 'row between', style: { fontFamily: 'var(--display)', fontWeight: 700 } },
  h('span', { class: 'tA' }, `${names[0]}${scores ? ` · ${scores.A}` : ''}`),
  h('span', { class: 'tB' }, `${scores ? `${scores.B} · ` : ''}${names[1]}`));
