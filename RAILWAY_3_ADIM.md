# Veriler Silinmesin – Railway'de 3 Adım

Backend’te verilerin kalıcı olması için Railway’de **sadece şunları** yap. (Kod tarafı zaten push edildi.)

---

## 1. Railway’i aç

Tarayıcıda git: **https://railway.app**  
Giriş yap → **LimonPOS** projesini aç → **Backend** (API) servisine tıkla.  
*(Birden fazla servis varsa “backend” / “API” / Root Directory’si `backend` olanı seç.)*

---

## 2. Volume ekle

- Sol menüden **Volumes** (veya **Storage**) sekmesine gir.
- **Add Volume** / **Create Volume** butonuna tıkla.
- **Mount Path** kutusuna tam şunu yaz: `/data`
- İsim: `limonpos-data` (veya boş bırakabilirsin).
- Kaydet.

---

## 3. DATA_DIR değişkenini ekle

- **Variables** (veya **Environment**) sekmesine gir.
- **New Variable** / **Add Variable**.
  - **Name:** `DATA_DIR`
  - **Value:** `/data`
- Kaydet.

Railway genelde kaydettikten sonra otomatik **Redeploy** yapar. Bir kez redeploy bitsin.

---

## Kontrol

Birkaç dakika sonra tarayıcıda aç: **https://api.the-limon.com/api/health**

Şunu görürsen tamam:  
`"data_dir": "/data"` ve `"persistent_storage": true`

Görmüyorsan: Volume’un Mount Path’i gerçekten `/data` mı, Variable adı tam `DATA_DIR` ve değeri `/data` mı kontrol et; sonra tekrar Redeploy et.
