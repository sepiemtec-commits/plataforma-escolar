/* VEHO Edu — service worker: cache do shell + Web Push */
const CACHE_NAME = 'veho-edu-shell-v6';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/styles/tokens.css',
  '/styles/fonts.css',
  '/styles/login.css',
  '/styles/painel.css',
  '/js/api.js',
  '/js/login.js',
  '/js/pwa-register.js',
  '/js/push.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/health' ||
    url.pathname.startsWith('/uploads/')
  ) {
    event.respondWith(fetch(req));
    return;
  }

  const isAsset =
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.startsWith('/icons/');

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (isAsset || url.pathname.endsWith('.html') || url.pathname === '/')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (isAsset) {
          return new Response('', { status: 503, statusText: 'Offline asset' });
        }
        return caches.match('/index.html');
      })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'VEHO Edu', body: '', url: '/' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (_) {
    try {
      data.body = event.data ? event.data.text() : '';
    } catch (__) {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'VEHO Edu', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const client of lista) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (typeof client.navigate === 'function') client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
