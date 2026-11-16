// Генератор примеров для «Каната на доске» под уровни лицея: 7 класс, 8–9, 10–11.
// Каждый пример — числовой вопрос, ответ вводится на цифровой клавиатуре.
export const LEVELS = { 7: '7 класс', 89: '8–9 класс', 1011: '10–11 класс' };

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (list) => list[rnd(0, list.length - 1)];
const signed = (n) => (n < 0 ? `(${n})` : `${n}`);
const linear = (aMax, xMin, xMax) => {
  const a = rnd(2, aMax); const x = rnd(xMin, xMax); const b = rnd(-25, 25) || 7;
  return [`${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${a * x + b},\\ x = ?`, x];
};

const TASKS = {
  7: [
    () => { const a = rnd(-60, 60); const b = rnd(-60, 60); return [`${a} + ${signed(b)} = ?`, a + b]; },
    () => { const a = rnd(-15, -2); const b = rnd(-12, 12) || 3; return [`${a} \\cdot ${signed(b)} = ?`, a * b]; },
    () => { const a = rnd(12, 25); const b = rnd(4, 9); return [`${a} \\cdot ${b} = ?`, a * b]; },
    () => { const b = rnd(6, 16); const c = rnd(6, 16); return [`${b * c} : ${b} = ?`, c]; },
    () => { const [a, n] = pick([[2, rnd(5, 10)], [3, rnd(3, 5)], [5, 3], [-2, rnd(3, 7)]]); return [`${signed(a)}^{${n}} = ?`, a ** n]; },
    () => { const p = pick([5, 15, 20, 25, 40, 75]); const x = pick([60, 80, 120, 240, 360, 480]); return [`${p}\\% \\cdot ${x} = ?`, (p * x) / 100]; },
    () => linear(7, -9, 12),
  ],
  89: [
    () => { const n = rnd(11, 25); return [`${n}^2 = ?`, n * n]; },
    () => { const n = rnd(12, 30); return [`\\sqrt{${n * n}} = ?`, n]; },
    () => { const a = rnd(30, 70); const b = a - rnd(1, 9); return [`${a}^2 - ${b}^2 = ?`, (a - b) * (a + b)]; },
    () => { const a = rnd(2, 9); const b = rnd(2, 9); return [`2^{${a}} \\cdot 2^{${b}} = 2^{?}`, a + b]; },
    () => { const x1 = rnd(-9, 9); const x2 = rnd(-9, 9); const b = -(x1 + x2); const c = x1 * x2;
      return [`x^2 ${b < 0 ? '-' : '+'} ${Math.abs(b)}x ${c < 0 ? '-' : '+'} ${Math.abs(c)} = 0;\\ x_1 + x_2 = ?`, x1 + x2]; },
    () => { const b = rnd(-10, 10); const c = rnd(-20, 20); return [`D:\\ x^2 ${b < 0 ? '-' : '+'} ${Math.abs(b)}x ${c < 0 ? '-' : '+'} ${Math.abs(c)}`, b * b - 4 * c]; },
    () => linear(12, -15, 15),
    () => { const p = pick([12, 15, 35, 45, 120, 150]); const x = pick([40, 80, 140, 220, 360]); return [`${p}\\% \\cdot ${x} = ?`, (p * x) / 100]; },
  ],
  1011: [
    () => { const n = rnd(3, 10); return [`\\log_2 ${2 ** n} = ?`, n]; },
    () => { const [b, n] = pick([[3, rnd(2, 5)], [5, rnd(2, 4)], [10, rnd(2, 6)]]); return [`\\log_{${b}} ${b ** n} = ?`, n]; },
    () => { const n = rnd(4, 7); return [`${n}! = ?`, [1, 1, 2, 6, 24, 120, 720, 5040][n]]; },
    () => { const n = rnd(2, 4); const a = rnd(-3, 4); return [`f(x) = x^{${n}},\\ f'(${a}) = ?`, n * a ** (n - 1)]; },
    () => { const a = rnd(-10, 15); const d = rnd(-5, 7) || 2; const n = rnd(5, 20); return [`a_1 = ${a},\\ d = ${d},\\ a_{${n}} = ?`, a + (n - 1) * d]; },
    () => { const n = rnd(5, 15); return [`C_{${n}}^{2} = ?`, (n * (n - 1)) / 2]; },
    () => pick([['\\sin 30^\\circ = ?', 0.5], ['\\cos 60^\\circ = ?', 0.5], ['\\operatorname{tg} 45^\\circ = ?', 1], ['\\sin 90^\\circ = ?', 1],
      ['\\cos 180^\\circ = ?', -1], ['\\sin^2 37^\\circ + \\cos^2 37^\\circ = ?', 1]]),
    () => { const a = rnd(2, 9); return [`\\int_0^{${a}} 2x\\,dx = ?`, a * a]; },
    () => { const n = rnd(2, 5); const k = rnd(2, 4); return [`\\sqrt[${k}]{${n ** k}} = ?`, n]; },
  ],
};

export function makeProblem({ level = 7 } = {}) {
  const [tex, answer] = pick(TASKS[level] || TASKS[7])();
  return { type: 'number', text: `$${tex}$`, answers: [answer] };
}

/** Уровень по классу квиза: 7 → 7, 8–9 → 89, 10–11 → 1011. */
export const levelForGrade = (grade) => (grade >= 10 ? 1011 : grade >= 8 ? 89 : 7);
