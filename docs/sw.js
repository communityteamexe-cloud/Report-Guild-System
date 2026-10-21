/**
 * Service Worker — ทำให้เปิดเว็บกิลด์เหมือนแอป และเปิดได้แม้เน็ตช้า/หลุดชั่วคราว
 * ไฟล์หน้าเว็บ: ขอของใหม่จากเน็ตก่อนเสมอ (อัปเดตทันที) · เน็ตล่ม/ช้าเกิน 4 วิ → ใช้ชุดที่เก็บไว้
 * ไม่ยุ่งกับคำขอไปหลังบ้าน (Apps Script) — ข้อมูลคะแนน/รายชื่อยังมาจากเซิร์ฟเวอร์ทุกครั้ง
 */
const CACHE = 'rgs-shell-v1';
const SHELL = ['./', './index.html', './app.js', './style.css', './config.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
      if (net && net.ok) cache.put(req, net.clone());
      return net;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      return fetch(req);
    }
  })());
});
