const CACHE_NAME = 'tareas-pwa-v43';
const urlsToCache = [
    './mobile.html',
    './css/mobile.css',
    './js/config.js',
    './js/cloud.js',
    './js/model.js',
    './js/engine.js',
    './js/ui-mobile.js',
    './js/app.js'
];

// Instalación: Se fuerza la toma de control inmediata
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

// Activación: Destrucción de cachés de versiones anteriores
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptación de red: Aislamiento de datos externos
self.addEventListener('fetch', event => {
    // Si la petición NO es hacia tus archivos locales (ej. API de GitHub), pasa de largo
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
