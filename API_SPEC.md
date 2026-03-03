# LimonPOS API Spesifikasyonu

Bu doküman, LimonPOS Android uygulamasının web backend ile haberleşmesi için gereken tüm API endpoint'lerini tanımlar. Web tarafında bu API'yi implement ederek uygulama verilerini senkronize edebilirsiniz.

## Base URL

```
https://offline-pos-17.preview.emergentagent.com/api/
```

Kendi backend'inizi kullanmak için `NetworkModule.kt` içindeki `BASE_URL` değerini değiştirin.

---

## Senkronizasyon Akışı (App ↔ Web)

Uygulama **Sync** butonuna basıldığında sırasıyla:

1. **Push (App → Web):** Bekleyen veriler önce web'e gönderilir
   - Açık siparişler ve masalar
   - Bekleyen ödemeler
   - Kapatılan masalar
   - Void kayıtları

2. **Pull (Web → App):** Web'den güncel veriler çekilir
   - Masalar, siparişler, kategoriler, ürünler, yazıcılar, kullanıcılar, modifier grupları, void talepleri

---

## Endpoint'ler

### 1. Auth

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `auth/login` | PIN ile giriş |
| POST | `auth/verify-cash-drawer` | Kasa çekmece yetkisi doğrulama |

#### POST `auth/login`
**Request:**
```json
{
  "pin": "1234"
}
```
**Response:**
```json
{
  "user": {
    "id": "u1",
    "name": "Admin",
    "pin": "1234",
    "role": "admin",
    "active": true,
    "permissions": ["post_void", "pre_void"],
    "cash_drawer_permission": true
  },
  "token": "jwt-token-here"
}
```

#### POST `auth/verify-cash-drawer`
**Request:** `{ "pin": "1234" }`  
**Response:** `{ "success": true, "message": null }`

---

### 2. Users (Kullanıcılar)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `users` | Tüm kullanıcıları listele |
| POST | `users` | Yeni kullanıcı oluştur |
| PUT | `users/{id}` | Kullanıcı güncelle |
| DELETE | `users/{id}` | Kullanıcı sil |

**UserDto:**
```json
{
  "id": "u1",
  "name": "Admin",
  "pin": "1234",
  "role": "admin",
  "active": true,
  "permissions": ["post_void", "pre_void"],
  "cash_drawer_permission": true
}
```
`role`: admin, manager, cashier, waiter, kds  
`permissions`: post_void, pre_void, vb.

---

### 3. Tables (Masalar)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `tables` | Tüm masaları listele |
| POST | `tables` | Yeni masa oluştur |
| POST | `tables/{id}/open` | Masayı aç (sipariş başlat) |
| POST | `tables/{id}/close` | Masayı kapat |

**TableDto:**
```json
{
  "id": "t1",
  "number": 1,
  "name": "Table 1",
  "capacity": 4,
  "floor": "main",
  "status": "free",
  "current_order_id": null,
  "guest_count": 0,
  "waiter_id": null,
  "waiter_name": null,
  "opened_at": null,
  "x": 100,
  "y": 50,
  "width": 120,
  "height": 100,
  "shape": "square"
}
```
`status`: free, occupied, bill  
`opened_at`: ISO 8601 string (örn: "2025-03-02T10:00:00Z")

#### POST `tables/{id}/open`
**Query:** `guest_count`, `waiter_id`  
**Response:** Güncellenmiş TableDto (current_order_id, status, waiter_id vb. dolu)

#### POST `tables/{id}/close`
**Response:** Güncellenmiş TableDto (status: free, current_order_id: null)

---

### 4. Categories (Kategoriler)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `categories` | Tüm kategorileri listele |
| POST | `categories` | Yeni kategori oluştur |
| PUT | `categories/{id}` | Kategori güncelle |
| DELETE | `categories/{id}` | Kategori sil |

**CategoryDto:**
```json
{
  "id": "cat1",
  "name": "Starters",
  "color": "#84CC16",
  "sort_order": 0,
  "active": true
}
```

---

