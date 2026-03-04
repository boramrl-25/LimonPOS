# Backend: Ürünler ve verilerin silinmemesi (kalıcı depolama)

Backend tüm veriyi `data.json` dosyasında tutar. Deploy/restart sonrası veri kaybolmasın diye **kalıcı volume** kullanın.

## Railway’de yapılacaklar

### 1. Volume ekle
1. [Railway](https://railway.app) → Projen → **Backend** servisi
2. **Variables** yanında **Storage** (veya **Volumes**) sekmesine gir
3. **Add Volume** / **Create Volume**
   - **Mount Path:** ` /data` (tam bu şekilde)
   - İsim: örn. `limonpos-data`
   - Boyut: 1 GB yeterli

### 2. Environment variable ekle
1. Aynı serviste **Variables** sekmesi
2. **New Variable**
   - **Name:** `DATA_DIR`
   - **Value:** `/data`

### 3. Redeploy
- **Deploy** veya **Redeploy** ile servisi yeniden başlatın.
- Bundan sonra `data.json` `/data/data.json` içine yazılır; restart’ta silinmez.

---

## Başka bir host kullanıyorsanız

- Sunucuda kalıcı bir klasör belirleyin (örn. `/var/data/limonpos`).
- Uygulama başlarken `DATA_DIR=/var/data/limonpos` environment variable’ı verin.
- `db.js` zaten `DATA_DIR` varsa onu kullanır; yoksa proje klasörüne yazar (restart’ta silinebilir).
