# Zoho Books Backend Entegrasyonu

Backend tarafında Zoho Books entegrasyonu için adım adım rehber. Ödeme alındığında sipariş otomatik olarak Zoho Books'a Sales Receipt olarak gönderilir.

---

## Genel Akış

```
LimonPOS App → POST /payments (order_id, payments[]) → Backend
    → Backend payment'ı kaydeder
    → GET /orders/{order_id} ile sipariş + kalemleri alır (veya DB'den)
    → Sipariş tam ödendiyse (status=paid) → Zoho Books API: POST /salesreceipts
```

---

## 1. Ortam Değişkenleri (Backend'de)

```env
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=your_refresh_token
ZOHO_ORGANIZATION_ID=1234567890
ZOHO_CUSTOMER_ID=1234567890123456789
```

**Not:** Zoho bölgenize göre URL değişir: `accounts.zoho.com` (global), `accounts.zoho.eu` (Avrupa), `accounts.zoho.in` (Hindistan). Zoho Books giriş URL'nize göre seçin.

**Refresh Token nasıl alınır:**
1. [Zoho API Console](https://api-console.zoho.com/) → Self Client oluştur
2. Scope: `ZohoBooks.fullaccess.all`
3. Generate Code → Authorization code al
4. `POST https://accounts.zoho.com/oauth/v2/token` ile refresh_token al:
   ```
   grant_type=authorization_code
   code={authorization_code}
   client_id={client_id}
   client_secret={client_secret}
   redirect_uri=https://www.zoho.com/books
   ```

---

## 2. Node.js / Express Örneği

### Bağımlılıklar
```bash
npm install express axios
```

### zoho-books.js
```javascript
const axios = require('axios');

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
const ZOHO_BOOKS_URL = 'https://www.zohoapis.com/books/v3';

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }
  const res = await axios.post(
    `${ZOHO_ACCOUNTS_URL}/oauth/v2/token`,
    new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      grant_type: 'refresh_token'
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  cachedAccessToken = res.data.access_token;
  tokenExpiresAt = Date.now() + (res.data.expires_in * 1000);
  return cachedAccessToken;
}

async function createSalesReceipt(order, items, paymentMethod = 'cash') {
  const token = await getAccessToken();
  const zohoPaymentMode = paymentMethod === 'card' ? 'credit_card' : 'cash';
  const date = new Date(order.paidAt || order.createdAt).toISOString().split('T')[0];

  const lineItems = items.map(item => ({
    name: item.productName,
    description: item.notes || '',
    quantity: item.quantity,
    rate: item.price
  }));

  const res = await axios.post(
    `${ZOHO_BOOKS_URL}/salesreceipts?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
    {
      customer_id: process.env.ZOHO_CUSTOMER_ID,
      date,
      payment_mode: zohoPaymentMode,
      reference_number: `LimonPOS-${order.id}`,
      line_items: lineItems
    },
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return res.data;
}
```

### payments handler (POST /payments)
```javascript
// POST /api/payments handler'ına ekleyin:
app.post('/api/payments', async (req, res) => {
  const { order_id, payments } = req.body;
  const userId = req.query.user_id;

  // 1. Payment'ı veritabanınıza kaydedin (mevcut mantığınız)
  // await savePayment(order_id, payments, userId);

  // 2. Siparişi alın (GET /orders/{id} veya DB'den)
  const order = await getOrderById(order_id);  // orders tablosundan
  const items = await getOrderItems(order_id); // order_items tablosundan

  // 3. Toplam ödenen miktarı hesaplayın (bu payment + öncekiler)
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0) + await getPreviousPaymentsSum(order_id);
  const orderTotal = order.total;

  // 4. Sipariş tam ödendiyse Zoho'ya gönderin
  if (Math.abs(totalPaid - orderTotal) < 0.01 && items.length > 0) {
    try {
      const primaryMethod = payments[0]?.method || 'cash';
      await createSalesReceipt(order, items, primaryMethod);
      console.log('Zoho Books: Sales receipt created for order', order_id);
    } catch (err) {
      console.error('Zoho Books error:', err.response?.data || err.message);
      // Payment yine de başarılı, Zoho hatası kullanıcıyı etkilemesin
    }
  }

  res.json({ success: true });
});
```

---

## 3. Python / Flask Örneği

### requirements.txt
```
flask requests
```

### zoho_books.py
```python
import os
import requests
from datetime import datetime

