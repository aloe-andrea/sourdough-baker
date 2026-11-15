(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  // 20261112T210000Z
  function utc(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
           pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // RFC 5545: lines are at most 75 octets; longer ones are folded with CRLF + space.
  function fold(line) {
    var out = [], cur = '', bytes = 0, limit = 75;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      var code = ch.charCodeAt(0);
      var b = code < 0x80 ? 1 : code < 0x800 ? 2 : (code >= 0xD800 && code <= 0xDBFF) ? 4 : 3;
      if (code >= 0xD800 && code <= 0xDBFF) { ch += line[++i]; }
      if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  // events: [{ uid, start, end, summary, description, alarms: [minutes before start] }]
  function build(events, opts) {
    opts = opts || {};
    var stamp = utc(opts.now || Date.now());
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sourdough Baker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
             'X-WR-CALNAME:' + esc(opts.name || 'Sourdough')];
    events.forEach(function (e) {
      L.push('BEGIN:VEVENT', 'UID:' + e.uid, 'DTSTAMP:' + stamp, 'DTSTART:' + utc(e.start), 'DTEND:' + utc(e.end),
             'SUMMARY:' + esc(e.summary));
      if (e.description) L.push('DESCRIPTION:' + esc(e.description));
      (e.alarms || []).forEach(function (m) {
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.summary),
               'TRIGGER:' + (m === 0 ? 'PT0S' : '-PT' + m + 'M'), 'END:VALARM');
      });
      L.push('END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  return { build: build, utc: utc, esc: esc, fold: fold };
});
