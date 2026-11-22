self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', event => {
  event.waitUntil(
    self.registration.showNotification('Cycle', {
      body: 'Period expected soon',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'cycle-reminder',
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (const client of clients) {
          if ('focus' in client) {
            return client.focus()
          }
        }

        return self.clients.openWindow('/')
      }),
  )
})
