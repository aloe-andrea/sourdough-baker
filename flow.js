(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Flow = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Which screen opens, which old saved screen names still make sense, and what the Confirm step reports.
  var VIEWS = ['import', 'ai', 'card', 'review', 'recipes', 'home', 'advanced', 'confirm', 'now', 'plan', 'ingredients'];
  var COOK = ['now', 'plan', 'ingredients'];

  function hm(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1] || 0); }

  // quiet = { start: 'HH:MM', end: 'HH:MM' }; the window may wrap midnight. Start is inside, end is outside.
  function isNight(ms, quiet) {
    if (!quiet) return false;
    var d = new Date(ms), m = d.getHours() * 60 + d.getMinutes(), a = hm(quiet.start), b = hm(quiet.end);
    return a <= b ? (m >= a && m < b) : (m >= a || m < b);
  }

  function hasRecipe(state) {
    return !!(state && (state.recipes || []).some(function (r) { return r.id === state.recipeId; }));
  }

  function startView(state, planOk) {
    if (state && state.started && planOk && hasRecipe(state)) return 'now';
    return hasRecipe(state) ? 'home' : 'import';
  }

  function migrateView(view, state, planOk) {
    var fallback = hasRecipe(state) ? 'home' : 'import';
    if (COOK.indexOf(view) >= 0) return state && state.started && planOk && hasRecipe(state) ? view : fallback;
    if (VIEWS.indexOf(view) >= 0) return hasRecipe(state) || view === 'import' || view === 'ai' ? view : 'import';
    return fallback;
  }

  // steps not done yet whose action moment is in the quiet window
  function nightSteps(plan, quiet) {
    return ((plan && plan.steps) || []).filter(function (s) { return !s.fatto && s.inizio != null && isNight(s.inizio, quiet); })
      .map(function (s) { return { at: s.inizio, name: s.nome }; });
  }

  function summary(plan, state) {
    var steps = (plan && plan.steps) || [];
    var first = steps.filter(function (s) { return !s.fatto && s.inizio != null; })[0] || null;
    return {
      firstAt: first ? first.inizio : null,
      firstName: first ? first.nome : null,
      readyAt: plan && plan.target != null ? plan.target : null,
      nightSteps: nightSteps(plan, state && state.quiet),
      notices: (plan && plan.avvisi) || []
    };
  }

  return { VIEWS: VIEWS, isNight: isNight, startView: startView, migrateView: migrateView, nightSteps: nightSteps, summary: summary };
});
