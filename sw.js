"use strict";

const CACHE_NAME = "cine-illimite-idf-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260720-1",
  "./app.js?v=20260720-1",
  "./manifest.webmanifest",
  "https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("cine-illimite-idf-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (url.hostname === "unpkg.com") event.respondWith(cacheFirstAsset(request));
    return;
  }

  if (url.pathname.endsWith("/data/showtimes.json")) {
    event.respondWith(networkFirstShowtimes(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  event.respondWith(cacheFirstAsset(request));
});

async function networkFirstShowtimes(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(showtimesCacheRequest(), response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(showtimesCacheRequest(), { ignoreSearch: true })
      || await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

function showtimesCacheRequest() {
  return new Request(new URL("data/showtimes.json", self.registration.scope).href);
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request) || await cache.match("./index.html");
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  return response;
}
