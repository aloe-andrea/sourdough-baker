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

test('a slow yeast recipe (written bulk of 6 h or more) is not stretched further', () => {
  const r = lean({ steps: [{ phase: 'bulk', minMin: 720, maxMin: 1080 }, { phase: 'proof', minMin: 90, maxMin: 120 }, { phase: 'bake', minMin: 35, maxMin: 35 }] });
  const res = Convert.yeastToStarter(r);
  assert.deepStrictEqual([step(res.recipe, 'bulk').minMin, step(res.recipe, 'bulk').maxMin], [720, 1080]);
  assert.deepStrictEqual([step(res.recipe, 'proof').minMin, step(res.recipe, 'proof').maxMin], [270, 360]);
});

test('converted times never exceed 12 h for the bulk and 6 h for the proof', () => {
  const r = lean({ steps: [{ phase: 'bulk', minMin: 300, maxMin: 340 }, { phase: 'proof', minMin: 150, maxMin: 200 }, { phase: 'bake', minMin: 35, maxMin: 35 }] });
  const res = Convert.yeastToStarter(r);
  assert.deepStrictEqual([step(res.recipe, 'bulk').minMin, step(res.recipe, 'bulk').maxMin], [720, 720]);
  assert.deepStrictEqual([step(res.recipe, 'proof').minMin, step(res.recipe, 'proof').maxMin], [360, 360]);
});

test('enrichment words match whole words only (eggplant, boiled are not enrichment)', () => {
  const mk = (name) => { const r = lean(); r.ingredients.push({ name: name, g: 100, type: 'other' }); return Convert.yeastToStarter(r).info.factor; };
  assert.strictEqual(mk('Eggplant'), 3);
  assert.strictEqual(mk('Boiled potatoes'), 3);
  assert.strictEqual(mk('Olive oil'), 4);
  assert.strictEqual(mk('Egg yolks'), 4);
});

test('margarine, lard, ghee, shortening and tuorli count as enrichment', () => {
  ['Margarine', 'Lard', 'Ghee', 'Shortening', 'Tuorli', 'Strutto', 'Margarina'].forEach(n => {
    const r = lean(); r.ingredients.push({ name: n, g: 100, type: 'other' });
    assert.strictEqual(Convert.yeastToStarter(r).info.factor, 4, n);
  });
});

test('isYeastRecipe: yeast and no starter only', () => {
  assert.strictEqual(Convert.isYeastRecipe(lean()), true);
  const withStarter = lean(); withStarter.ingredients.push({ name: 'Starter', g: 80, type: 'starter' });
  assert.strictEqual(Convert.isYeastRecipe(withStarter), false);
  assert.strictEqual(Convert.isYeastRecipe({ name: 'x', ingredients: [] }), false);
  assert.strictEqual(Convert.isYeastRecipe({ name: 'x' }), false);
});

