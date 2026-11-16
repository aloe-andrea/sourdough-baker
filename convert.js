(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Convert = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Turns an imported recipe that uses commercial yeast into a sourdough one.
  // Rules: see docs/superpowers/specs/2026-11-17-yeast-to-starter-design.md
  var STARTER_PCT = 0.2;        // starter weight as a share of the flour weight, 100% hydration
  var ENRICHED_PCT = 0.12;      // sugar + fat + eggs as a share of the flour weight
  var FACTOR_LEAN = 3;
  var FACTOR_ENRICHED = 4;
  var ENRICHMENT = /burro|butter|olio|oil|strutto|margarina|uov|tuorl|egg|yolk|zucchero|sugar|miele|honey/i;
  var SCALED_PHASES = ['bulk', 'proof'];
  var CAP_MIN = { bulk: 720, proof: 360 };   // converted times never go past 12 h (bulk) and 6 h (proof)
  var SLOW_BULK_MIN = 360;                   // a written bulk this long is already a slow yeast recipe: leave it

  function sum(ing, type) { return ing.reduce(function (a, i) { return a + (i.type === type && i.g > 0 ? i.g : 0); }, 0); }

  function unchanged(recipe, reason) { return { recipe: recipe, converted: false, info: null, reason: reason }; }

  function yeastToStarter(recipe, starterName) {
    var ing = recipe.ingredients || [];
    if (sum(ing, 'starter') > 0) return unchanged(recipe, 'has-starter');
    var yeastG = sum(ing, 'yeast');
    if (!(yeastG > 0)) return unchanged(recipe, 'no-yeast');

    var flourG = sum(ing, 'flour'), waterG = sum(ing, 'water');
    var starterG = Math.round(flourG * STARTER_PCT);
    var half = starterG / 2;
    if (!(flourG > 0) || flourG - half <= 0) return unchanged(recipe, 'too-little-flour');
    if (waterG - half <= 0) return unchanged(recipe, 'too-little-water');

    var enrichG = ing.reduce(function (a, i) { return a + (i.type === 'other' && i.g > 0 && ENRICHMENT.test(i.name || '') ? i.g : 0); }, 0);
    var enriched = enrichG / flourG >= ENRICHED_PCT;
    var factor = enriched ? FACTOR_ENRICHED : FACTOR_LEAN;

    var out = JSON.parse(JSON.stringify(recipe));
    out.ingredients = out.ingredients.filter(function (i) { return i.type !== 'yeast'; });
    out.ingredients.forEach(function (i) {
      if (i.type === 'flour' && i.g > 0) i.g = Math.round(i.g - half * i.g / flourG);
      else if (i.type === 'water' && i.g > 0) i.g = Math.round(i.g - half * i.g / waterG);
    });
    out.ingredients.push({ name: starterName || 'Starter', g: starterG, type: 'starter' });
    (out.steps || []).forEach(function (s) {
      if (SCALED_PHASES.indexOf(s.phase) < 0 || !(s.minMin > 0)) return;
      if (s.phase === 'bulk' && s.minMin >= SLOW_BULK_MIN) return;
      var cap = CAP_MIN[s.phase];
      s.minMin = Math.min(Math.round(s.minMin * factor), cap);
      if (s.maxMin > 0) s.maxMin = Math.min(Math.round(s.maxMin * factor), cap);
    });
    return { recipe: out, converted: true, info: { starterG: starterG, yeastG: yeastG, factor: factor, enriched: enriched }, reason: null };
  }

  return { yeastToStarter: yeastToStarter, STARTER_PCT: STARTER_PCT, ENRICHED_PCT: ENRICHED_PCT, FACTOR_LEAN: FACTOR_LEAN, FACTOR_ENRICHED: FACTOR_ENRICHED };
});
