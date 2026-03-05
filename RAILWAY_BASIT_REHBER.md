# Railway Nedir? – Baştan Sona Adım Adım

**Railway**, kodunuzu internet üzerinde 7/24 çalıştıran bir **bulut servisi**dir. LimonPOS’ta:
- **Backend (API)** ve **Web (pos.the-limon.com)** burada çalışır.
- Laptop’u kapatsanız bile site ve API açık kalır.
- Verilerin silinmemesi için **Volume** ve **DATA_DIR** ayarı yapmanız gerekir.

Bu rehberde sıfırdan Railway’e nasıl deploy edeceğiniz anlatılıyor.

---

## Önce bunları yapın

1. **GitHub’da hesap** ve **LimonPOS** reponun GitHub’da olması (zaten var: `boramrl-25/LimonPOS`).
2. **Railway hesabı:** https://railway.app → “Login” → GitHub ile giriş yapın.
3. Repo’daki son değişiklikleri GitHub’a push edin:
   ```bash
   cd c:\Users\Dell\LimonPOS
   git add .
   git commit -m "Railway deploy için güncellemeler"
   git push origin main
   ```

---

## Bölüm 1: Railway’de proje ve Backend servisi

### Adım 1.1 – Yeni proje (ilk kez yapıyorsanız)

1. Tarayıcıda **https://railway.app** açın, giriş yapın.
2. **“New Project”** (veya “Start a New Project”) tıklayın.
3. **“Deploy from GitHub repo”** seçin.
4. **LimonPOS** reponuzu listeden seçin (izin vermeniz istenirse “Configure GitHub” deyip LimonPOS’u seçin).
5. Railway repoyu seçince otomatik bir **servis** oluşturur. Bu ilk servisi **Backend (API)** olarak kullanacağız.

### Adım 1.2 – Root Directory = backend

1. Oluşan servise (kartına) tıklayın.
2. Üstte **“Settings”** (veya “⚙️”) sekmesine girin.
3. **“Source”** bölümünde **“Root Directory”** alanını bulun.
4. İçine sadece şunu yazın: **`backend`**
5. **Save** / **Deploy** ile kaydedin. Railway yeniden build alır.

Böylece Railway sadece `backend` klasörünü çalıştırır (Node.js API).

### Adım 1.3 – Volume ekle (veriler silinmesin)

1. Aynı Backend servisinde sol menüden **“Volumes”** (veya **“Storage”**) sekmesine girin.
2. **“Add Volume”** / **“Create Volume”** tıklayın.
3. **Mount Path** kutusuna tam şunu yazın: **`/data`**
4. İsim: **`limonpos-data`** (veya boş bırakabilirsiniz).
5. Kaydedin.

Bu sayede `data.json` kalıcı diskte tutulur; her deploy’da silinmez.

### Adım 1.4 – Değişkenler (Variables)

1. Aynı Backend servisinde **“Variables”** (veya **“Environment”**) sekmesine girin.
2. **“New Variable”** / **“Add Variable”** ile şunları ekleyin:

| Name     | Value   |
|----------|---------|
| `DATA_DIR` | `/data` |
| `PORT`    | `3002`  |

3. (Zoho Books kullanıyorsanız) Zoho bilgilerini de buradan ekleyebilirsiniz: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORGANIZATION_ID`, `ZOHO_CUSTOMER_ID`, `ZOHO_DC=eu` (EU hesabı için).

4. Kaydedin. Railway genelde otomatik **Redeploy** yapar.

### Adım 1.5 – Backend’e domain vermek (api.the-limon.com)

1. Backend servisinde **“Settings”** → **“Networking”** veya **“Domains”** bölümüne girin.
2. **“Generate Domain”** ile Railway size bir adres verir (örn. `xxx.up.railway.app`). Bunu not alın.
3. **“Custom Domain”** ekleyin: **`api.the-limon.com`** yazın.
4. Railway size DNS’te ne yapmanız gerektiğini gösterir. Genelde:
   - **CNAME** kaydı: **`api`** (veya `api.the-limon.com`) → Railway’in verdiği adres (örn. `xxx.up.railway.app`).
5. Domain’i GoDaddy / Cloudflare / vb. DNS panelinizde bu şekilde ekleyin. Birkaç dakika sonra yeşil tik çıkar.

---

## Bölüm 2: Web (Back-Office) servisi

### Adım 2.1 – İkinci servisi ekleyin

1. Railway projenizin ana sayfasına dönün (sol üstte proje adına tıklayın).
2. **“+ New”** veya **“Add Service”** tıklayın.
3. **“GitHub Repo”** → yine **LimonPOS** reponuzu seçin.
4. Oluşan yeni servise tıklayın (Backend’ten farklı bir kart).

### Adım 2.2 – Root Directory = pos-backoffice

1. Bu serviste **Settings** → **Source**.
2. **Root Directory:** **`pos-backoffice`** yazın.
3. Kaydedin.

### Adım 2.3 – Web için değişken

1. Bu serviste **Variables** sekmesine girin.
2. Tek bir değişken ekleyin:

| Name                    | Value                              |
|-------------------------|-------------------------------------|
| `NEXT_PUBLIC_API_URL`   | `https://api.the-limon.com/api`     |

