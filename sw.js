/* Offline cache for the installed prototype. Network first, so every visit online gets the latest push;
 * the cache is the fallback when there is no connection. Bump VERSION to drop old caches. */

const VERSION = 'villagehub-demo-v5';
const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/styles.css', 'assets/hub.css', 'assets/demo.css',
  'js/theme.js', 'js/icons.js', 'js/i18n.js', 'js/ui.js', 'js/store.js', 'js/registry.js', 'js/router.js', 'js/motion.js',
  'js/modules/chit/engine.js', 'js/modules/chit/chit.js', 'js/modules/chit/screens.js',
  'js/modules/temple/temple.js', 'js/modules/temple/screens.js',
  'js/screens/auth.js', 'js/screens/core.js', 'js/app.js', 'js/demo.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
