// Minimal offline shell. Hand-rolled rather than pulled from a plugin: the whole
// job is four routes and the build's static chunks.

const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

const SHELL_ROUTES = ["/", "/transactions", "/transactions/edit", "/dashboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_ROUTES)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL && k !== ASSETS)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase calls stay untouched

  // Navigations: network first so a deploy is picked up, cache as the offline
  // fallback. Query params are stripped — /transactions/edit?id=x is the same
  // document as /transactions/edit, and the id is read client-side.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(url.pathname, copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL);
          return (await cache.match(url.pathname)) ?? (await cache.match("/"));
        }),
    );
    return;
  }

  // Build output is content-hashed, so once cached it never needs revalidating.
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
