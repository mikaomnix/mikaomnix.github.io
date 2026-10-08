/* ميكانيزم (أبلكيشن المشتركين) — تشغيل من غير نت.
   السيستم (index.html): من النت الأول، ولو مفيش نت أو النت بطيء بيفتح النسخة المحفوظة.
   المكتبات والخطوط: بتتحفظ أول مرة وبعد كده بتفتح من الجهاز.
   الموقع (shop.html) والسيرفر (Supabase) مش بيعدّوا على هنا خالص. */
const CACHE = 'mkapp-v2';
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const APP = new URL('./', self.location).href;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([APP, './manifest.webmanifest'].map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('mkapp-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isApp = u => u.origin === self.location.origin && (u.href.split(/[?#]/)[0] === APP || /\/index\.html$/.test(u.pathname));
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function networkFirst(req, key, ms) {
  const net = fetch(req, { cache: 'no-store' }).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(key, cp)); }
    return res;
  });
  return timeout(net, ms).catch(() => caches.match(key).then(m => m || net));
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (isApp(u)) { e.respondWith(networkFirst(r, APP, 6000)); return; }
  if (u.origin === self.location.origin && /manifest\.webmanifest$/.test(u.pathname)) { e.respondWith(networkFirst(r, r.url.split('?')[0], 6000)); return; }
  if (CDN.test(r.url)) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {
      if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
      return res;
    })));
  }
});
