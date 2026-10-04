// Service worker minimo: permite instalar la app. No guarda copias en cache,
// asi siempre se carga la version mas reciente publicada en Vercel.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
