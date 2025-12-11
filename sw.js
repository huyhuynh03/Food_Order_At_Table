/**
 * Service Worker - Image Caching
 * Cache ảnh sản phẩm từ link mạng để load nhanh hơn
 * Ảnh chỉ cần tải 1 lần, sau đó sử dụng từ cache
 */

const CACHE_NAME = 'yaki-image-cache-v1';

// Các domain ảnh được phép cache (thêm domain của ảnh sản phẩm vào đây)
const ALLOWED_IMAGE_DOMAINS = [
    'github.com',
    'raw.githubusercontent.com',
    'images.unsplash.com',
    'cdn.pixabay.com',
    'i.imgur.com',
    'res.cloudinary.com',
    'storage.googleapis.com',
    'firebasestorage.googleapis.com',
    'lh3.googleusercontent.com',
    // Thêm domain khác nếu cần
];

// Kiểm tra xem URL có phải là ảnh không
function isImageRequest(request) {
    const url = new URL(request.url);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp'];

    // Check destination
    if (request.destination === 'image') {
        return true;
    }

    // Check file extension
    const pathname = url.pathname.toLowerCase();
    return imageExtensions.some(ext => pathname.includes(ext));
}

// Kiểm tra domain có được phép cache không
function isAllowedDomain(url) {
    try {
        const urlObj = new URL(url);
        // Luôn cache ảnh local
        if (urlObj.origin === self.location.origin) {
            return true;
        }
        // Kiểm tra domain trong danh sách cho phép
        return ALLOWED_IMAGE_DOMAINS.some(domain => urlObj.hostname.includes(domain));
    } catch {
        return false;
    }
}

// Install event - Kích hoạt Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] Service Worker installed - Image caching ready');
    self.skipWaiting(); // Kích hoạt ngay lập tức
});

// Activate event - Xóa cache cũ nếu có version mới
self.addEventListener('activate', (event) => {
    console.log('[SW] Service Worker activated');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter(name => name.startsWith('yaki-image-cache-') && name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - Intercept requests và cache ảnh
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Chỉ xử lý GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Chỉ cache ảnh
    if (!isImageRequest(request)) {
        return;
    }

    // Cache-first strategy cho ảnh
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // Nếu có trong cache, trả về ngay (nhanh!)
            if (cachedResponse) {
                console.log('[SW] 📦 From cache:', request.url.substring(0, 80) + '...');
                return cachedResponse;
            }

            // Nếu không có trong cache, fetch từ network
            return fetch(request).then((networkResponse) => {
                // Kiểm tra response hợp lệ
                if (!networkResponse || networkResponse.status !== 200) {
                    return networkResponse;
                }

                // Chỉ cache ảnh từ domain được phép
                if (isAllowedDomain(request.url) || request.url.startsWith(self.location.origin)) {
                    // Clone response vì nó chỉ có thể dùng 1 lần
                    const responseToCache = networkResponse.clone();

                    // Lưu vào cache
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                        console.log('[SW] 💾 Cached:', request.url.substring(0, 80) + '...');
                    });
                }

                return networkResponse;
            }).catch((error) => {
                console.error('[SW] Fetch failed:', error);
                // Có thể trả về placeholder image ở đây nếu muốn
                return new Response('', { status: 404 });
            });
        })
    );
});

// Message event - Xử lý lệnh từ main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'clearImageCache') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('[SW] 🗑️ Image cache cleared');
            event.source.postMessage({ action: 'cacheCleared' });
        });
    }

    if (event.data && event.data.action === 'getCacheStats') {
        caches.open(CACHE_NAME).then((cache) => {
            cache.keys().then((keys) => {
                event.source.postMessage({
                    action: 'cacheStats',
                    count: keys.length
                });
            });
        });
    }
});
