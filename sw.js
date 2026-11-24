/* Service Worker: кешируем оболочку, остальное — network-first */
const CACHE_VERSION = 'kcrm-v24';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/android/icon-192x192.png',
  './icons/android/icon-512x512.png',
  './icons/ios/icon-180x180.png',
  './icons/splash.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // GAS и сторонние API — не кешируем
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('ntfy.sh')) {
    return;
  }

  // Навигационные запросы: network-first, офлайн — из кеша
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Всё остальное — cache-first с фоновым обновлением
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ===== PUSH (приём уведомлений) =====
self.addEventListener('push', event => {
  let title = 'Конный клуб';
  let body = 'Новое уведомление';
  let url = './';

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body = data.message || data.body || body;
      url = data.url || data.click || url;
    } catch (e) {
      body = event.data.text() || body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: './icons/android/icon-192x192.png',
      badge: './icons/android/icon-72x72.png',
      vibrate: [200, 100, 200],
      data: { url: url },
      actions: [{ action: 'open', title: 'Открыть' }]
    })
  );
});

// ===== NOTIFICATION CLICK (открытие приложения по клику) =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ===== СООБЩЕНИЯ ОТ СТРАНИЦЫ =====
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