### 5. Products (Ürünler)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `products` | Tüm ürünleri listele |
| POST | `products` | Yeni ürün oluştur |
| PUT | `products/{id}` | Ürün güncelle |
| DELETE | `products/{id}` | Ürün sil |

**ProductDto:**
```json
{
  "id": "p1",
  "name": "Caesar Salad",
  "name_arabic": "",
  "name_turkish": "",
  "category_id": "cat1",
  "category": "Starters",
  "price": 28.0,
  "tax_rate": 0.05,
  "printers": ["printer1"],
  "modifier_groups": ["mod1"],
  "active": true,
  "pos_enabled": true
}
```
`tax_rate`: 0.05 = %5 (veya 5 = %5, uygulama her iki formatı da kabul eder)  
`printers`, `modifier_groups`: ID listesi (JSON array)

---

### 6. Orders (Siparişler)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `orders/{id}` | Sipariş detayı (items ile) |
| POST | `orders` | Yeni sipariş oluştur |
| POST | `orders/{id}/items` | Siparişe ürün ekle |
| PUT | `orders/{orderId}/items/{itemId}` | Sipariş kalemi güncelle |
| DELETE | `orders/{orderId}/items/{itemId}` | Sipariş kalemi sil |
| POST | `orders/{id}/send` | Mutfağa gönder |

**OrderDto:**
```json
{
  "id": "ord1",
  "table_id": "t1",
  "table_number": "1",
  "waiter_id": "u1",
  "waiter_name": "Waiter",
  "status": "open",
  "subtotal": 50.0,
  "tax_amount": 2.5,
  "discount_percent": 0,
  "discount_amount": 0,
  "total": 52.5,
  "created_at": 1709370000000,
  "paid_at": null,
  "items": [
    {
      "id": "item1",
      "order_id": "ord1",
      "product_id": "p1",
      "product_name": "Caesar Salad",
      "quantity": 2,
      "price": 25.0,
      "notes": "No cheese",
      "status": "pending",
      "sent_at": null
    }
  ]
}
```
`status`: open, sent, paid, closed  
`created_at`, `paid_at`: Unix timestamp (ms)

#### POST `orders`
**Query:** `waiter_id`  
**Request (CreateOrderRequest):**
```json
{
  "id": "ord1",
  "table_id": "t1",
  "guest_count": 2
}
```

#### POST `orders/{id}/items`
**Request (AddOrderItemRequest):**
```json
{
  "product_id": "p1",
  "product_name": "Caesar Salad",
  "quantity": 2,
  "price": 25.0,
  "notes": "No cheese"
}
```

---

### 7. Payments (Ödemeler)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `payments` | Ödeme oluştur |

#### POST `payments`
**Query:** `user_id`  
**Request:**
```json
{
  "order_id": "ord1",
  "payments": [
    {
      "amount": 52.5,
      "method": "cash",
      "received_amount": 60,
      "change_amount": 7.5
    }
  ]
}
```
`method`: cash, card

---

### 8. Printers (Yazıcılar)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `printers` | Tüm yazıcıları listele |
| POST | `printers` | Yeni yazıcı ekle |
| PUT | `printers/{id}` | Yazıcı güncelle |
| PUT | `printers/{id}/status` | Yazıcı durumu güncelle |
| DELETE | `printers/{id}` | Yazıcı sil |

**PrinterDto:**
```json
{
  "id": "pr1",
  "name": "Kitchen Printer",
  "printer_type": "kitchen",
  "ip_address": "192.168.1.100",
  "port": 9100,
  "connection_type": "network",
  "status": "online",
  "is_backup": false
}
```
`printer_type`: kitchen, receipt  
`status`: online, offline

---

### 9. Modifier Groups (Modifier Grupları)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `modifier-groups` | Tüm modifier gruplarını listele |

**ModifierGroupDto:**
```json
{
  "id": "mod1",
  "name": "Size",
  "min_select": 1,
  "max_select": 1,
  "required": true,
  "options": [
    {
      "id": "opt1",
      "name": "Large",
      "price": 5.0
    }
  ]
}
```

