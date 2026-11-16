(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(typeof Calc !== 'undefined' ? Calc : require('./calc.js'));
  else root.RecipeImport = factory(root.Calc);
})(typeof self !== 'undefined' ? self : this, function (Calc) {
  'use strict';

  // ---------- vocabulary ----------
  var PHASES = ['autolyse', 'mix', 'fold', 'bulk', 'preshape', 'shape', 'chill', 'proof', 'preheat', 'bake', 'cool'];
  // default [min, target, max] minutes for a phase whose time the recipe does not give
  var DEF = { autolyse: [30, 45, 60], mix: [30, 30, 45], fold: [30, 30, 45], bulk: [240, 330, 450], preshape: [20, 25, 40],
              shape: [30, 45, 60], chill: [480, 660, 840], proof: [60, 105, 180], preheat: [45, 45, 60], bake: [40, 45, 50], cool: [45, 60, 90] };
  var SPREAD = { autolyse: .25, bulk: .25, proof: .25, chill: .2, preshape: .25, shape: .25, mix: .25, fold: .25, preheat: .1, bake: .1, cool: .25 };

  var TYPE_WORDS = [
    ['starter', /starter|levain|lievito madre|lievito naturale|pasta madre|sourdough culture|mother|biga naturale/i],
    ['water', /\bwater\b|\bacqua\b/i],
    ['salt', /\bsalt\b|\bsale\b/i],
    ['flour', /flour|farina|semola|semolina|\brye\b|segale|whole ?(wheat|meal)|integrale|spelt|farro|manitoba|\bwheat\b|grano/i]
  ];
  function typeOf(name) {
    for (var i = 0; i < TYPE_WORDS.length; i++) if (TYPE_WORDS[i][1].test(name)) return TYPE_WORDS[i][0];
    return 'other';
  }

  var WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6 };

  // ---------- durations ----------
  var UNIT_MIN = { h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, ora: 60, ore: 60, min: 1, mins: 1, minute: 1, minutes: 1, minuti: 1, minuto: 1 };
  var U = '(hours?|hrs?|h|ore|ora|minutes?|mins?|min|minuti|minuto)';
  var RANGE_RE = new RegExp('(\\d+(?:[.,]\\d+)?|½)\\s*(?:-|–|—|to|a|or)\\s*(\\d+(?:[.,]\\d+)?)\\s*' + U + '\\b', 'gi');
  var SINGLE_RE = new RegExp('(\\d+(?:[.,]\\d+)?|½)\\s*' + U + '\\b', 'gi');

  // all durations in a line, as [{min, max}] in minutes (a single value has min === max)
  function durations(line) {
    var out = [], s = line;
    s = s.replace(RANGE_RE, function (m, a, b, u) {
      var k = UNIT_MIN[u.toLowerCase()];
      out.push({ at: arguments[arguments.length - 2], min: Calc.num(a) * k, max: Calc.num(b) * k });
      return ' '.repeat(m.length);
    });
    s.replace(SINGLE_RE, function (m, a, u) {
      out.push({ at: arguments[arguments.length - 2], min: Calc.num(a) * UNIT_MIN[u.toLowerCase()], max: Calc.num(a) * UNIT_MIN[u.toLowerCase()], single: true });
      return m;
    });
    out.sort(function (x, y) { return x.at - y.at; });
    // "1 hour 30 minutes": an hour value followed straight away by a minutes value
    var merged = [];
    for (var i = 0; i < out.length; i++) {
      var d = out[i], nx = out[i + 1];
      if (nx && d.single && nx.single && d.min >= 60 && nx.min < 60 && nx.at - d.at < 14) { merged.push({ min: d.min + nx.min, max: d.min + nx.min }); i++; }
      else merged.push({ min: d.min, max: d.max });
    }
    return merged;
  }

  function tempOf(line) {
    var m = line.match(/(\d{2,3})\s*°?\s*([CF])\b/i);
    return m ? Calc.toC(+m[1], m[2]) : null;
  }

  // "3 folds every 30 minutes", "folds every 30 min for 2 hours", "tre pieghe ogni 30 minuti"
  function foldsOf(line) {
    var w = Object.keys(WORD_NUM).join('|');
    var A = new RegExp('(\\d+|' + w + ')\\s+(?:sets?\\s+of\\s+)?(?:stretch[- ]and[- ])?(?:coil\\s+)?(?:folds?|pieghe)\\b[^.;]*?(?:every|each|ogni)\\s+(\\d+(?:[.,]\\d+)?)\\s*(min\\w*|minuti|hours?|ore)', 'i');
    var B = new RegExp('(?:folds?|pieghe)\\b[^.;]*?(?:every|each|ogni)\\s+(\\d+(?:[.,]\\d+)?)\\s*(min\\w*|minuti)[^.;]*?(?:for|per)\\s+(\\d+(?:[.,]\\d+)?)\\s*(hours?|ore|h)\\b', 'i');
    var C = new RegExp('(\\d+|' + w + ')\\s+(?:sets?\\s+of\\s+)?(?:stretch[- ]and[- ])?(?:folds?|pieghe)\\b', 'i');
    var m;
    if ((m = line.match(A))) {
      var n = WORD_NUM[m[1].toLowerCase()] || +m[1];
      var every = Calc.num(m[2]) * (/^h|^or/i.test(m[3]) ? 60 : 1);
      return { count: n, everyMin: every, text: m[0] };
    }
    if ((m = line.match(B))) {
      var ev = Calc.num(m[1]), total = Calc.num(m[3]) * 60;
      return { count: Math.max(1, Math.round(total / ev)), everyMin: ev, text: m[0] };
    }
    if ((m = line.match(C))) return { count: WORD_NUM[m[1].toLowerCase()] || +m[1], everyMin: 30, est: true, text: m[0] };
    return null;
  }

  // ---------- text parser ----------
  var UNIT_WORDS = 'kg|g|gr|grams?|grammi|oz|ounces?|lbs?|pounds?|ml|l|litri|cups?|tazze?|tbsp|tsp|cucchiai\\w*|cucchiaini?';
  var NUM = '(\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:[.,]\\d+)?\\s*[½¼¾]?|[½¼¾⅓⅔])';
  var ING_A = new RegExp('^\\s*(?:[-*•·]\\s*)?' + NUM + '\\s*(' + UNIT_WORDS + ')\\b\\.?\\s*(?:of\\s+|di\\s+|d[\'’]\\s*)?(.+?)\\s*(?:\\(.*\\))?\\s*$', 'i');
  var ING_B = new RegExp('^\\s*(?:[-*•·]\\s*)?([^\\d:]{2,40}?)\\s*[:\\-–]\\s*' + NUM + '\\s*(' + UNIT_WORDS + ')\\b', 'i');
  var ING_EGG = /^\s*(?:[-*•·]\s*)?(\d+)\s+(?:large\s+|medium\s+|grandi\s+)?(?:eggs?|uova|uovo)\b/i;

  var STEP_WORDS = [
    ['autolyse', /autolys|autolis/i],
    ['preheat', /preheat|preriscald|pre-?heat the oven|accendi il forno/i],
    ['fold', /\bfolds?\b|pieghe|\bpiega\b|stretch and fold/i],
    ['preshape', /pre-?shape|preforma|pirlatura|bench rest|riposo sul piano/i],
    ['chill', /fridge|refrigerat|retard|cold proof|cold ferment|frigo|overnight|tutta la notte|per la notte/i],
    ['proof', /final proof|second rise|final rise|\bproof\b|lievitazione finale|seconda lievitazione|\bappretto\b/i],
    ['shape', /\bshape\b|shaping|formatura|dai la forma|forma(re)? il pane/i],
    ['bulk', /bulk|first rise|prima lievitazione|fermentazione|ferment/i],
    ['bake', /\bbake\b|baking|\bcuoci\b|\bcottura\b|\binforna/i],
    ['cool', /\bcool\b|raffredd/i],
    ['mix', /\bmix\b|knead|impasta|incorpora|combine|mescola/i]
  ];

  function phaseOf(line) {
    for (var i = 0; i < STEP_WORDS.length; i++) if (STEP_WORDS[i][1].test(line)) return STEP_WORDS[i][0];
    return null;
  }

  function ingredientOf(line, warnings) {
    var m, name, n, unit, g;
    if ((m = line.match(ING_A))) { n = Calc.num(m[1]); unit = m[2]; name = m[3]; }
    else if ((m = line.match(ING_B))) { name = m[1]; n = Calc.num(m[2]); unit = m[3]; }
    else if ((m = line.match(ING_EGG))) {
      warnings.push({ code: 'egg-weight', detail: m[1] });
      var en = line.replace(/^\s*[-*•·]?\s*\d+\s+/, '').trim();
      return { name: en.charAt(0).toUpperCase() + en.slice(1), g: Math.round(+m[1] * 50), type: 'other' };
    } else return null;
    if (n == null) return null;
    name = name.replace(/\s+/g, ' ').replace(/[,;.]$/, '').trim();
    name = name.charAt(0).toUpperCase() + name.slice(1);
    g = Calc.toGrams(n, unit);
    if (g == null) { warnings.push({ code: 'unit-not-converted', detail: name + ' (' + n + ' ' + unit + ')' }); g = 0; }
    return { name: name, g: Math.round(g * 10) / 10, type: typeOf(name) };
  }

  function stepFromLine(line) {
    var fold = foldsOf(line);
    var rest = fold ? line.replace(fold.text, ' ') : line;
    var phase = phaseOf(rest), out = [];
    if (fold) out.push({ phase: 'fold', count: fold.count, everyMin: fold.everyMin, est: !!fold.est });
    else if (phase === 'fold') return [{ phase: 'fold', count: 3, everyMin: 30, est: true }];
    if (!phase || phase === 'fold') return out.length ? out : null;
    var d = durations(rest), t = tempOf(line), st = { phase: phase };
    if (phase === 'bake') {
      var total = d.reduce(function (a, x) { return a + x.min; }, 0);
      if (total) { st.minMin = total; st.maxMin = total; }
    } else if (d.length) { st.minMin = d[0].min; st.maxMin = d[0].max; }
    if (/overnight|tutta la notte|per la notte/i.test(line) && !d.length) { st.minMin = 480; st.maxMin = 720; }
    if (t) st.tempC = t;
    out.push(st);
    return out;
  }

  var HEAD_RE = /^\s*(ingredients?|ingredienti|method|instructions?|directions?|steps?|procedimento|preparazione|metodo)\s*:?\s*$/i;
  var TITLE_RE = /^\s*(?:recipe|ricetta)\s*:\s*(.+)$/i;

  function parseText(text) {
    var warnings = [], ingredients = [], steps = [], name = '';
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var seenPhase = {};
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line || HEAD_RE.test(line)) return;
      var tm = line.match(TITLE_RE);
      if (tm) { name = tm[1].trim(); return; }
      var body = line.replace(/^\d+[.)]\s+/, '');           // "1. Mix ..." is a step number, not an amount
      var ing = /^\d+[.)]\s+/.test(line) ? null : ingredientOf(line, warnings);
      if (ing) { ingredients.push(ing); return; }
      var st = stepFromLine(body);
      if (st) { st.forEach(function (s) { steps.push(s); seenPhase[s.phase] = true; }); return; }
      if (!name && !steps.length && !ingredients.length && line.length <= 60) name = line.replace(/[:.]$/, '');
    });
    return finish({ name: name, ingredients: ingredients, steps: steps }, warnings);
  }

  // ---------- JSON (from the user's own AI) ----------
  function fromJson(input) {
    var obj = input, errors = [];
    if (typeof input === 'string') {
      var s = input.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      var a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a < 0 || b < a) return { recipe: null, errors: [{ code: 'json-missing' }], warnings: [] };
      try { obj = JSON.parse(s.slice(a, b + 1)); } catch (e) { return { recipe: null, errors: [{ code: 'json-invalid', detail: e.message }], warnings: [] }; }
    }
    var warnings = [];
    if (!obj || !Array.isArray(obj.ingredients) || !obj.ingredients.length) errors.push({ code: 'no-ingredients' });
    var ing = (obj.ingredients || []).map(function (i, k) {
      var g = Number(i.g);
      if (!(g >= 0)) { errors.push({ code: 'bad-grams', detail: String(i.name || k) }); g = 0; }
      return { name: String(i.name || 'Ingredient'), g: g, type: ['flour', 'water', 'starter', 'salt', 'other'].indexOf(i.type) >= 0 ? i.type : typeOf(String(i.name || '')) };
    });
    var steps = [];
    (obj.steps || []).forEach(function (s) {
      if (PHASES.indexOf(s.phase) < 0) { warnings.push({ code: 'unknown-phase', detail: String(s.phase) }); return; }
      var st = { phase: s.phase };
      if (s.phase === 'fold') { st.count = Math.max(1, Math.round(+s.count || 3)); st.everyMin = +s.everyMin || 30; if (!s.count || !s.everyMin) st.est = true; }
      else {
        var lo = Number(s.minMin != null ? s.minMin : s.minutes), hi = Number(s.maxMin != null ? s.maxMin : (s.minutes != null ? s.minutes : s.minMin));
        if (lo > 0) { st.minMin = lo; st.maxMin = hi >= lo ? hi : lo; }
      }
      if (+s.tempC > 0) st.tempC = Math.round(+s.tempC);
      steps.push(st);
    });
    if (errors.length) return { recipe: null, errors: errors, warnings: warnings };
    var r = finish({ name: String(obj.name || ''), ingredients: ing, steps: steps }, warnings);
    r.errors = [];
    return r;
  }

  // ---------- shared checks ----------
  function finish(recipe, warnings) {
    var has = function (t) { return recipe.ingredients.some(function (i) { return i.type === t && i.g > 0; }); };
    if (!has('flour')) warnings.push({ code: 'no-flour' });
    if (!has('water')) warnings.push({ code: 'no-water' });
    if (!has('starter')) warnings.push({ code: 'no-starter' });
    if (!has('salt')) warnings.push({ code: 'no-salt' });
    if (!recipe.steps.some(function (s) { return s.phase === 'bake'; })) warnings.push({ code: 'no-bake' });
    var bake = recipe.steps.filter(function (s) { return s.phase === 'bake'; })[0];
    var pre = recipe.steps.filter(function (s) { return s.phase === 'preheat' && s.tempC; })[0];
    if (bake && !bake.tempC && pre) bake.tempC = pre.tempC;
    recipe.bake = bake ? { tempC: bake.tempC || null, minutes: bake.minMin || null } : { tempC: null, minutes: null };
    return { recipe: recipe, warnings: warnings, errors: [] };
  }

  // ---------- assembling the action chain ----------
  // Each returned item is one moment when you act; wait is the time until the next moment, in minutes.
  function range(step, phase, fallbackKey) {
    var d = DEF[fallbackKey || phase];
    if (step && step.minMin > 0) {
      var lo = step.minMin, hi = step.maxMin || step.minMin;
      if (hi === lo) { var sp = SPREAD[phase] || .2; lo = Math.max(5, Math.round(lo * (1 - sp) / 5) * 5); hi = Math.round(hi * (1 + sp) / 5) * 5; }
      return { min: lo, target: Math.round((step.minMin + (step.maxMin || step.minMin)) / 2), max: hi, est: false };
    }
    return { min: d[0], target: d[1], max: d[2], est: true };
  }

  function assemble(recipe) {
    var by = {};
    recipe.steps.forEach(function (s) { if (!by[s.phase]) by[s.phase] = s; });
    var out = [];
    function push(phase, r, extra) { out.push(Object.assign({ phase: phase, min: r.min, target: r.target, max: r.max, est: r.est }, extra || {})); }

    var fold = by.fold, n = fold ? fold.count : 0, every = fold ? fold.everyMin : 30;
    var bulk = range(by.bulk, 'bulk');
    if (by.autolyse) push('autolyse', range(by.autolyse, 'autolyse'));
    // mixing: the wait after it is the first fold, or the whole rise when there are no folds
    if (n) push('mix', { min: every, target: every, max: Math.round(every * 1.5), est: !!(fold && fold.est) || !by.mix });
    else push('mix', bulk, { est: bulk.est });
    for (var i = 1; i <= n; i++) {
      if (i < n) push('fold', { min: every, target: every, max: Math.round(every * 1.5), est: !!fold.est }, { index: i });
      else {
        var lo = Math.max(30, bulk.min - n * every), hi = Math.max(lo, bulk.max - n * every);
        push('fold', { min: lo, target: Math.max(lo, Math.min(hi, bulk.target - n * every)), max: hi, est: bulk.est }, { index: i });
      }
    }
    if (by.preshape) push('preshape', range(by.preshape, 'preshape'));
    // shaping: the wait after it is the cold rest if there is one, otherwise the final proof
    var chill = by.chill ? range(by.chill, 'chill') : null, proof = by.proof ? range(by.proof, 'proof') : null;
    if (chill) push('shape', chill);
    else if (proof) push('shape', proof);
    else push('shape', range(null, 'shape'));
    if (chill && proof) push('proof', proof);
    push('preheat', range(by.preheat, 'preheat'));
    push('bake', range(by.bake, 'bake'), { tempC: by.bake && by.bake.tempC || null });
    push('cool', range(by.cool, 'cool'));
    return out;
  }

  // ---------- text for the AI route ----------
  var PROMPT = {
    en: 'Read the sourdough or bread recipe I am sending (a link, a screenshot, a photo or pasted text) and reply with ONLY one JSON object, no other text, in exactly this shape:\n' +
        '{"name": "Recipe name",\n "ingredients": [{"name": "Bread flour", "g": 450, "type": "flour"}, {"name": "Water", "g": 340, "type": "water"}, {"name": "Active starter", "g": 90, "type": "starter"}, {"name": "Salt", "g": 10, "type": "salt"}],\n' +
        ' "steps": [{"phase": "autolyse", "minMin": 30, "maxMin": 60}, {"phase": "mix"}, {"phase": "fold", "count": 3, "everyMin": 30}, {"phase": "bulk", "minMin": 240, "maxMin": 360}, {"phase": "shape"}, {"phase": "chill", "minMin": 480, "maxMin": 720}, {"phase": "preheat", "minMin": 45}, {"phase": "bake", "minMin": 45, "tempC": 250}]}\n' +
        'Rules: all amounts in grams (convert cups, ounces, millilitres of water and milk), times in minutes, temperatures in Celsius. "type" is one of flour, water, starter, salt, other. "phase" is one of autolyse, mix, fold, bulk, preshape, shape, chill (fridge rest), proof (final room-temperature rise), preheat, bake, cool. Give the total time of the bulk fermentation in "bulk" (folds happen inside it). Leave out any step the recipe does not have. Ignore how to build or feed the starter: only the amount of active starter used in the dough. If the recipe gives baker\'s percentages, compute grams for 900 g of dough in total.',
    it: 'Leggi la ricetta di pane o lievito madre che ti mando (link, screenshot, foto o testo incollato) e rispondi SOLO con un oggetto JSON, senza altro testo, in questa forma esatta:\n' +
        '{"name": "Nome ricetta",\n "ingredients": [{"name": "Farina", "g": 450, "type": "flour"}, {"name": "Acqua", "g": 340, "type": "water"}, {"name": "Lievito madre attivo", "g": 90, "type": "starter"}, {"name": "Sale", "g": 10, "type": "salt"}],\n' +
        ' "steps": [{"phase": "autolyse", "minMin": 30, "maxMin": 60}, {"phase": "mix"}, {"phase": "fold", "count": 3, "everyMin": 30}, {"phase": "bulk", "minMin": 240, "maxMin": 360}, {"phase": "shape"}, {"phase": "chill", "minMin": 480, "maxMin": 720}, {"phase": "preheat", "minMin": 45}, {"phase": "bake", "minMin": 45, "tempC": 250}]}\n' +
        'Regole: tutte le quantità in grammi (converti tazze, once, millilitri di acqua e latte), tempi in minuti, temperature in Celsius. "type" è uno tra flour, water, starter, salt, other. "phase" è uno tra autolyse, mix, fold, bulk, preshape, shape, chill (riposo in frigo), proof (lievitazione finale a temperatura ambiente), preheat, bake, cool. In "bulk" metti il tempo totale della fermentazione di massa (le pieghe avvengono al suo interno). Ometti i passi che la ricetta non ha. Ignora come si crea o si rinfresca il lievito: conta solo la quantità di lievito attivo usata nell\'impasto. Se la ricetta usa percentuali del panettiere, calcola i grammi per 900 g di impasto totale.'
  };
  function promptFor(lang) { return PROMPT[lang] || PROMPT.en; }

  // short sample recipes, written for this app
  var SAMPLE = {
    en: 'Recipe: Country loaf\n\nIngredients\n450 g bread flour\n50 g whole wheat flour\n375 g water\n100 g active starter\n10 g salt\n\nMethod\n1. Autolyse the flour and water for 45 minutes.\n2. Mix in the starter and salt.\n3. Bulk ferment for 4-6 hours with 3 stretch and folds every 30 minutes.\n4. Pre-shape and rest for 20 minutes, then shape.\n5. Proof in the fridge overnight, 8-12 hours.\n6. Preheat the oven to 250°C for 45 minutes.\n7. Bake covered for 20 minutes, then uncovered for 25 minutes.\n8. Cool for 1 hour.',
    it: 'Ricetta: Pane di campagna\n\nIngredienti\n450 g di farina forte\n50 g di farina integrale\n375 g di acqua\n100 g di lievito madre attivo\n10 g di sale\n\nProcedimento\n1. Autolisi di farina e acqua per 45 minuti.\n2. Incorpora il lievito e il sale.\n3. Fermentazione di massa per 4-6 ore con 3 pieghe ogni 30 minuti.\n4. Preforma e riposo di 20 minuti, poi formatura.\n5. Lievitazione in frigo per tutta la notte, 8-12 ore.\n6. Preriscalda il forno a 250°C per 45 minuti.\n7. Cuoci coperto per 20 minuti, poi scoperto per 25 minuti.\n8. Raffredda per 1 ora.'
  };

  return { PHASES: PHASES, DEF: DEF, parseText: parseText, fromJson: fromJson, assemble: assemble, promptFor: promptFor, SAMPLE: SAMPLE, durations: durations, foldsOf: foldsOf };
});
