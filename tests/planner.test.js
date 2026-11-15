'use strict';
const assert = require('assert');
const Planner = require('../planner.js');
const Recipe = require('../recipe.js');

const MIN = 60000;
const QUIET = { start: '23:00', end: '07:00' };
// Sabato 14 novembre 2026, 13:00 (ora locale)
const SAT_13 = new Date(2026, 10, 14, 13, 0).getTime();

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}
function fmt(ms) { return new Date(ms).toLocaleString('it-IT'); }

function checkChain(res) {
  const planned = res.steps.filter(s => !s.fatto);
  for (let i = 0; i < planned.length - 1; i++) {
    assert.strictEqual(planned[i].fine, planned[i + 1].inizio, 'catena spezzata dopo ' + planned[i].id);
  }
  assert.strictEqual(planned[planned.length - 1].fine, res.target);
}

test('isBlocked: finestra a cavallo della mezzanotte', () => {
  const at = (h, m) => new Date(2026, 10, 14, h, m).getTime();
  assert.strictEqual(Planner.isBlocked(at(3, 0), QUIET), true);
  assert.strictEqual(Planner.isBlocked(at(23, 30), QUIET), true);
  assert.strictEqual(Planner.isBlocked(at(23, 0), QUIET), false);
  assert.strictEqual(Planner.isBlocked(at(7, 0), QUIET), false);
  assert.strictEqual(Planner.isBlocked(at(12, 0), QUIET), false);
  assert.strictEqual(Planner.isBlocked(at(3, 0), null), false);
});

test('allowedIntervals: esclude la notte, tiene gli estremi', () => {
  const from = new Date(2026, 10, 13, 20, 0).getTime();
  const to = new Date(2026, 10, 14, 10, 0).getTime();
  const iv = Planner.allowedIntervals(from, to, QUIET);
  assert.strictEqual(iv.length, 2);
  assert.strictEqual(iv[0][1], new Date(2026, 10, 13, 23, 0).getTime());
  assert.strictEqual(iv[1][0], new Date(2026, 10, 14, 7, 0).getTime());
});

test('tempFactor: 24 C = 1, piu freddo piu lento, piu caldo piu veloce', () => {
  assert.strictEqual(Planner.tempFactor(24), 1);
  assert.ok(Planner.tempFactor(17) > 1.9 && Planner.tempFactor(17) < 2.1);
  assert.ok(Planner.tempFactor(28) < 1);
});

test('senza finestra notturna: usa le durate target e chiude la catena', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: null });
  assert.ok(res.ok);
  assert.strictEqual(res.spostamentoMin, 0);
  checkChain(res);
  const last = res.steps[res.steps.length - 1];
  assert.strictEqual(last.inizio, SAT_13 - 60 * MIN);
  res.steps.forEach((s, i) => {
    const st = steps[i];
    assert.ok(s.durataMin >= Math.floor(st.durata.min) - 8 && s.durataMin <= st.durata.max, s.id + ' fuori range: ' + s.durataMin);
  });
});

test('con finestra notturna: nessun passo inizia di notte e il target resta', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET });
  assert.ok(res.ok, JSON.stringify(res.avvisi));
  assert.strictEqual(res.spostamentoMin, 0);
  checkChain(res);
  res.steps.forEach(s => assert.strictEqual(Planner.isBlocked(s.inizio, QUIET), false, s.id + ' alle ' + fmt(s.inizio)));
});

test('tutti i quarti dora: ogni inizio cade su :00 :15 :30 :45', () => {
  ['uno11-uno12', 'due12', 'singolo'].forEach(p => {
    [18, 22, 24, 27].forEach(t => {
      const res = Planner.plan({ steps: Recipe.buildRecipe(p), target: SAT_13, tempC: t, quiet: QUIET });
      assert.ok(res.ok, p + ' ' + t);
      res.steps.forEach(s => {
        [s.inizio, s.dalle, s.entro].forEach(x => assert.strictEqual(new Date(x).getMinutes() % 15, 0, p + ' ' + t + ' ' + s.id));
      });
    });
  });
});

