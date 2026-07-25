// Injected into the auto-generated Workbox service worker via vite.config.js's
// workbox.importScripts — the generated SW only knows about precaching/
// offline, it has no idea about Web Push on its own. This file adds that.
//
// Kept deliberately tiny and dependency-free (plain self.addEventListener,
// no imports) since it runs inside the service worker's own global scope,
// not a normal page/module context.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Rorota', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Rorota';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking the notification focuses an already-open tab if there is one,
// otherwise opens a new one — either way landing on the URL the push
// payload asked for (defaults to the app root).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
