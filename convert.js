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
  var ENRICHMENT = /\b(burro|butter|olio|oil|strutto|lard|margarin\w*|ghee|shortening|uov\w*|tuorl\w*|eggs?|yolks?|zucchero|sugar|miele|honey)\b/i;
  var SCALED_PHASES = ['bulk', 'proof'];
  var CAP_MIN = { bulk: 720, proof: 360 };   // converted times never go past 12 h (bulk) and 6 h (proof)
  var SLOW_BULK_MIN = 360;                   // a written bulk this long is already a slow yeast recipe: leave it

  function sum(ing, type) { return ing.reduce(function (a, i) { return a + (i.type === type && i.g > 0 ? i.g : 0); }, 0); }

  // yeast and no starter: the only recipes this module converts
  function isYeastRecipe(recipe) {
    var ing = (recipe && recipe.ingredients) || [];
    return sum(ing, 'yeast') > 0 && !(sum(ing, 'starter') > 0);
  }

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


  // ---------- the other way: starter to fresh yeast ----------
  var YEAST_PCT = 0.01;                      // fresh yeast as a share of the flour weight
  var FLOOR_MIN = { bulk: 60, proof: 30 };   // shortest converted rises

  function isStarterRecipe(recipe) {
    var ing = (recipe && recipe.ingredients) || [];
    return sum(ing, 'starter') > 0 && !(sum(ing, 'yeast') > 0);
  }

  // The starter holds equal parts flour and water, so its weight goes back into them; the yeast is 1% of the
  // flour; the written bulk and proof times shrink by the same factor the other conversion stretches them.
  function starterToYeast(recipe, yeastName, waterName) {
    var ing = (recipe && recipe.ingredients) || [];
    if (!(sum(ing, 'starter') > 0)) return unchanged(recipe, 'no-starter');
    if (sum(ing, 'yeast') > 0) return unchanged(recipe, 'has-yeast');
    var flourG = sum(ing, 'flour'), starterG = sum(ing, 'starter'), waterG = sum(ing, 'water');
    if (!(flourG > 0)) return unchanged(recipe, 'too-little-flour');
    var half = starterG / 2;
    var enrichG = ing.reduce(function (a, i) { return a + (i.type === 'other' && i.g > 0 && ENRICHMENT.test(i.name || '') ? i.g : 0); }, 0);
    var enriched = enrichG / flourG >= ENRICHED_PCT;
    var factor = enriched ? FACTOR_ENRICHED : FACTOR_LEAN;

    var out = JSON.parse(JSON.stringify(recipe));
    out.ingredients = out.ingredients.filter(function (i) { return i.type !== 'starter'; });
    out.ingredients.forEach(function (i) {
      if (i.type === 'flour' && i.g > 0) i.g = Math.round(i.g + half * i.g / flourG);
      else if (i.type === 'water' && i.g > 0) i.g = Math.round(i.g + half * i.g / waterG);
    });
    if (!(waterG > 0)) out.ingredients.push({ name: waterName || 'Water', g: Math.round(half), type: 'water' });
    var newFlour = sum(out.ingredients, 'flour');
    var yeastG = Math.max(1, Math.round(newFlour * YEAST_PCT));
    out.ingredients.push({ name: yeastName || 'Fresh yeast', g: yeastG, type: 'yeast' });
    (out.steps || []).forEach(function (s) {
      if (SCALED_PHASES.indexOf(s.phase) < 0 || !(s.minMin > 0)) return;
      var floor = FLOOR_MIN[s.phase];
      s.minMin = Math.max(floor, Math.round(s.minMin / factor));
      if (s.maxMin > 0) s.maxMin = Math.max(floor, Math.round(s.maxMin / factor));
    });
    return { recipe: out, converted: true, info: { yeastG: yeastG, starterG: starterG, factor: factor, enriched: enriched }, reason: null };
  }

  return { yeastToStarter: yeastToStarter, starterToYeast: starterToYeast, isStarterRecipe: isStarterRecipe, isYeastRecipe: isYeastRecipe, STARTER_PCT: STARTER_PCT, ENRICHED_PCT: ENRICHED_PCT, FACTOR_LEAN: FACTOR_LEAN, FACTOR_ENRICHED: FACTOR_ENRICHED };
});