test('empty ingredient list and missing steps do not crash', () => {
  assert.strictEqual(Convert.yeastToStarter({ name: 'x', ingredients: [] }).converted, false);
  const r = lean(); delete r.steps;
  const res = Convert.yeastToStarter(r);
  assert.strictEqual(res.converted, true);
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


// ---------- starter to fresh yeast ----------
function sour(extra) {
  return Object.assign({
    name: 'Pane di campagna',
    ingredients: [
      { name: 'Flour', g: 500, type: 'flour' },
      { name: 'Water', g: 350, type: 'water' },
      { name: 'Starter', g: 100, type: 'starter' },
      { name: 'Salt', g: 10, type: 'salt' }
    ],
    steps: [
      { phase: 'bulk', minMin: 240, maxMin: 360 },
      { phase: 'chill', minMin: 480, maxMin: 720 },
      { phase: 'proof', minMin: 120, maxMin: 180 },
      { phase: 'bake', minMin: 40, maxMin: 40, tempC: 240 }
    ],
    bake: { tempC: 240, minutes: 40 }
  }, extra || {});
}

test('starterToYeast: 500 flour, 350 water, 100 starter gives 550 flour, 400 water, 6 yeast', () => {
  const res = Convert.starterToYeast(sour(), 'Lievito di birra');
  assert.strictEqual(res.converted, true);
  assert.strictEqual(res.reason, null);
  assert.strictEqual(g(res.recipe, 'starter'), 0);
  assert.strictEqual(g(res.recipe, 'flour'), 550);
  assert.strictEqual(g(res.recipe, 'water'), 400);
  assert.strictEqual(g(res.recipe, 'yeast'), 6);
  assert.strictEqual(g(res.recipe, 'salt'), 10);
  assert.strictEqual(res.recipe.ingredients.filter(i => i.type === 'yeast')[0].name, 'Lievito di birra');
  assert.strictEqual(res.info.yeastG, 6);
  assert.strictEqual(res.info.starterG, 100);
  assert.strictEqual(res.info.factor, 3);
});

test('starterToYeast: bulk and proof divided by 3, chill and bake untouched, floors apply', () => {
  const res = Convert.starterToYeast(sour());
  assert.deepStrictEqual([step(res.recipe, 'bulk').minMin, step(res.recipe, 'bulk').maxMin], [80, 120]);
  assert.deepStrictEqual([step(res.recipe, 'proof').minMin, step(res.recipe, 'proof').maxMin], [40, 60]);
  assert.deepStrictEqual([step(res.recipe, 'chill').minMin, step(res.recipe, 'chill').maxMin], [480, 720]);
  assert.strictEqual(step(res.recipe, 'bake').minMin, 40);
  const short = sour({ steps: [{ phase: 'bulk', minMin: 90, maxMin: 120 }, { phase: 'proof', minMin: 45, maxMin: 60 }, { phase: 'bake', minMin: 40, maxMin: 40 }] });
  const r2 = Convert.starterToYeast(short);
  assert.deepStrictEqual([step(r2.recipe, 'bulk').minMin, step(r2.recipe, 'bulk').maxMin], [60, 60]);
  assert.deepStrictEqual([step(r2.recipe, 'proof').minMin, step(r2.recipe, 'proof').maxMin], [30, 30]);
});

test('starterToYeast: enriched dough divides by 4', () => {
  const r = sour(); r.ingredients.push({ name: 'Butter', g: 80, type: 'other' });
  const res = Convert.starterToYeast(r);
  assert.strictEqual(res.info.factor, 4);
  assert.deepStrictEqual([step(res.recipe, 'bulk').minMin, step(res.recipe, 'bulk').maxMin], [60, 90]);
});

test('starterToYeast: two flours get the flour back proportionally', () => {
  const r = sour(); r.ingredients[0] = { name: 'White', g: 300, type: 'flour' }; r.ingredients.splice(1, 0, { name: 'Rye', g: 200, type: 'flour' });
  const res = Convert.starterToYeast(r);
  assert.deepStrictEqual(res.recipe.ingredients.filter(i => i.type === 'flour').map(i => i.g), [330, 220]);
});

test('starterToYeast: unchanged without a starter, with yeast already present, or with no flour', () => {
  assert.strictEqual(Convert.starterToYeast(lean()).reason, 'no-starter');
  const both = sour(); both.ingredients.push({ name: 'Yeast', g: 2, type: 'yeast' });
  assert.strictEqual(Convert.starterToYeast(both).reason, 'has-yeast');
  const noflour = sour(); noflour.ingredients = noflour.ingredients.filter(i => i.type !== 'flour');
  assert.strictEqual(Convert.starterToYeast(noflour).reason, 'too-little-flour');
  assert.strictEqual(Convert.starterToYeast({ name: 'x' }).converted, false);
});

test('starterToYeast: input not mutated, no feeds are planned afterwards', () => {
  const r = sour(); const snap = JSON.parse(JSON.stringify(r));
  const res = Convert.starterToYeast(r);
  assert.deepStrictEqual(r, snap);
  assert.strictEqual(Recipe.fromImported(res.recipe, 'uno11-uno12', {}).starterG, 0);
});

test('isStarterRecipe: starter and no yeast only', () => {
  assert.strictEqual(Convert.isStarterRecipe(sour()), true);
  assert.strictEqual(Convert.isStarterRecipe(lean()), false);
  assert.strictEqual(Convert.isStarterRecipe({ name: 'x' }), false);
});

console.log(passed + ' test passati');
