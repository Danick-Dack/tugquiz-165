// Страница прослушивания звуков: /sounds.html
import { sound, RECIPES } from './core.js';

const NAMES = {
  win: 'Победа: фанфара, литавры и овации', lose: 'Поражение: грустный тромбон', draw: 'Ничья',
  finish: 'Финал: спокойные аплодисменты', good: 'Верный ответ', bad: 'Неверный ответ', pull: 'Рывок каната',
  go: 'Старт', count: 'Обратный отсчёт', pop: 'Новый игрок в лобби', tick: 'Нажатие кнопки',
};
const list = document.getElementById('list');
sound.on = true;
for (const key of Object.keys(NAMES).filter((k) => k in RECIPES)) {
  const b = document.createElement('button');
  b.className = 'btn big';
  b.style.cssText = 'width:100%;justify-content:flex-start';
  b.textContent = `▶ ${NAMES[key]}`;
  b.addEventListener('click', () => sound.play(key));
  list.append(b);
}
