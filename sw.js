// WorldWatch — service worker tylko do powiadomień systemowych (bez cache: zawsze świeże pliki)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all[0];
    if (c) { await c.focus(); c.postMessage({ ww: 'open', ...data }); }
    else await self.clients.openWindow(self.registration.scope);
  })());
});