3. Kaydedin. (Sonunda `/` olmadan yazın.)

### Adım 2.4 – Web’e domain (pos.the-limon.com)

1. Bu serviste **Settings** → **Networking** → **Custom Domain**.
2. **`pos.the-limon.com`** yazın.
3. DNS’te **CNAME:** **`pos`** → Bu servisin Railway’deki adresi (Railway’in gösterdiği `.up.railway.app` adresi).

---

## Bölüm 3: Kontrol

### Backend çalışıyor mu?

1. Tarayıcıda açın: **https://api.the-limon.com/api/health**
2. Şuna benzer bir yanıt görmelisiniz:
   ```json
   {
     "ok": true,
     "message": "LimonPOS API",
     "data_dir": "/data",
     "persistent_storage": true
   }
   ```
3. **Eğer** `data_dir` boş veya `"(not set)"` ve `persistent_storage: false` ise:
   - Backend servisinde Volume **Mount Path** = `/data` mı kontrol edin.
   - **Variables**’da `DATA_DIR` = `/data` var mı kontrol edin.
   - **Redeploy** yapıp tekrar `/api/health` deneyin.

### Web çalışıyor mu?

1. **https://pos.the-limon.com** (veya **https://pos.the-limon.com/pos**) açın.
2. PIN ile giriş yapın (örn. 1234).
3. Giriş yapıp menü/sayfalar açılıyorsa Web doğru API’ye bağlı demektir.

### Laptop kapalıyken test

1. Laptop’u kapatın (veya en azından bilgisayarınızda backend çalıştırmayın).
2. Telefondan veya başka bir cihazdan **https://pos.the-limon.com** açın.
3. Giriş yapıp veri görüyorsanız her şey Railway’de çalışıyor demektir; artık laptop’a bağlı değilsiniz.

---

## Özet tablo

| Ne nerede? | Railway’de yapılacak |
|------------|----------------------|
| **Backend (API)** | 1 servis: Root = `backend`, Volume mount = `/data`, Variable `DATA_DIR` = `/data`, Domain = `api.the-limon.com` |
| **Web** | 1 servis: Root = `pos-backoffice`, Variable `NEXT_PUBLIC_API_URL` = `https://api.the-limon.com/api`, Domain = `pos.the-limon.com` |

---

## Sık sorulanlar

**Railway ücretli mi?**  
Ücretsiz kredi verir; küçük projeler için genelde yeter. Kredi bitince ücretli plana geçmeniz gerekir.

**Kod değiştirdim, nasıl güncellerim?**  
GitHub’a `git push` yapmanız yeterli. Railway GitHub’a bağlıysa otomatik yeni deploy alır.

**Veriler neden siliniyordu?**  
Volume ve `DATA_DIR` olmadan veriler geçici diskte tutuluyor; her deploy’da sıfırlanıyor. Volume + `DATA_DIR=/data` ile veriler kalıcı olur.

**API adresi farklı olabilir mi?**  
Evet. `api.the-limon.com` yerine Railway’in verdiği `xxx.up.railway.app` adresini de kullanabilirsiniz. O zaman Web’deki `NEXT_PUBLIC_API_URL` ve Android uygulamasındaki sunucu adresini bu yeni API adresine göre güncellemeniz gerekir.

Bu rehberi takip ederek Railway’i baştan kurup hem Backend hem Web’i çalışır hale getirebilirsiniz.
