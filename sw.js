/* Offline cache. Bump VERSION whenever app files change.
   App files (pages, scripts, styles) are fetched from the network first, so a normal reload always
   shows the latest version; the cache is only the fallback when you are offline.
   Photos and fonts come from the cache first, since they rarely change. */
var VERSION = 'sourdough-v11';
var CORE = ['./', 'index.html', 'styles.css', 'app.js', 'planner.js', 'recipe.js', 'i18n.js', 'calc.js', 'recipeimport.js', 'ics.js', 'quotes.js', 'images.js',
            'manifest.webmanifest', 'assets/fonts/sora.woff2', 'assets/fonts/instrument-serif-italic.woff2',
            'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];

function fresh(url) { return new Request(url, { cache: 'reload' }); }

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (cache) {
    return Promise.all(CORE.map(function (u) { return cache.add(fresh(u)); })).then(function () {
      // every photo listed in images.js, so the app also works offline with all backgrounds
      return fetch(fresh('images.js')).then(function (r) { return r.text(); }).then(function (txt) {
        var files = (txt.match(/assets\/img\/[^"']+/g) || []);
        return Promise.all(files.map(function (u) { return cache.add(u); }));
      });
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isApp(req) {
  var p = new URL(req.url).pathname;
  return req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(p) || p.endsWith('/');
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (isApp(req)) {
    // network first
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }); }));
  } else {
    // cache first
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      });
    }));
  }
});
