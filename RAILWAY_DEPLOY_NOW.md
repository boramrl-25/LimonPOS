# Railway Deploy – Hızlı Adımlar

## 1. Railway CLI ile giriş (bir kez)

**Seçenek A – Tarayıcı ile:** Terminalde `railway login` → tarayıcıdan giriş yapın.

**Seçenek B – Token ile (CI / etkileşimsiz):** Railway Dashboard → Projeniz → **Settings** → **Tokens** → **Generate Project Token**. Sonra ortam değişkeni verin:

```powershell
$env:RAILWAY_TOKEN = "proj_xxxx..."
```

Bundan sonra `.\deploy-railway-vercel.ps1` çalıştığında Railway için tekrar giriş açılmaz.

---

## 2. Servisleri bağlama (ilk kez deploy için)

**Backend (API):**
```bash
cd backend
railway link
```
Açılan listeden **LimonPOS** projesini ve **Backend (API)** servisini seçin.

**Backoffice (Web):**
```bash
cd pos-backoffice
railway link
```
Aynı projede **Web / Backoffice** servisini seçin.

---

## 3. Deploy çalıştırma

Proje kök dizininde (LimonPOS):

**PowerShell:**
```powershell
.\deploy-railway.ps1
```

**Veya tek tek:**
```bash
cd backend
railway up

cd ..\pos-backoffice
railway up
```

---

## 4. Kontrol

- API: https://api.the-limon.com/api/health  
- Web: https://pos.the-limon.com  

Volume ve `DATA_DIR=/data` ayarları için **RAILWAY_DEPLOY.md** dosyasına bakın.
