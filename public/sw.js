/* World Choir — Web Push service worker */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'World Choir';
  const options = {
    body: data.body || '',
    icon: '/images/world-choir-logo.png',
    badge: '/images/world-choir-logo.png',
    data: {
      url: data.url || '/',
      campaignId: data.campaignId || null,
      topic: data.topic || null,
    },
    tag: data.campaignId ? `wc-${data.campaignId}` : 'world-choir',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  const absolute = new URL(target, self.location.origin).href;

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(absolute); } catch { /* ignore */ }
        }
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(absolute);
  })());
});
