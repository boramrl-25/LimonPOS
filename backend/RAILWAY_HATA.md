# "Application failed to respond" – Ne Yapmalı?

## 1. Deploy loglarına bak

Railway → **LimonPOS** (Backend) servisi → **Deployments** → en son deploy’a tıkla → **View Logs** (veya **Logs**).

Logda kırmızı bir **hata mesajı** görürsün. Örnekler:

- **"Cannot find module"** → Root Directory yanlış. **Settings** → **Source** → **Root Directory:** `backend` yaz, kaydet, tekrar deploy et.
- **"EACCES" / "permission denied"** → `/data` volume izin sorunu. Volume’u kaldırıp tekrar ekle veya DATA_DIR’i silip (volume’suz) dene; uygulama yedek konumda çalışır.
- **"ENOENT"** → Dosya/klasör bulunamadı. Genelde Root Directory = `backend` ile düzelir.

Logdaki **tam hata satırını** kopyalayıp bir yere yapıştır; buna göre net çözüm söylenebilir.

---

## 2. Root Directory kontrolü

Backend’in **repo’nun içindeki** `backend` klasöründen çalışması gerekir.

- **Settings** → **Source** → **Root Directory**
- Değer tam olarak: **`backend`** (küçük harf)
- Kaydedip **Redeploy** et.

---

## 3. Kod tarafı (yapıldı)

`db.js` güncellendi: `/data` açılamazsa uygulama yedek konumda başlamaya çalışır; böylece en azından “failed to respond” yerine logda gerçek hata görünür.

Deploy’u tetiklemek için: `git push` yeterli (Railway GitHub’a bağlıysa otomatik deploy alır).
