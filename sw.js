/* Network-first app shell; API responses and user writes are never cached here. */
const SHELL_CACHE='mfl-shell-v2';
const SHELL=['/','/index.html','/lineup-tools.mjs','/manager-experience.mjs','/archive-tools.mjs','/snapshot-cache.mjs','/manager-experience.css','/site-version.mjs','/manifest.webmanifest','/icon-192.png'];
const CDN='https://cdn.jsdelivr.net';
async function cacheModule(cache,url,seen=new Set()){
  if(seen.has(url)||seen.size>=50)return;seen.add(url);
  const response=await fetch(url);if(!response.ok)throw new Error('Module unavailable');
  await cache.put(url,response.clone());
  const source=await response.text();
  const children=[...source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map(m=>new URL(m[1],url)).filter(u=>u.origin===CDN);
  await Promise.all(children.map(u=>cacheModule(cache,u.href,seen)));
}
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const cache=await caches.open(SHELL_CACHE);
  await cache.addAll(SHELL);
  // Keep the existing Supabase client available for offline startup too.
  try{await cacheModule(cache,CDN+'/npm/@supabase/supabase-js@2/+esm');}catch{}
  await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('mfl-shell-')&&key!==SHELL_CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  const local=url.origin===self.location.origin;
  const shell=local&&(req.mode==='navigate'||SHELL.includes(url.pathname));
  const script=url.origin===CDN&&url.pathname.startsWith('/npm/')&&(req.destination==='script'||url.pathname.endsWith('/+esm'));
  if(!shell&&!script)return;
  e.respondWith((async()=>{
    let cache;try{cache=await caches.open(SHELL_CACHE);}catch{return fetch(req);}
    try{
      const response=await fetch(req);
      if(response.ok){try{await cache.put(shell&&req.mode==='navigate'?'/':req,response.clone());}catch{}return response;}
      throw new Error('Unavailable');
    }catch{const saved=await cache.match(req.mode==='navigate'?'/':req);return saved||Response.error();}
  })());
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "Mitch Fantasy League";
  const opts = {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "/" }
  };
  e.waitUntil((async () => {
    if (d.tag) {
      const shown = await self.registration.getNotifications({tag:d.tag});
      if (shown.some(n => n.title === title && n.body === opts.body)) return;
    }
    await self.registration.showNotification(title, opts);
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ("focus" in c) { try { c.navigate(url); } catch (_) {} return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
