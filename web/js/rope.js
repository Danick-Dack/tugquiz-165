// Сцена «Арқан тартыс»: SVG с горами, юртой и двумя командами. pos от -100 (победа левых, A) до 100 (правых, B).
import { h } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
const SHIFT = 1.6; // пикселей сдвига на единицу pos: при ±100 лента доходит до линии победы

// Один человечек, смотрит вправо (на канат), ступни в (0,0).
const figure = (color, dark, i) => `
  <g transform="translate(${190 + i * 66},300)"><g class="fig" style="animation-delay:-${(i * 0.45).toFixed(2)}s">
    <path d="M0 -58 L-26 0" stroke="#24323b" stroke-width="11" stroke-linecap="round"/>
    <path d="M0 -58 L16 -30 L27 0" stroke="#2e3e48" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <ellipse cx="-29" cy="1" rx="10" ry="4.5" fill="#161616"/><ellipse cx="31" cy="1" rx="10" ry="4.5" fill="#161616"/>
    <path d="M0 -58 L-16 -106" stroke="${color}" stroke-width="25" stroke-linecap="round"/>
    <path d="M-6 -62 L6 -60" stroke="${dark}" stroke-width="6" stroke-linecap="round"/>
    <path d="M-15 -101 L33 -88" stroke="${color}" stroke-width="9" stroke-linecap="round"/>
    <path d="M-11 -94 L29 -84" stroke="${dark}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="35" cy="-87" r="6.5" fill="#efc39b"/><circle cx="31" cy="-83" r="6" fill="#e3b48a"/>
    <circle cx="-22" cy="-127" r="15.5" fill="#efc39b"/>
    <path d="M-37.5 -129 A15.5 15.5 0 0 1 -6.5 -129 Z" fill="${dark}"/>
    <path d="M-35 -130.5 l3.5 -3 l3.5 3 l3.5 -3 l3.5 3 l3.5 -3 l3.5 3 l3.5 -3 l3.5 3" stroke="#f6e21a" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
    <circle cx="-14" cy="-125" r="2.2" fill="#1b1b1b"/>
    <path d="M-18 -131 l7 2" stroke="#1b1b1b" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M-17 -118 h7" stroke="#8a4b2a" stroke-width="2" stroke-linecap="round"/>
    <circle cx="-23" cy="-120" r="3" fill="#f39b8b" opacity=".55"/>
  </g></g>`;

const TEMPLATE = `
<defs>
  <linearGradient id="tq-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd8ff"/><stop offset="1" stop-color="#fff6cf"/></linearGradient>
  <pattern id="tq-orn" width="48" height="16" patternUnits="userSpaceOnUse">
    <path d="M0 8h6M42 8h6M24 14c-6 0-9-4-9-7s2-5 5-5 4 2 4 4-1 3-3 3M24 14c6 0 9-4 9-7s-2-5-5-5-4 2-4 4 1 3 3 3" fill="none" stroke="#f6e21a" stroke-width="1.6" stroke-linecap="round"/>
  </pattern>
</defs>
<rect width="1000" height="380" fill="url(#tq-sky)"/>
<g class="sun"><circle cx="860" cy="70" r="34" fill="#f6d81a"/>
  ${Array.from({ length: 16 }, (_, i) => `<path d="M855 27 L860 9 L865 27 Z" fill="#f6d81a" transform="rotate(${i * 22.5} 860 70)"/>`).join('')}
</g>
<path d="M0 232 L90 170 L150 200 L250 120 L330 190 L420 150 L500 196 L600 105 L700 185 L790 140 L880 196 L1000 160 V300 H0 Z" fill="#9cc7ae"/>
<path d="M250 120 L270 135 L258 133 L248 142 L238 134 L230 136 Z M600 105 L622 122 L608 119 L598 128 L588 120 L578 123 Z M790 140 L806 152 L796 151 L787 157 L778 151 Z" fill="#fff"/>
<path d="M0 262 Q120 225 260 250 T540 246 T820 240 T1000 252 V300 H0 Z" fill="#6aa877"/>
<g transform="translate(58 254)"><path d="M0 46 V20 Q30 -6 60 20 V46 Z" fill="#fbf6ea" stroke="#c9b48a" stroke-width="2"/>
  <path d="M6 22 Q30 2 54 22" stroke="#c0392b" stroke-width="3" fill="none"/><rect x="24" y="28" width="12" height="18" rx="2" fill="#c0392b"/></g>
<rect y="296" width="1000" height="84" fill="#c79f62"/>
<rect y="292" width="1000" height="9" rx="4" fill="#79bf5f"/>
<rect y="356" width="1000" height="18" fill="#0a4a28"/><rect y="357" width="1000" height="16" fill="url(#tq-orn)"/>
<path d="M500 250 V306" stroke="#fff" stroke-width="4" stroke-dasharray="8 6" opacity=".9"/>
<g><path d="M340 230 V306" stroke="#e5484d" stroke-width="5"/><path d="M340 230 l-26 8 l26 8 z" fill="#e5484d"/></g>
<g><path d="M660 230 V306" stroke="#3d63dd" stroke-width="5"/><path d="M660 230 l26 8 l-26 8 z" fill="#3d63dd"/></g>
<text class="nameA" x="24" y="40" font-family="Unbounded,sans-serif" font-weight="800" font-size="26" fill="#c8282d"></text>
<text class="nameB" x="976" y="40" text-anchor="end" font-family="Unbounded,sans-serif" font-weight="800" font-size="26" fill="#2647ad"></text>
<g class="shift">
  <g class="rope-line">
    <path d="M110 211 Q500 224 890 211" stroke="#8a5a1e" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M110 211 Q500 224 890 211" stroke="#d9a453" stroke-width="3.5" fill="none" stroke-dasharray="7 7"/>
  </g>
  <g class="flag"><path d="M491 215 h18 l5 40 l-14 -9 l-14 9 z" fill="#f6e21a" stroke="#a89100" stroke-width="2"/><circle cx="500" cy="216" r="6" fill="#e5484d"/></g>
  <g class="team A">${[0, 1, 2].map((i) => figure('#e5484d', '#9e1f24', i)).join('')}</g>
  <g transform="translate(1000 0) scale(-1 1)"><g class="team B">${[0, 1, 2].map((i) => figure('#3d63dd', '#1f3a94', i)).join('')}</g></g>
</g>`;

