// Minimalni service worker: omogućava instalaciju; mreža ima prednost, bez keširanja podataka iz baze.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => new Response('<meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:3rem"><h2>Nema interneta</h2><p>Provjeri vezu i pokušaj ponovo.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
  }
});
