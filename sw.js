/* 羽 · 半日闲 — Service Worker
   策略：
   - 页面（HTML）走网络优先，保证拿到最新版；断网或 403 时回落到缓存。
   - 静态资源走 stale-while-revalidate：先用缓存秒开，同时后台更新。 */
const CACHE = "yu-banrixian-v5";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./icon.svg", "./manifest.webmanifest", "./bg.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(req, res) {
  if (!res || !res.ok) return;
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (!res.ok) {
            // 分享码失效（403）等情况：优先还出缓存里的那一份
            return caches.match("./index.html").then((hit) => hit || res);
          }
          put(req, res);
          put("./index.html", res.clone());
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => { put(req, res); return res; })
        .catch(() => hit);
      return hit || network;
    })
  );
});
