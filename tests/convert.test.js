'use strict';
const assert = require('assert');
const Convert = require('../convert.js');
const Recipe = require('../recipe.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}

function lean(extra) {
  return Object.assign({
    name: 'Pizza',
    ingredients: [
      { name: 'Flour', g: 500, type: 'flour' },
      { name: 'Water', g: 325, type: 'water' },
      { name: 'Fresh yeast', g: 3, type: 'yeast' },
      { name: 'Salt', g: 10, type: 'salt' }
    ],
    steps: [
      { phase: 'bulk', minMin: 60, maxMin: 90 },
      { phase: 'proof', minMin: 30, maxMin: 45 },
      { phase: 'chill', minMin: 480, maxMin: 600 },
      { phase: 'bake', minMin: 35, maxMin: 35, tempC: 230 }
    ],
    bake: { tempC: 230, minutes: 35 }
  }, extra || {});
}
const g = (r, type) => r.ingredients.filter(i => i.type === type).reduce((a, i) => a + i.g, 0);
const step = (r, phase) => r.steps.filter(s => s.phase === phase)[0];

test('lean: 500 flour, 325 water, 3 yeast, 10 salt', () => {
  const res = Convert.yeastToStarter(lean(), 'Pasta madre');
  assert.strictEqual(res.converted, true);
  assert.strictEqual(res.reason, null);
  assert.strictEqual(g(res.recipe, 'starter'), 100);
  assert.strictEqual(g(res.recipe, 'flour'), 450);
  assert.strictEqual(g(res.recipe, 'water'), 275);
  assert.strictEqual(g(res.recipe, 'salt'), 10);
  assert.strictEqual(g(res.recipe, 'yeast'), 0);
  assert.strictEqual(res.recipe.ingredients.filter(i => i.type === 'starter')[0].name, 'Pasta madre');
  assert.strictEqual(res.info.factor, 3);
  assert.strictEqual(res.info.starterG, 100);
  assert.strictEqual(res.info.yeastG, 3);
  assert.strictEqual(res.info.enriched, false);
});

test('lean: times of bulk and proof are tripled, others untouched', () => {
  const r = lean();
  r.steps.push({ phase: 'fold', count: 3, everyMin: 30 });
  const res = Convert.yeastToStarter(r);
  assert.deepStrictEqual([step(res.recipe, 'bulk').minMin, step(res.recipe, 'bulk').maxMin], [180, 270]);
  assert.deepStrictEqual([step(res.recipe, 'proof').minMin, step(res.recipe, 'proof').maxMin], [90, 135]);
  assert.deepStrictEqual([step(res.recipe, 'chill').minMin, step(res.recipe, 'chill').maxMin], [480, 600]);
  assert.strictEqual(step(res.recipe, 'bake').minMin, 35);
  assert.strictEqual(step(res.recipe, 'fold').everyMin, 30);
});

test('a bulk step without written time stays without it', () => {
  const r = lean({ steps: [{ phase: 'bulk' }, { phase: 'bake', minMin: 35, maxMin: 35 }] });
  const res = Convert.yeastToStarter(r);
  assert.strictEqual(res.converted, true);
  assert.strictEqual(step(res.recipe, 'bulk').minMin, undefined);
});

test('enriched: butter, eggs and sugar over 12% of flour give factor 4', () => {
  const r = lean();
  r.ingredients.push({ name: 'Butter', g: 20, type: 'other' }, { name: 'Eggs', g: 30, type: 'other' }, { name: 'Sugar', g: 10, type: 'other' });
  const res = Convert.yeastToStarter(r);
  assert.strictEqual(res.info.factor, 4);
  assert.strictEqual(res.info.enriched, true);
  assert.strictEqual(step(res.recipe, 'bulk').minMin, 240);
});

test('just under the threshold stays lean, at the threshold is enriched', () => {
  const mk = (extraG) => { const r = lean(); r.ingredients.push({ name: 'Burro', g: extraG, type: 'other' }); return r; };
  assert.strictEqual(Convert.yeastToStarter(mk(59)).info.factor, 3);
  assert.strictEqual(Convert.yeastToStarter(mk(60)).info.factor, 4);
});

test('Italian names count as enrichment (uova, zucchero, olio)', () => {
  const r = lean();
  r.ingredients.push({ name: 'Uova', g: 40, type: 'other' }, { name: 'Zucchero', g: 30, type: 'other' }, { name: 'Olio', g: 20, type: 'other' });
  assert.strictEqual(Convert.yeastToStarter(r).info.factor, 4);
});

test('has starter: unchanged, also when yeast is present too', () => {
  const r = lean();
  r.ingredients.push({ name: 'Starter', g: 80, type: 'starter' });
  const res = Convert.yeastToStarter(r);
  assert.strictEqual(res.converted, false);
  assert.strictEqual(res.reason, 'has-starter');
  assert.strictEqual(res.info, null);
  assert.deepStrictEqual(res.recipe, r);
});

test('no yeast, or yeast 0 g: unchanged', () => {
  const none = lean(); none.ingredients = none.ingredients.filter(i => i.type !== 'yeast');
  assert.strictEqual(Convert.yeastToStarter(none).reason, 'no-yeast');
  const zero = lean(); zero.ingredients.forEach(i => { if (i.type === 'yeast') i.g = 0; });
  const res = Convert.yeastToStarter(zero);
  assert.strictEqual(res.converted, false);
  assert.strictEqual(res.reason, 'no-yeast');
  assert.strictEqual(Convert.yeastToStarter({ name: 'x', ingredients: [], steps: [] }).converted, false);
});

test('two flours: the reduction is proportional', () => {
  const r = lean();
  r.ingredients[0] = { name: 'White flour', g: 300, type: 'flour' };
  r.ingredients.splice(1, 0, { name: 'Whole wheat flour', g: 200, type: 'flour' });
  const res = Convert.yeastToStarter(r);
  const flours = res.recipe.ingredients.filter(i => i.type === 'flour').map(i => i.g);
  assert.deepStrictEqual(flours, [270, 180]);
  assert.strictEqual(g(res.recipe, 'starter'), 100);
});

test('too little water: unchanged, with or without a water ingredient', () => {
  const low = lean(); low.ingredients[1].g = 40;
  assert.strictEqual(Convert.yeastToStarter(low).reason, 'too-little-water');
  const none = lean(); none.ingredients = none.ingredients.filter(i => i.type !== 'water');
  const res = Convert.yeastToStarter(none);
  assert.strictEqual(res.converted, false);
  assert.strictEqual(res.reason, 'too-little-water');
});

test('too little flour: unchanged', () => {
  const r = lean({ ingredients: [
    { name: 'Water', g: 325, type: 'water' }, { name: 'Yeast', g: 3, type: 'yeast' }, { name: 'Salt', g: 10, type: 'salt' }] });
  assert.strictEqual(Convert.yeastToStarter(r).reason, 'too-little-flour');
});

test('input is not mutated', () => {
  const r = lean();
  const snap = JSON.parse(JSON.stringify(r));
  Convert.yeastToStarter(r);
  assert.deepStrictEqual(r, snap);
});

test('fromImported plans feeds for the converted recipe, not for the original', () => {
  const res = Convert.yeastToStarter(lean());
  const built = Recipe.fromImported(res.recipe, 'uno11-uno12', {});
  assert.strictEqual(built.starterG, 100);
  assert.strictEqual(built.steps[0].id, 'rinfresco-1-1');
  assert.strictEqual(Recipe.fromImported(lean(), 'uno11-uno12', {}).starterG, 0);
});

console.log(passed + ' test passati');
