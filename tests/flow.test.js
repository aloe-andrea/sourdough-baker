'use strict';
const assert = require('assert');
let Flow;
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}
try { Flow = require('../flow.js'); } catch (e) { console.error('FAIL load flow.js: ' + e.message); process.exit(1); }

const at = (h, m) => new Date(2026, 10, 24, h, m).getTime();
const Q = { start: '23:00', end: '07:00' };
const recipes = [{ id: 'r1' }];
const step = (h, m, extra) => Object.assign({ nome: { en: 'Step', it: 'Passo' }, inizio: at(h, m), fatto: false }, extra || {});

test('isNight: 23:00 is night, 22:59 is not, 06:59 is night, 07:00 is not', () => {
  assert.strictEqual(Flow.isNight(at(23, 0), Q), true);
  assert.strictEqual(Flow.isNight(at(22, 59), Q), false);
  assert.strictEqual(Flow.isNight(at(6, 59), Q), true);
  assert.strictEqual(Flow.isNight(at(7, 0), Q), false);
  assert.strictEqual(Flow.isNight(at(0, 0), Q), true);
});
test('isNight: null quiet is never night, and a window that does not wrap works', () => {
  assert.strictEqual(Flow.isNight(at(3, 0), null), false);
  const day = { start: '13:00', end: '15:00' };
  assert.strictEqual(Flow.isNight(at(14, 0), day), true);
  assert.strictEqual(Flow.isNight(at(15, 0), day), false);
});
test('startView: started and plan ok opens now', () => {
  assert.strictEqual(Flow.startView({ started: true, recipes, recipeId: 'r1' }, true), 'now');
});
test('startView: started but plan not ok opens import', () => {
  assert.strictEqual(Flow.startView({ started: true, recipes, recipeId: 'r1' }, false), 'import');
});
test('startView: not started with a saved recipe still opens import, where the last recipe is offered', () => {
  assert.strictEqual(Flow.startView({ started: false, recipes, recipeId: 'r1' }, true), 'import');
});
test('startView: no recipe, or recipeId pointing nowhere, opens import', () => {
  assert.strictEqual(Flow.startView({ started: true, recipes: [], recipeId: null }, true), 'import');
  assert.strictEqual(Flow.startView({ started: false, recipes, recipeId: 'zzz' }, true), 'import');
});
test('migrateView: new view names pass through', () => {
  ['import', 'card', 'review', 'recipes', 'home', 'advanced', 'confirm', 'ai'].forEach(v => assert.strictEqual(Flow.migrateView(v, { recipes, recipeId: 'r1' }, false), v));
});
test('migrateView: now, plan, ingredients need a started plan, otherwise home', () => {
  const on = { started: true, recipes, recipeId: 'r1' }, off = { started: false, recipes, recipeId: 'r1' };
  ['now', 'plan', 'ingredients'].forEach(v => {
    assert.strictEqual(Flow.migrateView(v, on, true), v);
    assert.strictEqual(Flow.migrateView(v, off, true), 'home');
    assert.strictEqual(Flow.migrateView(v, on, false), 'home');
  });
});
test('migrateView: intro, again, unknown and undefined map to home or import by recipe presence', () => {
  ['intro', 'again', 'bogus', undefined, null, ''].forEach(v => {
    assert.strictEqual(Flow.migrateView(v, { recipes, recipeId: 'r1' }, false), 'home');
    assert.strictEqual(Flow.migrateView(v, { recipes: [], recipeId: null }, false), 'import');
  });
});
test('nightSteps: only steps in the window, skipping done ones, in order', () => {
  const plan = { steps: [step(21, 30), step(23, 0), step(1, 30), step(2, 0, { fatto: true }), step(6, 59), step(7, 0)] };
  const n = Flow.nightSteps(plan, Q);
  assert.deepStrictEqual(n.map(x => x.at), [at(23, 0), at(1, 30), at(6, 59)]);
  assert.deepStrictEqual(n[0].name, { en: 'Step', it: 'Passo' });
});
test('nightSteps: none in the window returns an empty list', () => {
  assert.deepStrictEqual(Flow.nightSteps({ steps: [step(8, 0), step(14, 0), step(22, 59)] }, Q), []);
  assert.deepStrictEqual(Flow.nightSteps({ steps: [] }, Q), []);
});
test('summary: first step not done, ready time, notices and night steps', () => {
  const plan = { target: at(19, 0), avvisi: [{ codice: 'target-spostato' }], steps: [step(21, 30, { fatto: true }), step(22, 45, { nome: { en: 'Feed 1:2', it: 'Rinfresco 1:2' } }), step(1, 30)] };
  const s = Flow.summary(plan, { quiet: Q });
  assert.strictEqual(s.firstAt, at(22, 45));
  assert.deepStrictEqual(s.firstName, { en: 'Feed 1:2', it: 'Rinfresco 1:2' });
  assert.strictEqual(s.readyAt, at(19, 0));
  assert.deepStrictEqual(s.notices, [{ codice: 'target-spostato' }]);
  assert.strictEqual(s.nightSteps.length, 1);
});
test('summary: a plan that is not ok gives nulls and no crash', () => {
  const s = Flow.summary({ ok: false, steps: [], avvisi: [] }, { quiet: Q });
  assert.strictEqual(s.firstAt, null);
  assert.strictEqual(s.readyAt, null);
  assert.deepStrictEqual(s.nightSteps, []);
});
console.log(passed + ' test passati');
