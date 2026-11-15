(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Planner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN = 60000;
  var GRID = 15 * MIN;         // gli orari dei passi cadono su :00 :15 :30 :45
  // Arrotondando a 15 minuti un passo puo' risultare fino a mezzo quarto d'ora sotto il suo minimo.
  var TOL = GRID / 2;
  var SHIFT_STEP = 15 * MIN;   // passo di ricerca di un target alternativo
  var NODE_BUDGET = 5000;      // tetto di nodi per ogni tentativo di pianificazione

  // ---------- finestra notturna ----------

  function parseHM(s) {
    var p = String(s).split(':');
    return (+p[0]) * 60 + (+p[1] || 0);
  }

  function minutesOfDay(ms) {
    var d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  // Un orario e' "bloccato" se cade strettamente dentro la finestra. Gli estremi sono permessi.
  function isBlocked(ms, quiet) {
    if (!quiet) return false;
    var qs = parseHM(quiet.start), qe = parseHM(quiet.end), m = minutesOfDay(ms);
    if (qs === qe) return false;
    if (qs > qe) return m > qs || m < qe;
    return m > qs && m < qe;
  }

  function blockedIntervals(from, to, quiet) {
    var qs = parseHM(quiet.start), qe = parseHM(quiet.end), out = [];
    if (qs === qe) return out;
    var d = new Date(from);
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    var last = to + 2 * 86400000;
    while (d.getTime() <= last) {
      var y = d.getFullYear(), mo = d.getMonth(), da = d.getDate();
      var b0 = new Date(y, mo, da, 0, qs).getTime();
      var b1 = qs > qe ? new Date(y, mo, da + 1, 0, qe).getTime() : new Date(y, mo, da, 0, qe).getTime();
      out.push([b0, b1]);
      d = new Date(y, mo, da + 1);
    }
    return out;
  }

  // Sotto-intervalli chiusi di [from, to] in cui un passo puo' iniziare.
  function allowedIntervals(from, to, quiet) {
    if (from > to) return [];
    var res = [[from, to]];
    if (!quiet) return res;
    blockedIntervals(from, to, quiet).forEach(function (b) {
      var next = [];
      res.forEach(function (iv) {
        var a = iv[0], c = iv[1];
        if (b[1] <= a || b[0] >= c) { next.push(iv); return; }
        if (b[0] >= a) next.push([a, b[0]]);
        if (b[1] <= c) next.push([b[1], c]);
      });
      res = next;
    });
    return res;
  }

  // ---------- durate e temperatura ----------

  // Raddoppia i tempi ogni circa 7 C in meno rispetto a 24 C.
  function tempFactor(t) {
    var f = Math.pow(2, (24 - t) / 7);
    return Math.max(0.4, Math.min(3, f));
  }

  function range(step, tempC) {
    var f = step.sensibileTemperatura ? tempFactor(tempC) : 1;
    return { lo: step.durata.min * f, tgt: step.durata.target * f, hi: step.durata.max * f };
  }

  // ---------- planning backwards (dynamic programming on a 15 minute grid) ----------

  // R[i][k] = 1 when step i can start at minT + k * GRID and every later step can still finish
  // exactly at the target, within its duration range and outside the quiet window.
  function reach(steps, lo, target, ctx) {
    var n = steps.length, rs = [], sumHi = 0, i, k, d;
    for (i = lo; i < n; i++) { rs[i] = range(steps[i], ctx.tempC); sumHi += rs[i].hi * MIN; }
    var minT = Math.floor((target - sumHi) / GRID) * GRID - GRID;
    var K = Math.round((target - minT) / GRID) + 1;
    var blocked = new Uint8Array(K);
    if (ctx.quiet) for (k = 0; k < K; k++) blocked[k] = isBlocked(minT + k * GRID, ctx.quiet) ? 1 : 0;
    var R = [], dLo = [], dHi = [];
    var last = new Uint8Array(K); last[K - 1] = 1; R[n] = last;
    for (i = n - 1; i >= lo; i--) {
      dLo[i] = Math.max(1, Math.ceil(Math.max(0, rs[i].lo * MIN - TOL) / GRID - 1e-9));
      dHi[i] = Math.floor(rs[i].hi * MIN / GRID + 1e-9);
      var presence = steps[i].richiedePresenza !== false;
      var row = new Uint8Array(K), next = R[i + 1];
      for (k = 0; k < K; k++) {
        if (presence && blocked[k]) continue;
        for (d = dLo[i]; d <= dHi[i] && k + d < K; d++) if (next[k + d]) { row[k] = 1; break; }
      }
      R[i] = row;
    }
    return { R: R, minT: minT, K: K, rs: rs, dLo: dLo, dHi: dHi };
  }

  // Plans steps lo..n-1 so that the last one ends at target. Returns the start times or null.
  function planAt(steps, lo, target, ctx) {
    var n = steps.length, rc = reach(steps, lo, target, ctx), R = rc.R, i, k, d;
    var ideal = target;
    for (i = lo; i < n; i++) ideal -= rc.rs[i].tgt * MIN;
    var win = ctx.win, best = -1, bd = Infinity;
    for (k = 0; k < rc.K; k++) {
      if (!R[lo][k]) continue;
      var t = rc.minT + k * GRID;
      if (win && ((win.min != null && t < win.min) || (win.max != null && t > win.max))) continue;
      if (Math.abs(t - ideal) < bd) { bd = Math.abs(t - ideal); best = k; }
    }
    if (best < 0) return null;
    var starts = new Array(n), cur = best;
    starts[lo] = rc.minT + best * GRID;
    for (i = lo; i < n - 1; i++) {
      var want = cur + Math.round(rc.rs[i].tgt * MIN / GRID), bk = -1, bdd = Infinity;
      for (d = rc.dLo[i]; d <= rc.dHi[i] && cur + d < rc.K; d++) {
        if (!R[i + 1][cur + d]) continue;
        if (Math.abs(cur + d - want) < bdd) { bdd = Math.abs(cur + d - want); bk = cur + d; }
      }
      cur = bk; starts[i + 1] = rc.minT + cur * GRID;
    }
    starts.rc = rc;
    return starts;
  }

  // Flexibility window of every step with the target unchanged: "dalle" (not before) and "entro"
  // (latest start). Scans in 15 minute steps from the planned time and stops at the first time
  // that does not work, so the window is always one continuous stretch.
  var SCAN_CAP = 16 * 60 * MIN;

  function slack(steps, lo, starts, target, ctx) {
    var n = steps.length, rc = starts.rc, out = [];
    function inReach(i, t) {
      var k = (t - rc.minT) / GRID;
      return k >= 0 && k < rc.K && k === Math.floor(k) && rc.R[i][k] === 1;
    }
    for (var i = lo; i < n; i++) {
      var lim = { min: -Infinity, max: Infinity };
      if (i > lo) {
        var rp = range(steps[i - 1], ctx.tempC);
        lim.min = starts[i - 1] + rp.lo * MIN - TOL;
        lim.max = starts[i - 1] + rp.hi * MIN;
      } else if (ctx.win) {
        if (ctx.win.min != null) lim.min = ctx.win.min;
        if (ctx.win.max != null) lim.max = ctx.win.max;
      }
      var ok = function (t) { return t >= lim.min && t <= lim.max && inReach(i, t); };
      var late = starts[i], early = starts[i];
      while (late + GRID <= starts[i] + SCAN_CAP && ok(late + GRID)) late += GRID;
      while (early - GRID >= starts[i] - SCAN_CAP && ok(early - GRID)) early -= GRID;
      out.push({ dalle: early, entro: late });
    }
    return out;
  }

  function plan(opts) {
    var steps = opts.steps, n = steps.length;
    var tempC = opts.tempC == null ? 24 : opts.tempC;
    var quiet = opts.quiet || null;
    var now = opts.now == null ? null : opts.now;
    var done = opts.done || {};
    var req = Math.round(opts.target / GRID) * GRID;
    var avvisi = [];

    var k = -1;
    steps.forEach(function (s, i) { if (done[s.id] != null) k = i; });
    var lo = k + 1;

    function doneStep(s, i) {
      var nextStart = null;
      for (var j = i + 1; j < n; j++) if (done[steps[j].id] != null) { nextStart = done[steps[j].id]; break; }
      return { id: s.id, nome: s.nome, tipo: s.tipo, foto: s.foto, fatto: true,
               inizio: done[s.id] != null ? done[s.id] : null, fine: nextStart };
    }

    if (lo >= n) {
      return { ok: true, targetRichiesto: req, target: req, spostamentoMin: 0, avvisi: [],
               steps: steps.map(doneStep) };
    }

    var win = { min: now, max: null };
    if (k >= 0) {
      var rk = range(steps[k], tempC), a = done[steps[k].id];
      win.min = Math.max(a + rk.lo * MIN - TOL, now == null ? -Infinity : now);
      win.max = a + rk.hi * MIN;
      if (win.min > win.max) {
        win.max = null;
        avvisi.push({ codice: 'passo-oltre-massimo', id: steps[k].id });
      }
    }
    var ctx = { tempC: tempC, quiet: quiet, win: win };

    var maxJ = opts.exact ? 0 : 2 * Math.round(((opts.searchHours || 36) * 60 * MIN) / SHIFT_STEP);
    for (var j = 0; j <= maxJ; j++) {
      var off = j === 0 ? 0 : (j % 2 === 1 ? 1 : -1) * Math.ceil(j / 2) * SHIFT_STEP;
      var t = req + off;
      var starts = planAt(steps, lo, t, ctx);
      if (starts) return build(t, off, starts);
    }
    return { ok: false, targetRichiesto: req, target: null, spostamentoMin: null, steps: [],
             avvisi: avvisi.concat([{ codice: 'nessun-orario', ore: opts.searchHours || 36 }]) };

    function build(t, off, starts) {
      var out = [];
      var sl = slack(steps, lo, starts, t, ctx);
      for (var i = 0; i < n; i++) {
        var s = steps[i];
        if (i < lo) { out.push(doneStep(s, i)); continue; }
        var fine = i + 1 < n ? starts[i + 1] : t;
        var r = range(s, tempC);
        var dur = Math.round((fine - starts[i]) / MIN);
        var tgt = Math.round(r.tgt);
        var dev = tgt ? (dur - tgt) / tgt : 0;
        out.push({
          id: s.id, nome: s.nome, tipo: s.tipo, foto: s.foto,
          istruzioni: s.istruzioni, segnale: s.segnale,
          fatto: false, inizio: starts[i], fine: fine,
          dalle: sl[i - lo].dalle, entro: sl[i - lo].entro,
          durataMin: dur, durataTipicaMin: tgt,
          allungato: dev > 0.2, accorciato: dev < -0.2
        });
      }
      if (off !== 0) avvisi.push({ codice: 'target-spostato', spostamentoMin: off / MIN });
      return { ok: true, targetRichiesto: req, target: t, spostamentoMin: off / MIN, steps: out, avvisi: avvisi };
    }
  }

  // "If I start the first step now, when is the bread ready?" Forward pass over the same 15 minute
  // grid: which start times are reachable for each step, starting from the first step at `s`. The
  // first step happens at `s` whatever the hour (you are the one doing it); every later step stays
  // outside the quiet window. If starting at `start` cannot work, it tries later start times and
  // reports the first that does (delayed = true).
  function earliest(opts) {
    var steps = opts.steps, n = steps.length, tempC = opts.tempC == null ? 24 : opts.tempC;
    var quiet = opts.quiet || null, now = opts.start;
    var rs = steps.map(function (st) { return range(st, tempC); });
    var sumHi = 0; rs.forEach(function (r) { sumHi += r.hi * MIN; });
    var horizon = (opts.searchHours || 36) * 60 * MIN;
    var K = Math.ceil((sumHi + 2 * GRID) / GRID) + 2;

    function firstEnd(s) {
      var base = Math.floor(s / GRID) * GRID, k, d, i, j;
      var blocked = new Uint8Array(K);
      if (quiet) for (k = 0; k < K; k++) blocked[k] = isBlocked(base + k * GRID, quiet) ? 1 : 0;
      var cur = new Uint8Array(K), any = false;
      var lo0 = rs[0].lo * MIN - TOL, hi0 = rs[0].hi * MIN;
      var pres1 = n > 1 && steps[1].richiedePresenza !== false;
      for (k = 0; k < K; k++) {
        var dt = base + k * GRID - s;
        if (dt >= lo0 && dt <= hi0 && !(pres1 && blocked[k])) { cur[k] = 1; any = true; }
      }
      for (i = 1; i < n && any; i++) {
        var dLo = Math.max(1, Math.ceil(Math.max(0, rs[i].lo * MIN - TOL) / GRID - 1e-9));
        var dHi = Math.floor(rs[i].hi * MIN / GRID + 1e-9);
        var last = i === n - 1, presNext = !last && steps[i + 1].richiedePresenza !== false;
        var nxt = new Uint8Array(K); any = false;
        for (k = 0; k < K; k++) {
          if (!cur[k]) continue;
          for (d = dLo; d <= dHi; d++) {
            j = k + d;
            if (j >= K) break;
            if (presNext && blocked[j]) continue;
            nxt[j] = 1; any = true;
          }
        }
        cur = nxt;
      }
      if (!any) return null;
      for (k = 0; k < K; k++) if (cur[k]) return base + k * GRID;
      return null;
    }

    var s = now;
    while (s <= now + horizon) {
      var T = firstEnd(s);
      if (T != null) {
        var done = {}; done[steps[0].id] = s;
        var r = plan({ steps: steps, target: T, tempC: tempC, quiet: quiet, now: now, done: done, exact: true });
        if (r.ok && s > now) {
          // starting later: show the plan for that ready time as it will really be run (not pinned to the earliest start)
          var p2 = plan({ steps: steps, target: T, tempC: tempC, quiet: quiet, now: now, exact: true });
          if (p2.ok) { p2.startAt = p2.steps[0].inizio; p2.delayed = true; return p2; }
        }
        if (r.ok) { r.startAt = s; r.delayed = s > now; return r; }
      }
      s = s === now ? Math.ceil((now + 1) / GRID) * GRID : s + GRID;
    }
    return { ok: false, steps: [], target: null, avvisi: [{ codice: 'nessun-orario', ore: opts.searchHours || 36 }] };
  }

  return {
    plan: plan, earliest: earliest, range: range, tempFactor: tempFactor,
    isBlocked: isBlocked, allowedIntervals: allowedIntervals, blockedIntervals: blockedIntervals
  };
});
