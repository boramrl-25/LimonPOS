# Limon POS – Sistem Mimarisi

Bu dokümanda: backend teknolojisi, veritabanı, Android–web senkronizasyonu, kod konumları ve Zoho Books entegrasyonu özetlenir.

---

## 1. Sistem Mimarisi

### 1.1. Backend teknolojisi

- **Teknoloji:** **Node.js** (JavaScript, ES modules)
- **Framework:** **Express.js** (REST API)
- **Port:** Varsayılan `3002` (`.env` veya `PORT` ile değiştirilebilir)
- **Konum:** `backend/` klasörü  
  - Giriş noktası: `backend/server.js`  
  - Veri/DB: `backend/db.js`  
  - Zoho: `backend/zoho.js`

### 1.2. Veritabanı

- **Tür:** İlişkisel DB değil; **dosya tabanlı JSON veritabanı**
- **Kütüphane:** **LowDB** (`lowdb` npm paketi)
- **Dosya:** Tek bir JSON dosyası: `data.json`
  - Varsayılan konum: `backend/data.json`
  - Production’da kalıcı olması için: **`DATA_DIR`** environment variable ile dizin verilir (örn. Railway’de volume mount + `DATA_DIR=/data` → `/data/data.json`)
- **İçerik:** users, categories, products, tables, orders, order_items, payments, printers, modifier_groups, void_logs, void_requests, zoho_config, floor_plan_sections vb. tek dosyada JSON olarak tutulur.
- **Not:** MySQL, MongoDB, Firebase kullanılmıyor; tüm veri bu JSON dosyasında.

### 1.3. Android app – Web senkronizasyonu

- **Yöntem:** **REST API** (HTTP/HTTPS). WebSocket veya Firebase Realtime DB yok.
- **Akış:**
  - **Android uygulaması** (Kotlin, Retrofit) aynı backend’e istek atar: sipariş/masa/kategori/ürün gönderir (PUT/POST) ve çeker (GET).
  - **Web backoffice** (Next.js, `pos-backoffice/`) da aynı backend API’yi kullanır: `NEXT_PUBLIC_API_URL` (örn. `https://api.the-limon.com/api`).
- **Senkronizasyon mantığı:**
  - App çevrimiçi olduğunda periyodik (örn. 30 sn) **tam senkron**: önce açık siparişleri/masaları API’ye **push**, sonra tablolar/siparişler/katalog (categories, products, users, printers, modifier groups) **pull**.
  - Web tarafı sadece API’den veri çeker/günceller; app ile doğrudan bağlantı yok, her ikisi de backend üzerinden senkron olur.
- **Yakın gerçek zamanlı güncelleme (WebSocket yok, polling):**
  - **Web:** Ana sayfa ve Dashboard ~8–15 sn’de bir, Floor Plan 5 sn’de bir tablolar/istatistikler yenilenir. Böylece Android’de açılan masa veya alınan sipariş kısa sürede görünür.
  - **Android:** Floor Plan ekranı açıkken her ~25 sn’de tam senkron çalışır; Web’den yapılan masa/sipariş değişiklikleri bu ekranda güncellenir.
- **Kimlik doğrulama:** API’de `Authorization: Bearer <token>`; web’de PIN ile giriş sonrası token saklanır; app’te kullanıcı PIN’i ile benzer şekilde token/oturum kullanılır.

---

## 2. Backend ve Android kodlarına erişim

### 2.1. Backend kodu

- **Klasör:** `LimonPOS/backend/`
- **Açmak:** Bu repo’yu clone’ladıktan sonra `backend` klasörüne gidin.
- **Çalıştırmak (yerel):**
  ```bash
  cd backend
  npm install
  npm run dev
  ```
  API varsayılan olarak `http://localhost:3002` üzerinde çalışır.
- **Önemli dosyalar:**
  - `server.js` – Tüm REST endpoint’leri (auth, tables, orders, categories, products, payments, zoho, vb.)
  - `db.js` – LowDB ve `data.json` yolu (DATA_DIR)
  - `zoho.js` – Zoho Books OAuth, token, ürün/fiş senkronu

### 2.2. Android (app) kodu

- **Klasör:** `LimonPOS/app/`
- **Açmak:** Projeyi **Android Studio** ile açın (kök klasör `LimonPOS` veya `LimonPOS` içinde `app` modülü).
- **Gereksinimler:** JDK 17, Android SDK (min 24, target 34), Gradle.
- **Build / çalıştırma:**
  ```bash
  ./gradlew assembleDebug
  ```
  veya Android Studio’dan Run.
- **API adresi (app):** Uygulama içi ayarlardan (Server Settings) değiştirilebilir; varsayılan `https://api.the-limon.com/api/`. Tanım: `app/src/main/java/com/limonpos/app/data/prefs/ServerPreferences.kt` (DEFAULT_BASE_URL).
- **Senkron katmanı:** `app/src/main/java/com/limonpos/app/data/repository/ApiSyncRepository.kt` – push/pull ve sync tetiklemesi burada.

