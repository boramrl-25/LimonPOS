# LimonPOS Web Paneli – Detaylı Kılavuz

Bu dokümanda web backoffice’teki **ürünler**, **ayarlar**, **raporlar** ve tüm ekranlar tek tek, alan bazlı anlatılmaktadır.

---

## 1. Giriş ve Menü Yapısı

- **API tabanı:** `NEXT_PUBLIC_API_URL` (varsayılan: `https://api2.the-limon.com/api`)
- **Kimlik:** PIN ile giriş → token `limonpos_admin_token`, kullanıcı `limonpos_admin_user` (localStorage)
- **Sidebar menü (izinlere göre):**
  - **Dashboard** – `web_dashboard`
  - **Cash & Card** – `web_dashboard`
  - **Floor Plan** – `web_floorplan`
  - **Settings** – `web_settings`
  - **Payment Methods** – `web_settings`
  - **Zoho Books** – `web_settings`
  - **Users** – `web_users`
  - **Products** – `web_products`
  - **Modifiers** – `web_modifiers`
  - **Categories** – `web_categories`
  - **Printers** – `web_printers`
  - **Veri Denetim ve Kurtarma** – `web_settings`
- **Reports (alt menü):** `web_reports` gerekir
  - Daily Sales, Sales Report, Void Report, Refund Report, Category Sales, Product Sales

---

## 2. Ürünler (Products)

**Sayfa:** `/products`  
**API:** `GET/POST /api/products`, `PUT/DELETE /api/products/:id`, `PATCH /api/products/:id/show-in-till`

### Ürün alanları (Product)

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | string (UUID) | Benzersiz kimlik |
| `name` | string | Ürün adı (zorunlu) |
| `name_arabic` | string | Arapça ad |
| `name_turkish` | string | Türkçe ad |
| `sku` | string | Stok kodu |
| `category_id` | string | Kategori ID (opsiyonel) |
| `category` | string | Kategori adı (API’den gelir) |
| `price` | number | Birim fiyat |
| `tax_rate` | number | Vergi oranı (genelde 0) |
| `image_url` | string | Ürün görseli URL |
| `printers` | string[] | Bu ürünün yazdırılacağı yazıcı ID’leri (JSON array) |
| `modifier_groups` | string[] | Modifier grup ID’leri (boyut, ekstra vb.) |
| `active` | boolean | Aktif/pasif |
| `pos_enabled` | boolean | POS’ta (kasadaki ekranda) gösterilsin mi; “Show in Till” |
| `overdue_undelivered_minutes` | number | Masaya gitmeyen ürün uyarı süresi (dakika); 1–1440, zorunlu |
| `sellable_from_api` | unknown | Zoho/API’den gelen “satılabilir” bilgisi |
| `zoho_suggest_remove` | boolean | Zoho’da artık yok, silinecek önerisi; onay verilene kadar satışta kalır |

### Ürün sayfası işlevleri

- Liste: arama, kategori filtresi, sıralama (kategori / isim / fiyat)
- Yeni ürün ekleme, düzenleme, silme
- **Show in Till:** Ürünün POS ekranında görünmesini aç/kapa (`setProductShowInTill`)
- **Zoho entegrasyonu:**
  - Zoho’dan ürün listesi: `getZohoItems`
  - Zoho sync: `syncZohoBooks` (periyodik)
  - “Clear and sync”: `clearAndSyncProducts` – Zoho’da olmayanlar silinmez, “silinecek önerisi” olur
  - Silinecek öneriler: `getPendingZohoRemovalProducts` → onay: `confirmProductRemoval(productIds)`
- Excel ile toplu içe aktarma; çakışmalarda “mevcut güncelle / yeni ekle” seçimi
- Modifier & printer ataması formda seçim listesi ile

---

## 3. Kategoriler (Categories)

**Sayfa:** `/categories`  
**API:** `GET/POST /api/categories`, `PUT/DELETE /api/categories/:id`

