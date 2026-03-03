# LimonPOS → Zoho Books Anlık Satış Aktarımı

Bu rehber, LimonPOS uygulamasında yapılan satışların **anlık** olarak Zoho Books'a aktarılmasını sağlar.

## Genel Bakış

- **Sales Receipt**: Zoho Books'ta "anlık satış makbuzu" – ödeme alındığı anda oluşturulur (POS için ideal)
- **Invoice**: Fatura – müşteriye sonra ödeme yapılacaksa kullanılır

LimonPOS için **Sales Receipt** kullanıyoruz.

---

## Ön Hazırlık (Zoho Books)

### 1. Zoho Developer Console'da Uygulama Oluşturma

1. [Zoho API Console](https://api-console.zoho.com/) → **Add Client** → **Self Client**
2. **Scope**: `ZohoBooks.fullaccess.all` veya `ZohoBooks.invoices.CREATE`
3. **Time Duration**: 10 dakika
4. **Create** → **Generate Code** ile **Authorization Code** alın
5. Bu kod ile **Access Token** ve **Refresh Token** üretin

### 2. Zoho Books'ta "Walk-in" Müşteri Oluşturma

1. Zoho Books → **Contacts** → **New Contact**
2. İsim: `POS Müşterileri` veya `Walk-in Customer`
3. Kaydedin ve **Contact ID**'yi not alın (ör: `1234567890123456789`)

### 3. Organization ID

1. Zoho Books → **Settings** → **Organization**
2. URL'deki `organization_id` değerini not alın

---

## Uygulama İçi Kurulum

1. **Ayarlar** → **Zoho Books** bölümüne gidin
2. **Access Token** (veya Refresh Token) girin
3. **Organization ID** girin
4. **Customer ID** (Walk-in müşteri) girin
5. **Kaydet** → Entegrasyon aktif olur

---

## Akış

```
Ödeme yapıldığında (PaymentViewModel.createPayment / completePayment)
    → PaymentRepository.createPayment()
    → ZohoBooksRepository.pushSalesReceipt() [opsiyonel, ayarlar açıksa]
    → Zoho Books API: POST /salesreceipts
```

- **Anlık**: Her ödeme tamamlandığında (masa kapatıldığında) tek bir Sales Receipt oluşturulur
- **Offline**: İnternet yoksa Zoho'ya gönderilmez; ödeme yerel kaydedilir

---

## Zoho Books API Referansı

- **Endpoint**: `POST https://www.zohoapis.com/books/v3/salesreceipts`
- **Header**: `Authorization: Zoho-oauthtoken {access_token}`
- **Query**: `organization_id={org_id}`

**Request Body Örneği:**
```json
{
  "customer_id": "1234567890123456789",
  "date": "2025-03-02",
  "payment_mode": "cash",
  "reference_number": "ORD-abc123",
  "line_items": [
    {
      "name": "Caesar Salad",
      "description": "",
      "quantity": 2,
      "rate": 25.0
    }
  ]
}
```

`payment_mode`: `cash`, `credit_card`, `bank_transfer`, `check`, vb.

---

## Alternatif: Backend Üzerinden Aktarım

Kendi backend API'niz varsa (`API_SPEC.md`'deki `POST /payments`), backend tarafında:

1. Payment alındığında sipariş + kalemleri çekin
2. Zoho Books API'ye Sales Receipt POST edin
3. OAuth token'ı backend'de güvenli saklayın

Bu yöntem API anahtarlarını uygulama dışında tutar.
