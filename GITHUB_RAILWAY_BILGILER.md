# GitHub ve Railway – Gerekli Bilgiler

Bu dosyada projeyi GitHub’a bağlayıp Railway’de çalıştırmak için ihtiyaç duyacağınız tüm bilgiler özetlenmiştir.

---

## 1. GitHub

### Repo bağlantısı
- **Railway’e giriş:** https://railway.app → Login → **GitHub** ile giriş yapın.
- **Yeni proje:** **+ New** → **Deploy from GitHub repo** → **LimonPOS** reposunu seçin (veya önce GitHub hesabınızı bağlayın).
- Repo bağlandıktan sonra her servis için **Root Directory** ayrı ayrı ayarlanır (aşağıda).

### GitHub’da özel bir şey gerekmez
- Railway, repo’ya **read** erişimiyle yeterli; GitHub Actions veya secret kullanmıyorsanız ekstra ayar yok.
- İsterseniz GitHub’da **Settings → Integrations → Railway** ile uygulamayı yükleyebilirsiniz (Railway tarafında “Deploy from GitHub” derken zaten istenir).

---

## 2. Railway – Backend (API) servisi

### Servis oluşturma
1. Railway → **+ New** → **GitHub Repo** → **LimonPOS** seçin.
2. Oluşan servise tıklayın (örn. LimonPOS).

### Root Directory
- **Settings** → **Source** → **Root Directory:** `backend`  
  (Sadece `backend` klasörü build/deploy edilir.)

### Volume (veriler silinmesin)
- **Volumes** (veya **Storage**) → **Add Volume**
  - **Mount Path:** `/data`
  - İsim: `limonpos-data` (isteğe bağlı)
  - Boyut: 1 GB yeterli

### Environment variables (Backend)

| Name   | Value   | Zorunlu |
|--------|---------|--------|
| `DATA_DIR` | `/data` | **Evet** – yoksa her deploy’da veriler silinir. |
| `PORT`    | `3002` veya `3000` | Hayır (Railway kendi PORT’unu da verebilir). |

**Zoho kullanıyorsanız** (isteğe bağlı):

| Name | Açıklama |
|------|----------|
| `ZOHO_CLIENT_ID` | Zoho API client ID |
| `ZOHO_CLIENT_SECRET` | Zoho API client secret |
| `ZOHO_REFRESH_TOKEN` | Zoho refresh token |
| `ZOHO_ORGANIZATION_ID` | Zoho Books organizasyon ID |
| `ZOHO_CUSTOMER_ID` | Zoho Books müşteri ID |
| `ZOHO_DC` | `eu` ise EU hesabı (yoksa com) |
| `ZOHO_ACCOUNTS_URL` | İsteğe bağlı; EU için `https://accounts.zoho.eu` |

### Domain (Backend)
- **Settings** → **Networking** → **Public Networking**
- **Generate Domain** ile `.up.railway.app` alın **veya** **Custom Domain** ekleyin: `api.the-limon.com`
- DNS’te **CNAME:** `api` (veya `api.the-limon.com`) → Railway’in verdiği adres (örn. `xxx.up.railway.app`).

---

## 3. Railway – Web (Back-Office) servisi

### Servis oluşturma
1. Aynı Railway projesinde tekrar **+ New** → **GitHub Repo** → **LimonPOS**.
2. Oluşan **ikinci** servise tıklayın.

### Root Directory
- **Settings** → **Source** → **Root Directory:** `pos-backoffice`

### Environment variables (Web)

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_API_URL` | `https://api.the-limon.com/api` |

*(Kendi domain’iniz yoksa Railway’in verdiği backend adresini kullanın, örn. `https://limonpos-backend-production-xxxx.up.railway.app/api`.)*

### Domain (Web)
- **Settings** → **Networking** → **Public Networking**
- **Custom Domain:** `pos.the-limon.com`  
- DNS’te **CNAME:** `pos` → Bu Web servisinin Railway adresi.

---

## 4. Özet tablo

| Nerede | Ne | Değer |
|--------|-----|--------|
| **Backend** | Root Directory | `backend` |
| **Backend** | Volume Mount Path | `/data` |
| **Backend** | `DATA_DIR` | `/data` |
| **Backend** | `PORT` | `3002` (veya Railway’in verdiği) |
| **Backend** | Domain | `api.the-limon.com` veya `xxx.up.railway.app` |
| **Web** | Root Directory | `pos-backoffice` |
| **Web** | `NEXT_PUBLIC_API_URL` | `https://api.the-limon.com/api` |
| **Web** | Domain | `pos.the-limon.com` veya `xxx.up.railway.app` |

---

## 5. Kontrol

- **API:** https://api.the-limon.com/api/health  
  Beklenen: `"data_dir": "/data"`, `"persistent_storage": true`
- **Web:** https://pos.the-limon.com/pos (veya kullandığınız domain)  
  PIN ile giriş (örn. 1234) yapıp ürünlerin gelmesi gerekir.

Bu bilgilerle GitHub repo’nuz Railway’e bağlanır ve hem backend hem web doğru şekilde çalışır.