---

### 10. Voids (İptal Kayıtları)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `voids` | Void kaydı oluştur (App → Web push) |

**Request (CreateVoidRequest):**
```json
{
  "type": "post_void",
  "order_id": "ord1",
  "order_item_id": "item1",
  "product_name": "Caesar Salad",
  "quantity": 1,
  "price": 25.0,
  "amount": 25.0,
  "source_table_id": "t1",
  "source_table_number": "1",
  "target_table_id": null,
  "target_table_number": null,
  "user_id": "u1",
  "user_name": "Admin",
  "details": "Voided after send to kitchen"
}
```
`type`: pre_void, post_void, recalled_void (veya table_transfer_void)

---

### 11. Void Requests (İptal Talepleri – KDS/Supervisor Onayı)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `void-requests` | Bekleyen talepleri listele |
| POST | `void-requests` | Yeni void talebi oluştur |
| PATCH | `void-requests/{id}` | Talebi güncelle (onay/red) |

#### GET `void-requests`
**Query:** `status` (örn: "pending")

**VoidRequestDto:**
```json
{
  "id": "vr1",
  "order_id": "ord1",
  "order_item_id": "item1",
  "product_name": "Caesar Salad",
  "quantity": 1,
  "price": 25.0,
  "table_number": "1",
  "requested_by_user_id": "u1",
  "requested_by_user_name": "Waiter",
  "requested_at": 1709370000000,
  "status": "pending",
  "approved_by_supervisor_user_id": null,
  "approved_by_supervisor_user_name": null,
  "approved_by_supervisor_at": null,
  "approved_by_kds_user_id": null,
  "approved_by_kds_user_name": null,
  "approved_by_kds_at": null
}
```

#### POST `void-requests`
**Request (CreateVoidRequestDto):**
```json
{
  "id": "vr1",
  "order_id": "ord1",
  "order_item_id": "item1",
  "product_name": "Caesar Salad",
  "quantity": 1,
  "price": 25.0,
  "table_number": "1",
  "requested_by_user_id": "u1",
  "requested_by_user_name": "Waiter"
}
```

---

## JSON Alan İsimlendirmesi

API **snake_case** kullanır:
- `table_id`, `order_id`, `user_id`, `product_id`, `category_id`
- `created_at`, `paid_at`, `opened_at`
- `guest_count`, `waiter_name`, `current_order_id`

---

## Hata Durumları

- `401 Unauthorized`: Geçersiz veya eksik token
- `404 Not Found`: Kayıt bulunamadı
- `422 Unprocessable Entity`: Geçersiz veri
- `500 Internal Server Error`: Sunucu hatası

Uygulama hata durumunda log yazar ve sync işlemini tamamlamaya devam eder.

---

## Opsiyonel: Daily Sales API (Web Raporlama)

Uygulama şu an Daily Sales verilerini sadece lokal gösterir. Web tarafında raporlama için aşağıdaki endpoint'ler eklenebilir:

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `daily-sales` | Günlük satış özeti (tarih parametresi ile) |
| GET | `daily-sales/payments` | Günlük ödemeler (cash/card) |
| GET | `daily-sales/voids` | Günlük void kayıtları |
| GET | `daily-sales/categories` | Kategori bazlı satışlar |
| GET | `daily-sales/items` | Ürün bazlı satışlar |

Bu endpoint'ler için uygulama tarafında henüz çağrı yok; web backend bu verileri kendi veritabanından (orders, payments, void_logs tablolarından) üretebilir.

---

## Özet Tablo

| Modül | Push (App→Web) | Pull (Web→App) |
|-------|----------------|----------------|
| Tables | open, close | GET tables |
| Orders | create, add/update/delete items, send | GET order |
| Payments | POST payments | - |
| Voids | POST voids | - |
| Void Requests | POST, PATCH | GET void-requests |
| Users | - | GET users |
| Categories | - | GET categories |
| Products | - | GET products |
| Printers | - | GET printers |
| Modifier Groups | - | GET modifier-groups |