ZOHO_ACCOUNTS = "https://accounts.zoho.com"
ZOHO_BOOKS = "https://www.zohoapis.com/books/v3"

_cached_token = None
_token_expires = 0

def get_access_token():
    global _cached_token, _token_expires
    if _cached_token and datetime.now().timestamp() < _token_expires - 60:
        return _cached_token
    r = requests.post(f"{ZOHO_ACCOUNTS}/oauth/v2/token", data={
        "refresh_token": os.environ["ZOHO_REFRESH_TOKEN"],
        "client_id": os.environ["ZOHO_CLIENT_ID"],
        "client_secret": os.environ["ZOHO_CLIENT_SECRET"],
        "grant_type": "refresh_token"
    }, headers={"Content-Type": "application/x-www-form-urlencoded"})
    r.raise_for_status()
    data = r.json()
    _cached_token = data["access_token"]
    _token_expires = datetime.now().timestamp() + data["expires_in"]
    return _cached_token

def create_sales_receipt(order, items, payment_method="cash"):
    token = get_access_token()
    zoho_mode = "credit_card" if payment_method == "card" else "cash"
    paid_at = order.get("paid_at") or order.get("created_at")
    date = datetime.fromtimestamp(paid_at / 1000).strftime("%Y-%m-%d")
    line_items = [{"name": i["product_name"], "quantity": i["quantity"], "rate": i["price"]} for i in items]
    r = requests.post(
        f"{ZOHO_BOOKS}/salesreceipts?organization_id={os.environ['ZOHO_ORGANIZATION_ID']}",
        json={
            "customer_id": os.environ["ZOHO_CUSTOMER_ID"],
            "date": date,
            "payment_mode": zoho_mode,
            "reference_number": f"LimonPOS-{order['id']}",
            "line_items": line_items
        },
        headers={"Authorization": f"Zoho-oauthtoken {token}", "Content-Type": "application/json"}
    )
    r.raise_for_status()
    return r.json()
```

---

## 4. Veritabanı Gereksinimleri

Backend'inizin `orders` ve `order_items` verilerine erişimi olmalı. API_SPEC'e göre:
- `GET /orders/{id}` → Sipariş + items döner
- Veya kendi DB'nizde `orders`, `order_items` tabloları varsa doğrudan oradan okuyun

**Önemli:** Payment alındığında sipariş henüz `status=paid` olmayabilir. Bu yüzden:
- Toplam ödenen = mevcut payments + yeni gelen payments
- `totalPaid >= order.total` ise sipariş tam ödendi → Zoho'ya gönder

**Çift kayıt önleme:** Split payment (nakit+kart) durumunda aynı sipariş için birden fazla payment isteği gelebilir. Zoho'ya sadece **bir kez** gönderin. Örnek: `orders` tablosuna `zoho_receipt_id` kolonu ekleyin; gönderdikten sonra kaydedin; bir sonraki payment'ta bu alan doluysa tekrar göndermeyin.

---

## 5. Uygulama Tarafında

Backend entegrasyonu kullanıyorsanız **uygulama içi Zoho ayarlarını kapatın** (Settings → Zoho Books → switch OFF). Böylece satışlar sadece backend üzerinden Zoho'ya gider, çift kayıt olmaz.

---

## 6. Özet Checklist

- [ ] Zoho Developer Console'da Client ID, Secret, Refresh Token al
- [ ] Zoho Books'ta Walk-in müşteri oluştur, Customer ID al
- [ ] Backend'e env değişkenlerini ekle
- [ ] POST /payments handler'ına Zoho push mantığını ekle
- [ ] `getOrderById`, `getOrderItems`, `getPreviousPaymentsSum` fonksiyonlarını backend'inize göre implement et
- [ ] Uygulamada Zoho Books ayarını kapat (opsiyonel, çift kayıt önlemek için)
