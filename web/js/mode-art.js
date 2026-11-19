// Маленькие сцены для карточек режимов на главной: команды, канат, пьедестал, доска.
const RED = '#d83c41', RED_D = '#b22a2f', BLUE = '#3657c9', BLUE_D = '#26439f', SKIN = '#f0c6a0', RIBBON = '#f2d50f', ROPE = '#8a5a2b';
const FONT = 'font-family="Montserrat, Onest, sans-serif" font-weight="600"';

// Человечек в шапке своей команды; lean — наклон корпуса.
const kid = (x, c, cd, lean = 0, y = 0) => `<g transform="translate(${x} ${y}) rotate(${lean} 0 80)">
  <path d="M-7 80 L-5 54 Q0 49 5 54 L7 80Z" fill="${c}"/><circle cy="44" r="7" fill="${SKIN}"/>
  <path d="M-7 41a7 7 0 0 1 14 0z" fill="${cd}"/><circle cy="33" r="2" fill="${RIBBON}"/></g>`;
const ground = '<rect y="80" width="240" height="24" fill="#e4dccb"/><rect y="98" width="240" height="6" fill="#6e171b"/>';

const ART = {
  tug: `${ground}<path d="M24 62 Q120 56 216 62" fill="none" stroke="${ROPE}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M118 59 L124 59 L121 72Z" fill="${RIBBON}"/>
    ${[44, 66, 88].map((x) => kid(x, RED, RED_D, -14)).join('')}${[152, 174, 196].map((x) => kid(x, BLUE, BLUE_D, 14)).join('')}`,
  duel: `${ground}<rect x="30" y="18" width="72" height="54" rx="10" fill="${RED}"/><text x="66" y="55" text-anchor="middle" font-size="30" fill="#fff" ${FONT}>1</text>
    <rect x="138" y="18" width="72" height="54" rx="10" fill="${BLUE}" opacity=".45"/><text x="174" y="55" text-anchor="middle" font-size="30" fill="#fff" ${FONT}>2</text>
    <path d="M104 30 Q120 16 134 30" fill="none" stroke="#565a52" stroke-width="2.5" stroke-linecap="round"/><path d="M128 24 L135 31 L126 33" fill="none" stroke="#565a52" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  solo: `${ground}<rect x="72" y="56" width="32" height="24" rx="3" fill="#cfd3c9"/><rect x="104" y="40" width="32" height="40" rx="3" fill="${RIBBON}"/><rect x="136" y="64" width="32" height="16" rx="3" fill="#d9a77a"/>
    <text x="88" y="74" text-anchor="middle" font-size="14" fill="#1d1f1a" ${FONT}>2</text><text x="120" y="66" text-anchor="middle" font-size="16" fill="#1d1f1a" ${FONT}>1</text><text x="152" y="76" text-anchor="middle" font-size="11" fill="#1d1f1a" ${FONT}>3</text>
    ${kid(88, '#138a49', '#0b6a36', 0, -24)}${kid(120, '#7d4bb7', '#5d3590', 0, -40)}${kid(152, '#0a7f99', '#06657a', 0, -16)}
    <path d="M120 -2 l3 6 6 1 -4.5 4 1 6 -5.5 -3 -5.5 3 1 -6 -4.5 -4 6 -1z" transform="translate(0 8)" fill="${RIBBON}" stroke="#946b10" stroke-width="1"/>`,
  board: `${ground}<rect x="34" y="10" width="172" height="62" rx="6" fill="#1f3a2c" stroke="#5c4a2e" stroke-width="4"/>
    <path d="M120 16 V66" stroke="rgba(255,255,255,.25)" stroke-width="2" stroke-dasharray="4 4"/>
    <text x="77" y="49" text-anchor="middle" font-size="20" fill="#ff9a9d" ${FONT}>7×8</text><text x="163" y="49" text-anchor="middle" font-size="20" fill="#a3b6ff" ${FONT}>63:9</text>
    <path d="M60 72 V80 M180 72 V80" stroke="#5c4a2e" stroke-width="4"/>`,
};

export const modeArt = (kind) => `<svg class="mode-art" viewBox="0 0 240 104" role="img" aria-hidden="true">${ART[kind]}</svg>`;
