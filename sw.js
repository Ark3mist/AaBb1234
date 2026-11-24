// Caches the app so it opens with no connection (after one online visit).
// Bump CACHE together with version.json and APP_VERSION in index.html.
const CACHE = "edto-crz-1-11-27";
const FILES = ["./", "index.html", "perf.js", "crz.js", "wmm.js", "airports.js", "world50.js", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  // cache each file on its own, so one missing file cannot stop the app installing
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(FILES.map((f) => c.add(new Request(f, { cache: "reload" })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first with timeout (updates arrive when online), cache when offline or slow.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith("/version.json")) return; // always ask the network
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2500);
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache", credentials: "same-origin", signal: ctl.signal })
      .then((r) => {
        clearTimeout(timer);
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => {
        clearTimeout(timer);
        return caches.match(e.request, { ignoreSearch: true })
          .then((r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()));
      })
  );
});
