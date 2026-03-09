# Zoho Books OAuth Bilgilerini Alma – Adım Adım

## ÖNEMLİ: Bölge Seçimi

| Bölge | API Console | Region (Web ayarlarında) |
|-------|-------------|--------------------------|
| **EU (Avrupa)** | https://api-console.zoho.eu | **EU** seçin |
| **Global (ABD)** | https://api-console.zoho.com | Boş bırakın |

Hesabınız EU ise (books.zoho.eu, api-console.zoho.eu) → Web'de **Region = EU** seçin.

---

## 1. Client ID ve Client Secret

### 1.1. Zoho API Console’a girin
- **EU hesabı:** https://api-console.zoho.eu/ | **Global hesabı:** https://api-console.zoho.com/
- Zoho hesabınızla giriş yapın

### 1.2. Yeni uygulama oluşturun
- **"Add Client"** veya **"Create"** butonuna tıklayın
- **Client Type**: **"Server-based Applications"** seçin

### 1.3. Uygulama ayarları
- **Client Name**: Örn. `LimonPOS`
- **Homepage URL**: Örn. `http://localhost:3000`
- **Authorized Redirect URIs**: `https://localhost:3000/callback` veya `http://localhost:3000/callback`  
  *(Zoho sadece HTTPS redirect kabul edebilir; self-client kullanacaksanız farklı olabilir)*

### 1.4. Kaydı tamamlayın
- **Create** ile kaydedin
- **Client ID** ve **Client Secret** ekranda görünecek – bunları kopyalayın

---

## 2. Refresh Token

Refresh token almak için önce **authorization code** almanız gerekir.

### Yöntem A: Self Client (Önerilen, test için)

1. **api-console.zoho.eu** (EU) veya **api-console.zoho.com** (Global) → Uygulamanızı açın
2. **"Generate Code"** bölümüne gidin
3. **Scope**: `ZohoBooks.fullaccess.all` veya `ZohoBooks.items.READ,ZohoBooks.salesreceipts.CREATE`
4. **Time Duration**: 10 dakika seçin
5. **Create** ile **Code** üretin
6. Bu kodu kopyalayın (kısa süre geçerli)

### Yöntem B: Redirect URI ile

1. Tarayıcıda şu adresi açın (bölgenize göre `com` / `eu` / `in` / `com.au`):
   ```
   https://accounts.zoho.com/oauth/v2/auth?scope=ZohoBooks.fullaccess.all&client_id=CLIENT_ID&response_type=code&redirect_uri=REDIRECT_URI&access_type=offline&prompt=consent
   ```
2. `CLIENT_ID` ve `REDIRECT_URI` değerlerini kendi bilgilerinizle değiştirin
3. Giriş yapın ve onaylayın
4. Redirect sonrası adres çubuğundaki `code=` parametresini kopyalayın

### Authorization code ile Refresh Token almak

**EU hesabı için:**
```bash
curl -X POST "https://accounts.zoho.eu/oauth/v2/token" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://api-console.zoho.eu/oauth/redirect" \
  -d "grant_type=authorization_code"
```

**Global hesabı için:**
```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://api-console.zoho.com/oauth/redirect" \
  -d "grant_type=authorization_code"
```

**Not:** Web'de "Token Al" butonu kullanırsanız, Region (EU/Global) seçiminize göre doğru URL otomatik kullanılır.

Yanıtta `refresh_token` alanını kopyalayın – bu süresiz geçerlidir.

---

## 3. Organization ID

### 3.1. Zoho Books API ile

1. Access token’ı refresh token ile alın (yukarıdaki adım)
2. Şu isteği atın:

```bash
curl "https://www.zohoapis.com/books/v3/organizations" \
  -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
```

3. Yanıttaki `organization_id` değerini kopyalayın

### 3.2. Zoho Books arayüzünden

1. **EU:** https://books.zoho.eu | **Global:** https://books.zoho.com adresine gidin
2. URL’e bakın: `https://books.zoho.com/app/XXXXXX/...`
3. `XXXXXX` kısmı organization ID’dir

### 3.3. Ayarlardan

1. Zoho Books → **Settings** (Ayarlar)
2. **Organization Profile** veya **Organization**
3. Sayfada veya URL’de organization ID gösterilir

---

## Özet – Doldurulacak Alanlar

| Alan | Nereden |
|------|---------|
| **Region** | EU hesabı → **EU** seçin. Global → boş |
| **Client ID** | api-console.zoho.eu (EU) veya api-console.zoho.com (Global) |
| **Client Secret** | Aynı sayfada |
| **Refresh Token** | Authorization code ile token endpoint’ine POST |
| **Organization ID** | Zoho Books Settings veya /organizations API |

---

## Data center (Sunucu bölgesi)

- **ABD**: `accounts.zoho.com`, `www.zohoapis.com`
- **AB**: `accounts.zoho.eu`, `www.zohoapis.eu`
- **Hindistan**: `accounts.zoho.in`, `www.zohoapis.in`
- **Avustralya**: `accounts.zoho.com.au`, `www.zohoapis.com.au`

LimonPOS backend’deki `Region (Web'de EU/Global)` değişkeni hangi data center’ı kullanacağınızı belirler.
