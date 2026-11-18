import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkName } from '../web/js/names.js';

test('имена: настоящие проходят, мемы и мат — нет', () => {
  for (const n of ['Данияр Даулетулы', 'Айгерим', 'Ким Алина', 'Daniyar Dauletuly', 'Әсел Нұрланқызы', 'Анна-Мария Ли', 'Иванова Мария Петровна', 'Жұлдызай', 'Нұрсұлтан']) {
    assert.ok(checkName(n).ok, n);
  }
  for (const n of ['скебоб', 'Скибиди Туалет', 'Сигма', 'абоба', 'asdfgh', 'ааааа', 'Иван 2007', 'Кот', 'Бобр Курва', 'Шрек']) {
    assert.ok(!checkName(n).ok, n);
  }
  assert.equal(checkName('  данияр   даулетулы ').name, 'Данияр Даулетулы');
});

test('имена: Азия и соседи (узбекские, русские, корейские, японские, индийские, турецкие)', () => {
  for (const n of ['Мухаммадали Рахимов', 'Нигора Рахмонова', 'Эльчин Алиев', 'Мээрим Асанова', 'Ариунаа Батбаяр', 'Takeshi Yamamoto', 'Park Ji-min', 'Priya Sharma', 'Şeyma Yılmaz', 'Nguyễn Văn An', 'Влада', 'Zarina']) {
    assert.ok(checkName(n).ok, n);
  }
  for (const n of ['Кошка', 'Abobus', 'Nigga', 'Огурец Огурцов', 'Zxcvb', 'Роблокс']) assert.ok(!checkName(n).ok, n);
});
