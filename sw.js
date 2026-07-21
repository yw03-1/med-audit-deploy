// 病历审核助手 - Service Worker（V2 缓存优先版）
// 策略：首次安装预缓存全部资源；后续访问缓存优先（零等待），后台静默更新
// 跨域与 POST 请求（如 AI 云接口）一律放行
const CACHE = 'mr-audit-v2';
const PRECACHE = [
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// 安装：预缓存所有资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // 不拦截非 GET 请求（POST = AI 云审核接口）
  if (req.method !== 'GET') return;
  // 不拦截跨域请求（智谱 API 等）
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求（打开页面）：缓存优先，后台静默更新
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        // 后台拿最新版（不阻塞渲染）
        const fetchPromise = fetch(req).then((netRes) => {
          if (netRes && netRes.status === 200) {
            const clone = netRes.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', clone));
          }
          return netRes;
        }).catch(() => null /* 网络不可用时静默失败 */ );

        // 立即返回缓存（零等待），如果缓存为空则等网络
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
