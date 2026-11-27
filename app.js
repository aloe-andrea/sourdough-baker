(function () {
  'use strict';

  var MIN = 60000;
  var KEY = 'sourdough.v2';
  var $ = function (s) { return document.querySelector(s); };
  var t = I18n.t, L = I18n.L;

  var DEFAULTS = {
    lang: 'en', target: null, preset: 'uno11-uno12', recipes: [], recipeId: null, loafG: null, leaven: null, ddt: 25, tempC: 22,
    quietOn: true, quiet: { start: '23:00', end: '07:00' }, avoidNight: false, started: false, nowMode: false,
    done: {}, view: 'import'
  };

  function load() {
    var st;
    try { st = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (e) { st = Object.assign({}, DEFAULTS); }
    var raw = {};
    try { raw = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* none */ }
    if (raw.useStarter === false && !raw.leaven) st.leaven = 'yeast';          // older saves
    if (raw.started === undefined) {                                           // older saves: a plan was running
      st.started = ['now', 'plan', 'ingredients'].indexOf(raw.view) >= 0;
      if (st.started) st.avoidNight = raw.quietOn !== false;
    }
    delete st.useStarter; delete st.intro; delete st.hint;
    return st;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }

  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var S = load();
  I18n.set(S.lang);
  var PLAN = null;       // the plan being followed
  var BUILT = null;      // the current recipe turned into steps and grams
  var CONV = null;       // result of the leaven conversion for the current recipe, or null
  var CF = null;         // the plans offered on the Confirm screen
  var view = null, HIST = [];
  var pending = { target: null };   // the time picked on When, not saved until the plan is started
  var tickTimer;
  var dayIdx = null;

  // ---------- recipe and leaven ----------
  function currentRecipe() { return S.recipes.filter(function (r) { return r.id === S.recipeId; })[0] || null; }
  function origKind(r) { return !r ? null : Convert.isYeastRecipe(r) ? 'yeast' : Convert.isStarterRecipe(r) ? 'starter' : null; }
  function leavenMode() { return S.leaven || 'starter'; }
  function build() {
    var r = currentRecipe(), kind = origKind(r);
    CONV = null;
    if (kind === 'yeast' && leavenMode() === 'starter') CONV = Convert.yeastToStarter(r, t('ty.starter'));
    else if (kind === 'starter' && leavenMode() === 'yeast') CONV = Convert.starterToYeast(r, t('ty.yeastFresh'), t('ty.water'));
    BUILT = r ? Recipe.fromImported(CONV ? CONV.recipe : r, S.preset, { loafG: S.loafG }) : null;
    return BUILT;
  }
  function currentSteps() { return BUILT ? BUILT.steps : []; }
  function waterStepId() {
    var st = currentSteps().filter(function (x) { return x.id.indexOf('rinfresco') !== 0 && (x.grammi || []).some(function (g) { return g.type === 'water'; }); })[0];
    return st ? st.id : null;
  }
  function waterC() { return Calc.waterTempCheck({ ddt: S.ddt, room: S.tempC }); }
  function gramsText(st) {
    return (st.grammi || []).map(function (x) { return (x.key ? t('ty.' + x.key) : x.name) + ' ' + Calc.formatG(x.g); }).join(' · ');
  }
  function needList(st) {
    var out = (st.grammi || []).map(function (x) { return (x.key ? t('ty.' + x.key) : x.name) + ' ' + Calc.formatG(x.g); });
    if (st.id === waterStepId()) out.push(t('step.water', { c: waterC().c }));
    return out;
  }
  function needText(st) { return needList(st).join(' · '); }

  // ---------- formatting ----------
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var hhmm = function (ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var dayLabel = function (ms) { return cap(new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' })); };
  var dayMid = function (ms) { var s = dayLabel(ms); return I18n.get() === 'it' ? s.toLowerCase() : s; };
  var dayShort = function (ms) { return cap(new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric' })); };
  var dayBrief = function (ms) { return cap(new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' })); };
  var dayKey = function (ms) { var d = new Date(ms); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
  function dur(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }
  function toLocalInput(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function defaultTarget() {
    var d = new Date();
    d.setHours(13, 0, 0, 0);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 6);
    return d.getTime();
  }
  function txt(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';

  var toastTimer;
  function toast(msg, ms) {
    var e = $('#toast');
    e.textContent = msg; e.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { e.hidden = true; }, ms || 4500);
  }

  // ---------- photos ----------
  var STEP_IMG = { starter: 'mood_01', impasto: 'dough_00', pieghe: 'dough_01', bulk: 'dough_00', forma: 'dough_01',
                   frigo: 'loaf_00', forno: 'loaf_00', cottura: 'mood_00', pane: 'mood_00' };
  function photoUrl(name) { return 'url("assets/img/' + name + '-p.webp")'; }
  function paintPhotos() {
    document.querySelectorAll('.photo[data-img]').forEach(function (p) { p.style.backgroundImage = photoUrl(p.dataset.img); });
  }

  // ---------- language ----------
  function applyLang() {
    build(); recompute();
    document.documentElement.lang = I18n.get();
    document.title = 'Sourdough';
    document.querySelectorAll('[data-i18n]').forEach(function (e) { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (e) { e.placeholder = t(e.dataset.i18nPh); });
    if (view) renderView(view);
    setChrome(view);
  }

  // ---------- views ----------
  var VIEWS = Flow.VIEWS;
  var COOK = ['now', 'plan', 'ingredients'];
  var THEME = { import: 'y', ai: 'y', card: 'y', home: 'y', review: 'c', recipes: 'c', advanced: 'c', ingredients: 'c', confirm: 'bur', now: 'bur', plan: 'bur' };
  var DOTS = { import: 1, card: 1, home: 2, confirm: 3 };
  var BAR = { import: 'bar.import', ai: 'bar.ai', card: 'bar.card', review: 'bar.review', recipes: 'bar.recipes', home: 'bar.when', advanced: 'bar.custom', confirm: 'bar.confirm', plan: 'tab.plan', ingredients: 'tab.ing' };
  var THEME_COLOR = { y: '#F4C24B', c: '#FBF3E1', bur: '#5E1420' };

  function setChrome(v) {
    if (!v) return;
    $('#topTitle').textContent = v === 'now' ? (currentRecipe() ? currentRecipe().name : '') : t(BAR[v]);
    var n = DOTS[v];
    $('#dots').hidden = !n;
    $('#dots').querySelectorAll('i').forEach(function (d, i) { d.className = n && i === n - 1 ? 'on' : ''; });
    $('#btnBack').hidden = !HIST.length || COOK.indexOf(v) >= 0;
    $('#tabs').hidden = COOK.indexOf(v) < 0;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.className = b.dataset.tab === v ? 'on' : ''; });
  }

  function show(v, opt) {
    opt = opt || {};
    if (COOK.indexOf(v) >= 0 || opt.reset) { HIST = []; pending.target = null; }
    else if (view && view !== v && !opt.back && view !== 'confirm') HIST.push(view);
    if (v !== 'now') clearInterval(tickTimer);
    view = v; S.view = v; save();
    document.body.className = 't-' + THEME[v];
    document.body.dataset.view = v;
    var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', THEME_COLOR[THEME[v]]);
    VIEWS.forEach(function (n) { var e = $('#view-' + n); if (e) e.hidden = n !== v; });
    $('#top').hidden = false;
    var scr = $('#view-' + v); if (scr) scr.scrollTop = 0;
    closeSheet();
    setChrome(v);
    renderView(v);
  }
  function goBack() { var v = HIST.pop(); if (v) show(v, { back: true }); }

  function renderView(v) {
    if (v === 'import') openImport();
    else if (v === 'card') renderCard();
    else if (v === 'review') renderReview();
    else if (v === 'recipes') renderRecipes();
    else if (v === 'home') renderHome();
    else if (v === 'advanced') renderAdvanced();
    else if (v === 'confirm') renderConfirm();
    else if (v === 'now') renderNow();
    else if (v === 'plan') { renderPlan(); }
    else if (v === 'ingredients') renderIngredients();
  }

  // ---------- plan ----------
  function compute(done, avoid, target) {
    if (!BUILT) return { ok: false, steps: [], avvisi: [] };
    return Planner.plan({
      steps: currentSteps(),
      target: target != null ? target : S.target, tempC: S.tempC,
      quiet: avoid ? S.quiet : null,
      now: Date.now(), done: done
    });
  }
  function recompute() { PLAN = compute(S.done, S.avoidNight); return PLAN; }
  function activeStep() {
    if (!PLAN || !PLAN.ok) return null;
    return PLAN.steps.filter(function (s) { return !s.fatto; })[0] || null;
  }

  var lastDone = 0;
  function markDone(id) {
    if (Date.now() - lastDone < 600) return;
    lastDone = Date.now(); dayIdx = null;
    var next = Object.assign({}, S.done);
    next[id] = Date.now();
    var res = compute(next, S.avoidNight);
    if (!res.ok) { toast(t('toast.impossible')); return; }
    S.done = next;
    if (res.target !== S.target) { toast(t('toast.moved', { day: dayMid(res.target), t: hhmm(res.target) })); S.target = res.target; }
    save(); recompute();
    if (view === 'now') renderNow(); else renderPlan();
  }

  function unmarkDone(id) {
    var steps = currentSteps(), idx = -1;
    steps.forEach(function (s, i) { if (s.id === id) idx = i; });
    var next = {};
    Object.keys(S.done).forEach(function (k) {
      var j = -1; steps.forEach(function (s, i) { if (s.id === k) j = i; });
      if (j < idx) next[k] = S.done[k];
    });
    S.done = next; save(); recompute(); renderPlan();
  }

  // ---------- recipe import ----------
  var RV = null;       // the recipe being checked
  var ROWS = [
    { phase: 'autolyse', optional: true }, { phase: 'mix' }, { phase: 'fold', optional: true, fold: true },
    { phase: 'bulk' }, { phase: 'preshape', optional: true }, { phase: 'chill', optional: true }, { phase: 'proof', optional: true },
    { phase: 'preheat' }, { phase: 'bake', bake: true }, { phase: 'cool' }
  ];

  function showMsgs(box, errors, warnings) {
    box.innerHTML = '';
    (errors || []).forEach(function (e) { box.appendChild(txt('p', 'msg err', t('err.' + e.code, { d: e.detail || '' }))); });
    (warnings || []).forEach(function (w) { box.appendChild(txt('p', 'msg warn', t('warn.' + w.code, { d: w.detail || '' }))); });
    if ((errors || []).length && box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
  }

  function openImport() {
    $('#importMsg').innerHTML = '';
    var r = currentRecipe();
    $('#lastBox').hidden = !r;
    if (r) {
      $('#lastName').textContent = r.name;
      $('#lastSub').textContent = t('card.grams', { g: Calc.formatG(Calc.totalWeight(r.ingredients)) });
      $('#lastOthers').hidden = S.recipes.length < 2;
    }
    paintPhotos();
  }

  function readLink(url) {
    var box = $('#importMsg'), relay = window.SOURDOUGH_RELAY;
    if (!relay) { showMsgs(box, [{ code: 'no-relay' }], []); return; }
    box.innerHTML = ''; box.appendChild(txt('p', 'msg', t('recipe.reading')));
    $('#readText').disabled = true;
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 25000);
    fetch(relay + (relay.indexOf('?') < 0 ? '?' : '&') + 'url=' + encodeURIComponent(url), { signal: ctl.signal })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var res = RecipeImport.fromPage(data);
        if (res.errors && res.errors.length) { showMsgs(box, res.errors, []); return; }
        if (view !== 'import') return;   // the user already left this screen
        box.innerHTML = ''; openReview(res.recipe, res.warnings);
      })
      .catch(function () { showMsgs(box, [{ code: 'link-failed' }], []); })
      .then(function () { clearTimeout(timer); $('#readText').disabled = false; });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, no) {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : no(); } catch (e) { no(e); } ta.remove();
    });
  }

  function openReview(recipe, warnings) {
    var rec = JSON.parse(JSON.stringify(recipe));
    var rows = ROWS.map(function (def) {
      var st = rec.steps.filter(function (x) { return x.phase === def.phase; })[0];
      var d = RecipeImport.DEF[def.phase];
      var row = { phase: def.phase, optional: !!def.optional, fold: !!def.fold, bake: !!def.bake, on: !!st, present: !!st, touched: false };
      if (def.fold) { row.count = st ? st.count : 3; row.every = st ? st.everyMin : 30; row.est = !st || !!st.est; }
      else {
        row.min = st && st.minMin ? st.minMin : (def.bake ? d[1] : d[0]);
        row.max = st && st.maxMin ? st.maxMin : d[2];
        row.est = !st || !st.minMin;
        if (def.bake) row.tempC = (st && st.tempC) || (rec.bake && rec.bake.tempC) || '';
      }
      return row;
    });
    RV = { id: rec.id || null, name: rec.name || '', ing: rec.ingredients, rows: rows, warnings: warnings || [] };
    show('review');
  }

  function numInput(value, on) {
    var i = document.createElement('input'); i.type = 'number'; i.min = 0; i.step = 'any'; i.inputMode = 'decimal';
    i.value = value === '' || value == null ? '' : value; i.addEventListener('input', function () { on(i.value === '' ? 0 : +i.value); });
    return i;
  }

  function renderReview() {
    if (!RV) { show(currentRecipe() ? 'card' : 'import', { reset: true }); return; }
    var name = $('#rvName'); name.value = RV.name; name.oninput = function () { RV.name = name.value; };
    var box = $('#rvIng'); box.innerHTML = '';
    RV.ing.forEach(function (it, i) {
      var row = document.createElement('div'); row.className = 'rrow';
      var nm = document.createElement('input'); nm.type = 'text'; nm.value = it.name; nm.className = 'rname'; nm.addEventListener('input', function () { it.name = nm.value; });
      var g = numInput(it.g, function (v) { it.g = v; });
      var ty = document.createElement('select');
      ['flour', 'water', 'starter', 'yeast', 'salt', 'other'].forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = t('ty.' + k); if (k === it.type) o.selected = true; ty.appendChild(o); });
      ty.addEventListener('change', function () { it.type = ty.value; });
      var del = txt('button', 'x', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Remove');
      del.addEventListener('click', function () { RV.ing.splice(i, 1); renderReview(); });
      row.appendChild(nm); row.appendChild(g); row.appendChild(ty); row.appendChild(del);
      box.appendChild(row);
    });
    var sb = $('#rvSteps'); sb.innerHTML = '';
    RV.rows.forEach(function (row) {
      var div = document.createElement('div'); div.className = 'rrow steprow';
      var head = document.createElement('label'); head.className = 'rlabel';
      if (row.optional) {
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = row.on;
        cb.addEventListener('change', function () { row.on = cb.checked; row.touched = true; renderReview(); });
        head.appendChild(cb);
      }
      head.appendChild(document.createTextNode(' ' + t('ph.' + row.phase)));
      if (row.est && !(row.optional && !row.on)) head.appendChild(txt('i', 'est', t('review.estimated')));
      div.appendChild(head);
      if (!row.optional || row.on) {
        if (row.fold) {
          div.appendChild(numInput(row.count, function (v) { row.count = Math.max(1, Math.round(v)); row.touched = true; }));
          div.appendChild(txt('span', 'u', t('review.times')));
          div.appendChild(numInput(row.every, function (v) { row.every = v; row.touched = true; }));
          div.appendChild(txt('span', 'u', t('review.min')));
        } else if (row.bake) {
          div.appendChild(numInput(row.min, function (v) { row.min = v; row.max = v; row.touched = true; }));
          div.appendChild(txt('span', 'u', t('review.min')));
          div.appendChild(numInput(row.tempC, function (v) { row.tempC = v; row.touched = true; }));
          div.appendChild(txt('span', 'u', '°C'));
        } else {
          div.appendChild(numInput(row.min, function (v) { row.min = v; if (row.max < v) row.max = v; row.touched = true; }));
          div.appendChild(txt('span', 'u', '–'));
          div.appendChild(numInput(row.max, function (v) { row.max = v; row.touched = true; }));
          div.appendChild(txt('span', 'u', t('review.min')));
        }
      }
      sb.appendChild(div);
    });
    showMsgs($('#rvMsg'), [], RV.warnings);
  }

  function saveReview() {
    var ing = RV.ing.filter(function (i) { return i.name || i.g > 0; });
    var sum = function (type) { return ing.reduce(function (a, i) { return a + (i.type === type ? i.g : 0); }, 0); };
    var errors = [];
    if (!(sum('flour') > 0)) errors.push({ code: 'need-flour' });
    if (!(sum('starter') > 0) && !(sum('yeast') > 0)) errors.push({ code: 'need-starter' });
    if (errors.length) { showMsgs($('#rvMsg'), errors, RV.warnings); return; }
    var steps = [], bake = { tempC: null, minutes: null };
    RV.rows.forEach(function (row) {
      var include = row.optional ? row.on : (row.present || row.touched);
      if (!include) return;
      if (row.fold) steps.push({ phase: 'fold', count: row.count, everyMin: row.every });
      else if (row.bake) { steps.push({ phase: 'bake', minMin: row.min, maxMin: row.min, tempC: row.tempC || undefined }); bake = { tempC: row.tempC || null, minutes: row.min }; }
      else steps.push({ phase: row.phase, minMin: row.min, maxMin: Math.max(row.min, row.max) });
    });
    var rec = { id: RV.id || 'r' + Date.now().toString(36), name: (RV.name || '').trim() || t('recipe.untitled'), ingredients: ing, steps: steps, bake: bake, savedAt: Date.now() };
    S.recipes = [rec].concat(S.recipes.filter(function (r) { return r.id !== rec.id; })).slice(0, 5);
    useRecipe(rec.id);
    RV = null;
    show('card', { reset: true });
  }

  // a new recipe is in use: the plan being followed no longer applies
  function useRecipe(id) {
    S.recipeId = id; S.loafG = null; S.done = {}; S.leaven = null; S.started = false; S.avoidNight = false; S.nowMode = false;
    save(); build(); recompute();
  }

  // ---------- recipe card and leaven switch ----------
  function renderLeaven(box) {
    var r = currentRecipe(), kind = origKind(r);
    box.innerHTML = '';
    if (!kind) return;
    box.appendChild(txt('div', 'label', t('card.leaven')));
    var seg = el('div', 'seg');
    (kind === 'yeast' ? ['yeast', 'starter'] : ['starter', 'yeast']).forEach(function (m) {
      var b = txt('button', m === leavenMode() ? 'on' : '', t(m === 'yeast' ? 'card.yeast' : 'card.starter')); b.type = 'button';
      b.addEventListener('click', function () {
        if (m === leavenMode()) return;
        if (S.started && Object.keys(S.done).length && !confirm(t('plan.resetConfirm'))) return;
        S.leaven = m; S.done = {}; save(); build(); recompute();
        renderView(view);
      });
      seg.appendChild(b);
    });
    box.appendChild(seg);
    var b = BUILT;
    if (CONV && CONV.converted && b) {
      var sg = b.ingredients.reduce(function (a, i) { return a + (i.type === 'starter' ? i.g : 0); }, 0);
      var yg = b.ingredients.reduce(function (a, i) { return a + (i.type === 'yeast' ? i.g : 0); }, 0);
      box.appendChild(txt('p', 'hint', kind === 'yeast'
        ? t('conv.toStarter', { s: Calc.formatG(sg), y: Calc.formatG(CONV.info.yeastG * b.scale), f: CONV.info.factor })
        : t('conv.toYeast', { y: Calc.formatG(yg), s: Calc.formatG(CONV.info.starterG * b.scale), f: CONV.info.factor })));
    } else if (CONV) {
      box.appendChild(txt('p', 'hint', t('conv.skipped')));
    }
  }

  function doughRows(b) {
    var pc = Calc.bakersPercent(b.ingredients), frag = document.createDocumentFragment();
    b.ingredients.forEach(function (i, k) {
      var row = el('div', 'row');
      row.appendChild(txt('span', '', i.name));
      var v = el('span', 'v'); v.appendChild(txt('b', '', Calc.formatG(i.g))); v.appendChild(document.createTextNode('  ' + Math.round(pc.byIndex[k]) + ' %'));
      row.appendChild(v); frag.appendChild(row);
    });
    return frag;
  }

  function renderCard() {
    var r = currentRecipe(), b = BUILT;
    if (!r || !b) { show('import', { reset: true }); return; }
    $('#cardTitle').textContent = r.name;
    $('#cardSub').textContent = t('card.grams', { g: Calc.formatG(b.loafG) });
    renderLeaven($('#cardLeaven'));
    var list = $('#cardList'); list.innerHTML = ''; list.appendChild(doughRows(b));
    paintPhotos();
  }

  function renderRecipes() {
    var box = $('#recipeList'); box.innerHTML = '';
    S.recipes.forEach(function (rec) {
      var row = el('button', 'row'); row.type = 'button';
      row.appendChild(txt('span', '', rec.name));
      row.appendChild(txt('span', 'v', rec.id === S.recipeId ? '✓' : ''));
      row.addEventListener('click', function () {
        if (rec.id === S.recipeId && S.started) { goBack(); return; }
        if (rec.id !== S.recipeId) useRecipe(rec.id);
        show('card', { reset: true });
      });
      box.appendChild(row);
    });
  }

  // ---------- step 2: when ----------
  var whenMode = 'pick';
  function nextDow(dow, h, m) {
    var d = new Date(); d.setHours(h, m, 0, 0);
    var add = (dow - d.getDay() + 7) % 7;
    if (add === 0 && d.getTime() <= Date.now()) add = 7;
    d.setDate(d.getDate() + add);
    return d.getTime();
  }
  function nextQuarter() { var g = 15 * MIN; return Math.ceil(Date.now() / g) * g; }
  function earliestNow(quiet) {
    return Planner.earliest({ steps: currentSteps(), tempC: S.tempC, quiet: quiet || null, start: nextQuarter() });
  }
  function renderHome() {
    if (!currentRecipe()) { show('import', { reset: true }); return; }
    if (!S.target) S.target = defaultTarget();
    if (pending.target == null || pending.target <= Date.now()) pending.target = S.target > Date.now() ? S.target : defaultTarget();   // never offer a time in the past
    $('#target').value = toLocalInput(pending.target);
    $('#target').min = toLocalInput(Date.now());
    $('#recipeName').textContent = currentRecipe().name;
    $('#whenMsg').innerHTML = '';
    $('#optNow').className = 'opt' + (whenMode === 'now' ? ' on' : '');
    $('#optPick').className = 'opt' + (whenMode === 'pick' ? ' on' : '');
    $('#optNow').setAttribute('aria-checked', String(whenMode === 'now'));
    $('#optPick').setAttribute('aria-checked', String(whenMode === 'pick'));
    $('#pickBox').hidden = whenMode !== 'pick';
    var res = earliestNow();
    $('#nowText').textContent = res.ok ? t('when.nowText', { day: dayMid(res.target), t: hhmm(res.target) }) : t('notice.none');
    var box = $('#quickDates'); box.innerHTML = '';
    [[6, 13, 0], [0, 13, 0], [0, 19, 0]].forEach(function (q) {
      var ms = nextDow(q[0], q[1], q[2]);
      var b = txt('button', 'chip', cap(new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'short' })) + ' ' + pad(q[1]) + ':' + pad(q[2])); b.type = 'button';
      b.addEventListener('click', function () { pending.target = ms; $('#target').value = toLocalInput(ms); });
      box.appendChild(b);
    });
    paintPhotos();
  }
  function continueFromHome() {
    if (!BUILT) return;
    var target, nowMode;
    if (whenMode === 'now') {
      var res = earliestNow();
      if (!res.ok) { $('#whenMsg').innerHTML = ''; $('#whenMsg').appendChild(txt('p', 'msg err', t('notice.none'))); return; }
      target = res.target; nowMode = true;
    } else {
      var v = $('#target').value;
      if (!v) { showMsgs($('#whenMsg'), [{ code: 'no-date' }], []); return; }
      target = new Date(v).getTime(); nowMode = false;
      if (!(target > Date.now())) { showMsgs($('#whenMsg'), [{ code: 'past' }], []); return; }
    }
    CF = { target: target, nowMode: nowMode, done: {}, ideal: compute({}, false, target), avoid: null, mode: 'ideal' };
    show('confirm');
  }

  // ---------- customize ----------
  function renderAdvanced() {
    var b = BUILT; if (!b) { show('import', { reset: true }); return; }
    var r = currentRecipe();
    var asWritten = Math.round(Calc.totalWeight((CONV && CONV.converted ? CONV.recipe : r).ingredients));
    var sizes = [[null, t('cu.asWritten')], [Math.round(asWritten * 0.75 / 50) * 50, t('cu.smaller')], [Math.round(asWritten * 1.25 / 50) * 50, t('cu.bigger')]];
    var sb = $('#sizes'); sb.innerHTML = '';
    sizes.forEach(function (s) {
      var c = txt('button', 'chip' + ((S.loafG || null) === s[0] ? ' on' : ''), s[1] + (s[0] ? ' · ' + s[0] + ' g' : ' · ' + asWritten + ' g')); c.type = 'button';
      c.addEventListener('click', function () { S.loafG = s[0]; S.done = {}; save(); build(); recompute(); renderAdvanced(); });
      sb.appendChild(c);
    });
    var ks = $('#kitchenSeg'); ks.innerHTML = '';
    var temps = [18, 22, 26], nearest = temps.reduce(function (a, k) { return Math.abs(S.tempC - k) < Math.abs(S.tempC - a) ? k : a; }, 22);
    [[18, 'cu.cool'], [22, 'cu.normal'], [26, 'cu.warm']].forEach(function (k) {
      var on = k[0] === nearest;
      var bt = el('button', on ? 'on' : '', t(k[1]) + '<small>' + k[0] + ' °C</small>'); bt.type = 'button';
      bt.addEventListener('click', function () { S.tempC = k[0]; save(); recompute(); renderAdvanced(); });
      ks.appendChild(bt);
    });
    $('#feedsBox').hidden = !(b.starterG > 0);
    var fs = $('#feedsSeg'); fs.innerHTML = '';
    [['uno11-uno12', 'cu.feedsClassic', 'cu.feedsClassicSub'], ['singolo', 'cu.feedsQuick', 'cu.feedsQuickSub']].forEach(function (f) {
      var on = f[0] === 'singolo' ? S.preset === 'singolo' : S.preset !== 'singolo';
      var bt = el('button', on ? 'on' : '', t(f[1]) + '<small>' + t(f[2]) + '</small>'); bt.type = 'button';
      bt.addEventListener('click', function () { S.preset = f[0]; S.done = {}; save(); build(); recompute(); renderAdvanced(); });
      fs.appendChild(bt);
    });
    $('#quietOn').checked = S.quietOn;
    $('#quietStart').value = S.quiet.start; $('#quietEnd').value = S.quiet.end;
    $('#quietRow').hidden = !S.quietOn;
    $('#nightWindow').textContent = t('cu.nightWindow', { a: S.quiet.start, b: S.quiet.end });
  }

  // ---------- step 3: confirm ----------
  function renderConfirm() {
    if (!CF) { show(currentRecipe() ? 'home' : 'import', { reset: true }); return; }
    var plan = CF.mode === 'avoid' ? CF.avoid : CF.ideal, notes = $('#cfNotes'), btns = $('#cfButtons');
    notes.innerHTML = ''; btns.innerHTML = '';
    paintPhotos();
    function button(cls, label, fn) { var b = txt('button', 'btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); btns.appendChild(b); }
    if (!plan.ok) {
      $('#cfReady').textContent = '–'; $('#cfStarts').textContent = '';
      notes.appendChild(txt('p', 'notice', t('notice.none')));
      button('', t('review.back'), goBack);
      return;
    }
    var sm = Flow.summary(plan, { quiet: S.quiet });
    var todo = plan.steps.filter(function (s) { return !s.fatto; }).length;
    $('#cfReady').textContent = dayBrief(plan.target) + ', ' + hhmm(plan.target);
    $('#cfStarts').textContent = t('cf.starts', { day: dayMid(sm.firstAt), t: hhmm(sm.firstAt), n: todo });
    var night = S.quietOn ? sm.nightSteps : [];
    plan.avvisi.forEach(function (a) {
      if (a.codice === 'target-spostato') notes.appendChild(txt('p', 'notice', t('notice.moved', { day: dayMid(plan.target), t: hhmm(plan.target), d: dur(Math.abs(a.spostamentoMin)), dir: t(a.spostamentoMin > 0 ? 'notice.later' : 'notice.earlier') })));
    });
    if (CF.mode === 'avoid') {
      var same = Math.abs(CF.avoid.target - CF.ideal.target) < MIN;
      notes.appendChild(txt('p', 'okcard', same ? t('cf.nightFreeSame') : t('cf.nightFreeMoved', { day: dayMid(plan.target), t: hhmm(plan.target) })));
      button('', t('cf.start'), startPlan);
      button('txt', t('cf.original'), function () { CF.mode = 'ideal'; renderConfirm(); });
      return;
    }
    if (night.length) {
      var card = el('div', 'nightcard');
      card.appendChild(el('div', 'h', MOON)); card.firstChild.appendChild(document.createTextNode(night.length === 1 ? t('cf.nightOne') : t('cf.nightMany', { n: night.length })));
      var pills = el('div', 'pills');
      night.forEach(function (n) { var s = el('span'); s.appendChild(txt('b', '', hhmm(n.at))); s.appendChild(document.createTextNode('  ' + L(n.name))); pills.appendChild(s); });
      card.appendChild(pills); notes.appendChild(card);
      button('', t('cf.go'), startPlan);
      button('sec', t('cf.avoid'), function () {
        var target = CF.target;
        if (CF.nowMode) {   // starting now cannot dodge the night: look for the best moment to start instead
          var er = earliestNow(S.quiet);
          if (!er.ok) { toast(t('cf.noAvoid'), 6000); return; }
          target = er.target;
        }
        var av = compute({}, true, target);
        if (!av.ok) { toast(t('cf.noAvoid'), 6000); return; }
        CF.avoid = av; CF.mode = 'avoid'; renderConfirm();
      });
    } else {
      button('', t('cf.start'), startPlan);
    }
  }

  function startPlan() {
    if (!CF) return;
    var plan = CF.mode === 'avoid' ? CF.avoid : CF.ideal;
    if (!plan.ok) return;
    var done = {};
    var prev = { target: S.target, done: S.done, avoidNight: S.avoidNight, nowMode: S.nowMode, started: S.started };
    S.avoidNight = CF.mode === 'avoid'; S.target = plan.target; S.done = done; S.nowMode = CF.nowMode; S.started = true;
    recompute();
    if (!PLAN.ok) {
      Object.assign(S, prev); recompute(); save();
      toast(t('toast.impossible')); return;
    }
    if (Math.abs(PLAN.target - plan.target) >= MIN) { S.target = PLAN.target; toast(t('toast.moved', { day: dayMid(PLAN.target), t: hhmm(PLAN.target) })); }
    CF = null; dayIdx = null; pending.target = null;
    save(); show('now');
  }

  function resetPlan() {
    S.done = {}; S.started = false; S.avoidNight = false; S.nowMode = false; dayIdx = null; pending.target = null;
    save(); recompute(); closeSheet(); show('home', { reset: true });
  }

  // ---------- "now" screen ----------
  function renderNow() {
    clearInterval(tickTimer);
    var when = $('#when');
    function empty(msg) {
      $('#nowEyebrow').textContent = ''; $('#nowName').textContent = msg; when.hidden = true; $('#nowSub').textContent = '';
      $('#nowNeedBox').hidden = true; $('#nowHow').hidden = true; $('#nowDone').hidden = true;
    }
    if (!PLAN || !PLAN.ok) { empty(t('notice.none')); return; }
    var a = activeStep();
    if (!a) { empty(t('now.finished')); $('#nowDone').hidden = false; $('#nowDone').textContent = t('now.again'); $('#nowDone').dataset.mode = 'again'; return; }
    when.hidden = false;
    $('#nowDone').textContent = t('now.done'); $('#nowDone').dataset.mode = '';
    $('#nowPhoto').style.backgroundImage = photoUrl(STEP_IMG[a.foto] || 'mood_00');
    $('#nowName').textContent = L(a.nome);
    var need = needList(a), nb = $('#nowNeed'); nb.innerHTML = '';
    need.forEach(function (n) { nb.appendChild(txt('span', 'chip', n)); });
    $('#nowNeedBox').hidden = !need.length;
    var due0 = Date.now() >= a.inizio;
    $('#nowHow').hidden = !due0;
    $('#nowHowBody').hidden = true;
    if (due0) { $('#nowInstr').textContent = L(a.istruzioni); $('#nowSignal').textContent = L(a.segnale); }
    function paint() {
      var now = Date.now(), due = now >= a.inizio;
      $('#nowEyebrow').textContent = due ? t('now.due') : t('now.name');
      $('#nowDone').hidden = !due;
      if (!due) {
        $('#whenDay').textContent = dayLabel(a.inizio);
        $('#whenTime').textContent = hhmm(a.inizio);
        $('#nowSub').textContent = t('now.inTime', { d: dur(Math.max(1, Math.round((a.inizio - now) / MIN))) });
      } else if (a.entro > a.inizio) {
        $('#whenDay').textContent = t('now.latestBy');
        $('#whenTime').textContent = hhmm(a.entro);
        $('#nowSub').textContent = now > a.entro ? t('now.late') : '';
      } else {
        $('#whenDay').textContent = t('now.right');
        $('#whenTime').textContent = hhmm(a.inizio);
        $('#nowSub').textContent = now <= a.inizio + 15 * MIN ? '' : t('now.late');
      }
    }
    paint();
    tickTimer = setInterval(function () {
      var nowDue = Date.now() >= a.inizio;
      if (nowDue !== due0) { renderNow(); return; }
      paint();
    }, 15000);
  }

  // ---------- plan screen ----------
  function notices() {
    var box = $('#notices');
    box.innerHTML = '';
    if (!PLAN.ok) { box.appendChild(txt('p', 'notice', t('notice.none'))); return; }
    PLAN.avvisi.forEach(function (a) {
      if (a.codice === 'target-spostato') {
        box.appendChild(txt('p', 'notice', t('notice.moved', { day: dayMid(PLAN.target), t: hhmm(PLAN.target), d: dur(Math.abs(a.spostamentoMin)),
                                                      dir: t(a.spostamentoMin > 0 ? 'notice.later' : 'notice.earlier') })));
      } else if (a.codice === 'passo-oltre-massimo') {
        box.appendChild(txt('p', 'notice', t('notice.over')));
      }
    });
  }

  function renderPlan() {
    if (!PLAN) recompute();
    notices();
    var list = $('#timeline'), tabs = $('#dayTabs');
    list.innerHTML = ''; tabs.innerHTML = '';
    if (!PLAN.ok) { $('#planSub').textContent = ''; return; }
    $('#icsHelp').hidden = !IOS; $('#icsHelp').textContent = t('plan.calendarHelpIos');
    var first = activeStep();
    $('#planSub').textContent = first ? t('plan.starts', { day: dayMid(first.inizio), t: hhmm(first.inizio) }) : t('plan.allDone');

    var days = [], byKey = {};
    PLAN.steps.forEach(function (s, i) {
      if (s.inizio == null) return;
      var k = dayKey(s.inizio);
      if (!byKey[k]) { byKey[k] = { key: k, at: s.inizio, items: [] }; days.push(byKey[k]); }
      byKey[k].items.push({ s: s, i: i });
    });
    if (dayIdx == null || dayIdx >= days.length) {
      var act = first ? dayKey(first.inizio) : null, found = 0;
      days.forEach(function (d, n) { if (d.key === act) found = n; });
      dayIdx = found;
    }
    days.forEach(function (d, n) {
      var b = txt('button', n === dayIdx ? 'on' : '', dayShort(d.at)); b.type = 'button'; b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { dayIdx = n; renderPlan(); });
      tabs.appendChild(b);
    });

    var day = days[dayIdx], prev = null;
    if (S.avoidNight && dayIdx > 0) {
      var before = days[dayIdx - 1].items[days[dayIdx - 1].items.length - 1].s;
      if (Planner.blockedIntervals(before.inizio, day.items[0].s.inizio, S.quiet).some(function (iv) { return iv[0] >= before.inizio && iv[1] <= day.items[0].s.inizio; })) list.appendChild(nightRow());
    }
    day.items.forEach(function (it) {
      if (prev && S.avoidNight) {
        var b = Planner.blockedIntervals(prev.inizio, it.s.inizio, S.quiet).filter(function (iv) { return iv[0] >= prev.inizio && iv[1] <= it.s.inizio; });
        if (b.length) list.appendChild(nightRow());
      }
      list.appendChild(stepItem(it.s, it.i));
      prev = it.s;
    });
  }

  function nightRow() { return txt('li', 'night-row', '☾  ' + t('plan.nightRest', { a: S.quiet.start, b: S.quiet.end })); }

  function stepItem(s) {
    var li = document.createElement('li');
    var isNight = S.quietOn && !s.fatto && Flow.isNight(s.inizio, S.quiet);
    li.className = 'step' + (s.fatto ? ' done' : '') + (isNight ? ' night' : '');
    var head = document.createElement('button');
    head.type = 'button'; head.setAttribute('aria-expanded', 'false');
    head.appendChild(el('span', 'dot'));
    var time = document.createElement('time'); time.textContent = hhmm(s.inizio);
    head.appendChild(time);
    head.appendChild(txt('span', 'name', L(s.nome)));
    var meta = document.createElement('span'); meta.className = 'meta';
    if (s.fatto) meta.textContent = t('chip.done');
    else {
      var bits = [s.entro > s.inizio ? t('chip.by', { t: hhmm(s.entro) }) : t('chip.exact'), t('chip.then', { d: dur(s.durataMin) })];
      if (isNight) bits.push(t('plan.night'));
      if (s.allungato) bits.push(t('chip.long'));
      if (s.accorciato) bits.push(t('chip.short'));
      if (s.stimato) bits.push(t('chip.est'));
      meta.textContent = bits.join(' · ');
    }
    head.appendChild(meta);

    var detail = document.createElement('div');
    detail.className = 'detail'; detail.hidden = true;
    if (!s.fatto) {
      var need = needText(s);
      if (need) detail.appendChild(txt('p', 'grams', need));
      detail.appendChild(txt('p', '', L(s.istruzioni)));
      detail.appendChild(txt('p', 'signal', L(s.segnale)));
      var done = txt('button', '', t('act.done')); done.type = 'button';
      done.addEventListener('click', function () { markDone(s.id); });
      detail.appendChild(done);
    } else {
      var undo = txt('button', 'secondary', t('act.undo')); undo.type = 'button';
      undo.addEventListener('click', function () { unmarkDone(s.id); });
      detail.appendChild(undo);
    }
    head.addEventListener('click', function () {
      var open = detail.hidden;
      detail.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
    });
    li.appendChild(head); li.appendChild(detail);
    return li;
  }

  // ---------- ingredients ----------
  function renderIngredients() {
    var r = currentRecipe(), b = BUILT, body = $('#ingBody');
    body.innerHTML = '';
    if (!r || !b) return;
    $('#ingTitle').textContent = r.name;
    $('#ingSub').textContent = t('card.grams', { g: Calc.formatG(b.loafG) });
    renderLeaven($('#ingLeaven'));
    var dough = el('div', 'card'); dough.appendChild(doughRows(b));
    body.appendChild(txt('div', 'label', t('ing.dough'))); body.appendChild(dough);
    var feeds = b.steps.filter(function (x) { return x.id.indexOf('rinfresco') === 0; });
    if (feeds.length) {
      body.appendChild(txt('div', 'label', t('ing.feeds')));
      var fc = el('div', 'card');
      feeds.forEach(function (f) {
        var row = el('div', 'row'); row.appendChild(txt('span', '', L(f.nome))); row.appendChild(txt('span', 'v', gramsText(f))); fc.appendChild(row);
      });
      body.appendChild(fc);
      if (b.feeds.scaledUp) body.appendChild(txt('p', 'hint', t('ing.scaledUp')));
    }
    var w = waterC();
    body.appendChild(txt('p', 'hint', t('ing.water', { c: w.c, d: S.ddt })));
    if (w.warning) body.appendChild(txt('p', 'hint', t(w.warning === 'hot' ? 'ing.waterHot' : 'ing.waterCold')));
  }

  // ---------- calendar export ----------
  function exportCalendar() {
    if (!PLAN || !PLAN.ok) return;
    var events = [], uid = Date.now().toString(36);
    PLAN.steps.forEach(function (s, i) {
      if (s.fatto || s.inizio == null) return;
      var lines = [L(s.istruzioni)];
      var need = needText(s);
      if (need) lines.unshift(need);
      if (s.entro > s.inizio) lines.push(t('ics.latest', { t: hhmm(s.entro) }));
      lines.push(L(s.segnale));
      events.push({ uid: uid + '-' + i + '@sourdough', start: s.inizio, end: s.inizio + 15 * MIN, summary: L(s.nome),
                    description: lines.join('\n'), alarms: [10, 0] });
    });
    events.push({ uid: uid + '-ready@sourdough', start: PLAN.target, end: PLAN.target + 30 * MIN, summary: t('ics.ready'),
                  description: '', alarms: [0] });
    var blob = new Blob([Ics.build(events, { name: 'Sourdough' })], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'sourdough-plan.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast(t(IOS ? 'toast.calendarIos' : 'toast.calendar'));
  }

  // ---------- menu sheet ----------
  function openSheet() { $('#scrim').hidden = false; $('#sheet').hidden = false; }
  function closeSheet() { $('#scrim').hidden = true; $('#sheet').hidden = true; }
  function sheetRow(label, fn, cls) {
    var r = el('button', 'row' + (cls ? ' ' + cls : '')); r.type = 'button';
    r.appendChild(txt('span', '', label));
    if (fn) r.addEventListener('click', fn);
    return r;
  }
  function confirmLoss() { return !(S.started && Object.keys(S.done).length) || confirm(t('plan.resetConfirm')); }
  function openMenu() {
    var body = $('#sheetBody'); body.innerHTML = '';
    body.appendChild(sheetRow(t('menu.recipe'), function () { if (!confirmLoss()) return; closeSheet(); show('recipes'); }));
    if (currentRecipe()) body.appendChild(sheetRow(t('menu.time'), function () { if (!confirmLoss()) return; closeSheet(); show('home'); }));
    if (S.started && PLAN && PLAN.ok) body.appendChild(sheetRow(t('plan.calendar'), function () { closeSheet(); exportCalendar(); }));
    var lang = el('div', 'row'); lang.appendChild(txt('span', '', t('menu.language')));
    var seg = el('div', 'seg'); seg.style.width = '140px';
    ['it', 'en'].forEach(function (l) {
      var b = txt('button', S.lang === l ? 'on' : '', l.toUpperCase()); b.type = 'button';
      b.addEventListener('click', function () { S.lang = l; I18n.set(l); save(); applyLang(); openMenu(); });
      seg.appendChild(b);
    });
    lang.appendChild(seg); body.appendChild(lang);
    body.appendChild(sheetRow(t('menu.help'), openHelp));
    if (S.started) body.appendChild(sheetRow(t('menu.reset'), function () {
      if (Object.keys(S.done).length && !confirm(t('plan.resetConfirm'))) return;
      resetPlan();
    }, 'danger'));
    openSheet();
  }
  function openHelp() {
    var body = $('#sheetBody'); body.innerHTML = '';
    body.appendChild(txt('h2', '', t('intro.title')));
    body.appendChild(txt('p', '', t('intro.lead')));
    ['intro.p1', 'intro.p2', 'intro.p3'].forEach(function (k) { body.appendChild(txt('p', 'soft', t(k))); });
    var close = txt('button', 'btn', t('menu.close')); close.type = 'button'; close.style.marginTop = '12px'; close.addEventListener('click', closeSheet);
    body.appendChild(close);
  }

  // ---------- events ----------
  function bind() {
    $('#btnBack').addEventListener('click', goBack);
    $('#btnMenu').addEventListener('click', openMenu);
    $('#scrim').addEventListener('click', closeSheet);
    document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.tab); }); });

    $('#useSample').addEventListener('click', function () { $('#recipeText').value = RecipeImport.SAMPLE[I18n.get()] || RecipeImport.SAMPLE.en; });
    $('#readText').addEventListener('click', function () {
      var text = $('#recipeText').value.trim();
      if (!text) { showMsgs($('#importMsg'), [{ code: 'no-text' }], []); return; }
      if (/^https?:\/\/\S+$/i.test(text)) { readLink(text); return; }
      var r = RecipeImport.parseText(text);
      if (!r.recipe.ingredients.length) { showMsgs($('#importMsg'), [{ code: 'no-ingredients' }], []); return; }
      openReview(r.recipe, r.warnings);
    });
    $('#lastBtn').addEventListener('click', function () { show('card'); });
    $('#lastOthers').addEventListener('click', function () { show('recipes'); });
    $('#aiLink').addEventListener('click', function () { $('#aiMsg').innerHTML = ''; show('ai'); });
    $('#copyPrompt').addEventListener('click', function () {
      copyText(RecipeImport.promptFor(I18n.get())).then(function () { toast(t('recipe.copied')); }, function () { $('#recipeJson').value = RecipeImport.promptFor(I18n.get()); });
    });
    $('#readJson').addEventListener('click', function () {
      var r = RecipeImport.fromJson($('#recipeJson').value);
      if (r.errors && r.errors.length) { showMsgs($('#aiMsg'), r.errors, []); return; }
      openReview(r.recipe, r.warnings);
    });

    $('#cardContinue').addEventListener('click', function () { show('home'); });
    $('#cardEdit').addEventListener('click', function () { var r = currentRecipe(); if (r) openReview(r, []); });
    $('#cardOther').addEventListener('click', function () { show('recipes'); });
    $('#rvAdd').addEventListener('click', function () { if (RV) { RV.ing.push({ name: '', g: 0, type: 'other' }); renderReview(); } });
    $('#rvSave').addEventListener('click', saveReview);
    $('#rvBack').addEventListener('click', goBack);
    $('#recNew').addEventListener('click', function () { show('import'); });

    function pick(mode) { whenMode = mode; renderHome(); }
    $('#optNow').addEventListener('click', function () { pick('now'); });
    $('#optPick').addEventListener('click', function (e) { if (whenMode !== 'pick') pick('pick'); });
    [['#optNow', 'now'], ['#optPick', 'pick']].forEach(function (o) {
      $(o[0]).addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === $(o[0])) { e.preventDefault(); pick(o[1]); } });
    });
    $('#target').addEventListener('change', function (e) { if (e.target.value) pending.target = new Date(e.target.value).getTime(); });
    $('#changeRecipe').addEventListener('click', function () { show('recipes'); });
    $('#goCustom').addEventListener('click', function () { show('advanced'); });
    $('#homeContinue').addEventListener('click', continueFromHome);

    $('#advDone').addEventListener('click', goBack);
    $('#quietOn').addEventListener('change', function (e) { S.quietOn = e.target.checked; $('#quietRow').hidden = !S.quietOn; save(); });
    $('#quietStart').addEventListener('change', function (e) { if (e.target.value) { S.quiet.start = e.target.value; save(); $('#nightWindow').textContent = t('cu.nightWindow', { a: S.quiet.start, b: S.quiet.end }); } });
    $('#quietEnd').addEventListener('change', function (e) { if (e.target.value) { S.quiet.end = e.target.value; save(); $('#nightWindow').textContent = t('cu.nightWindow', { a: S.quiet.start, b: S.quiet.end }); } });

    $('#nowDone').addEventListener('click', function () {
      if ($('#nowDone').dataset.mode === 'again') { resetPlan(); return; }
      var a = activeStep(); if (a) markDone(a.id);
    });
    $('#nowHowBtn').addEventListener('click', function () { $('#nowHowBody').hidden = !$('#nowHowBody').hidden; });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && PLAN && PLAN.ok && S.started) { recompute(); if (view === 'plan') renderPlan(); if (view === 'now') renderNow(); }
    });
  }

  // ---------- start ----------
  bind();
  paintPhotos();
  if (!S.target) S.target = defaultTarget();
  build();
  recompute();
  var planOk = !!(PLAN && PLAN.ok);
  applyLang();
  show(Flow.startView(S, planOk), { reset: true });   // a running plan opens on Now; any old saved screen name is ignored
  if (IOS && !window.navigator.standalone && !S.iosHint) { S.iosHint = true; save(); toast(t('install.text'), 9000); }
})();
