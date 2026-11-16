'use strict';
const assert = require('assert');
const Calc = require('../calc.js');
const RI = require('../recipeimport.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const g = (r, type) => r.ingredients.filter(i => i.type === type).reduce((a, i) => a + i.g, 0);
const phases = r => r.steps.map(s => s.phase);

const YEAST_IT = [
  'INGREDIENTI', '250', 'Calorie per pezzo', 'Energia', 'Kcal', '250', 'Carboidrati', 'g', '30', '',
  'Ingredienti per 12 panini dolci', 'Farina forte 500 g', 'Zucchero 80 g', 'Lievito di birra fresco 8 g', 'Acqua 150 g',
  'Uova (circa 2) 100 g', 'Sale 6 g', 'Burro morbido 80 g', 'Scorza di arancia 1', 'Preparazione', 'Come preparare i panini dolci',
  'Panini - 1', 'Panini - 2',
  'Impastate farina, zucchero, lievito, acqua e uova. Unite il sale e poi il burro poco alla volta. Date un paio di pieghe senza fretta.',
  "Lasciate lievitare l'impasto in una ciotola coperta per 2 ore e mezza. Formate 12 palline.",
  "Lasciate lievitare ancora per un'ora. Cuocete in forno preriscaldato a 190° per 18 minuti. Lasciate intiepidire."
].join('\n');

test('durations: intervalli, valori singoli, ore e minuti insieme', () => {
  assert.deepStrictEqual(RI.durations('bulk for 4-6 hours'), [{ min: 240, max: 360 }]);
  assert.deepStrictEqual(RI.durations('rest 30 minutes'), [{ min: 30, max: 30 }]);
  assert.deepStrictEqual(RI.durations('wait 1 hour 30 minutes'), [{ min: 90, max: 90 }]);
  assert.deepStrictEqual(RI.durations('per 4 a 6 ore'), [{ min: 240, max: 360 }]);
  assert.deepStrictEqual(RI.durations('1,5 ore'), [{ min: 90, max: 90 }]);
});

test('foldsOf: "3 folds every 30 minutes" e varianti', () => {
  assert.deepStrictEqual(RI.foldsOf('with 3 stretch and folds every 30 minutes'), { count: 3, everyMin: 30, text: '3 stretch and folds every 30 minutes' });
  const f = RI.foldsOf('do folds every 30 min for 2 hours');
  assert.strictEqual(f.count, 4); assert.strictEqual(f.everyMin, 30);
  assert.strictEqual(RI.foldsOf('con tre pieghe ogni 45 minuti').count, 3);
});

test('testo inglese: ingredienti e passi riconosciuti', () => {
  const { recipe, warnings } = RI.parseText(RI.SAMPLE.en);
  assert.strictEqual(recipe.name, 'Country loaf');
  assert.strictEqual(g(recipe, 'flour'), 500);
  assert.strictEqual(g(recipe, 'water'), 375);
  assert.strictEqual(g(recipe, 'starter'), 100);
  assert.strictEqual(g(recipe, 'salt'), 10);
  assert.deepStrictEqual(phases(recipe), ['autolyse', 'mix', 'fold', 'bulk', 'preshape', 'chill', 'preheat', 'bake', 'cool']);
  assert.strictEqual(warnings.length, 0, JSON.stringify(warnings));
  const bulk = recipe.steps.find(s => s.phase === 'bulk');
  assert.deepStrictEqual([bulk.minMin, bulk.maxMin], [240, 360]);
  const bake = recipe.steps.find(s => s.phase === 'bake');
  assert.strictEqual(bake.minMin, 45);
  assert.strictEqual(recipe.bake.tempC, 250);
  const chill = recipe.steps.find(s => s.phase === 'chill');
  assert.deepStrictEqual([chill.minMin, chill.maxMin], [480, 720]);
});

test('testo italiano: stessa ricetta, stessi risultati', () => {
  const en = RI.parseText(RI.SAMPLE.en).recipe, it = RI.parseText(RI.SAMPLE.it).recipe;
  assert.strictEqual(it.name, 'Pane di campagna');
  assert.strictEqual(g(it, 'flour'), 500);
  assert.strictEqual(g(it, 'starter'), 100);
  assert.deepStrictEqual(phases(it), phases(en));
  assert.strictEqual(it.bake.tempC, 250);
});

test('ricetta con lievito di birra, quantita in fondo alla riga, testo di un sito italiano', () => {
  const { recipe, warnings } = RI.parseText(YEAST_IT);
  assert.strictEqual(recipe.name, 'Panini dolci');
  assert.strictEqual(g(recipe, 'flour'), 500);
  assert.strictEqual(g(recipe, 'yeast'), 8);
  assert.strictEqual(g(recipe, 'starter'), 0);
  assert.strictEqual(g(recipe, 'water'), 150);
  assert.strictEqual(g(recipe, 'salt'), 6);
  assert.ok(!recipe.ingredients.some(i => /calorie|energia|carboidrati/i.test(i.name)), 'nessun valore nutrizionale tra gli ingredienti');
  assert.ok(warnings.some(w => w.code === 'unit-not-converted' && /arancia/i.test(w.detail)));
  assert.ok(!warnings.some(w => w.code === 'no-starter'), 'il lievito di birra basta');
});

test('piu frasi in un paragrafo: ore e mezza, un ora, gradi senza lettera', () => {
  const { recipe } = RI.parseText(YEAST_IT);
  assert.deepStrictEqual(phases(recipe), ['mix', 'bulk', 'proof', 'bake', 'cool']);
  const bulk = recipe.steps.find(s => s.phase === 'bulk'), proof = recipe.steps.find(s => s.phase === 'proof'), bake = recipe.steps.find(s => s.phase === 'bake');
  assert.strictEqual(bulk.minMin, 150);
  assert.strictEqual(proof.minMin, 60);
  assert.strictEqual(bake.minMin, 18);
  assert.strictEqual(recipe.bake.tempC, 190);
  assert.ok(!phases(recipe).includes('fold'), 'un paio di pieghe senza intervallo non sono un passo');
  assert.deepStrictEqual(RI.assemble(recipe).map(a => a.phase), ['mix', 'shape', 'preheat', 'bake', 'cool']);
});

test('il lievito di birra non e il lievito madre; il lievito madre resta tale', () => {
  const r = RI.parseText('500 g flour\n8 g fresh yeast\n100 g sourdough starter\n100 g lievito madre').recipe;
  assert.deepStrictEqual(r.ingredients.map(i => i.type), ['flour', 'yeast', 'starter', 'starter']);
});

test('unita imperiali e Fahrenheit', () => {
  const t = 'Ingredients\n1 lb bread flour\n12 oz water\n3.5 oz active starter\n2 tsp salt\nMethod\nBake at 450°F for 40 minutes.';
  const { recipe, warnings } = RI.parseText(t);
  assert.ok(Math.abs(g(recipe, 'flour') - 453.6) < 0.2);
  assert.ok(Math.abs(g(recipe, 'water') - 340.2) < 0.2);
  assert.strictEqual(recipe.bake.tempC, 232);
  assert.ok(warnings.some(w => w.code === 'unit-not-converted'), 'il sale a cucchiaini va segnalato');
});

test('formato "Nome: quantita" e uova senza unita', () => {
  const t = 'Flour: 500 g\nWater: 250 g\nStarter: 100 g\nSalt: 10 g\n3 eggs\n120 g butter\n1. Mix everything.\n2. Bake for 35 minutes at 180°C.';
  const { recipe, warnings } = RI.parseText(t);
  assert.strictEqual(g(recipe, 'flour'), 500);
  assert.strictEqual(g(recipe, 'starter'), 100);
  assert.strictEqual(recipe.ingredients.find(i => /eggs/i.test(i.name)).g, 150);
  assert.ok(warnings.some(w => w.code === 'egg-weight'));
  assert.strictEqual(recipe.ingredients.find(i => /butter/i.test(i.name)).g, 120);
});

test('un passo numerato non diventa un ingrediente', () => {
  const { recipe } = RI.parseText('500 g flour\n1. Mix the flour with the water\n2. Rest 30 minutes');
  assert.strictEqual(recipe.ingredients.length, 1);
});

test('avvisi: manca lievito, sale o cottura', () => {
  const { warnings } = RI.parseText('500 g flour\n300 g water');
  const codes = warnings.map(w => w.code);
  assert.ok(codes.includes('no-starter') && codes.includes('no-salt') && codes.includes('no-bake'));
});

test('JSON dell AI: valido, con blocco di codice e testo intorno', () => {
  const j = 'Here you go:\n```json\n{"name":"Test","ingredients":[{"name":"Flour","g":500,"type":"flour"},{"name":"Water","g":350,"type":"water"},{"name":"Starter","g":100,"type":"starter"},{"name":"Salt","g":10,"type":"salt"}],"steps":[{"phase":"mix"},{"phase":"bulk","minMin":240,"maxMin":360},{"phase":"shape"},{"phase":"bake","minMin":40,"tempC":240}]}\n```';
  const r = RI.fromJson(j);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(g(r.recipe, 'flour'), 500);
  assert.strictEqual(r.recipe.bake.tempC, 240);
});

test('JSON dell AI: errori chiari', () => {
  assert.strictEqual(RI.fromJson('not json at all').errors[0].code, 'json-missing');
  assert.strictEqual(RI.fromJson('{"name": "x", }').errors[0].code, 'json-invalid');
  assert.strictEqual(RI.fromJson('{"name":"x","ingredients":[]}').errors[0].code, 'no-ingredients');
  assert.strictEqual(RI.fromJson('{"ingredients":[{"name":"Flour","g":"lots"}]}').errors[0].code, 'bad-grams');
});

test('JSON: fase sconosciuta ignorata con avviso', () => {
  const r = RI.fromJson({ ingredients: [{ name: 'Flour', g: 500, type: 'flour' }], steps: [{ phase: 'dance' }, { phase: 'bake', minMin: 40 }] });
  assert.ok(r.warnings.some(w => w.code === 'unknown-phase'));
  assert.deepStrictEqual(phases(r.recipe), ['bake']);
});

test('assemble: pieghe dentro la fermentazione, catena completa con ricetta d esempio', () => {
  const rec = RI.parseText(RI.SAMPLE.en).recipe;
  const a = RI.assemble(rec);
  assert.deepStrictEqual(a.map(x => x.phase), ['autolyse', 'mix', 'fold', 'fold', 'fold', 'preshape', 'shape', 'preheat', 'bake', 'cool']);
  // mix waits for the first fold; the last fold waits for the rest of the bulk (4-6 h minus 3 x 30 min)
  assert.deepStrictEqual([a[1].min, a[1].max], [30, 45]);
  assert.deepStrictEqual([a[4].min, a[4].max], [150, 270]);
  // shaping waits for the cold rest
  assert.deepStrictEqual([a[6].min, a[6].max], [480, 720]);
  assert.strictEqual(a[8].tempC, 250);
});

test('assemble: senza pieghe il mix aspetta tutta la fermentazione; senza dati si usano i valori standard', () => {
  const rec = RI.fromJson({ ingredients: [{ name: 'Flour', g: 500, type: 'flour' }], steps: [{ phase: 'mix' }, { phase: 'bulk', minMin: 180, maxMin: 300 }, { phase: 'bake', minMin: 35 }] }).recipe;
  const a = RI.assemble(rec);
  assert.deepStrictEqual(a.map(x => x.phase), ['mix', 'shape', 'preheat', 'bake', 'cool']);
  assert.deepStrictEqual([a[0].min, a[0].max], [180, 300]);
  assert.strictEqual(a[0].est, false);
  assert.strictEqual(a[1].est, true);   // shape: no time given
  assert.strictEqual(a[2].est, true);   // preheat: default
});

test('assemble: durata singola diventa un intervallo, valori mai nulli', () => {
  const rec = RI.parseText('500 g flour\nBulk ferment 4 hours.\nBake 40 minutes at 230°C.').recipe;
  const a = RI.assemble(rec);
  const mix = a[0];
  assert.ok(mix.min < mix.max && mix.min > 0);
  a.forEach(x => assert.ok(x.min > 0 && x.max >= x.min && x.target >= x.min && x.target <= x.max, x.phase));
});

test('prompt per l AI in inglese e italiano contiene lo schema', () => {
  ['en', 'it'].forEach(l => { const p = RI.promptFor(l); assert.ok(p.includes('"phase"') && p.includes('"ingredients"') && p.includes('JSON')); });
});

test('fromPage: ricetta da blocco JSON-LD (Giallozafferano)', () => {
  const r = RI.fromPage({ ok: true, source: 'jsonld', name: 'Brioche', ingredients: ['Farina Manitoba 500 g', 'Zucchero 100 g', 'Uova (medie) 150 g', 'Burro 100 g', 'Latte intero 100 g', 'Lievito di birra fresco 10 g', 'Sale fino 8 g'],
    instructions: ['Impastate tutto per 15 minuti.', 'Lasciate lievitare per 2 ore.', 'Cuocete a 180° per 20 minuti.'] });
  assert.ok(r.recipe && r.recipe.name === 'Brioche');
  assert.ok(r.recipe.ingredients.some(i => i.type === 'flour' && i.g === 500));
  assert.ok(r.recipe.steps.length >= 2);
});
test('fromPage: solo testo, errori', () => {
  const ok = RI.fromPage({ ok: true, source: 'text', text: 'Ingredients\n500 g flour\n350 g water\n100 g starter\n10 g salt\nMethod\nMix. Bake 40 minutes at 230°C.' });
  assert.ok(ok.recipe.ingredients.length >= 4);
  assert.strictEqual(RI.fromPage({ ok: true, source: 'text', text: 'Hello world' }).errors[0].code, 'no-recipe-on-page');
  assert.strictEqual(RI.fromPage({ ok: false, error: 'http-404' }).errors[0].code, 'link-failed');
  assert.strictEqual(RI.fromPage(null).errors[0].code, 'link-failed');
});

console.log('\n' + passed + ' test passati' + (process.exitCode ? ', con errori' : ''));
