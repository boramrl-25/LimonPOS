# LimonPOS — Hibrit Mimari Uygulama Raporu

**Tarih:** 2025-03  
**Amaç:** Offline öncelikli, cloud yedekli, audit destekli mimarinin uygulanması

---

## 1. Mevcut Durum (Güncel — Uygulandı)

| Bileşen | Durum |
|---------|-------|
| App (Android) | Çoklu API URL (Primary, Secondary, Tertiary) |
| Failover | Var — Primary → Secondary → Tertiary |
| Check-Back | Var — Her 15 dk Local ping, sync tetikleme |
| X-Device-Id | Var — Tüm isteklere eklenir |
| Audit metadata | Var — Order/Payment: source, device_id |
| Gün sonu audit | Var — 23:00 UTC job, GET /api/admin/audit-report |
| Force Update API | Var — POST /api/admin/broadcast-catalog-update |
| Local sync script | Var — backend/scripts/local-sync-from-cloud.js |

---

## 2. Hedef Mimari (Özet)

- **Local Backend:** Yerel ağda (WiFi) çalışan Node.js + Prisma
- **3 seviye failover:** Local A → Local B → Cloud
- **Check-Back:** Cloud'dayken her 5 dk Local'e ping, dönüş varsa geri geç
- **Veri gönderme:** App + Local Backend → Cloud (audit için)
- **Veri alma:** Backoffice → Cloud → Local Backend + App (fallback)
- **Force Update:** FCM Silent Push (veya Local WebSocket B planı)
- **Gün sonu audit:** Cloud, App vs Local karşılaştırma, fark raporu
- **Sabit IP:** Local Backend için DHCP reservation veya static IP

---

## 3. Yapılacaklar Listesi

### 3.1 App Tarafı (Android)

| # | Görev | Açıklama |
|---|-------|----------|
| 1 | **Çoklu API URL** | Settings'e 3 URL: Primary (Local A), Secondary (Local B), Tertiary (Cloud). Sırayla dene. |
| 2 | **Failover mantığı** | Bir URL ulaşılamazsa (timeout/404) sıradakine geç. |
| 3 | **Check-Back mekanizması** | Cloud'dayken arka planda her 5 dk Primary/Secondary'ye ping at. Erişilebilirse geri dön. |
| 4 | **Cihaz ID** | Her request'e `X-Device-Id` header ekle (zaten `deviceId` var mı kontrol et). |
| 5 | **Kaynak etiketi** | Cloud'a gönderilen veriye `source: "app"` veya `source: "local_backend"` ekle (audit için). |
| 6 | **FCM entegrasyonu** | Firebase Cloud Messaging — `catalog_updated` silent push alınca hemen sync tetikle. |
| 7 | **UUID** | Sipariş ID'leri zaten UUID; order_item için de clientLineId UUID — doğrula. |
| 8 | **Settings UI** | Server URL yerine 3 URL girişi veya tek URL + "Yedek URL'ler" alanı. |

**Etkilenen dosyalar:**
- `ServerPreferences.kt` / `ServerPreferences` — çoklu base URL
- `ApiSyncRepository.kt` — failover, check-back, header
- `ApiService.kt` — base URL değişken, interceptor
- Yeni: `ApiFailoverManager` veya benzeri
- Yeni: FCM service (Firebase)

---

### 3.2 Backend Tarafı (Node.js)

| # | Görev | Açıklama |
|---|-------|----------|
| 1 | **Audit metadata** | Order/payment kayıtlarına `source` (app | local_backend) ve `device_id` ekle. |
| 2 | **Gün sonu job** | Cron: Belirlenen saatte App vs Local verilerini karşılaştır, fark raporu üret. |
| 3 | **Force Update API** | Backoffice fiyat değiştirdiğinde FCM ile `catalog_updated` gönder. Endpoint: `POST /api/admin/broadcast-catalog-update` |
| 4 | **FCM server** | Firebase Admin SDK ile cihazlara push gönderme. |
| 5 | **Local Backend sync** | Local backend'in Cloud'dan katalog çekmesi (cron). Zaten `syncFromApi` benzeri — Local için reverse sync job. |

**Etkilenen dosyalar:**
- `backend/server.js` — yeni endpoint'ler, audit alanları
- `backend/` — FCM config, cron job
- Prisma schema — `source`, `device_id` kolonları (gerekirse)

---

### 3.3 Local Backend Kurulumu

