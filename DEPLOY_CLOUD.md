# pos.the-limon.com Neden Laptop Kapanınca Çalışmıyor? Veriler Neden Siliniyor?

## Kısa cevap

- **Laptop kapatınca çalışmıyor** → Backend (API) şu an büyük ihtimalle **laptop’ta** veya **kalıcı olmayan** bir yerde çalışıyor. API’yi **bulutta 7/24** çalışacak şekilde taşımanız gerekir.
- **Veriler siliniyor** → Backend bulutta olsa bile **kalıcı disk (volume)** tanımlı değilse her restart/redeploy’da `data.json` sıfırlanır. **Volume + DATA_DIR** şart.

---

## Mimari (nasıl olmalı)

| Bileşen | Nerede çalışmalı | Şu an ne olabilir |
|--------|-------------------|--------------------|
| **pos.the-limon.com** (web arayüz) | Vercel / Netlify (zaten cloud) | Muhtemelen Vercel’de; laptop’a bağlı değil. |
| **api.the-limon.com** (backend API) | Railway / Render / Fly.io vb. (cloud) | Laptop’ta `node server.js` veya cloud’da **volume olmadan** çalışıyor olabilir. |

- Web (pos.the-limon.com) her zaman API’ye (api.the-limon.com) istek atar. **API kapalıysa** (laptop kapalı veya sunucu down) site açılır ama giriş yapamaz, veri gelmez → “çalışmıyor” hissi.
- API’nin verisi `data.json` dosyasında. Bu dosya **geçici diskte** ise (varsayılan) her restart’ta sıfırlanır → “bütün bilgiler silindi”.

---

## Yapmanız gerekenler

### 1. Backend’i (API) bulutta 7/24 çalıştırın

- **Laptop’ta çalıştırmayın.** Backend’i Railway, Render, Fly.io vb. bir servise deploy edin.
- Domain: `api.the-limon.com` bu sunucuya yönlensin (CNAME / A record).
- Böylece laptop kapalıyken de pos.the-limon.com API’ye erişir, site çalışır.

### 2. Verilerin silinmemesi için kalıcı disk (volume) kullanın

Backend’te tüm veri `data.json` dosyasında. Bu dosyanın **kalıcı volume**’da olması gerekir.

**Railway kullanıyorsanız** (önerilen):

1. **Volume ekleyin**
   - Railway → Projeniz → Backend servisi → **Volumes**
   - **Add Volume** → Mount Path: `/data` (tam böyle), isim: örn. `limonpos-data`, 1 GB yeterli.

2. **Environment variable**
   - Aynı serviste **Variables** → `DATA_DIR` = `/data` ekleyin.

3. **Redeploy**
   - Deploy/Redeploy ile yeniden başlatın. Bundan sonra `data.json` `/data/data.json` içine yazılır; restart’ta silinmez.

Detay: `backend/README_STORAGE.md` dosyasına bakın.

**Başka bir host (VPS, cPanel vb.) kullanıyorsanız:**

- Sunucuda kalıcı bir klasör açın (örn. `/var/data/limonpos`).
- Uygulama başlarken `DATA_DIR=/var/data/limonpos` verin. `db.js` bu değişkeni kullanır.

---

## Özet

| Sorun | Sebep | Çözüm |
|-------|--------|--------|
| Laptop kapatınca pos.the-limon.com çalışmıyor | API (api.the-limon.com) laptop’ta veya kapalı | Backend’i Railway/Render vb. bulutta 7/24 çalıştırın. |
| Her seferinde bütün bilgiler siliniyor | `data.json` geçici diskte; restart’ta sıfırlanıyor | Backend’te Volume mount + `DATA_DIR=/data` (veya sunucuda kalıcı path) kullanın. |

Bu iki adım tamamsa hem site laptop kapalıyken çalışır hem de veriler kalıcı olur.
