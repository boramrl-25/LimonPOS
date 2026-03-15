# Hibrit Mimari Kurulum Kılavuzu

HIBRIT_MIMARI_OZET.html'deki mimari kod olarak tamamlandı. Bu kılavuz kurulum adımlarını gösterir.

---

## Önce Ne Var?

- **Cloud (Hetzner):** api.the-limon.com — zaten çalışıyor
- **Backoffice:** pos.the-limon.com — zaten çalışıyor
- **Local Backend:** Henüz kurulmamış — PC/Raspberry Pi'de kurulacak
- **App (Tablet):** Server Settings'te URL'ler ayarlanacak

---

## Adım 1: Cloud (Hetzner) Güncellemesi

### 1.1 DB migration

Backend'de `source` ve `device_id` kolonları için migration çalıştır:

```bash
cd backend
# .env veya ortam değişkeninde DATABASE_URL olmalı
npx prisma db push
```

Veya Windows PowerShell:
```powershell
cd backend
.\scripts\run-migration.ps1
```

### 1.2 Backend + Backoffice deploy

Güncel kodu Hetzner’e push et (mevcut deploy sürecin ile):

- Backend: `backend/` → api.the-limon.com
- Backoffice: `pos-backoffice/` → pos.the-limon.com

### 1.3 (Opsiyonel) FCM

Anında Force Update için Firebase kurulumu — `docs/FIREBASE_SETUP.md` bölümüne bak.

---

## Adım 2: Local Backend Kurulumu

### 2.1 Donanım

- **PC, Mini PC veya Raspberry Pi** (yerel WiFi ağına bağlı)
- **Sabit IP** (router’da DHCP reservation veya cihazda static IP, örn. 192.168.1.10)

### 2.2 Gereksinimler

- Node.js 18+
- PostgreSQL (veya mevcut Cloud DB’ye bağlan — Local’de ayrı DB de olabilir)
- Aynı WiFi ağında tabletler

### 2.3 Kurulum

```bash
# Projeyi Local Backend PC'ye kopyala veya klonla
cd LimonPOS/backend

# Bağımlılıklar
npm install

# .env oluştur
cp .env.example .env
# Düzenle: DATABASE_URL (Cloud DB veya lokal PostgreSQL)
# PORT=3002
```

**Önemli:** Local Backend Cloud ile aynı PostgreSQL’e mi bağlanacak?

- **Aynı DB:** Local ve Cloud aynı veritabanını kullanır; senkron basit, ama Local Cloud’a internetten erişebilmeli.
- **Ayrı DB:** Local kendi PostgreSQL’ine bağlanır; Cloud sync için `local-sync-from-cloud.js` script’i kullanılır.

### 2.4 Cloud’dan katalog çekme (ayrı DB ise)

```bash
cd backend
PIN=1234 API_URL=https://api.the-limon.com/api node scripts/local-sync-from-cloud.js
```

Bunu cron ile 5–15 dakikada bir çalıştırabilirsin.

### 2.5 Local Backend başlat

```bash
cd backend
PORT=3002 node server.js
```

Veya `pm2` / `systemd` ile açılışta otomatik başlat.

---

## Adım 3: App (Tablet) Ayarları

### 3.1 Server Settings

1. App’i aç → **Settings** → **Server URL**
2. **Primary (Local A):** `http://192.168.1.10:3002/api/` (Local Backend IP)
3. **Secondary (Local B):** (Varsa) `http://192.168.1.11:3002/api/`
4. **Tertiary (Cloud):** `https://api.the-limon.com/api/`
5. **Save** ile kaydet

### 3.2 Çalışma mantığı

- Önce Primary (Local) denenir
- Ulaşılamazsa Secondary, o da yoksa Cloud kullanılır
- Cloud kullanılırken Check-Back her 15 dk Local’e ping atar; Local tekrar ulaşılabilir olunca geri döner

---

## Adım 4: Test Senaryoları

| Senaryo | Beklenen |
|---------|----------|
| Local çalışıyor, internet var | App Local’e bağlanır |
| Local kapalı, internet var | App otomatik Cloud’a geçer |
| Local tekrar açıldı | 15 dk içinde App Local’e döner |
| İnternet yok | App sadece Local ile çalışır |
| Zorunlu Güncelle | Backoffice Products → Zorunlu Güncelle → En geç 15 sn içinde sync |

---

## Özet Checklist

- [ ] Hetzner: DB migration çalıştırıldı
- [ ] Hetzner: Backend + Backoffice deploy edildi
- [ ] Local Backend: PC/Mini PC kuruldu, sabit IP ayarlandı
- [ ] Local Backend: `npm install`, `.env`, `node server.js` çalışıyor
- [ ] (Opsiyonel) Local sync script cron’a eklendi
- [ ] Tablet: Server Settings’te Primary = Local, Tertiary = Cloud ayarlandı
- [ ] Test: Local kapat → Cloud’a geçiş; Local aç → geri dönüş
