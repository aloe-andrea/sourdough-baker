/* Offline cache. Bump VERSION whenever app files change. */
var VERSION = 'sourdough-v7';
var CORE = ['./', 'index.html', 'styles.css', 'app.js', 'planner.js', 'recipe.js', 'i18n.js', 'ics.js', 'quotes.js', 'images.js',
            'manifest.webmanifest', 'assets/fonts/sora.woff2', 'assets/fonts/instrument-serif-italic.woff2',
            'assets/icons/icon-192.png', 'assets/icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (cache) {
    return cache.addAll(CORE).then(function () {
      // every photo listed in images.js, so the app also works offline with all backgrounds
      return fetch('images.js').then(function (r) { return r.text(); }).then(function (txt) {
        var files = (txt.match(/assets\/img\/[^"']+/g) || []);
        return cache.addAll(files);
      });
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      return res;
    });
  }));
});