| # | Görev | Açıklama |
|---|-------|----------|
| 1 | **Node.js + Prisma** | Mevcut backend kodunu PC/Tablet/Mini PC'de çalıştır. |
| 2 | **Sabit IP** | Router'da DHCP reservation veya cihazda static IP (örn. 192.168.1.10). |
| 3 | **Cloud sync job** | Periyodik (5–15 dk) Cloud'dan katalog çek, local DB güncelle. |
| 4 | **Cloud push** | Periyodik veya event bazlı Local → Cloud veri gönder (orders, payments, tables). |
| 5 | **Başlangıç scripti** | `npm start` veya `node server.js` — systemd / pm2 ile açılışta başlat. |

---

### 3.4 Backoffice (Web)

| # | Görev | Açıklama |
|---|-------|----------|
| 1 | **Force Update butonu** | "Zorunlu Güncelle" — Cloud API'yi tetikler, FCM broadcast gönderir. |
| 2 | **Fark raporu sayfası** | Gün sonu audit sonuçlarını göster. |
| 3 | **Gün sonu saati ayarı** | Settings'te audit cron saati (örn. 23:00). |

---

### 3.5 Dokümantasyon

| # | Görev |
|---|-------|
| 1 | Hibrit mimari dokümanı güncelle (static IP, Mini PC tavsiyesi, check-back, audit fingerprint, FCM + WebSocket) |
| 2 | Kurulum kılavuzu (Local Backend nasıl kurulur) |
| 3 | Failover test senaryoları |

---

## 4. Uygulama Sırası (Öneri)

### Faz 1 — Temel (2–3 hafta)
1. App: Çoklu API URL + failover mantığı
2. Local Backend: Kurulum scripti, Cloud sync job
3. Sabit IP dokümantasyonu

### Faz 2 — Dayanıklılık (1–2 hafta)
4. App: Check-Back mekanizması
5. Backend: Audit metadata (source, device_id)
6. Gün sonu audit job (basit karşılaştırma)

### Faz 3 — Force Update (1 hafta)
7. FCM entegrasyonu (App + Backend)
8. Backoffice: "Zorunlu Güncelle" butonu
9. Gerekirse Local WebSocket B planı

### Faz 4 — İyileştirmeler (1 hafta)
10. Fark raporu UI
11. Mini PC / donanım tavsiyeleri dokümanı
12. Test ve optimizasyon

---

## 5. Teknik Detaylar

### 5.1 Failover Akışı
```
1. baseUrl = primaryUrl
2. İstek at
3. Başarısız (timeout, 5xx, connection error)?
   → baseUrl = secondaryUrl, tekrar dene
4. Başarısız?
   → baseUrl = tertiaryUrl (Cloud), tekrar dene
5. Başarılı → devam et
```

### 5.2 Check-Back Akışı
```
Şu an tertiaryUrl (Cloud) kullanılıyorsa:
  Her 5 dakikada bir:
    primaryUrl'e HEAD /api/health veya GET /api/settings (minimal) at
    Başarılı? → baseUrl = primaryUrl, sync başlat
```

### 5.3 Audit Fingerprint
- `orders` tablosu: `source` (app | local_backend), `device_id`
- `payments` tablosu: aynı
- Gün sonu: order_id bazında App vs Local karşılaştır

### 5.4 Force Update (FCM)
- Backoffice kaydedince → `POST /api/admin/broadcast-catalog-update`
- Backend → FCM: `{ "data": { "type": "catalog_updated" } }` (silent)
- App FCM listener: `type == "catalog_updated"` → `syncFromApi()` çağır

---

## 6. Riskler ve Önlemler

| Risk | Önlem |
|------|-------|
| Local DB bozulması | Düzenli yedekleme (günlük) |
| IP değişimi | DHCP reservation, dokümanda uyarı |
| FCM gecikmesi | WebSocket B planı (local ağ) |
| Çoklu cihaz conflict | UUID, last-write-wins veya timestamp |

---

## 7. Test Senaryoları

1. Local Backend kapat → App Cloud'a geçmeli
2. Local Backend aç → 5 dk içinde App geri dönmeli (check-back)
3. Fiyat değiştir → Force Update → Tablet 1 dk içinde güncellemeli
4. İnternet yok → App + KDS Local ile çalışmalı
5. Gün sonu → Fark raporu üretilmeli (test verisi ile)

---

## 8. Özet

| Kategori | İş sayısı (yaklaşık) |
|----------|----------------------|
| App | 8 görev |
| Backend | 5 görev |
| Local Backend | 5 görev |
| Backoffice | 3 görev |
| Dokümantasyon | 3 görev |

**Tahmini süre:** 5–7 hafta (1 geliştirici, part-time)

---

*LimonPOS — Hibrit Mimari Uygulama Raporu — Son güncelleme: 2025-03*
