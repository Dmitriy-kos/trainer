// Service worker: офлайн-кэш приложения «Тренер».
// Все пути относительные (деплой на GitHub Pages в подпапке) —
// resolve идёт от расположения самого sw.js (корень app/).
//
// НЕ добавлять в список: tests/, package.json (не деплоятся), сам sw.js
// (браузер обновляет SW самостоятельно; кэширование sw.js тормозит апдейты).

const CACHE = "trainer-v14"; // менять при каждом релизе, чтобы activate вычистил старый кэш

const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "ui/app.js",
  "ui/screens.js",
  "core/logic.js",
  "core/format.js",
  "core/plan.js",
  "core/queries.js",
  "core/backup.js",
  "core/store.js",
  "core/food.js",
  "core/claude.js",
  "core/weigh.js",
  "ui/image.js",
  "assets/technique/accessory.png",
  "assets/technique/barbell_row.png",
  "assets/technique/bench.png",
  "assets/technique/db_row.png",
  "assets/technique/deadlift.png",
  "assets/technique/front_squat.png",
  "assets/technique/hanging_leg_raise.png",
  "assets/technique/hollow_hold.png",
  "assets/technique/incline_db.png",
  "assets/technique/lat_pulldown.png",
  "assets/technique/lunges.png",
  "assets/technique/ohp.png",
  "assets/technique/power_clean.png",
  "assets/technique/pullup.png",
  "assets/technique/push_press.png",
  "assets/technique/rdl.png",
  "assets/technique/russian_twist.png",
  "assets/technique/squat.png",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("trainer-") && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Навигации (адресная строка, включая ?screen=history-demo и т.п.) —
  // всегда отдаём закэшированный app-shell, игнорируя query-строку,
  // чтобы дев-урлы тоже резолвились офлайн.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached =
          (await cache.match(req, { ignoreSearch: true })) ||
          (await cache.match("index.html", { ignoreSearch: true })) ||
          (await cache.match("./", { ignoreSearch: true }));
        return cached || fetch(req);
      })
    );
    return;
  }

  // Остальные запросы (css/js/manifest/картинки) — cache-first с сетевым фолбэком.
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
