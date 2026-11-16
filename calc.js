(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VULGAR = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

  // "1,5" "1.5" "1/2" "1 1/2" "½" "2½" -> number, or null
  function num(str) {
    var s = String(str == null ? '' : str).trim();
    if (!s) return null;
    var total = 0, found = false;
    Object.keys(VULGAR).forEach(function (ch) {
      if (s.indexOf(ch) >= 0) { total += VULGAR[ch]; s = s.replace(ch, ' '); found = true; }
    });
    s = s.trim();
    if (s) {
      var m;
      if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) total += +m[1] + (+m[2]) / (+m[3]);
      else if ((m = s.match(/^(\d+)\/(\d+)$/))) total += (+m[1]) / (+m[2]);
      else if (/^\d{1,3}(,\d{3})+$/.test(s)) total += parseFloat(s.replace(/,/g, ''));
      else if (/^\d+([.,]\d+)?$/.test(s)) total += parseFloat(s.replace(',', '.'));
      else return null;
      found = true;
    }
    return found ? total : null;
  }

  var UNITS = {
    g: 1, gr: 1, gram: 1, grams: 1, gramm: 1, grammi: 1, gramma: 1,
    kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000, chilo: 1000, chili: 1000, chilogrammi: 1000,
    oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
    lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
    ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1, millilitri: 1,
    l: 1000, liter: 1000, litre: 1000, litres: 1000, litro: 1000, litri: 1000
  };

  // water and milk: 1 ml = 1 g. Cups and spoons are not converted: they depend on the ingredient.
  function toGrams(value, unit) {
    var k = UNITS[String(unit || '').toLowerCase().replace(/\.$/, '')];
    return k == null ? null : value * k;
  }

  function toC(value, unit) {
    return /^f/i.test(String(unit || '')) ? Math.round((value - 32) * 5 / 9) : Math.round(value);
  }

  // under 5 g in half grams, otherwise whole grams
  function r1(x) { return x < 5 ? Math.round(x * 2) / 2 : Math.round(x); }

  function formatG(g) { return r1(g) + ' g'; }

  function totalWeight(ing) { return ing.reduce(function (a, i) { return a + (i.g || 0); }, 0); }

  function scaleTo(ing, targetG) {
    var f = targetG / totalWeight(ing);
    return ing.map(function (i) { var c = Object.assign({}, i); c.g = r1(i.g * f); return c; });
  }

  // baker's percentages: everything relative to the total flour
  function bakersPercent(ing) {
    var flour = ing.reduce(function (a, i) { return a + (i.type === 'flour' ? i.g : 0); }, 0);
    var water = ing.reduce(function (a, i) { return a + (i.type === 'water' ? i.g : 0); }, 0);
    return {
      flour: flour,
      byIndex: ing.map(function (i) { return flour ? i.g / flour * 100 : 0; }),
      hydration: flour ? water / flour * 100 : 0
    };
  }

  // Feeds worked backwards. A feed 1:r is 1 part starter + r parts flour + r parts water.
  // The last feed must make the starter the dough needs; each earlier feed makes exactly what the next one uses.
  // ratios are in chronological order, e.g. [1, 2] for "1:1 then 1:2".
  function feeds(neededG, ratios) {
    if (!(neededG > 0) || !ratios || !ratios.length) return [];
    var a = new Array(ratios.length), m = neededG, k;
    for (k = ratios.length - 1; k >= 0; k--) { a[k] = m / (1 + 2 * ratios[k]); m = a[k]; }
    var scaledUp = false;
    if (a[0] < 5) {
      var f = 5 / a[0];
      for (k = 0; k < a.length; k++) a[k] *= f;
      scaledUp = true;
    }
    var out = a.map(function (s, i) {
      return { ratio: ratios[i], starter: Math.round(s), flour: Math.round(s * ratios[i]), water: Math.round(s * ratios[i]), makes: s * (1 + 2 * ratios[i]) };
    });
    out.scaledUp = scaledUp;
    return out;
  }

  // desired dough temperature x 4 = room + flour + starter + water + friction
  function waterTemp(o) {
    var room = o.room;
    var flour = o.flour == null ? room : o.flour;
    var starter = o.starter == null ? room : o.starter;
    return Math.round(4 * o.ddt - room - flour - starter - (o.friction || 0));
  }

  function waterTempCheck(o) {
    var c = waterTemp(o), warning = null;
    if (c > 40) { c = 40; warning = 'hot'; }
    else if (c < 0) { c = 0; warning = 'cold'; }
    return { c: c, warning: warning };
  }

  return { num: num, toGrams: toGrams, toC: toC, r1: r1, formatG: formatG, totalWeight: totalWeight, scaleTo: scaleTo,
           bakersPercent: bakersPercent, feeds: feeds, waterTemp: waterTemp, waterTempCheck: waterTempCheck };
});
