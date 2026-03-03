# Zoho Books OAuth Bilgilerini Alma – Adım Adım

## 1. Client ID ve Client Secret

### 1.1. Zoho API Console’a girin
- Adres: **https://api-console.zoho.com/**
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

1. **https://api-console.zoho.com/** → Uygulamanızı açın
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

Terminal veya Postman ile:

```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=YOUR_REDIRECT_URI" \
  -d "grant_type=authorization_code"
```

**Not:** EU kullanıyorsanız `https://accounts.zoho.eu`, Hindistan için `https://accounts.zoho.in` kullanın.

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

1. **https://books.zoho.com** adresine gidin
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
| **Client ID** | api-console.zoho.com → Uygulama detayları |
| **Client Secret** | api-console.zoho.com → Uygulama detayları |
| **Refresh Token** | Authorization code ile token endpoint’ine POST |
| **Organization ID** | Zoho Books Settings veya /organizations API |

---

## Data center (Sunucu bölgesi)

- **ABD**: `accounts.zoho.com`, `www.zohoapis.com`
- **AB**: `accounts.zoho.eu`, `www.zohoapis.eu`
- **Hindistan**: `accounts.zoho.in`, `www.zohoapis.in`
- **Avustralya**: `accounts.zoho.com.au`, `www.zohoapis.com.au`

LimonPOS backend’deki `ZOHO_ACCOUNTS_URL` değişkeni hangi data center’ı kullanacağınızı belirler.
