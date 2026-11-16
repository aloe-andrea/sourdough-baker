(function () {
  'use strict';

  var MIN = 60000;
  var KEY = 'sourdough.v2';
  var $ = function (s) { return document.querySelector(s); };
  var t = I18n.t, L = I18n.L;

  var DEFAULTS = {
    lang: 'en', target: null, preset: 'uno11-uno12', recipes: [], recipeId: null, loafG: null, ddt: 25, tempC: 22,
    quietOn: true, quiet: { start: '23:00', end: '07:00' },
    done: {}, view: 'home'
  };

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }

  var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var S = load();
  I18n.set(S.lang);
  var PLAN = null;       // last computed plan
  var BUILT = null;      // the current recipe turned into steps and grams

  function currentRecipe() { return S.recipes.filter(function (r) { return r.id === S.recipeId; })[0] || null; }
  function build() {
    var r = currentRecipe();
    BUILT = r ? Recipe.fromImported(r, S.preset, { loafG: S.loafG }) : null;
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
  function needText(st) {
    var out = gramsText(st);
    if (st.id === waterStepId()) out += (out ? ' · ' : '') + t('step.water', { c: waterC().c });
    return out;
  }
  var view = 'home';
  var dayIdx = null;     // selected day tab in the plan

  // ---------- formatting ----------
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var hhmm = function (ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var dayLabel = function (ms) { return cap(new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' })); };
  // Italian writes weekdays and months in lower case inside a sentence, English capitalises them
  var dayMid = function (ms) { var s = dayLabel(ms); return I18n.get() === 'it' ? s.toLowerCase() : s; };
  var dayShort = function (ms) { return cap(new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric' })); };
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

  // ---------- toast ----------
  var toastTimer;
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || 4500);
  }

  // ---------- photos ----------
  var IMGS = window.IMAGES || [];
  // personal photos (images.local.js, not published) replace the stand-ins
  if (window.IMAGES_LOCAL && window.IMAGES_LOCAL.length) IMGS = IMGS.filter(function (i) { return !i.standin; }).concat(window.IMAGES_LOCAL);
  var CAT_FOR = { starter: 'starter', impasto: 'dough', pieghe: 'dough', bulk: 'dough', forma: 'dough',
                  frigo: 'mood', forno: 'dough', cottura: 'loaf', pane: 'loaf' };
  var bgLayers = [$('#bgA'), $('#bgB')], bgIdx = 0, currentImg = null;
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
  function byUse(use) { return IMGS.filter(function (i) { return i.use === use; }); }
  function isPortrait() { return window.innerHeight >= window.innerWidth; }

  // The panel follows the phone/computer light or dark setting, tinted from the photo, so it
  // stays the same style while the photo changes.
  function applyPalette(img) {
    var pal = dark && dark.matches ? img.dark : img.light;
    var r = document.documentElement.style;
    document.body.dataset.side = img.side || 'left';
    r.setProperty('--panel', pal.panel);
    r.setProperty('--panel-solid', pal.panel.replace(/,\s*[\d.]+\)$/, ',0.96)'));
    r.setProperty('--ink', pal.ink);
    r.setProperty('--accent', pal.accent);
    r.setProperty('--btn-ink', pal.btnInk);
    r.setProperty('--scheme', dark && dark.matches ? 'dark' : 'light');
    r.setProperty('--veil', dark && dark.matches ? '0.18' : '0.04');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark && dark.matches ? '#1c130d' : '#efe6d8');
  }

  function setBackdrop(img, force) {
    if (!img || (img === currentImg && !force)) return;
    currentImg = img;
    var file = isPortrait() ? img.p : img.l;
    var pre = new Image();
    pre.onload = function () {
      if (currentImg !== img) return;
      var next = bgLayers[1 - bgIdx], prev = bgLayers[bgIdx];
      next.style.backgroundImage = 'url("' + file + '")';
      next.classList.add('show');
      prev.classList.remove('show');
      bgIdx = 1 - bgIdx;
      applyPalette(img);
      $('#credit').textContent = img.title + ' · ' + img.credit;
    };
    pre.src = file;
  }

  function imageForStep(step) {
    var list = byUse(CAT_FOR[step.foto] || 'loaf');
    return list.length ? list[hash(step.id) % list.length] : null;
  }

  // one calm photo for the setup screen, different each day, never rotating
  function homeImage() {
    var day = Math.floor(Date.now() / 86400000);
    var pool = IMGS.filter(function (i) { return i.use === 'loaf' || i.use === 'mood' || i.use === 'dough'; });
    return pool.length ? pool[day % pool.length] : IMGS[0];
  }

  // ---------- quotes ----------
  function newQuote() {
    var q = window.QUOTES[Math.floor(Math.random() * window.QUOTES.length)];
    var el = $('#quote');
    el.style.opacity = 0;
    setTimeout(function () {
      el.querySelector('q').textContent = '“' + (q[I18n.get()] || q.en) + '”';
      el.querySelector('cite').textContent = q.by;
      el.dataset.q = window.QUOTES.indexOf(q);
      el.style.opacity = 1;
    }, 300);
  }
  function refreshQuoteLang() {
    var q = window.QUOTES[+$('#quote').dataset.q || 0];
    $('#quote').querySelector('q').textContent = '“' + (q[I18n.get()] || q.en) + '”';
  }

  // ---------- language ----------
  function applyLang() {
    document.documentElement.lang = I18n.get();
    document.title = t('home.title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === I18n.get())); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    renderChoices();
    renderSizes();
    renderQuick();
    refreshQuoteLang();
    if (currentImg) setBackdrop(currentImg, true);
    if (view === 'now') renderNow(true);
    if (view === 'plan') renderPlan();
    if (view === 'ingredients') renderIngredients();
    if (view === 'again') renderAgain();
    if (view === 'review') renderReview();
    $('#startNowOut').hidden = true;
  }

  // ---------- views ----------
  var VIEWS = ['intro', 'import', 'review', 'again', 'home', 'now', 'plan', 'ingredients'];
  var CALM = { intro: 1, import: 1, review: 1, again: 1, home: 1 };
  function show(v) {
    view = v; S.view = v; save();
    document.body.classList.remove('peek');
    document.body.dataset.view = v;
    VIEWS.forEach(function (n) { $('#view-' + n).hidden = n !== v; });
    $('#helpBtn').hidden = v === 'intro';
    $('#view-' + v).scrollTop = 0;
    if (v === 'home' && IOS && !window.navigator.standalone && !S.hint) { S.hint = true; save(); toast(t('install.text'), 9000); }
    if (CALM[v]) setBackdrop(homeImage());
    else {
      var act = activeStep();
      setBackdrop(act ? imageForStep(act) : (byUse('loaf')[0] || IMGS[0]));
    }
    newQuote();
    if (v === 'now') renderNow(true);
    if (v === 'plan') { dayIdx = null; renderPlan(); }
    if (v === 'ingredients') renderIngredients();
    if (v === 'again') renderAgain();
    if (v === 'import') openImport();
    if (v === 'review') renderReview();
  }

  // ---------- setup ----------
  function renderGroup(boxId, descId, defs, selected, onPick) {
    var box = $(boxId), desc = $(descId);
    box.innerHTML = '';
    Object.keys(defs).forEach(function (id) {
      var d = defs[id];
      var label = document.createElement('label');
      label.innerHTML = '<input type="radio"><span></span>';
      label.querySelector('span').textContent = L(d.breve);
      var input = label.querySelector('input');
      input.name = boxId; input.value = id; input.checked = id === selected;
      input.addEventListener('change', function () { onPick(id); desc.textContent = L(d.descrizione); });
      if (id === selected) desc.textContent = L(d.descrizione);
      box.appendChild(label);
    });
  }

  function renderChoices() {
    renderGroup('#presets', '#presetDesc', Recipe.PRESETS, S.preset, function (id) { S.preset = id; S.done = {}; save(); build(); });
    $('#recipeName').textContent = currentRecipe() ? currentRecipe().name : '';
  }

  // loaf size pills: the recipe as written, a few sizes and a free number
  function renderSizes() {
    var box = $('#sizes'); box.innerHTML = '';
    var r = currentRecipe();
    if (!r) return;
    var written = Math.round(Calc.totalWeight(r.ingredients));
    var sizes = [written].concat([750, 900].filter(function (g) { return Math.abs(g - written) > 40; }));
    sizes.forEach(function (g, i) {
      var label = document.createElement('label');
      label.innerHTML = '<input type="radio" name="size"><span></span>';
      label.querySelector('span').textContent = g + ' g' + (i === 0 ? ' ✓' : '');
      var input = label.querySelector('input');
      input.checked = i === 0 ? S.loafG == null : S.loafG === g;
      input.addEventListener('change', function () { S.loafG = i === 0 ? null : g; S.done = {}; save(); build(); $('#sizeG').value = ''; });
      box.appendChild(label);
    });
    var num = document.createElement('input');
    num.type = 'number'; num.id = 'sizeG'; num.min = 200; num.max = 5000; num.step = 50; num.placeholder = 'g'; num.className = 'sizeg';
    num.setAttribute('aria-label', t('home.size'));
    if (S.loafG && sizes.indexOf(S.loafG) < 0) num.value = S.loafG;
    num.addEventListener('change', function () {
      var v = Math.round(+num.value);
      S.loafG = v >= 200 ? v : null; S.done = {}; save(); build(); renderSizes();
    });
    box.appendChild(num);
  }

  // quick picks for the day and time
  function nextDow(dow, h, m) {
    var d = new Date(); d.setHours(h, m, 0, 0);
    var add = (dow - d.getDay() + 7) % 7;
    if (add === 0 && d.getTime() <= Date.now()) add = 7;
    d.setDate(d.getDate() + add);
    return d.getTime();
  }
  function renderQuick() {
    var box = $('#quickDates'); box.innerHTML = '';
    [[6, 13, 0], [0, 13, 0], [0, 19, 0]].forEach(function (q) {
      var ms = nextDow(q[0], q[1], q[2]);
      var b = document.createElement('button'); b.type = 'button';
      b.textContent = cap(new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'short' })) + ' ' + pad(q[1]) + ':' + pad(q[2]);
      b.addEventListener('click', function () { S.target = ms; $('#target').value = toLocalInput(ms); save(); $('#startNowOut').hidden = true; });
      box.appendChild(b);
    });
  }

  function fillForm() {
    if (!S.target) S.target = defaultTarget();
    $('#target').value = toLocalInput(S.target);
    $('#temp').value = S.tempC;
    $('#tempOut').textContent = S.tempC;
    $('#ddt').value = S.ddt; $('#ddtOut').textContent = S.ddt;
    $('#quietOn').checked = S.quietOn;
    $('#quietStart').value = S.quiet.start;
    $('#quietEnd').value = S.quiet.end;
    $('#quietRow').hidden = !S.quietOn;
  }

  function bind() {
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.addEventListener('click', function () { S.lang = b.dataset.lang; I18n.set(S.lang); save(); applyLang(); });
    });
    if (dark && dark.addEventListener) dark.addEventListener('change', function () { if (currentImg) applyPalette(currentImg); });
    $('#detailsBtn').addEventListener('click', function () {
      var d = $('#details'), open = d.hidden;
      d.hidden = !open;
      this.setAttribute('aria-expanded', String(open));
      this.querySelector('i').textContent = open ? '−' : '+';
    });
    $('#ddt').addEventListener('input', function (e) { S.ddt = +e.target.value; $('#ddtOut').textContent = S.ddt; save(); });
    $('#temp').addEventListener('input', function (e) { S.tempC = +e.target.value; $('#tempOut').textContent = S.tempC; save(); });
    $('#quietOn').addEventListener('change', function (e) { S.quietOn = e.target.checked; $('#quietRow').hidden = !S.quietOn; save(); });
    $('#quietStart').addEventListener('change', function (e) { if (e.target.value) { S.quiet.start = e.target.value; save(); } });
    $('#quietEnd').addEventListener('change', function (e) { if (e.target.value) { S.quiet.end = e.target.value; save(); } });

    var preview = null;
    function hidePreview() { $('#startNowOut').hidden = true; preview = null; }
    $('#form').addEventListener('input', hidePreview);
    $('#form').addEventListener('change', hidePreview);
    $('#startNowBtn').addEventListener('click', function () {
      var res = Planner.earliest({ steps: currentSteps(), tempC: S.tempC, quiet: S.quietOn ? S.quiet : null, start: Date.now() });
      $('#startNowOut').hidden = false;
      if (!res.ok) { preview = null; $('#startNowText').textContent = t('notice.none'); $('#startNowGo').hidden = true; return; }
      preview = res;
      var vars = { day: dayMid(res.target), t: hhmm(res.target), sd: dayMid(res.startAt), st: hhmm(res.startAt) };
      $('#startNowText').textContent = t(res.delayed ? 'home.startNowLater' : 'home.startNowResult', vars);
      $('#startNowGo').textContent = t(res.delayed ? 'home.startNowGoLater' : 'home.startNowGo');
      $('#startNowGo').hidden = false;
    });
    $('#startNowGo').addEventListener('click', function () {
      if (!preview) return;
      var steps = currentSteps();
      S.target = preview.target; S.done = {};
      if (!preview.delayed) S.done[steps[0].id] = Date.now();   // starting right now: the first step is under way
      save(); recompute(); show('now');
    });
    $('#form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#target').value;
      if (!v) return;
      S.target = new Date(v).getTime();
      S.done = {};
      save(); recompute(); show('now');
    });
    $('#helpBtn').addEventListener('click', function () { show('intro'); });
    $('#peekBtn').addEventListener('click', function () { document.body.classList.toggle('peek'); });
    document.addEventListener('click', function (e) {
      if (document.body.classList.contains('peek') && !e.target.closest('.help, .lang')) document.body.classList.remove('peek');
    });
    $('#introGo').addEventListener('click', function () { S.intro = true; save(); show(currentRecipe() ? 'home' : 'import'); });
    $('#changeRecipe').addEventListener('click', function () { show('again'); $('#againMain').hidden = true; $('#againList').hidden = false; });
    $('#toIng').addEventListener('click', function () { show('ingredients'); });
    $('#toIng2').addEventListener('click', function () { show('ingredients'); });
    $('#ingBack').addEventListener('click', function () { show(PLAN && PLAN.ok ? 'plan' : 'home'); });
    bindRecipeUi();
    $('#toPlan').addEventListener('click', function () { show('plan'); });
    $('#toHome').addEventListener('click', function () { show('home'); });
    $('#back').addEventListener('click', function () { show('now'); });
    $('#nowDone').addEventListener('click', function () { var a = activeStep(); if (a) markDone(a.id); });
    $('#icsBtn').addEventListener('click', exportCalendar);
    $('#reset').addEventListener('click', function () {
      if (!Object.keys(S.done).length || confirm(t('plan.resetConfirm'))) { S.done = {}; save(); recompute(); renderPlan(); }
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && PLAN && PLAN.ok) { recompute(); if (view === 'plan') renderPlan(); } });
  }

  // ---------- plan ----------
  function compute(done) {
    if (!BUILT) return { ok: false, steps: [], avvisi: [] };
    return Planner.plan({
      steps: currentSteps(),
      target: S.target, tempC: S.tempC,
      quiet: S.quietOn ? S.quiet : null,
      now: Date.now(), done: done
    });
  }
  function recompute() { PLAN = compute(S.done); return PLAN; }
  function activeStep() {
    if (!PLAN || !PLAN.ok) return null;
    return PLAN.steps.filter(function (s) { return !s.fatto; })[0] || null;
  }

  function markDone(id) {
    var next = Object.assign({}, S.done);
    next[id] = Date.now();
    var res = compute(next);
    if (!res.ok) { toast(t('toast.impossible')); return; }
    S.done = next;
    if (res.target !== S.target) { toast(t('toast.moved', { day: dayMid(res.target), t: hhmm(res.target) })); S.target = res.target; }
    save(); recompute();
    var a = activeStep();
    if (a) setBackdrop(imageForStep(a));
    if (view === 'now') renderNow(true); else renderPlan();
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

  // ---------- "now" screen ----------
  var tickTimer;

  function renderNow(full) {
    clearInterval(tickTimer);
    if (!PLAN || !PLAN.ok) {
      $('#nowEyebrow').textContent = '';
      $('#nowName').textContent = t('notice.none');
      $('#when').hidden = true; $('#nowSub').textContent = ''; $('#nowNeed').hidden = true;
      $('#nowHow').hidden = true; $('#nowDone').hidden = true;
      return;
    }
    $('#when').hidden = false;
    var a = activeStep();
    if (!a) {
      $('#nowEyebrow').textContent = '';
      $('#nowName').textContent = t('now.finished');
      $('#when').hidden = true; $('#nowSub').textContent = ''; $('#nowNeed').hidden = true;
      $('#trackFill').style.width = '100%';
      $('#nowHow').hidden = true; $('#nowDone').hidden = true;
      return;
    }
    $('#nowName').textContent = L(a.nome);
    var need = needText(a);
    $('#nowNeed').hidden = !need; $('#nowNeed').textContent = need ? t('now.need', { list: need }) : '';
    var firstStart = PLAN.steps.reduce(function (m, s) { return s.inizio != null ? Math.min(m, s.inizio) : m; }, Infinity);

    function paint() {
      var now = Date.now(), due = now >= a.inizio;
      $('#nowEyebrow').textContent = due ? t('now.due') : t('now.next');
      $('#nowDone').hidden = !due;
      if (!due) {
        $('#whenDay').textContent = dayLabel(a.inizio);
        $('#whenTime').textContent = hhmm(a.inizio);
        $('#nowSub').textContent = '';
      } else if (a.entro > a.inizio) {
        $('#whenDay').textContent = t('now.latestBy');
        $('#whenTime').textContent = hhmm(a.entro);
        $('#nowSub').textContent = now > a.entro ? t('now.late') : '';
      } else {
        $('#whenDay').textContent = t('now.right');
        $('#whenTime').textContent = hhmm(a.inizio);
        // steps with no slack get a 15 minute grace before the "late" message
        $('#nowSub').textContent = now <= a.inizio + 15 * MIN ? '' : t('now.late');
      }
      var total = PLAN.target - firstStart;
      var p = total > 0 ? Math.max(0, Math.min(100, (now - firstStart) / total * 100)) : 0;
      $('#trackFill').style.width = p.toFixed(1) + '%';
    }
    var due0 = Date.now() >= a.inizio;
    $('#nowHow').hidden = !due0;
    if (due0) { $('#nowInstr').textContent = L(a.istruzioni); $('#nowSignal').textContent = L(a.segnale); }
    paint();
    tickTimer = setInterval(function () {
      var nowDue = Date.now() >= a.inizio;
      if (nowDue !== due0) { renderNow(); return; }
      paint();
    }, 15000);
    if (full) { var img = imageForStep(a); if (img) setBackdrop(img); }
  }

  // ---------- plan screen ----------
  function notices() {
    var box = $('#notices');
    box.innerHTML = '';
    function add(text) {
      var p = document.createElement('p');
      p.className = 'notice';
      p.textContent = text;
      box.appendChild(p);
    }
    if (!PLAN.ok) { add(t('notice.none')); return; }
    PLAN.avvisi.forEach(function (a) {
      if (a.codice === 'target-spostato') {
        add(t('notice.moved', { day: dayMid(PLAN.target), t: hhmm(PLAN.target), d: dur(Math.abs(a.spostamentoMin)),
                                dir: t(a.spostamentoMin > 0 ? 'notice.later' : 'notice.earlier') }));
      } else if (a.codice === 'passo-oltre-massimo') {
        add(t('notice.over'));
      }
    });
  }

  function renderPlan() {
    if (!PLAN) recompute();
    notices();
    var list = $('#timeline'), tabs = $('#dayTabs');
    list.innerHTML = ''; tabs.innerHTML = '';
    if (!PLAN.ok) { $('#planTitle').textContent = ''; $('#planSub').textContent = ''; return; }

    $('#planTitle').textContent = dayLabel(PLAN.target) + ', ' + hhmm(PLAN.target);
    $('#icsHelp').hidden = !IOS; $('#icsHelp').textContent = t('plan.calendarHelpIos');
    var first = activeStep();
    $('#planSub').textContent = first ? t('plan.starts', { day: dayMid(first.inizio), t: hhmm(first.inizio) }) : t('plan.allDone');

    // group the steps by day
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
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(n === dayIdx));
      b.textContent = dayShort(d.at);
      b.addEventListener('click', function () { dayIdx = n; renderPlan(); });
      tabs.appendChild(b);
    });

    var day = days[dayIdx], prev = null;
    // the night before this day's first step
    if (S.quietOn && dayIdx > 0) {
      var before = days[dayIdx - 1].items[days[dayIdx - 1].items.length - 1].s;
      if (Planner.blockedIntervals(before.inizio, day.items[0].s.inizio, S.quiet).some(function (iv) { return iv[0] >= before.inizio && iv[1] <= day.items[0].s.inizio; })) {
        list.appendChild(nightRow());
      }
    }
    day.items.forEach(function (it) {
      if (prev && S.quietOn) {
        var b = Planner.blockedIntervals(prev.inizio, it.s.inizio, S.quiet).filter(function (iv) { return iv[0] >= prev.inizio && iv[1] <= it.s.inizio; });
        if (b.length) list.appendChild(nightRow());
      }
      list.appendChild(stepItem(it.s, it.i));
      prev = it.s;
    });
  }

  function nightRow() {
    var n = document.createElement('li');
    n.className = 'night';
    n.textContent = '☾  ' + t('plan.rest', { a: S.quiet.start, b: S.quiet.end });
    return n;
  }

  function stepItem(s, i) {
    var li = document.createElement('li');
    li.className = 'step' + (s.fatto ? ' done' : '');
    li.style.animationDelay = Math.min(i, 10) * 30 + 'ms';

    var head = document.createElement('button');
    head.type = 'button'; head.setAttribute('aria-expanded', 'false');
    var time = document.createElement('time'); time.textContent = hhmm(s.inizio);
    var name = document.createElement('span'); name.className = 'name'; name.textContent = L(s.nome);
    var meta = document.createElement('span'); meta.className = 'meta';
    if (s.fatto) meta.textContent = t('chip.done');
    else {
      var lim = document.createElement('b');
      lim.textContent = s.entro > s.inizio ? t('chip.by', { t: hhmm(s.entro) }) : t('chip.exact');
      meta.appendChild(lim);
      var rest = ' · ' + t('chip.then', { d: dur(s.durataMin) });
      if (s.allungato) rest += ' · ' + t('chip.long');
      if (s.accorciato) rest += ' · ' + t('chip.short');
      if (s.stimato) rest += ' · ' + t('chip.est');
      meta.appendChild(document.createTextNode(rest));
    }
    head.appendChild(time); head.appendChild(name); head.appendChild(meta);

    var detail = document.createElement('div');
    detail.className = 'detail'; detail.hidden = true;
    var act = document.createElement('div'); act.className = 'actions';
    if (!s.fatto) {
      var p1 = document.createElement('p'); p1.textContent = L(s.istruzioni);
      var p2 = document.createElement('p'); p2.className = 'signal'; p2.textContent = L(s.segnale);
      var done = document.createElement('button'); done.type = 'button'; done.textContent = t('act.done');
      done.addEventListener('click', function () { markDone(s.id); });
      act.appendChild(done);
      var need = needText(s);
      if (need) { var pg = document.createElement('p'); pg.className = 'grams'; pg.textContent = need; detail.appendChild(pg); }
      detail.appendChild(p1); detail.appendChild(p2);
    } else {
      var undo = document.createElement('button'); undo.type = 'button'; undo.className = 'secondary'; undo.textContent = t('act.undo');
      undo.addEventListener('click', function () { unmarkDone(s.id); });
      act.appendChild(undo);
    }
    detail.appendChild(act);

    head.addEventListener('click', function () {
      var open = detail.hidden;
      detail.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
    });

    li.appendChild(head); li.appendChild(detail);
    return li;
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

  // re-pick the right crop when the phone rotates or the window is resized
  var rzT, wasPortrait = isPortrait();
  window.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () { if (isPortrait() !== wasPortrait) { wasPortrait = isPortrait(); if (currentImg) setBackdrop(currentImg, true); } }, 250);
  });

  // ---------- recipe: read it, check it, choose it ----------
  var RV = null;       // the recipe being checked
  var ROWS = [
    { phase: 'autolyse', optional: true }, { phase: 'mix' }, { phase: 'fold', optional: true, fold: true },
    { phase: 'bulk' }, { phase: 'preshape', optional: true }, { phase: 'chill', optional: true }, { phase: 'proof', optional: true },
    { phase: 'preheat' }, { phase: 'bake', bake: true }, { phase: 'cool' }
  ];

  function showMsgs(box, errors, warnings) {
    box.innerHTML = '';
    (errors || []).forEach(function (e) { var p = document.createElement('p'); p.className = 'msg err'; p.textContent = t('err.' + e.code, { d: e.detail || '' }); box.appendChild(p); });
    (warnings || []).forEach(function (w) { var p = document.createElement('p'); p.className = 'msg warn'; p.textContent = t('warn.' + w.code, { d: w.detail || '' }); box.appendChild(p); });
  }

  function openImport() {
    $('#importMsg').innerHTML = '';
    document.querySelector('input[name="imode"][value="text"]').checked = true;
    $('#importText').hidden = false; $('#importAi').hidden = true;
    $('#importCancel').hidden = !S.recipes.length;
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
  function txt(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; }

  function renderReview() {
    if (!RV) return;
    var name = $('#rvName'); name.value = RV.name; name.oninput = function () { RV.name = name.value; };
    var box = $('#rvIng'); box.innerHTML = '';
    RV.ing.forEach(function (it, i) {
      var row = document.createElement('div'); row.className = 'rrow';
      var nm = document.createElement('input'); nm.type = 'text'; nm.value = it.name; nm.className = 'rname'; nm.addEventListener('input', function () { it.name = nm.value; });
      var g = numInput(it.g, function (v) { it.g = v; });
      var ty = document.createElement('select');
      ['flour', 'water', 'starter', 'salt', 'other'].forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = t('ty.' + k); if (k === it.type) o.selected = true; ty.appendChild(o); });
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
    if (!(sum('starter') > 0)) errors.push({ code: 'need-starter' });
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
    S.recipeId = rec.id; S.loafG = null; S.done = {};
    save(); build(); renderChoices(); renderSizes(); recompute();
    RV = null;
    show('home');
  }

  function chooseRecipe(id) {
    S.recipeId = id; S.loafG = null; S.done = {};
    save(); build(); renderChoices(); renderSizes(); recompute();
    show('home');
  }

  function renderAgain() {
    var r = currentRecipe();
    $('#againTitle').textContent = r ? t('again.title', { name: r.name }) : '';
    var box = $('#againRecipes'); box.innerHTML = '';
    S.recipes.forEach(function (rec) {
      var label = document.createElement('label');
      label.innerHTML = '<input type="radio" name="again"><span></span>';
      label.querySelector('span').textContent = rec.name;
      var input = label.querySelector('input'); input.checked = rec.id === S.recipeId;
      input.addEventListener('change', function () { chooseRecipe(rec.id); });
      box.appendChild(label);
    });
  }

  function showAgain() { show('again'); $('#againMain').hidden = false; $('#againList').hidden = true; }

  function renderIngredients() {
    var r = currentRecipe(), b = BUILT, body = $('#ingBody');
    body.innerHTML = '';
    if (!r || !b) return;
    $('#ingTitle').textContent = r.name + ' · ' + Calc.formatG(b.loafG);
    function list(items) {
      var ul = document.createElement('ul'); ul.className = 'list';
      items.forEach(function (it) {
        var li = document.createElement('li');
        li.appendChild(txt('span', '', it[0])); li.appendChild(txt('b', '', it[1]));
        if (it[2]) li.appendChild(txt('i', '', it[2]));
        ul.appendChild(li);
      });
      return ul;
    }
    var pc = Calc.bakersPercent(b.ingredients);
    body.appendChild(txt('div', 'label', t('ing.dough')));
    body.appendChild(list(b.ingredients.map(function (i, k) { return [i.name, Calc.formatG(i.g), Math.round(pc.byIndex[k]) + ' %']; })));
    body.appendChild(txt('p', 'hint', t('ing.total', { g: Calc.formatG(Calc.totalWeight(b.ingredients)) })));
    var feeds = b.steps.filter(function (x) { return x.id.indexOf('rinfresco') === 0; });
    if (feeds.length) {
      body.appendChild(txt('div', 'label', t('ing.feeds')));
      body.appendChild(list(feeds.map(function (f) { return [L(f.nome), gramsText(f)]; })));
      if (b.feeds.scaledUp) body.appendChild(txt('p', 'hint', t('ing.scaledUp')));
    }
    var w = waterC();
    body.appendChild(txt('p', 'hint', t('ing.water', { c: w.c, d: S.ddt })));
    if (w.warning) body.appendChild(txt('p', 'hint', t(w.warning === 'hot' ? 'ing.waterHot' : 'ing.waterCold')));
  }

  function bindRecipeUi() {
    document.querySelectorAll('input[name="imode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        $('#importText').hidden = r.value !== 'text' || !r.checked; $('#importAi').hidden = r.value !== 'ai' || !r.checked;
        $('#importMsg').innerHTML = '';
      });
    });
    $('#useSample').addEventListener('click', function () { $('#recipeText').value = RecipeImport.SAMPLE[I18n.get()] || RecipeImport.SAMPLE.en; });
    $('#readText').addEventListener('click', function () {
      var text = $('#recipeText').value.trim();
      if (!text) { showMsgs($('#importMsg'), [{ code: 'no-text' }], []); return; }
      var r = RecipeImport.parseText(text);
      if (!r.recipe.ingredients.length) { showMsgs($('#importMsg'), [{ code: 'no-ingredients' }], []); return; }
      openReview(r.recipe, r.warnings);
    });
    $('#copyPrompt').addEventListener('click', function () {
      copyText(RecipeImport.promptFor(I18n.get())).then(function () { toast(t('recipe.copied')); }, function () { $('#recipeJson').value = RecipeImport.promptFor(I18n.get()); });
    });
    $('#readJson').addEventListener('click', function () {
      var r = RecipeImport.fromJson($('#recipeJson').value);
      if (r.errors && r.errors.length) { showMsgs($('#importMsg'), r.errors, []); return; }
      openReview(r.recipe, r.warnings);
    });
    $('#importCancel').addEventListener('click', function () { show('home'); });
    $('#rvAdd').addEventListener('click', function () { if (RV) { RV.ing.push({ name: '', g: 0, type: 'other' }); renderReview(); } });
    $('#rvSave').addEventListener('click', saveReview);
    $('#rvBack').addEventListener('click', function () { show('import'); });
    $('#againSame').addEventListener('click', function () { show('home'); });
    $('#againOther').addEventListener('click', function () { $('#againMain').hidden = true; $('#againList').hidden = false; });
    $('#againNew').addEventListener('click', function () { show('import'); });
  }

  // ---------- start ----------
  bind();
  fillForm();
  build();
  recompute();
  applyLang();
  var inProgress = (S.view === 'now' || S.view === 'plan' || S.view === 'ingredients') && PLAN && PLAN.ok;
  if (!S.intro) show('intro');                                  // first time: what the app does
  else if (!currentRecipe()) show('import');                     // no recipe yet: load one
  else if (inProgress) show(S.view === 'ingredients' ? 'plan' : S.view);   // a plan is running: carry on
  else showAgain();                                              // otherwise: same recipe or another?
})();
