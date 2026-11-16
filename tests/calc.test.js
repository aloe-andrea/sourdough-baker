'use strict';
const assert = require('assert');
const Calc = require('../calc.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || '') + ' ' + a + ' vs ' + b);

test('num: virgola decimale, frazioni e mezzi', () => {
  assert.strictEqual(Calc.num('1,5'), 1.5);
  assert.strictEqual(Calc.num('1.5'), 1.5);
  assert.strictEqual(Calc.num('1/2'), 0.5);
  assert.strictEqual(Calc.num('1 1/2'), 1.5);
  assert.strictEqual(Calc.num('½'), 0.5);
  assert.strictEqual(Calc.num('2½'), 2.5);
  assert.strictEqual(Calc.num('450'), 450);
  assert.strictEqual(Calc.num('abc'), null);
});

test('toGrams: g, kg, oz, lb e unita sconosciute', () => {
  assert.strictEqual(Calc.toGrams(450, 'g'), 450);
  assert.strictEqual(Calc.toGrams(1.5, 'kg'), 1500);
  close(Calc.toGrams(1, 'oz'), 28.35, 0.01);
  close(Calc.toGrams(1, 'lb'), 453.59, 0.01);
  assert.strictEqual(Calc.toGrams(2, 'ml'), 2);       // acqua e latte: 1 ml = 1 g
  assert.strictEqual(Calc.toGrams(2, 'cups'), null);   // non si indovina
  assert.strictEqual(Calc.toGrams(2, 'tbsp'), null);
});

test('fahrenheit e celsius', () => {
  assert.strictEqual(Calc.toC(450, 'F'), 232);
  assert.strictEqual(Calc.toC(250, 'C'), 250);
});

test('scala: gli ingredienti arrivano al peso desiderato', () => {
  const ing = [{ name: 'Flour', g: 500, type: 'flour' }, { name: 'Water', g: 350, type: 'water' }, { name: 'Starter', g: 100, type: 'starter' }, { name: 'Salt', g: 10, type: 'salt' }];
  assert.strictEqual(Calc.totalWeight(ing), 960);
  const s = Calc.scaleTo(ing, 480);
  close(s.reduce((a, i) => a + i.g, 0), 480, 3);
  assert.strictEqual(s[0].g, 250);
  assert.strictEqual(s[3].g, 5);
});

test('percentuali del panettiere rispetto alla farina totale', () => {
  const ing = [{ name: 'Flour', g: 450, type: 'flour' }, { name: 'Rye', g: 50, type: 'flour' }, { name: 'Water', g: 375, type: 'water' }, { name: 'Salt', g: 10, type: 'salt' }, { name: 'Starter', g: 100, type: 'starter' }];
  const p = Calc.bakersPercent(ing);
  assert.strictEqual(p.flour, 500);
  close(p.byIndex[2], 75, 0.01);
  close(p.byIndex[3], 2, 0.01);
  close(p.byIndex[4], 20, 0.01);
  close(p.hydration, 75, 0.01);
});

test('rinfreschi a ritroso: 1:1 poi 1:2 per avere 110 g di lievito', () => {
  const f = Calc.feeds(110, [1, 2]);
  assert.strictEqual(f.length, 2);
  assert.deepStrictEqual([f[1].starter, f[1].flour, f[1].water], [22, 44, 44]);
  assert.deepStrictEqual([f[0].starter, f[0].flour, f[0].water], [7, 7, 7]);
  close(f[1].makes, 110, 0.5);
  assert.ok(f[0].makes >= f[1].starter - 1.5, 'il primo rinfresco produce quanto serve al secondo');
});

test('rinfreschi: un solo rinfresco 1:2', () => {
  const f = Calc.feeds(100, [2]);
  assert.deepStrictEqual([f[0].starter, f[0].flour, f[0].water], [20, 40, 40]);
});

test('rinfreschi: se il primo scende sotto 5 g si scala tutto in su', () => {
  const f = Calc.feeds(40, [1, 2]);            // 40/5 = 8 -> 8/3 = 2.7 g: troppo poco
  assert.ok(f[0].starter >= 5, 'primo rinfresco almeno 5 g: ' + f[0].starter);
  assert.ok(f[1].makes >= 40, 'il lievito prodotto copre il fabbisogno');
  assert.ok(Calc.feeds(40, [1, 2]).scaledUp);
});

test('rinfreschi: nessun rinfresco o lievito nullo', () => {
  assert.deepStrictEqual(Calc.feeds(0, [1, 2]), []);
  assert.deepStrictEqual(Calc.feeds(100, []), []);
});

test('temperatura dell acqua: impasto a 25 C con casa a 22 C', () => {
  assert.strictEqual(Calc.waterTemp({ ddt: 25, room: 22 }), 34);
  assert.strictEqual(Calc.waterTemp({ ddt: 25, room: 28 }), 16);
  assert.strictEqual(Calc.waterTemp({ ddt: 25, room: 22, flour: 20, starter: 22, friction: 4 }), 32);
});

test('temperatura dell acqua: fuori da un intervallo sensato restituisce un avviso', () => {
  const r = Calc.waterTempCheck({ ddt: 25, room: 40 });
  assert.ok(r.warning);
  assert.ok(r.c <= 40 && r.c >= 0);
});

test('formatG: grammi leggibili', () => {
  assert.strictEqual(Calc.formatG(450), '450 g');
  assert.strictEqual(Calc.formatG(7.4), '7 g');
  assert.strictEqual(Calc.formatG(4.5), '4.5 g');
  assert.strictEqual(Calc.formatG(10.04), '10 g');
});

console.log('\n' + passed + ' test passati' + (process.exitCode ? ', con errori' : ''));
