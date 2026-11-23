'use strict';
const assert = require('assert');
const I18n = require('../i18n.js');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; }
}
const en = Object.keys(I18n.DICT.en), it = Object.keys(I18n.DICT.it);
test('English and Italian have exactly the same keys', () => {
  assert.deepStrictEqual(en.filter(k => !it.includes(k)), []);
  assert.deepStrictEqual(it.filter(k => !en.includes(k)), []);
});
test('no em dash in any text', () => {
  ['en', 'it'].forEach(l => Object.keys(I18n.DICT[l]).forEach(k => assert.ok(String(I18n.DICT[l][k]).indexOf('—') < 0, l + ' ' + k)));
});
test('placeholders match between languages', () => {
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  en.forEach(k => assert.strictEqual(ph(I18n.DICT.en[k]), ph(I18n.DICT.it[k]), k));
});
console.log(passed + ' test passati');