test('con finestra notturna anche i preset 2x1:2 e singolo sono fattibili', () => {
  ['due12', 'singolo'].forEach(p => {
    const res = Planner.plan({ steps: Recipe.buildRecipe(p), target: SAT_13, tempC: 22, quiet: QUIET });
    assert.ok(res.ok, p);
    res.steps.forEach(s => assert.strictEqual(Planner.isBlocked(s.inizio, QUIET), false, p + ' ' + s.id));
  });
});

test('target impossibile per la notte: propone l\'orario piu vicino', () => {
  const one = [{ id: 'unico', nome: 'Unico', tipo: 'attesa', durata: { min: 600, target: 600, max: 600 }, sensibileTemperatura: false }];
  const res = Planner.plan({ steps: one, target: SAT_13, tempC: 24, quiet: QUIET });
  assert.ok(res.ok);
  assert.strictEqual(Math.abs(res.spostamentoMin), 240);
  assert.ok(res.avvisi.some(a => a.codice === 'target-spostato'));
  assert.strictEqual(Planner.isBlocked(res.steps[0].inizio, QUIET), false);
});

test('ora attuale troppo vicina: sposta il target in avanti', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const now = SAT_13 - 10 * 60 * MIN;
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET, now });
  assert.ok(res.ok);
  assert.ok(res.spostamentoMin > 0);
  assert.ok(res.steps[0].inizio >= now);
  checkChain(res);
});

test('temperatura: 18 C piu lungo di 24 C piu lungo di 28 C', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const span = t => { const r = Planner.plan({ steps, target: SAT_13, tempC: t, quiet: null }); return SAT_13 - r.steps[0].inizio; };
  assert.ok(span(18) > span(24));
  assert.ok(span(24) > span(28));
});

test('ricalcolo live: rinfresco 1:1 iniziato con 30 minuti di ritardo, il piano si adatta', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const first = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET });
  const planned = first.steps[0].inizio;
  const actual = planned + 30 * MIN;
  const rk = Planner.range(steps[0], 24);
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET, now: actual, done: { [steps[0].id]: actual } });
  assert.ok(res.ok, JSON.stringify(res.avvisi));
  assert.strictEqual(res.steps[0].fatto, true);
  assert.strictEqual(res.steps[0].inizio, actual);
  assert.ok(res.steps[1].inizio >= actual + rk.lo * MIN - 8 * MIN, 'secondo rinfresco troppo presto');
  assert.ok(res.steps[1].inizio <= actual + rk.hi * MIN + MIN, 'secondo rinfresco troppo tardi');
  res.steps.filter(s => !s.fatto).forEach(s => assert.strictEqual(Planner.isBlocked(s.inizio, QUIET), false, s.id));
  checkChain(res);
});

test('ricalcolo live: con il secondo rinfresco piu corto un ritardo di 90 minuti si assorbe', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const first = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET });
  const actual = first.steps[0].inizio + 90 * MIN;
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET, now: actual, done: { [steps[0].id]: actual } });
  assert.ok(res.ok);
  assert.strictEqual(res.spostamentoMin, 0);
});

test('ricalcolo live: un ritardo di 3 ore rende il piano impossibile e lo dice senza inventare', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const first = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET });
  const actual = first.steps[0].inizio + 180 * MIN;
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET, now: actual, done: { [steps[0].id]: actual } });
  assert.strictEqual(res.ok, false);
  assert.ok(res.avvisi.some(a => a.codice === 'nessun-orario'));
});

test('il secondo rinfresco dura circa la meta del primo', () => {
  ['uno11-uno12', 'due12'].forEach(p => {
    const [a, b] = Recipe.buildRecipe(p);
    const ratio = b.durata.target / a.durata.target;
    assert.ok(ratio >= 0.45 && ratio <= 0.55, p + ' rapporto ' + ratio);
  });
});

