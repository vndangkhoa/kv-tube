self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
    // Basic pass-through to satisfy the PWA requirements
    // In a robust implementation, this would handle caching and offline fallbacks.
    e.respondWith(
        fetch(e.request).catch(() => {
            return new Response('Offline', { status: 503 });
        })
    );
});
