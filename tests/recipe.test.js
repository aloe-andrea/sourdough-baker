'use strict';
const assert = require('assert');
const Calc = require('../calc.js');
const RI = require('../recipeimport.js');
const Recipe = require('../recipe.js');
const Planner = require('../planner.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const MIN = 60000;
const QUIET = { start: '23:00', end: '07:00' };
const SAT_13 = new Date(2026, 10, 14, 13, 0).getTime();
const sample = lang => RI.parseText(RI.SAMPLE[lang]).recipe;
const fmt = ms => new Date(ms).toLocaleString('it-IT');

test('fromImported: ingredienti scalati al peso scelto', () => {
  const r = Recipe.fromImported(sample('en'), 'uno11-uno12', { loafG: 900 });
  assert.ok(Math.abs(Calc.totalWeight(r.ingredients) - 900) <= 4);
  assert.strictEqual(r.loafG, 900);
  assert.ok(r.starterG > 80 && r.starterG < 100, 'lievito scalato: ' + r.starterG);
});

test('fromImported: senza peso scelto usa quello della ricetta', () => {
  const r = Recipe.fromImported(sample('en'), 'uno11-uno12', {});
  assert.strictEqual(Calc.totalWeight(r.ingredients), 985);
  assert.strictEqual(r.scale, 1);
});

test('fromImported: i rinfreschi del preset producono il lievito che serve alla ricetta', () => {
  const r = Recipe.fromImported(sample('en'), 'uno11-uno12', { loafG: 985 });
  const feeds = r.steps.filter(s => s.id.indexOf('rinfresco') === 0);
  assert.strictEqual(feeds.length, 2);
  const last = feeds[1].grammi.reduce((a, x) => a + x.g, 0);
  assert.ok(Math.abs(last - 100) <= 2, 'ultimo rinfresco produce ~100 g: ' + last);
  assert.deepStrictEqual(feeds[1].grammi.map(x => x.key), ['starter', 'flour', 'water']);
});

test('fromImported: tutti i preset di rinfreschi funzionano', () => {
  ['uno11-uno12', 'due12', 'singolo'].forEach(p => {
    const r = Recipe.fromImported(sample('en'), p, { loafG: 900 });
    assert.ok(r.steps.length > 8);
    r.steps.slice(0, Recipe.PRESETS[p].rinfreschi.length).forEach(s => assert.ok(s.grammi && s.grammi.length === 3, p));
  });
});

test('fromImported: grammi sull autolisi e sull impasto, senza duplicati', () => {
  const r = Recipe.fromImported(sample('en'), 'uno11-uno12', { loafG: 900 });
  const auto = r.steps.find(s => s.id === 'r-autolyse'), mix = r.steps.find(s => s.id === 'r-mix');
  assert.ok(auto.grammi.every(x => x.type === 'flour' || x.type === 'water'));
  assert.ok(mix.grammi.every(x => x.type !== 'flour' && x.type !== 'water'));
  assert.ok(mix.grammi.some(x => x.type === 'starter') && mix.grammi.some(x => x.type === 'salt'));
});

test('fromImported: senza autolisi tutto l impasto sta nel primo passo', () => {
  const rec = RI.parseText('500 g flour\n350 g water\n100 g starter\n10 g salt\n1. Mix everything.\n2. Bulk ferment 4-5 hours.\n3. Bake 40 minutes at 230°C.').recipe;
  const r = Recipe.fromImported(rec, 'singolo', { loafG: 960 });
  const mix = r.steps.find(s => s.id === 'r-mix');
  assert.strictEqual(mix.grammi.length, 4);
});

test('fromImported: id unici e durate coerenti', () => {
  const r = Recipe.fromImported(sample('it'), 'due12', { loafG: 900 });
  const ids = r.steps.map(s => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  r.steps.forEach(s => assert.ok(s.durata.min > 0 && s.durata.max >= s.durata.target && s.durata.target >= s.durata.min, s.id));
});

test('piano a ritroso con la ricetta importata: fattibile e senza passi di notte', () => {
  ['uno11-uno12', 'due12', 'singolo'].forEach(p => {
    [18, 22, 26].forEach(t => {
      const r = Recipe.fromImported(sample('en'), p, { loafG: 900 });
      const res = Planner.plan({ steps: r.steps, target: SAT_13, tempC: t, quiet: QUIET });
      assert.ok(res.ok, p + ' ' + t + ' ' + JSON.stringify(res.avvisi));
      res.steps.forEach(st => assert.strictEqual(Planner.isBlocked(st.inizio, QUIET), false, p + ' ' + st.id + ' ' + fmt(st.inizio)));
      assert.ok(res.steps.some(st => st.grammi && st.grammi.length), 'i grammi arrivano nel piano');
    });
  });
});

test('"se parto ora" con la ricetta importata', () => {
  const r = Recipe.fromImported(sample('en'), 'uno11-uno12', { loafG: 900 });
  const start = new Date(2026, 10, 12, 21, 30).getTime();
  const res = Planner.earliest({ steps: r.steps, tempC: 22, quiet: QUIET, start });
  assert.ok(res.ok, JSON.stringify(res.avvisi));
  assert.ok(res.target > start);
  console.log('     (si parte ' + fmt(res.startAt || start) + ', pane pronto ' + fmt(res.target) + ')');
});

test('ricetta di AI (JSON) con brioche, senza pieghe', () => {
  const rec = RI.fromJson({ name: 'Brioche', ingredients: [
    { name: 'Flour', g: 500, type: 'flour' }, { name: 'Eggs', g: 150, type: 'other' }, { name: 'Milk', g: 100, type: 'water' },
    { name: 'Starter', g: 100, type: 'starter' }, { name: 'Butter', g: 200, type: 'other' }, { name: 'Sugar', g: 60, type: 'other' }, { name: 'Salt', g: 10, type: 'salt' }],
    steps: [{ phase: 'mix' }, { phase: 'bulk', minMin: 180, maxMin: 300 }, { phase: 'shape' }, { phase: 'chill', minMin: 480, maxMin: 720 }, { phase: 'proof', minMin: 60, maxMin: 120 }, { phase: 'bake', minMin: 35, tempC: 180 }] }).recipe;
  const r = Recipe.fromImported(rec, 'uno11-uno12', { loafG: 1000 });
  const res = Planner.plan({ steps: r.steps, target: SAT_13, tempC: 22, quiet: QUIET });
  assert.ok(res.ok, JSON.stringify(res.avvisi));
  assert.ok(!res.steps.some(s => s.id.indexOf('fold') >= 0));
  assert.ok(res.steps.some(s => s.id === 'r-proof'));
});

console.log('\n' + passed + ' test passati' + (process.exitCode ? ', con errori' : ''));
