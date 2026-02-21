const CACHE_NAME = "orizontio-tribi-v1";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./sim.js",
  "./pwa.js",
  "./manifest.json",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-1024.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(req)) || (await cache.match("./index.html")) || Response.error();
        })
    );
    return;
  }

  const isStatic =
    req.destination === "script" ||
    req.destination === "style" ||
    req.destination === "image" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json");

  if (isStatic) {
    const isScriptOrStyle =
      req.destination === "script" ||
      req.destination === "style" ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".json");

    if (isScriptOrStyle) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
            }
            return res;
          })
          .catch(async () => {
            const cache = await caches.open(CACHE_NAME);
            return (await cache.match(req)) || Response.error();
          })
      );
      return;
    }

    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => null);

        if (cached) {
          return cached;
        }
        const networkRes = await networkPromise;
        return networkRes || Response.error();
      })
    );
  }
});
