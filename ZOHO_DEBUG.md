# Zoho Books EU Entegrasyon – Hata Ayıklama Rehberi

## Kök Neden Özeti

Aşağıdaki sorunlar giderildi:

1. **redirect_uri yanlış** – Frontend EU için `https://www.zoho.com/books` gönderiyordu. Zoho EU OAuth için `https://api-console.zoho.eu/oauth/redirect` olmalı.
2. **exchange-code dc kaydetmiyordu** – Token Al sonrası `dc` (region) DB'ye yazılmıyordu; sonraki token isteklerinde yanlış bölge kullanılıyordu.
3. **OAuth exchange sadece eu/com** – `in`, `au` bölgeleri destekleniyordu ama exchange sadece eu/com için yapılıyordu.
4. **Zoho push log eksikliği** – Hata ayıklamak için yeterli log yoktu.

---

## Düzeltilen Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `pos-backoffice/src/lib/api.ts` | `exchangeZohoCode`: dc’ye göre doğru redirect_uri (EU: api-console.zoho.eu/oauth/redirect) |
| `backend/server.js` | `/api/zoho/exchange-code`: Token Al sonrası `dc` değerini zoho_config’e kaydetme |
| `backend/zoho.js` | `exchangeCodeForRefreshToken`: `getZohoUrls(dcKey)` ile tüm bölgeler (eu/com/in/au) |
| `backend/zoho.js` | `pushToZohoBooks`: dc, booksBase, org, customer, line_items loglama |

---

## Zorunlu Env / Config Alanları

### Railway Variables (opsiyonel – DB’yi override eder)

| Değişken | Açıklama | EU için |
|----------|----------|---------|
| `ZOHO_DC` | Bölge (eu, com, in, au) | `eu` |
| `ZOHO_REFRESH_TOKEN` | Refresh token | - |
| `ZOHO_CLIENT_ID` | Client ID | - |
| `ZOHO_CLIENT_SECRET` | Client Secret | - |
| `ZOHO_ORGANIZATION_ID` | Org ID | - |
| `ZOHO_CUSTOMER_ID` | Walk-in customer ID | - |
| `ZOHO_CASH_ACCOUNT_ID` | Nakit hesap ID | - |
| `ZOHO_CARD_ACCOUNT_ID` | Kart hesap ID | - |
| `ZOHO_ENABLED` | `true` / `false` | `true` |

Önemli: Railway’de `ZOHO_DC` tanımlıysa DB’deki region değerini geçersiz kılar. EU hesabı için `ZOHO_DC=eu` olmalı veya hiç tanımlanmayıp DB’de `dc=eu` kullanılmalı.

### Web Arayüzü (Zoho Ayarları)

- **Region:** EU (zoho.eu)
- **Client ID / Client Secret:** api-console.zoho.eu üzerinden alınmalı
- **Refresh Token:** Token Al ile alınmalı (Region=EU seçili iken)
- **Organization ID:** Zoho Books → Settings → Organization Profile
- **Customer ID:** Walk-in Customer ID
- **Zoho Books Enabled:** Açık

---

## Endpoint Doğrulama (EU)

| İşlem | Doğru URL |
|-------|-----------|
| Token refresh | `https://accounts.zoho.eu/oauth/v2/token` |
| Books API | `https://www.zohoapis.eu/books/v3` |
| OAuth redirect (code exchange) | `https://api-console.zoho.eu/oauth/redirect` |

---

## Test Planı

### 1) EU Token Exchange Testi

1. Zoho ayarlarında **Region: EU** seçin.
2. Client ID ve Client Secret girin (api-console.zoho.eu).
3. api-console.zoho.eu → Self Client → Generate Code (scope: ZohoBooks.fullaccess.all, redirect: https://api-console.zoho.eu/oauth/redirect).
4. Kodu yapıştırıp **Token Al** tıklayın.
5. Refresh token alınmalı; hata olmamalı.
6. **Save** tıklayın.

### 2) Müşteri Listesi (Contacts) Testi

1. **Müşterileri Getir** tıklayın.
2. Walk-in Customer dahil kişiler listelenmeli.
3. Walk-in Customer seçin ve **Save** yapın.

### 3) Bağlantı Kontrolü Testi

1. **Zoho Entegrasyonu Kontrol Et** tıklayın.
2. `salesPushReady: true` ve `region: EU` görülmeli.
3. `checks` altında enabled, orgId, customerId, refreshToken, clientId, clientSecret hepsi ✓ olmalı.

### 4) Satış Sonrası Sales Receipt Testi

1. POS’ta bir satış yapın ve ödemeyi tamamlayın.
2. Railway loglarında şunlar görülmeli:
   - `[Zoho] POST /api/payments received: ...`
   - `[Zoho] Pushing order ... to Zoho Books...`
   - `[Zoho] pushToZohoBooks: dc= eu booksBase= https://www.zohoapis.eu/books/v3 ...`
   - `[Zoho] Sales receipt created: ...` veya hata mesajı.
3. Zoho Books → Sales → Sales Receipts’te yeni kayıt olmalı.

---

## Sık Karşılaşılan Hatalar

| Hata | Olası Sebep |
|------|-------------|
| `invalid_client` | Client ID/Secret veya bölge hatalı. api-console.zoho.eu’da Self Client ve Region=EU kullanın. |
| `invalid_grant` | Refresh token geçersiz veya farklı bölgede üretilmiş. Region=EU seçip yeniden Token Al deneyin. |
| Satışlar Zoho’ya gitmiyor | 1) Zoho Books Enabled kapalı 2) Customer ID eksik 3) Order backend’e ulaşmıyor (Server URL, sync) |
| `enabled is not true` | Zoho Books Enabled açık değil veya DB/env’de `enabled` yanlış. |
