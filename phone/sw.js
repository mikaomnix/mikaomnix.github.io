/* فون سيستم v2 — شغل من غير نت: النت الأول، ولو مفيش نت من النسخة المحفوظة لنفس الصفحة بالظبط */
const V='ph-v2';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V&&!x.startsWith('cash')).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==location.origin)return;
 // قسم المحافظ ليه برنامجه — ماندخلش فيه خالص
 if(u.pathname.includes('/phone/cash/'))return;
 e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put(r,c)).catch(()=>{})}return res}).catch(()=>caches.match(r).then(m=>m||(r.mode==='navigate'?caches.match(new URL('./',location).href):Response.error()))))});
