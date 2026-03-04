# Zoho Books Entegrasyonu Kurulumu

LimonPOS, satış tamamlandığında otomatik olarak Zoho Books'a **Sales Receipt** gönderir. Kurulum için aşağıdaki adımları izleyin.

---

## 1. Zoho API Console

1. **https://api-console.zoho.com** adresine gidin.
2. Giriş yapın (Zoho hesabınızla).
3. **Add Client** → **Self Client** seçin.
4. **Client Name:** LimonPOS
5. **Homepage URL:** https://the-limon.com (veya herhangi bir geçerli URL)
6. **Authorized Redirect URIs:**  
   - `https://api-console.zoho.com/oauth/v2/auth/callback`  
   - veya `https://api-console.zoho.eu/oauth/v2/auth/callback` (EU hesabı için)
7. **Create** tıklayın.

---

## 2. Client ID ve Client Secret

Oluşturduğunuz Self Client'a tıklayın. **Client ID** ve **Client Secret** değerlerini kopyalayın (güvenli bir yerde saklayın).

---

## 3. Refresh Token Alın

1. Zoho API Console'da **Generate Code** butonuna tıklayın.
2. **Time Duration:** 10 dakika seçin.
3. **Create** tıklayın.
4. Oluşan **Code**'u kopyalayın (tek kullanımlık, hemen kullanın).

Sonra terminalde:

```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "code=GIRDIĞINIZ_CODE" \
  -d "client_id=CLIENT_ID" \
  -d "client_secret=CLIENT_SECRET" \
  -d "redirect_uri=https://api-console.zoho.com/oauth/v2/auth/callback" \
  -d "grant_type=authorization_code"
```

Yanıtta `refresh_token` değeri görünecek. Bunu da kopyalayın.

**EU hesabı kullanıyorsanız:**
- `https://accounts.zoho.eu/oauth/v2/token`
- `redirect_uri=https://api-console.zoho.eu/oauth/v2/auth/callback`

---

## 4. Organization ID ve Customer ID

1. **Zoho Books** uygulamasına girin.
2. **Organization ID:** Zoho Books URL'sinde görünür (örn. `https://books.zoho.com/...?organization_id=123456789`).
3. **Customer ID:** Müşteriler → Varsayılan müşteri (Limon Restaurant vb.) → URL'deki `id` değeri.

---

## 5. Railway’de Değişkenler (Production)

Railway dashboard → LimonPOS servisi → **Variables** bölümüne ekleyin:

| Değişken | Değer |
|----------|-------|
| `ZOHO_CLIENT_ID` | API Console’dan aldığınız Client ID |
| `ZOHO_CLIENT_SECRET` | Client Secret |
| `ZOHO_REFRESH_TOKEN` | Refresh token |
| `ZOHO_ORGANIZATION_ID` | Zoho Books Organization ID |
| `ZOHO_CUSTOMER_ID` | Varsayılan müşteri ID |
| `ZOHO_DC` | EU hesabı için: `eu` (boş bırakırsanız `.com` kullanılır) |

Kaydettikten sonra Railway otomatik redeploy eder. Bu değişkenler olmadan Zoho senkronizasyonu çalışmaz.

---

## 6. Web Panel ile (Alternatif – Local)

Lokal çalıştırıyorsanız web panelden de ayarlayabilirsiniz:

1. Web panel → **Settings** → **Zoho Books**
2. Yukarıdaki değerleri girin.
3. **Connect** / **Save** tıklayın.
4. **Test Connection** ile bağlantıyı kontrol edin.

---

## 7. Test

1. LimonPOS’ta bir sipariş tamamlayın (ödeme alın).
2. Zoho Books → **Sales** → **Customer Payments** veya **Sales Receipts** bölümüne bakın.
3. Yeni kayıt oluşmuş olmalı.

---

## Sorun Giderme

- **Token alınamadı:** Refresh Token, Client ID ve Secret’ı kontrol edin. EU hesabı için `ZOHO_DC=eu` ekleyin.
- **Organization not found:** `ZOHO_ORGANIZATION_ID` doğru mu kontrol edin.
- **Customer not found:** `ZOHO_CUSTOMER_ID` Zoho Books’taki geçerli bir müşteri ID’si olmalı.
