import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

// Precache only the built app shell. No runtime caching: Base44 API calls must always hit the network.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

// autoUpdate: a new SW takes over at once (main.tsx reloads the page when it does).
self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

type PushData = { title?: string; body?: string; url?: string };

self.addEventListener('push', (event) => {
  let data: PushData = {};
  try {
    data = (event.data?.json() ?? {}) as PushData;
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || 'Finance Tracker';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | null)?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all.find((c) => new URL(c.url).origin === self.location.origin) as WindowClient | undefined;
      if (client) {
        await client.focus();
        try {
          await client.navigate(url);
          return;
        } catch {
          /* navigate fails for uncontrolled clients; fall through to openWindow */
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
