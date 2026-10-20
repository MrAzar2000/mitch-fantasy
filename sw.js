/* Mitch Fantasy League — push-only service worker (no offline caching, so the
   site always loads fresh from Netlify/Supabase). Handles Web Push + taps. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
  e.waitUntil(self.registration.showNotification(title, opts));
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