### Kategori alanları (Prisma + Web)

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | string (UUID) | Benzersiz kimlik |
| `name` | string | Kategori adı |
| `color` | string | Renk (hex, örn. #84CC16) |
| `sort_order` | number | Sıra (küçük önce) |
| `active` | number | 1=aktif |
| `modifier_groups` | string (JSON array) | Bu kategoriye varsayılan modifier grup ID’leri |
| `printers` | string (JSON array) | Bu kategorideki ürünlerin gideceği yazıcı ID’leri |
| `show_till` | boolean/number | POS’ta (till) gösterilsin mi |

### Sayfa işlevleri

- Sürükle-bırak ile sıra (sort_order) güncelleme
- Kategori ekleme/düzenleme/silme
- **Show in Till** toggle (kategori bazında POS’ta görünürlük)
- Modifier grupları ve yazıcılar çoklu seçim
- Excel ile içe aktarma ve dışa aktarma

---

## 4. Modifier gruplar (Modifiers)

**Sayfa:** `/modifiers`  
**API:** `GET/POST /api/modifier-groups`, `PUT/DELETE /api/modifier-groups/:id`

### Modifier grup alanları

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | string (UUID) | Benzersiz kimlik |
| `name` | string | Grup adı (örn. Size, Extras) |
| `min_select` | number | Min seçim sayısı (0 = seçim zorunlu değil) |
| `max_select` | number | Max seçim sayısı |
| `required` | boolean | Zorunlu mu |
| `options` | array | Seçenekler: `{ id, name, price }` |

### Seçenek (option) alanları

- `id`: string  
- `name`: string (örn. Small, Large, Cheese)  
- `price`: number (ek fiyat)

### Sayfa işlevleri

- Grup ekleme/düzenleme/silme
- Her grupta birden fazla seçenek; seçenek adı ve fiyatı
- Excel şablonu indirme ve modifier’ları Excel’den içe aktarma / dışa aktarma

---

## 5. Yazıcılar (Printers)

**Sayfa:** `/printers`  
**API:** `GET/POST /api/printers`, `PUT/DELETE /api/printers/:id`

### Yazıcı alanları

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | string (UUID) | Benzersiz kimlik |
| `name` | string | Yazıcı adı (örn. Bar, Receipt) |
| `printer_type` | string | `"kitchen"` veya `"receipt"` |
| `ip_address` | string | Ağ IP adresi |
| `port` | number | Port (varsayılan 9100) |
| `status` | string | offline/online vb. |
| `kds_enabled` | boolean | KDS’e (ekrana) de gönderilsin mi |
| `enabled` | boolean/number | Yazıcı kullanımda mı (1=on) |

### Sayfa işlevleri

- Yazıcı ekleme/düzenleme/silme
- **Enabled** aç/kapa (yazıcıyı işe dahil etme/çıkarma)
- Excel şablonu, içe aktarma ve dışa aktarma

---

## 6. Ayarlar (Settings) – Genel yapı

**Ana sayfa:** `/settings` – Tüm ayar bölümlerine linkler.

Aşağıdaki ayarların çoğu **tek bir Settings kaydı** içinde (id: `"default"`) tutulur; API: `GET/PATCH /api/settings`.

---

### 6.1 General, Timezone & Currency  
**Sayfa:** `/settings/general`

| Ayar | API anahtarı | Açıklama |
|------|----------------|----------|
| Saat dilimi | `timezone_offset_minutes` | UTC’den dakika; örn. 180 = GMT+3 (Türkiye). Dashboard ve “bugün” hesapları buna göre. Preset: UTC, GMT+1…+4, GMT-1…-5; manuel -720..840 |
| Para birimi | `currency_code` | AED, TRY, USD, EUR, GBP. Fiş, dashboard ve POS’taki tutar/sembol buna göre |

---

### 6.2 Customer Receipt & Kitchen Receipt  
**Sayfa:** `/settings/receipt`

| Ayar | API anahtarı | Açıklama |
|------|----------------|----------|
| Şirket adı | `company_name` | Müşteri fişinde |
| Adres | `company_address` | Müşteri fişinde |
| Fiş başlığı | `receipt_header` | Varsayılan: "BILL / RECEIPT" |
| Fiş alt mesajı | `receipt_footer_message` | Varsayılan: "Thank you!" |
| Mutfak fişi başlığı | `kitchen_header` | Mutfak yazıcısı fişinin üstü |
| Mutfak ürün yazı boyutu | `receipt_item_size` | 0=Normal, 1=Large, 2=XLarge |

---

### 6.3 VAT  
**Sayfa:** `/settings/vat`

| Ayar | API anahtarı | Açıklama |
|------|----------------|----------|
| KDV oranı (%) | `vat_percent` | 0–100; tüm ürünlere uygulanan global oran |

---

### 6.4 Business Hours & End of Day  
**Sayfa:** `/settings/business-hours`

| Ayar | API anahtarı | Açıklama |
|------|----------------|----------|
| Açılış saati | `opening_time` | HH:mm (örn. 07:00) |
| Kapanış saati | `closing_time` | HH:mm (örn. 01:30); gece yarısı geçişi desteklenir |
| Açık masa uyarı saati | `open_tables_warning_time` | HH:mm; bu saatte süpervizörlere “açık masaları kapat” uyarısı |
| Uyarı açık | `warning_enabled` | Bu uyarının gösterilmesi |
| Otomatik kapatma | `auto_close_open_tables` | Kapanış–açılış aralığında açık masaları otomatik kapat |
| Otomatik kapatma ödeme yöntemi | `auto_close_payment_method` | "cash" veya "card" |
| Grace dakika | `grace_minutes` | 0–60; kapanıştan kaç dakika sonra otomatik kapatma çalışsın (0 = tam kapanışta) |

---

### 6.5 Payment Methods  
**Sayfa:** `/settings/payment`  
**API:** `GET/POST /api/payment-methods`, `PUT/DELETE /api/payment-methods/:id`

| Alan | Açıklama |
|------|----------|
| `id` | UUID |
| `name` | Görünen ad (örn. Nakit, Kart) |
| `code` | cash, card veya özel (sodexo vb.) – backend bu code’a göre eşleme yapar |
| `active` | 1=aktif |

Backend’de Android’den gelen “Nakit”, “1”, “CASH” vb. `code` ile eşleştirilip doğru PaymentMethod ID’sine çevrilir.

---

### 6.6 Zoho Books Integration  
**Sayfa:** `/settings/zoho`

| Ayar | Açıklama |
|------|----------|
| Zoho Books Enabled | Açık/kapalı |
| Region (dc) | eu / com / in / au – OAuth ve API base URL |
| Client ID | Zoho API Console’dan |
| Client Secret | Zoho API Console’dan |
| Refresh Token | “Generate Code” ile alınan kod → “Token Al” ile exchange |
| Organization ID | Zoho Books → Settings → Organization Profile veya URL’deki sayı |
| Customer ID | Satış fişlerinin atanacağı müşteri |
| Cash Account ID | Nakit hesabı (Zoho’da) |
| Card Account ID | Kart hesabı (Zoho’da) |

İşlevler: Bağlantı testi (`checkZohoConnection`), Zoho kişi listesi (`getZohoContacts`). Satışlar ödeme alındığında Zoho’ya Sales Receipt olarak gider; nakit/kart/split hesaplara ayrılır.

---

### 6.7 Email & SMTP  
**Sayfa:** `/settings/email`

- **Z-Report alıcıları:** En fazla 4 e-posta; Z-Raporu bu adreslere gidebilir.
- **SMTP:** Host, Port, User, Password (Z-Raporu/e-posta gönderimi için).

*Not: Bu sayfada API’ye kaydetme kodu şu an sadece local state’te; backend’de ilgili endpoint’ler varsa bağlanabilir.*

---

### 6.8 Cash & Card Reconciliation  
**Sayfa:** `/settings/reconciliation`

- **IMAP kutusu:** Host (örn. imap.gmail.com), Port (993), User, Password – UTAP/Banka e-postalarını çekmek için.
- **Fetch now:** `fetchReconciliationNow` – e-postaları hemen çeker.
- **Bank settings:** `default_percentage` (komisyon), `card_types` (örn. CREDIT PREMIUM %2, INTERNATIONAL CARDS %1.5).
- **Bank accounts:** `card_account`, `cash_account` – e-postalardaki işlemlerin eşleştirileceği hesap isimleri.

Dashboard’daki reconciliation blokunda aynı gün için sistem nakit/kart, fiziksel sayım ve banka verisi karşılaştırılır; manuel fiziksel nakit girişi yapılabilir.

---

### 6.9 Users & Permissions  
**Sayfa:** `/settings/users`  
**API:** `GET/POST/PUT/DELETE /api/users`, `GET /api/permissions`, `POST/DELETE /api/roles`

#### Kullanıcı alanları

| Alan | Açıklama |
|------|----------|
| `id` | UUID |
| `name` | Ad soyad |
| `pin` | Giriş PIN’i |
| `role` | waiter, admin, manager, supervisor vb. (sabit + özel roller) |
| `active` | Aktif/pasif |
| `permissions` | string[] – web_dashboard, web_floorplan, web_settings, web_users, web_products, web_modifiers, web_categories, web_printers, web_reports vb. |
| `cash_drawer_permission` | Kasa çekmece açma yetkisi |

Özel rol oluşturma: `createRole`, `deleteRole`. Yetki matrisi ile kullanıcıya permission atanır. Zoho açıksa “Zoho’da kişi” eşlemesi gösterilir.

---

### 6.10 Clear local data on apps  
**Sayfa:** `/settings/clear-local-data`

- **Cihaz listesi:** `GET /api/devices` – POS uygulaması en az bir kez sync olan cihazlar.
- **Temizleme:** `POST /api/devices/:id/request-clear-local-data` – Cihaza “yerel veriyi sil” komutu gider; uygulama bir sonraki sync’te yerel sipariş/ödeme/masa verilerini siler.

---

### 6.11 Clear test data (date range)  
**Sayfa:** `/settings/clear-test-data`

- **Tarih aralığı:** dateFrom, dateTo (YYYY-MM-DD).
- **İşlem:** `clearSalesByDateRange(dateFrom, dateTo)` – Bu aralıkta oluşturulmuş tüm siparişler, order items, payments, void loglar kalıcı silinir; masalar serbest bırakılır.

---

## 7. Dashboard

**Sayfa:** `/dashboard`  
**API:**  
- `getDashboardStats(dateFrom?, dateTo?)` → Total Sales, Order Count, Open Tables, Open Checks, Last EOD, Pending Void/ClosedBill counts.  
- `getDailySales(date?, dateFrom?, dateTo?)` → Günlük özet + paid tickets, categorySales, itemSales, voids, refunds, daily cash entry, reconciliation.  
- `getOpenOrders`, `getBusinessDayStatus`, `getOpenTablesNotClosed`, `getReconciliationSummary`, `markWarningShown`, `setReconciliationPhysicalCount`, `getClosedBillChanges`, `getCashDrawerOpens`, `getDiscountsToday`, `getDiscountRequestsPending`.

### Gösterilen bloklar (özet)

- **Tarih seçimi:** dateFrom – dateTo (varsayılan son 7 gün); seçilen aralıkta istatistikler.
- **Total Sales / Cash / Card:** Seçilen gün(ler) için toplam satış, nakit, kart.
- **Order count, Open tables, Open checks.**
- **Last EOD:** Son “end of day” çalıştırma zamanı ve kullanıcı.
- **Paid tickets:** Ödenmiş fişler (receipt_no, masa, toplam, nakit/kart, waiter).
- **Category sales / Item sales:** Kategori ve ürün bazlı satış.
- **Voids / Refunds:** İptal ve iade listeleri.
- **Cash drawer opens:** Kasa açılışları.
- **Discounts today / Pending discount requests:** İndirim talepleri ve onay.
- **Open tables not closed:** Kapanış saatine yakın hâlâ açık masalar (uyarı).
- **Reconciliation:** Seçilen gün için sistem nakit/kart, fiziksel sayım, banka; manuel fiziksel nakit girişi.

Polling: ~8 saniyede bir veri yenilenir.

---

## 8. Cash & Card

**Sayfa:** `/dashboard/cash-card`  
Nakit ve kart özeti, reconciliation detayı, tarih filtresi.

---

## 9. Floor Plan

**Sayfa:** `/floorplan`  
**API:** `getTables`, `getFloorPlanSections`, `updateFloorPlanSections`, `getOrder(orderId)`, `getOverdueTableIds`, `reserveTable`, `cancelTableReservation`, `createTable`, `deleteTable`, `importTables`, `importFloorPlanSections`.

### Masalar (Table)

| Alan | Açıklama |
|------|----------|
| `id` | UUID |
| `number` | Masa numarası (sayı veya string) |
| `name` | Görünen ad |
| `floor` | Kat/bölge |
| `status` | free, occupied vb. |
| `waiter_name` | Garson |
| `current_order_id` | Açık sipariş ID |
| `reservation` | Rezervasyon (guest_name, guest_phone, from_time, to_time) |

### Bölümler (Sections)

- A, B, C, D, E – Her bölümde hangi masa numaralarının listeleneceği `floor_plan_sections` ile saklanır; sürükle-bırak veya import ile güncellenir.

### Sipariş detayı (masaya tıklanınca)

- `GET /api/orders/:id` – Sipariş + **items** (ürün adı, adet, fiyat, not, status, sent_at, delivered_at) + payments + voids.
- Ürün satırı durumları: pending, sent, delivered; gecikme (overdue) uyarısı ve ses/toast (masa bazlı cooldown).

### Diğer işlevler

- Masa rezervasyonu ekleme/iptal.
- Masa ekleme (numara, ad, bölüm, kapasite), silme, Excel ile toplu import.
- “Manage” ile bölüm–masa eşlemesi ve filtreleri düzenleme.
- KDS sesi açık/kapalı (localStorage: `kds_sound_muted`).

---

## 10. Raporlar (Reports)

Hepsi tarih aralığı (dateFrom, dateTo) kullanır; veri çoğunlukla `getDailySales(dateFrom, dateTo)` ile alınır.

| Sayfa | İçerik |
|-------|--------|
| **Daily Sales** (`/reports/daily-summary`) | Toplam satış, nakit, kart, void, refund, kategori/ürün satışları; Excel export. |
| **Sales Report** (`/reports/sales`) | Satış detayları, export. |
| **Void Report** (`/reports/voids`) | İptal edilen kalemler. |
| **Refund Report** (`/reports/refunds`) | İade işlemleri. |
| **Category Sales** (`/reports/category-sales`) | Kategori bazlı satış. |
| **Product Sales** (`/reports/product-sales`) | Ürün bazlı satış (productId, productName, totalAmount, totalQuantity); Excel/CSV. |

---

## 11. Veri denetim ve kurtarma (Recovery)

**Sayfa:** `/settings/recovery`  
**API:** `getDeletedRecords`, `restoreTable`, `restoreOrder`, `restoreOrderItem`, `getSyncErrors`.

- **Soft delete ile silinen kayıtlar:** Tables, Orders, OrderItems ayrı listelerde; tek tek “Geri yükle” ile geri alınır.
- **Sync errors:** Android/web sync hataları (source, entity_type, entity_id, message) listelenir.

---

## 12. Sipariş detayı (Order)

**Sayfa:** `/orders/[id]`  
**API:** `GET /api/orders/:id`

Dönen yapı (özet):

- Sipariş: id, table_id, table_number, status, subtotal, tax_amount, discount_percent, discount_amount, total, created_at (ms), paid_at (ms).
- **items:** id, order_id, product_id, product_name, quantity, price, notes, status, sent_at (ms), delivered_at (ms), overdue_undelivered_minutes.
- **payments:** id, amount, method, received_amount, change_amount, user_id, created_at.
- **voids:** Bu siparişe ait void logları.

*Backend, Android uyumu için `created_at` ve `paid_at` değerlerini milisaniye (number) olarak döner.*

---

## 13. Veritabanı (Prisma) – Özet

- **User:** name, pin, role, active, permissions (JSON string), cash_drawer_permission, can_access_settings.
- **Category:** name, color, sort_order, active, modifier_groups (JSON), printers (JSON), show_till.
- **Product:** name, name_arabic, name_turkish, sku, category_id, price, tax_rate, image_url, printers (JSON), modifier_groups (JSON), active, pos_enabled, zoho_item_id, sellable, zoho_suggest_remove. *overdue_undelivered_minutes* Settings’te global; ürün cevabında backend buna göre ekleyebilir.
- **Printer:** name, printer_type, ip_address, port, connection_type, status, is_backup, kds_enabled, enabled.
- **PaymentMethod:** name, code, active, sort_order.
- **ModifierGroup:** name, min_select, max_select, required, options (JSON).
- **Table:** number, name, capacity, floor, status, current_order_id, guest_count, waiter_id, waiter_name, opened_at, x, y, width, height, shape, deletedAt.
- **Order:** table_id, table_number, waiter_id, waiter_name, status, subtotal, tax_amount, discount_*, total, created_at, paid_at, zoho_receipt_id, deletedAt.
- **OrderItem:** order_id, product_id, product_name, quantity, price, notes, status, sent_at, client_line_id, delivered_at, deletedAt.
- **Payment:** order_id, amount, method, received_amount, change_amount, user_id, created_at.
- **VoidLog:** type, order_id, order_item_id, product_name, quantity, price, amount, source/target table, user_id, user_name, details.
- **Settings:** Yukarıdaki tüm ayar alanları (timezone, currency, receipt, kitchen, business hours, reconciliation JSON’ları, company_name, vat_percent, vb.).
- **ZohoConfig:** enabled, client_id, client_secret, refresh_token, organization_id, customer_id, cash_account_id, card_account_id, dc.

---

Bu kılavuz, web panelindeki ürünler, ayarlar, raporlar ve ilgili API/veritabanı alanlarını tek bir yerde detaylı toplar. Belirli bir ekran veya alan için kod tarafında daha fazla detay gerekirse ilgili sayfa veya `api.ts` dosyasına bakılabilir.
