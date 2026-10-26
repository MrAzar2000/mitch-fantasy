/* Mitch Fantasy League service worker: Web Push + taps, and an app-shell cache
   so the Home Screen app opens on weak signal or offline.
   - Site files are network-first: online visitors always get the latest
     deploy; the cached copy is used only when the network fails or is slow.
   - Library and font files (CDN) are served from cache and refreshed in the
     background.
   - League data, APIs and analytics are never cached here (the page keeps its
     own saved copy of the league). */
const SHELL = "mfl-shell-v1";
const CDN = "mfl-cdn-v1";
const PRECACHE = ["/", "/manager-experience.css", "/manager-experience.mjs", "/manager-layout.mjs",
  "/lineup-tools.mjs", "/site-version.mjs", "/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png"];
const NETWORK_WAIT = 3500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  const keep = new Set([SHELL, CDN]);
  for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
  await self.clients.claim();
})()));

function cacheable(url) {
  if (url.origin === self.location.origin) {
    return !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/.netlify/") &&
      url.pathname !== "/site-version.json" && url.pathname !== "/sw.js";
  }
  return url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

async function networkFirst(req, event) {
  const cache = await caches.open(SHELL);
  // pages share one cached shell; query strings and #hashes don't change the HTML
  const key = req.mode === "navigate" ? new URL(req.url).pathname : req;
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  const slow = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT));
  try {
    const res = await Promise.race([network, slow.then(() => cache.match(key)).then((hit) => hit || network)]);
    if (res) return res;
  } catch (_) {}
  const hit = await cache.match(key) || (req.mode === "navigate" ? await cache.match("/") : null);
  if (hit) return hit;
  return network;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CDN);
  const hit = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  return hit || network;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!cacheable(url)) return;
  e.respondWith(url.origin === self.location.origin ? networkFirst(req, e) : staleWhileRevalidate(req, e));
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