test('ricalcolo live: passo gia oltre la durata massima genera un avviso, non un errore', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const now = new Date(2026, 10, 13, 20, 0).getTime();
  const started = now - 10 * 60 * MIN;
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET, now, done: { [steps[0].id]: started } });
  assert.ok(res.ok);
  assert.ok(res.avvisi.some(a => a.codice === 'passo-oltre-massimo'));
});

test('orario limite: ogni passo ha "dalle" ed "entro" coerenti, mai di notte', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const t0 = Date.now();
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET });
  console.log('     (calcolo con finestre: ' + (Date.now() - t0) + ' ms)');
  res.steps.forEach(s => {
    assert.ok(s.dalle <= s.inizio && s.inizio <= s.entro, s.id + ' finestra incoerente');
    assert.strictEqual(Planner.isBlocked(s.entro, QUIET), false, s.id + ' entro di notte');
    assert.strictEqual(Planner.isBlocked(s.dalle, QUIET), false, s.id + ' dalle di notte');
  });
  const last = res.steps[res.steps.length - 1];
  assert.ok(last.entro <= SAT_13 - 45 * MIN, 'il raffreddamento non puo iniziare dopo target-45min');
  assert.ok(res.steps.some(s => s.entro > s.inizio), 'almeno un passo deve avere margine');
  res.steps.forEach(s => console.log('     ' + s.id.padEnd(16) + fmt(s.dalle) + '  ->  ' + fmt(s.inizio) + '  ->  entro ' + fmt(s.entro)));
});

test('tutti i passi fatti: nessun errore', () => {
  const steps = Recipe.buildRecipe('singolo');
  const done = {};
  steps.forEach((s, i) => { done[s.id] = SAT_13 - (steps.length - i) * 60 * MIN; });
  const res = Planner.plan({ steps, target: SAT_13, tempC: 24, quiet: QUIET, done });
  assert.ok(res.ok);
  assert.ok(res.steps.every(s => s.fatto));
});

test('parto ora alle 10: con la notte vietata il rinfresco non puo partire subito, propone un orario migliore', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const start = new Date(2026, 10, 12, 10, 0).getTime();
  const res = Planner.earliest({ steps, tempC: 24, quiet: QUIET, start });
  assert.ok(res.ok, JSON.stringify(res.avvisi));
  assert.strictEqual(res.delayed, true);
  assert.ok(res.startAt > start && res.target > res.startAt);
  assert.strictEqual(res.steps[0].inizio, res.startAt);
  res.steps.filter(s => !s.fatto).forEach(s => assert.strictEqual(Planner.isBlocked(s.inizio, QUIET), false, s.id + ' ' + fmt(s.inizio)));
  console.log('     (alle ' + fmt(start) + ' non si puo partire: meglio ' + fmt(res.startAt) + ', pane pronto ' + fmt(res.target) + ')');
});

test('parto ora di sera con casa a 20 C: si parte subito e il pane e pronto a un orario preciso', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const start = new Date(2026, 10, 12, 22, 0).getTime();
  const res = Planner.earliest({ steps, tempC: 20, quiet: QUIET, start });
  assert.ok(res.ok);
  assert.strictEqual(res.delayed, false);
  assert.strictEqual(res.steps[0].inizio, start);
  res.steps.filter(s => !s.fatto).forEach(s => assert.strictEqual(Planner.isBlocked(s.inizio, QUIET), false, s.id));
  console.log('     (si parte ' + fmt(start) + ', pane pronto ' + fmt(res.target) + ')');
});

test('parto ora: e davvero il primo orario, 15 minuti prima non e fattibile', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const start = new Date(2026, 10, 12, 22, 0).getTime();
  const res = Planner.earliest({ steps, tempC: 20, quiet: QUIET, start });
  const done = { [steps[0].id]: start };
  const earlier = Planner.plan({ steps, target: res.target - 15 * MIN, tempC: 20, quiet: QUIET, now: start, done, exact: true });
  assert.strictEqual(earlier.ok, false);
});