### 2.3. Web backoffice kodu

- **Klasör:** `LimonPOS/pos-backoffice/`
- **Teknoloji:** Next.js 14, React, TypeScript.
- **Çalıştırmak:**
  ```bash
  cd pos-backoffice
  npm install
  npm run dev
  ```
  Varsayılan: `http://localhost:3000`. API adresi `pos-backoffice/.env` veya ortam değişkeni `NEXT_PUBLIC_API_URL` ile ayarlanır.

---

## 3. Zoho Books entegrasyonu ve token nereden alınır?

### 3.1. Entegrasyon ne yapar?

- **Ödeme tamamlanınca:** Backend, siparişi Zoho Books’a **Sales Receipt** olarak gönderir (`pushToZohoBooks`).
- **Ürün/katalog:** Web’den “Zoho Sync” veya “Select from Zoho Books” ile Zoho’daki ürünler çekilir; kategoriler ve ürünler backend’e (ve sync ile app’e) yansır.
- **Ayarlar:** Backend’de `zoho_config` (refresh_token, client_id, client_secret, organization_id, customer_id, enabled) saklanır; web’den **Settings → Zoho Books Integration** ile yönetilir.

### 3.2. Token ve kimlik bilgileri nereden alınır?

| Bilgi | Nereden alınır |
|-------|-----------------|
| **Client ID & Client Secret** | [Zoho API Console](https://api-console.zoho.com) → Add Client → **Server-based Applications** → Create. Ekranda görünen Client ID ve Secret’ı kopyalayın. |
| **Refresh Token** | 1) Aynı console’da **Generate Code** ile kısa ömürlü bir **authorization code** alın (scope: `ZohoBooks.fullaccess.all`). 2) Bu kodu backend’e gönderin; backend `exchangeCodeForRefreshToken` ile Zoho’dan **refresh_token** alır ve `zoho_config` içine yazar. Web’de **Settings → Zoho Books** sayfasında “Exchange code” alanına kodu yapıştırıp ilgili butona basarak da token alınabilir. |
| **Organization ID** | Zoho Books → Settings → Organization Profile veya tarayıcıda `books.zoho.com/app/XXXXXX` URL’indeki XXXXXX. |
| **Customer ID** | Zoho Books’ta satış fişi atarken kullanılan müşteri kaydının ID’si; Zoho Books API veya arayüzden alınır. |

### 3.3. Token alma adımları (özet)

1. **https://api-console.zoho.com** (EU hesabı için **api-console.zoho.eu**) → Zoho ile giriş.
2. **Add Client** → **Server-based Applications** → Client Name, Homepage URL, **Redirect URI** girin (Self Client kullanıyorsanız Zoho’nun önerdiği redirect’i kullanın, örn. `https://api-console.zoho.com/oauth/redirect`).
3. **Create** → **Client ID** ve **Client Secret**’ı kopyalayın.
4. **Generate Code** bölümünde scope olarak `ZohoBooks.fullaccess.all` seçip **Create** → çıkan **Code**’u kopyalayın (birkaç dakika geçerlidir).
5. Web backoffice’te **Settings → Zoho Books Integration** sayfasında:
   - Client ID ve Client Secret’ı girin, kaydedin.
   - “Authorization code” alanına bu code’u yapıştırıp **Exchange code** / token al butonuna basın.
   - Backend, Zoho’ya `grant_type=authorization_code` ile istek atar; yanıttaki **refresh_token** alınır ve backend’de saklanır.
6. **Organization ID** ve (gerekirse) **Customer ID**’yi de aynı sayfadan girip kaydedin. Zoho Books’u “Enabled” yapın.

### 3.4. Detaylı kılavuzlar (proje içi)

- **Web tarafı (token adımları):** `pos-backoffice/ZOHO_OAUTH_KILAVUZU.md`
- **Kök dizinde:** `ZOHO_KURULUM.md`, `ZOHO_BOOKS_BACKEND.md`, `ZOHO_BOOKS_INTEGRATION.md` (varsa)

### 3.5. EU / farklı data center

- Hesabınız **Zoho EU** ise backend’e `ZOHO_DC=eu` (veya ilgili env) verin; `zoho.js` `accounts.zoho.eu` ve `zohoapis.eu` kullanır.
- Redirect URI ve token endpoint’leri bölgeye göre değişir; detay için `backend/zoho.js` ve `pos-backoffice/ZOHO_OAUTH_KILAVUZU.md` içindeki data center notlarına bakın.

---

## Özet tablo

| Soru | Cevap |
|------|--------|
| Backend teknolojisi | Node.js, Express |
| Veritabanı | LowDB (tek JSON dosyası, `data.json`) |
| Android–Web senkron | REST API (push/pull); WebSocket/Firebase yok |
| Backend kodu nerede | `backend/` |
| Android kodu nerede | `app/` (Android Studio ile açılır) |
| Web kodu nerede | `pos-backoffice/` (Next.js) |
| Zoho token nereden | Zoho API Console → Client + Generate Code → Web’de “Exchange code” ile refresh_token alınır |
