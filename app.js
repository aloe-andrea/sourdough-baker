(function () {
  'use strict';

  var MIN = 60000;
  var KEY = 'sourdough.v2';
  var $ = function (s) { return document.querySelector(s); };
  var t = I18n.t, L = I18n.L;

  var DEFAULTS = {
    lang: 'en', target: null, preset: 'uno11-uno12', method: 'pieghe', tempC: 22,
    quietOn: true, quiet: { start: '23:00', end: '07:00' },
    done: {}, view: 'home'
  };

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }

  var S = load();
  I18n.set(S.lang);
  var PLAN = null;       // last computed plan
  var view = 'home';

  // ---------- formatting ----------
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var hhmm = function (ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  var dayLabel = function (ms) {
    var s = new Date(ms).toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  // Italian writes weekdays and months in lower case, English capitalises them
  var dayMid = function (ms) { var s = dayLabel(ms); return I18n.get() === 'it' ? s.toLowerCase() : s; };
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
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4500);
  }

  // ---------- photos ----------
  var IMGS = window.IMAGES || [];
  var CAT_FOR = { starter: 'starter', impasto: 'dough', pieghe: 'dough', bulk: 'dough', forma: 'dough',
                  frigo: 'mood', forno: 'dough', cottura: 'loaf', pane: 'loaf' };
  var bgLayers = [$('#bgA'), $('#bgB')], bgIdx = 0, currentImg = null;

  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
  function byUse(use) { return IMGS.filter(function (i) { return i.use === use; }); }

  function isPortrait() { return window.innerHeight >= window.innerWidth; }

  // panel colours, ink and accent come from the photo (computed once, stored in images.js)
  function applyPalette(img) {
    var r = document.documentElement.style;
    document.body.dataset.side = img.side || 'left';
    r.setProperty('--panel', img.panel);
    r.setProperty('--ink', img.ink);
    r.setProperty('--accent', img.accent);
    r.setProperty('--btn-ink', img.btnInk);
    r.setProperty('--scheme', img.mode === 'light' ? 'light' : 'dark');
    r.setProperty('--veil', img.mode === 'light' ? '0.06' : '0.28');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', img.mode === 'light' ? '#efe6d8' : '#1c130d');
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
      next.classList.remove('show'); void next.offsetWidth; next.classList.add('show');
      prev.classList.remove('show');
      bgIdx = 1 - bgIdx;
      applyPalette(img);
      $('#credit').textContent = t('credit.photo') + ': ' + img.title + ' · ' + img.credit + ' · ' + img.license;
    };
    pre.src = file;
  }

  function imageForStep(step, salt) {
    var list = byUse(CAT_FOR[step.foto] || 'loaf');
    return list.length ? list[hash(step.id + (salt || '')) % list.length] : null;
  }

  var homeTimer, homeOrder = [], homePos = 0;
  function startHomeSlides() {
    stopHomeSlides();
    var order = IMGS.slice().sort(function (a, b) { return hash(a.file + 'h') - hash(b.file + 'h'); });
    // lead with a bakery or loaf, calm and recognisable
    order.sort(function (a, b) { return (b.use === 'loaf' ? 1 : 0) - (a.use === 'loaf' ? 1 : 0); });
    homeOrder = order; homePos = 0;
    if (homeOrder.length) setBackdrop(homeOrder[0]);
    homeTimer = setInterval(function () { homePos = (homePos + 1) % homeOrder.length; setBackdrop(homeOrder[homePos]); }, 14000);
  }
  function stopHomeSlides() { clearInterval(homeTimer); }

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
    document.title = t('home.eyebrow');
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === I18n.get())); });
    renderPresets();
    renderMethods();
    refreshQuoteLang();
    if (currentImg) setBackdrop(currentImg, true);
    if (view === 'now') renderNow(true);
    if (view === 'plan') renderPlan();
    $('#startNowOut').hidden = true;
  }

  // ---------- views ----------
  function show(v) {
    view = v; S.view = v; save();
    document.body.dataset.view = v;
    ['home', 'now', 'plan'].forEach(function (n) { $('#view-' + n).hidden = n !== v; });
    $('#view-' + v).scrollTop = 0;
    if (v === 'home') startHomeSlides(); else stopHomeSlides();
    if (v !== 'home') {
      var act = activeStep();
      if (act) setBackdrop(imageForStep(act));
      else if (IMGS.length) setBackdrop(byUse('loaf')[0] || IMGS[0]);
    }
    newQuote();
    if (v === 'now') renderNow(true);
    if (v === 'plan') renderPlan();
  }

  // ---------- setup ----------
  function renderPresets() {
    var box = $('#presets');
    box.innerHTML = '';
    Object.keys(Recipe.PRESETS).forEach(function (id) {
      var p = Recipe.PRESETS[id];
      var label = document.createElement('label');
      label.className = 'preset';
      label.innerHTML = '<input type="radio" name="preset"><b></b><small></small>';
      label.querySelector('b').textContent = L(p.nome);
      label.querySelector('small').textContent = L(p.descrizione);
      var input = label.querySelector('input');
      input.value = id; input.checked = id === S.preset;
      input.addEventListener('change', function () { S.preset = id; S.done = {}; save(); });
      box.appendChild(label);
    });
  }

  function renderMethods() {
    var box = $('#methods');
    box.innerHTML = '';
    Object.keys(Recipe.METHODS).forEach(function (id) {
      var m = Recipe.METHODS[id];
      var label = document.createElement('label');
      label.className = 'preset';
      label.innerHTML = '<input type="radio" name="method"><b></b><small></small>';
      label.querySelector('b').textContent = L(m.nome);
      label.querySelector('small').textContent = L(m.descrizione);
      var input = label.querySelector('input');
      input.value = id; input.checked = id === S.method;
      input.addEventListener('change', function () { S.method = id; S.done = {}; save(); });
      box.appendChild(label);
    });
  }

  function fillForm() {
    if (!S.target) S.target = defaultTarget();
    $('#target').value = toLocalInput(S.target);
    $('#temp').value = S.tempC;
    $('#tempOut').textContent = S.tempC;
    $('#quietOn').checked = S.quietOn;
    $('#quietStart').value = S.quiet.start;
    $('#quietEnd').value = S.quiet.end;
    $('#quietRow').hidden = !S.quietOn;
  }

  function bind() {
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.addEventListener('click', function () { S.lang = b.dataset.lang; I18n.set(S.lang); save(); applyLang(); });
    });
    $('#detailsBtn').addEventListener('click', function () {
      var d = $('#details'), open = d.hidden;
      d.hidden = !open;
      this.setAttribute('aria-expanded', String(open));
      this.querySelector('i').textContent = open ? '−' : '+';
    });
    $('#temp').addEventListener('input', function (e) { S.tempC = +e.target.value; $('#tempOut').textContent = S.tempC; save(); });
    $('#quietOn').addEventListener('change', function (e) { S.quietOn = e.target.checked; $('#quietRow').hidden = !S.quietOn; save(); });
    $('#quietStart').addEventListener('change', function (e) { if (e.target.value) { S.quiet.start = e.target.value; save(); } });
    $('#quietEnd').addEventListener('change', function (e) { if (e.target.value) { S.quiet.end = e.target.value; save(); } });
    var preview = null;
    function hidePreview() { $('#startNowOut').hidden = true; preview = null; }
    $('#form').addEventListener('input', hidePreview);
    $('#form').addEventListener('change', hidePreview);
    $('#startNowBtn').addEventListener('click', function () {
      var res = Planner.earliest({ steps: Recipe.buildRecipe(S.preset, S.method), tempC: S.tempC, quiet: S.quietOn ? S.quiet : null, start: Date.now() });
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
      var steps = Recipe.buildRecipe(S.preset, S.method);
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
    return Planner.plan({
      steps: Recipe.buildRecipe(S.preset, S.method),
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
    var steps = Recipe.buildRecipe(S.preset, S.method), idx = -1;
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
  function setDigits(ms) {
    var tot = Math.max(0, Math.floor(ms / 1000)), a, b, c, ua, ub, uc;
    if (tot >= 48 * 3600) {
      a = Math.floor(tot / 86400); b = Math.floor(tot % 86400 / 3600); c = Math.floor(tot % 3600 / 60);
      ua = I18n.get() === 'it' ? 'Giorni' : 'Days'; ub = t('now.hours'); uc = t('now.minutes');
    } else {
      a = Math.floor(tot / 3600); b = Math.floor(tot % 3600 / 60); c = tot % 60;
      ua = t('now.hours'); ub = t('now.minutes'); uc = t('now.seconds');
    }
    $('#d1').textContent = pad(a); $('#d2').textContent = pad(b); $('#d3').textContent = pad(c);
    $('#u1').textContent = ua; $('#u2').textContent = ub; $('#u3').textContent = uc;
  }

  function renderNow(full) {
    clearInterval(tickTimer);
    if (!PLAN || !PLAN.ok) {
      $('#nowEyebrow').textContent = '';
      $('#nowName').textContent = t('notice.none');
      $('#digits').hidden = true; $('#nowSub').textContent = ''; $('#nowProgress').textContent = '';
      $('#nowHow').hidden = true; $('#nowDone').hidden = true;
      return;
    }
    $('#digits').hidden = false;
    var a = activeStep();
    if (!a) {
      $('#nowEyebrow').textContent = '';
      $('#nowName').textContent = t('now.finished');
      $('#digits').hidden = true; $('#nowSub').textContent = '';
      $('#nowProgress').textContent = ''; $('#trackFill').style.width = '100%';
      $('#nowHow').hidden = true; $('#nowDone').hidden = true;
      return;
    }
    $('#nowName').textContent = L(a.nome);
    var firstStart = PLAN.steps.reduce(function (m, s) { return s.inizio != null ? Math.min(m, s.inizio) : m; }, Infinity);

    function tick() {
      var now = Date.now(), due = now >= a.inizio;
      $('#nowEyebrow').textContent = due ? t('now.due') : t('now.next');
      $('#nowDone').hidden = !due;
      if (!due) {
        setDigits(a.inizio - now);
        $('#nowSub').textContent = t('now.starts', { day: dayMid(a.inizio), t: hhmm(a.inizio) });
      } else if (now <= a.entro) {
        setDigits(a.entro - now);
        $('#nowSub').textContent = t('now.latest', { t: hhmm(a.entro) });
      } else {
        setDigits(0);
        // steps with no slack get a 15 minute grace before the "late" message
        $('#nowSub').textContent = now <= a.inizio + 15 * MIN ? '' : t('now.late');
      }
      var total = PLAN.target - firstStart;
      var p = total > 0 ? Math.max(0, Math.min(100, (now - firstStart) / total * 100)) : 0;
      $('#trackFill').style.width = p.toFixed(1) + '%';
      $('#nowProgress').textContent = t('now.progress', { p: Math.round(p) });
      if (!due && a.inizio - now <= 0) renderNow();
    }
    var due0 = Date.now() >= a.inizio;
    $('#nowHow').hidden = !due0;
    if (due0) { $('#nowInstr').textContent = L(a.istruzioni); $('#nowSignal').textContent = L(a.segnale); }
    tick();
    tickTimer = setInterval(function () {
      var nowDue = Date.now() >= a.inizio;
      if (nowDue !== due0) { renderNow(); return; }
      tick();
    }, 1000);
    if (full) { var img = imageForStep(a); if (img) setBackdrop(img); }
  }

  // ---------- plan screen ----------
  function notices() {
    var box = $('#notices');
    box.innerHTML = '';
    function add(text, bad) {
      var p = document.createElement('p');
      p.className = 'notice' + (bad ? ' bad' : '');
      p.textContent = text;
      box.appendChild(p);
    }
    if (!PLAN.ok) { add(t('notice.none'), true); return; }
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
    var list = $('#timeline');
    list.innerHTML = '';
    if (!PLAN.ok) { $('#planTitle').textContent = ''; $('#planSub').textContent = ''; return; }

    $('#planTitle').textContent = dayLabel(PLAN.target) + ', ' + hhmm(PLAN.target);
    var first = activeStep();
    $('#planSub').textContent = first ? t('plan.starts', { day: dayMid(first.inizio), t: hhmm(first.inizio) }) : t('plan.allDone');

    var lastDay = null, prev = null;
    PLAN.steps.forEach(function (s, i) {
      if (s.inizio == null) return;
      var dk = dayKey(s.inizio);
      if (dk !== lastDay) {
        var h = document.createElement('li');
        h.className = 'day'; h.textContent = dayLabel(s.inizio);
        list.appendChild(h); lastDay = dk;
      }
      if (prev && S.quietOn) {
        var b = Planner.blockedIntervals(prev.inizio, s.inizio, S.quiet).filter(function (iv) { return iv[0] >= prev.inizio && iv[1] <= s.inizio; });
        if (b.length) {
          var n = document.createElement('li');
          n.className = 'night';
          n.textContent = '☾  ' + t('plan.rest', { a: S.quiet.start, b: S.quiet.end });
          list.appendChild(n);
        }
      }
      list.appendChild(stepItem(s, i));
      prev = s;
    });
  }

  function stepItem(s, i) {
    var li = document.createElement('li');
    li.className = 'step' + (s.fatto ? ' done' : '');
    li.style.animationDelay = Math.min(i, 12) * 40 + 'ms';

    var time = document.createElement('div');
    time.className = 'time'; time.textContent = hhmm(s.inizio);

    var card = document.createElement('div');
    card.className = 'card';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');

    var meta = [];
    if (s.fatto) meta.push('<span class="chip">' + t('chip.done') + '</span>');
    else {
      meta.push('<span class="chip limit">' + (s.entro > s.inizio ? t('chip.by', { t: hhmm(s.entro) }) : t('chip.exact')) + '</span>');
      meta.push('<span class="chip">' + t('chip.then', { d: dur(s.durataMin) }) + '</span>');
      if (s.allungato) meta.push('<span class="chip warn">' + t('chip.long') + '</span>');
      if (s.accorciato) meta.push('<span class="chip warn">' + t('chip.short') + '</span>');
    }
    btn.innerHTML = '<span class="name"></span><span class="meta">' + meta.join('') + '</span>';
    btn.querySelector('.name').textContent = L(s.nome);

    var detail = document.createElement('div');
    detail.className = 'detail'; detail.hidden = true;
    var act = document.createElement('div'); act.className = 'actions';
    if (!s.fatto) {
      var p1 = document.createElement('p'); p1.textContent = L(s.istruzioni);
      var p2 = document.createElement('p'); p2.className = 'signal';
      var bb = document.createElement('b'); bb.textContent = t('step.how');
      p2.appendChild(bb); p2.appendChild(document.createTextNode(L(s.segnale)));
      var done = document.createElement('button'); done.type = 'button'; done.textContent = t('act.done');
      done.addEventListener('click', function () { markDone(s.id); });
      act.appendChild(done);
      detail.appendChild(p1); detail.appendChild(p2);
    } else {
      var undo = document.createElement('button'); undo.type = 'button'; undo.className = 'secondary'; undo.textContent = t('act.undo');
      undo.addEventListener('click', function () { unmarkDone(s.id); });
      act.appendChild(undo);
    }
    detail.appendChild(act);

    btn.addEventListener('click', function () {
      var open = detail.hidden;
      detail.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });

    card.appendChild(btn); card.appendChild(detail);
    li.appendChild(time); li.appendChild(card);
    return li;
  }

  var rzT, wasPortrait = isPortrait();
  window.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () { if (isPortrait() !== wasPortrait) { wasPortrait = isPortrait(); if (currentImg) setBackdrop(currentImg, true); } }, 250);
  });

  // ---------- calendar export ----------
  function exportCalendar() {
    if (!PLAN || !PLAN.ok) return;
    var events = [], uid = Date.now().toString(36);
    PLAN.steps.forEach(function (s, i) {
      if (s.fatto || s.inizio == null) return;
      var lines = [L(s.istruzioni)];
      if (s.entro > s.inizio) lines.push(t('ics.latest', { t: hhmm(s.entro) }));
      lines.push(t('step.how') + L(s.segnale));
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
    toast(t('toast.calendar'));
  }

  // ---------- start ----------
  bind();
  fillForm();
  renderPresets();
  recompute();
  applyLang();
  var startView = (S.view === 'now' || S.view === 'plan') && PLAN && PLAN.ok ? S.view : 'home';
  show(startView);
})();