test('parto ora senza finestra notturna: parte subito e il pane e pronto prima che con la finestra', () => {
  const steps = Recipe.buildRecipe('uno11-uno12');
  const start = new Date(2026, 10, 12, 10, 0).getTime();
  const free = Planner.earliest({ steps, tempC: 24, quiet: null, start });
  const night = Planner.earliest({ steps, tempC: 24, quiet: QUIET, start });
  assert.strictEqual(free.delayed, false);
  assert.ok(free.target < night.target);
});

test('metodi senza pieghe: nessun passo "piega" e il piano e fattibile con la notte vietata', () => {
  ['senza', 'brioche'].forEach(m => {
    ['uno11-uno12', 'due12', 'singolo'].forEach(pr => {
      const steps = Recipe.buildRecipe(pr, m);
      assert.ok(!steps.some(x => x.id.indexOf('piega') === 0), m + ' contiene pieghe');
      [18, 22, 26].forEach(temp => {
        const res = Planner.plan({ steps, target: SAT_13, tempC: temp, quiet: QUIET });
        assert.ok(res.ok, m + ' ' + pr + ' ' + temp);
        res.steps.forEach(st => assert.strictEqual(Planner.isBlocked(st.inizio, QUIET), false, m + ' ' + st.id + ' ' + fmt(st.inizio)));
      });
    });
  });
});

test('metodo con pieghe resta il predefinito', () => {
  const a = Recipe.buildRecipe('uno11-uno12').map(x => x.id).join();
  const b = Recipe.buildRecipe('uno11-uno12', 'pieghe').map(x => x.id).join();
  assert.strictEqual(a, b);
  assert.ok(a.indexOf('piega-1') >= 0);
});

test('parto ora funziona anche con la brioche', () => {
  const steps = Recipe.buildRecipe('uno11-uno12', 'brioche');
  const start = new Date(2026, 10, 12, 10, 0).getTime();
  const res = Planner.earliest({ steps, tempC: 22, quiet: QUIET, start });
  assert.ok(res.ok, JSON.stringify(res.avvisi));
  console.log('     (brioche, ' + fmt(start) + ': start ' + fmt(res.startAt) + ', pronta ' + fmt(res.target) + ')');
});

const Ics = require('../ics.js');

test('calendario: struttura valida, orari in UTC, sveglie e a capo CRLF', () => {
  const start = new Date(Date.UTC(2026, 10, 12, 21, 0)).getTime();
  const out = Ics.build([{ uid: 'a@x', start, end: start + 15 * MIN, summary: 'Feed 1:1, now', description: 'Line one\nLine two; ok', alarms: [10, 0] }], { now: start });
  assert.ok(out.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(out.endsWith('END:VCALENDAR\r\n'));
  assert.ok(out.includes('DTSTART:20261112T210000Z\r\n'));
  assert.ok(out.includes('DTEND:20261112T211500Z\r\n'));
  assert.ok(out.includes('SUMMARY:Feed 1:1\\, now'));
  assert.ok(out.includes('DESCRIPTION:Line one\\nLine two\\; ok'));
  assert.strictEqual((out.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.ok(out.includes('TRIGGER:-PT10M') && out.includes('TRIGGER:PT0S'));
  assert.ok(!/[^\r]\n/.test(out), 'solo CRLF');
});

test('calendario: le righe lunghe vanno a capo entro 75 byte, anche con accenti', () => {
  const start = Date.now();
  const long = 'Rinfresca nel rapporto 1:2. Segna il livello sul vasetto con un elastico e controlla che sia più che raddoppiato, con bolle in superficie.';
  const out = Ics.build([{ uid: 'b@x', start, end: start + MIN, summary: 'Rinfresco', description: long }]);
  out.split('\r\n').forEach(line => assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'riga lunga: ' + line));
  const unfolded = out.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('più che raddoppiato'));
});

console.log('\n' + passed + ' test passati' + (process.exitCode ? ', con errori' : ''));
