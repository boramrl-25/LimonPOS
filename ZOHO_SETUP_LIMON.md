# Zoho Books Entegrasyonu – Limon POS Kurulum

## Hesap Bilgileriniz (EU)

| Alan | Değer |
|------|-------|
| **Region** | **EU** (mutlaka seçin) |
| **Client ID** | `1000.Z9JNHOZ55LAWLWDIOJ9SXC6AUR9T9U` |
| **Organization ID** | `20111054613` |
| **Cash Account ID** (Nakit → Cash POS Sale) | `864689000000493032` |
| **Card Account ID** (Kart → UTAP) | `864689000000493048` |

## Adım Adım Kurulum

### 1. Walk-in Customer ID Alın

1. https://books.zoho.eu adresine gidin
2. **Contacts** (Kişiler) → **Walk-in Customer** veya benzeri müşteriyi bulun
3. Müşteriye tıklayın
4. URL'deki sayıyı kopyalayın: `books.zoho.eu/app/20111054613#/contacts/864689000000XXXXXX` → `864689000000XXXXXX` kısmı **Customer ID**

### 2. Refresh Token Alın

1. https://api-console.zoho.eu adresine gidin
2. Client'ınızı açın (1000.Z9JNHOZ55...)
3. **Generate Code** → Scope: `ZohoBooks.fullaccess.all` → **Create**
4. Oluşan kodu kopyalayın (10 dakika geçerli)

### 3. Web Ayarlarını Yapın

1. https://pos.the-limon.com/pos/settings/zoho adresine gidin
2. **Zoho Books Enabled** → Açık (ON)
3. **Region** → **EU** seçin
4. **Client ID** → `1000.Z9JNHOZ55LAWLWDIOJ9SXC6AUR9T9U`
5. **Client Secret** → api-console.zoho.eu'dan kopyalayın (tam değer)
6. **Save** tıklayın
7. **Authorization Code** alanına Generate Code ile aldığınız kodu yapıştırın
8. **Token Al** tıklayın
9. **Organization ID** → `20111054613`
10. **Customer ID** → Walk-in müşteri ID'si (adım 1)
11. **Cash Account ID** → `864689000000493032`
12. **Card Account ID** → `864689000000493048`
13. **Save** tıklayın

### 4. Kontrol

**Zoho Entegrasyonu Kontrol Et** butonuna tıklayın. Yeşil ✓ görürseniz hazır.

### 5. Test Satışı

POS'tan bir satış yapın. Zoho Books → **Sales** → **Sales Receipts** bölümünde görünmeli.

---

## Önemli

- **Client Secret**'ı kimseyle paylaşmayın, koda yazmayın
- **Region = EU** mutlaka seçili olmalı (api-console.zoho.eu kullanıyorsanız)
- Token süresi dolarsa (birkaç ay) Generate Code → Token Al ile yenileyin