export class Tug {
  constructor({ names = ['', ''], labels = true } = {}) {
    this.el = document.createElementNS(NS, 'svg');
    this.el.setAttribute('viewBox', '0 0 1000 380');
    this.el.setAttribute('class', 'tug');
    this.el.setAttribute('role', 'img');
    this.el.innerHTML = TEMPLATE;
    this.shift = this.el.querySelector('.shift');
    this.teams = { A: this.el.querySelector('.team.A'), B: this.el.querySelector('.team.B') };
    this.pos = 0;
    if (labels) this.setNames(names);
    this.el.setAttribute('aria-label', 'Арқан тартыс');
  }

  setNames([a, b]) {
    this.el.querySelector('.nameA').textContent = a;
    this.el.querySelector('.nameB').textContent = b;
  }

  /** Сдвинуть канат; by = 'A' | 'B' — какая команда сделала рывок. */
  set(pos, by) {
    pos = Math.max(-100, Math.min(100, Number(pos) || 0));
    if (by === undefined && Math.abs(pos - this.pos) > 0.5) by = pos < this.pos ? 'A' : 'B';
    this.pos = pos;
    this.shift.style.transform = `translateX(${pos * SHIFT}px)`;
    if (by) this.jerk(by);
  }

  jerk(team) {
    const other = team === 'A' ? 'B' : 'A';
    for (const [g, cls] of [[this.teams[team], 'heave'], [this.teams[other], 'stumble']]) {
      g.classList.remove('heave', 'stumble');
      void g.getBoundingClientRect();
      g.classList.add(cls);
      clearTimeout(g._t);
      g._t = setTimeout(() => g.classList.remove(cls), 750);
    }
    this.dust(team);
  }

  dust(team) {
    const g = this.teams[team];
    const puff = document.createElementNS(NS, 'g');
    puff.setAttribute('class', 'dust');
    puff.innerHTML = [0, 1, 2].flatMap((i) => [0, 1, 2].map((k) =>
      `<circle cx="${164 + i * 66 + k * 6}" cy="${296 - k * 3}" r="${4 + k * 2}" fill="#e2c79a" style="--dx:${-14 - k * 10}px;animation-delay:${k * 60}ms"/>`)).join('');
    g.append(puff);
    setTimeout(() => puff.remove(), 1000);
  }

  win(team) {
    if (team !== 'A' && team !== 'B') return;
    this.teams[team].classList.add('cheer');
    this.teams[team === 'A' ? 'B' : 'A'].classList.add('fall');
  }

  reset() {
    for (const g of Object.values(this.teams)) g.classList.remove('cheer', 'fall', 'heave', 'stumble');
    this.set(0, null);
  }
}

/** Небольшая подпись под сценой со счётом команд. */
export const tugLegend = (names, scores) => h('div', { class: 'row between', style: { fontFamily: 'var(--display)', fontWeight: 800 } },
  h('span', { class: 'tA' }, `${names[0]}${scores ? ` · ${scores.A}` : ''}`),
  h('span', { class: 'tB' }, `${scores ? `${scores.B} · ` : ''}${names[1]}`));
