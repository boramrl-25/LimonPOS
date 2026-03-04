# Railway’e Tam Deploy – Laptop Kapalıyken Çalışsın, Veriler Silinmesin

Bu rehber, **pos.the-limon.com** ve **api.the-limon.com**’un tamamen Railway’de çalışması ve **verilerin resetlenmemesi** için adım adım yapmanız gerekenleri anlatıyor.

---

## Sorunlar ve Sebepleri

| Sorun | Sebep |
|-------|--------|
| Laptop kapatınca site çalışmıyor | Backend (API) hâlâ laptop’ta veya Railway’de **backend servisi** yok / kapalı. |
| Sürekli kendini resetliyor, tüm veriler gidiyor | Backend Railway’de olsa bile **Volume yok**; her restart/redeploy’da `data.json` sıfırlanıyor. |

**Çözüm:** Railway’de **iki servis** (Backend + Web) olacak ve Backend’te **mutlaka Volume + DATA_DIR** tanımlı olacak.

---

## 1. Backend (API) servisi – Node.js

### 1.1 Yeni servis ekle

1. [Railway](https://railway.app) → Projenize girin.
2. **+ New** → **GitHub Repo** → **LimonPOS** reponuzu seçin.
3. Repo bağlandıktan sonra bu servise tıklayın (örn. LimonPOS veya LimonPOS-2).

### 1.2 Root Directory

1. **Settings** → **Source**.
2. **Root Directory:** `backend` yazın (sadece bu klasör deploy edilsin).
3. Kaydedin (Railway yeniden build eder).

### 1.3 Volume ekle (veriler silinmesin)

1. Aynı **Backend** servisinde **Volumes** (veya **Storage**) sekmesine gidin.
2. **Add Volume** / **Create Volume**.
   - **Mount Path:** `/data` (tam bu şekilde, başında/sonunda boşluk yok).
   - İsim: `limonpos-data`.
   - Boyut: 1 GB yeterli.
3. Kaydedin.

### 1.4 Environment variables (Backend)

1. **Variables** sekmesi.
2. Şunları ekleyin:

| Name       | Value                    |
|-----------|---------------------------|
| `DATA_DIR`| `/data`                   |
| `PORT`    | `3002` (Railway isterse 3000 da olur, önemli değil) |
| (Zoho için)| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` vb. – Zoho kullanıyorsanız ekleyin. |

**Önemli:** `DATA_DIR=/data` olmazsa her deploy’da veriler silinir.

### 1.5 Domain (API)

1. **Settings** → **Networking** → **Public Networking**.
2. **Generate Domain** ile Railway `.up.railway.app` adresi alın veya **Custom Domain** ekleyin: `api.the-limon.com`.
3. GoDaddy (veya DNS sağlayıcınız) üzerinde:
   - **CNAME:** `api` → Railway’in verdiği adres (örn. `xxx.up.railway.app`).
   - Gerekirse TXT doğrulama kaydını da ekleyin.

---

## 2. Web (Back-Office) servisi – Next.js

### 2.1 Yeni servis ekle

1. Aynı Railway projesinde tekrar **+ New** → **GitHub Repo** → **LimonPOS**.
2. Oluşan ikinci servise tıklayın.

### 2.2 Root Directory

1. **Settings** → **Source**.
2. **Root Directory:** `pos-backoffice` yazın.
3. Kaydedin.

### 2.3 Environment variables (Web)

1. **Variables** sekmesi.
2. Ekle:

| Name                    | Value                           |
|-------------------------|----------------------------------|
| `NEXT_PUBLIC_API_URL`   | `https://api.the-limon.com/api` |

(Bu sayede frontend her zaman buluttaki API’ye istek atar; laptop’a bağlı kalmaz.)

### 2.4 Domain (Web)

1. **Settings** → **Networking** → **Public Networking**.
2. **Custom Domain** → `pos.the-limon.com`.
3. DNS’te **CNAME:** `pos` → Bu servisin Railway adresi.

---

## 3. Kontrol listesi

### Backend doğru mu?

1. Tarayıcıda açın: **https://api.the-limon.com/api/health**
2. Örnek yanıt:
   ```json
   {
     "ok": true,
     "message": "LimonPOS API",
     "data_dir": "/data",
     "persistent_storage": true
   }
   ```
3. **Eğer** `data_dir` boş veya `"(not set)"` ve `persistent_storage: false` ise:
   - Backend servisinde **Volume** mount path’i `/data` mı kontrol edin.
   - **Variables**’da `DATA_DIR` = `/data` var mı kontrol edin.
   - **Redeploy** yapın ve tekrar `/api/health` kontrol edin.

### Web doğru mu?

1. **https://pos.the-limon.com/pos** açın.
2. PIN ile giriş yapın (örn. 1234).
3. Ürünler / ayarlar açılıyorsa, frontend doğru API’ye gidiyor demektir.

### Laptop kapalıyken test

1. Laptop’u kapatın (veya en azından backend’i local’de çalıştırmayın).
2. Telefondan veya başka bir cihazdan **https://pos.the-limon.com/pos** açın.
3. Giriş yapıp veri görüyorsanız deploy doğru; artık laptop’a bağlı değilsiniz.

---

## 4. Railway loglarında görecekleriniz

- **DATA_DIR doğruysa:**  
  `DATA_DIR=/data – veriler kalıcı (restart'ta silinmez).`
- **DATA_DIR yoksa:**  
  `UYARI: DATA_DIR tanımlı değil. Veriler geçici diskte; her restart/redeploy'da SİLİNİR...`

Bu uyarıyı görüyorsanız mutlaka Volume + `DATA_DIR=/data` ekleyip redeploy edin.

---

## Özet

| Adım | Ne yapılacak |
|------|----------------|
| 1 | Railway’de **Backend** servisi: Root = `backend`, **Volume** mount = `/data`, **Variable** `DATA_DIR` = `/data`. |
| 2 | Backend’e domain: `api.the-limon.com`. |
| 3 | Railway’de **Web** servisi: Root = `pos-backoffice`, **Variable** `NEXT_PUBLIC_API_URL` = `https://api.the-limon.com/api`. |
| 4 | Web’e domain: `pos.the-limon.com`. |
| 5 | **https://api.the-limon.com/api/health** ile `data_dir` ve `persistent_storage: true` olduğunu doğrulayın. |

Bunlar tamamsa hem laptop kapalıyken çalışır hem de veriler restart’ta silinmez.
