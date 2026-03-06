# LimonPOS Nasıl Deploy Yapılır?

Bu rehberde **backend (API)** ve **web (pos.the-limon.com)** deploy adımları var. İkisi de bulutta olursa laptop kapalıyken de sistem çalışır, veriler kalıcı olur.

---

## Senin yapacakların (kısa liste)

| Ne durumdasın? | Ne yapacaksın? |
|----------------|----------------|
| **Vercel / Railway hiç kurmadım** | Aşağıdaki **1. Web** ve **2. Backend** bölümlerini sırayla yap (her biri bir kez). |
| **İkisini de kurduk, sadece kodu güncellemek istiyorum** | Bilgisayarda `git push origin main` yap (veya Cursor’da “Push” de). Sonrası otomatik. |
| **pos.the-limon.com / api.the-limon.com açılmıyor** | Domain’i Vercel ve Railway’e bağla; domain sağlayıcında CNAME kayıtlarını ekle (aşağıda anlatıldı). |
| **pos.the-limon.com 404 veriyor** | Vercel’de **Root Directory** mutlaka `pos-backoffice` olmalı. Aşağıdaki “404 alıyorsan” adımlarını uygula. |
| **Veriler yine silindi** | Railway’de **Volume** (mount: `/data`) ve **DATA_DIR=/data** tanımlı mı kontrol et. Yoksa ekle, redeploy et. |

**Özet:** İlk seferde Vercel + Railway’i kurup domain’leri bağlarsan, sonra sadece `git push` yeter; deploy’u sen yapmıyorsun, otomatik olur.

---

## Genel mimari

| Bileşen | Adres | Nerede deploy | Not |
|--------|--------|----------------|-----|
| **Web (backoffice)** | pos.the-limon.com | Vercel | GitHub’a push → otomatik deploy |
| **Backend (API)** | api.the-limon.com | Railway (veya Render/Fly.io) | Volume + DATA_DIR şart (veri kalıcı olsun) |

---

## 1. Web (Backoffice) deploy — Vercel

### İlk kurulum (bir kez)

1. [Vercel](https://vercel.com) → giriş yap.
2. Sol menüden **Projects**’e tıkla (Integrations değil).
3. Sağ üstte **Add New** → **Project** (veya **Import Git Repository**).
4. **Import** ile GitHub repo’yu seç: `boramrl-25/LimonPOS`. (GitHub hesabını bağlaman istenirse “Connect GitHub” de.)
5. **Configure Project** ekranında:
   - **Root Directory** → **Edit** → `pos-backoffice` yaz, seç (sadece bu klasör deploy edilsin).
   - **Environment Variables** → Name: `NEXT_PUBLIC_API_URL`, Value: `https://api.the-limon.com/api`
6. **Deploy** tıkla.

Not: **Integrations** sayfasına girme; proje deploy’u **Projects** → **Add New** → **Project** ile yapılır.

### Sonraki deploy’lar

- Koddaki değişiklikleri GitHub’a push et:
  ```bash
  cd C:\Users\Dell\LimonPOS
  git add .
  git commit -m "Deploy: ..."
  git push origin main
  ```
- Vercel, `main` branch’e push’u görünce **otomatik** yeni build alır ve deploy eder. Ekstra bir şey yapmana gerek yok.

### Domain (pos.the-limon.com)

- Vercel → Proje → **Settings** → **Domains** → `pos.the-limon.com` ekle.
- Domain sağlayıcında (GoDaddy, Cloudflare vb.) **CNAME**: `pos.the-limon.com` → `cname.vercel-dns.com` (Vercel’in verdiği adres neyse onu kullan).

### pos.the-limon.com 404 alıyorsan

1. **Vercel** → [vercel.com](https://vercel.com) → Giriş yap → **LimonPOS** projesini aç.
2. **Settings** → **General** → **Root Directory** kısmına bak.
   - **Mutlaka `pos-backoffice` yazılı olmalı.** Boş veya farklı bir şeyse **Edit** deyip `pos-backoffice` yaz, **Save**.
3. **Deployments** sekmesine geç → sağ üstten **Redeploy** (son deployment’ı “Redeploy” ile tekrar deploy et).
4. Domain kontrolü: **Settings** → **Domains** → `pos.the-limon.com` listede mi? Yoksa **Add** ile ekle.
5. Tarayıcıda **https://pos.the-limon.com/pos** dene (uygulama `/pos` altında çalışıyor). Ana sayfa yine de açılmıyorsa Root Directory’yi kaydettikten sonra 1–2 dakika bekleyip tekrar dene.

**Neden 404 olur?** Root Directory `pos-backoffice` değilse Vercel repo kökünden build alır; orada Next.js uygulaması olmadığı için build hata verir veya boş sayfa/404 döner.

---

## 2. Backend (API) deploy — Railway

### İlk kurulum (bir kez)

1. [Railway](https://railway.app) → giriş yap → **New Project**
2. **Deploy from GitHub repo** → `LimonPOS` repo’sunu seç
3. **Root Directory** ayarla: `backend` (sadece backend klasörü deploy edilsin)
4. **Settings** / **Variables** bölümünde environment variable ekle:
   - `DATA_DIR` = `/data`
5. **Volumes** (Storage):
   - **Add Volume** → Mount Path: `/data`, isim: `limonpos-data`, 1 GB
6. **Deploy** / **Redeploy** yap.

Böylece `data.json` `/data` içine yazılır; restart veya redeploy’da silinmez.

### Domain (api.the-limon.com)

- Railway → Servis → **Settings** → **Networking** / **Public Networking** → **Generate Domain** (veya **Custom Domain**).
- **Custom domain** ekle: `api.the-limon.com`
- Domain sağlayıcında **CNAME**: `api.the-limon.com` → Railway’in verdiği hedef (örn. `xxx.railway.app`).

### Sonraki deploy’lar

- Kodu GitHub’a push et:
  ```bash
  git push origin main
  ```
- Railway, repo’ya bağlıysa **otomatik** yeni deploy alır.  
- Sadece backend’i değiştirdiysen yine aynı push yeterli; Railway sadece `backend` klasörünü kullanıyorsa sadece o kısım deploy edilir.

---

## 3. Özet: Her deploy için yapman gereken

1. Kod değişikliklerini commit et:
   ```bash
   git add .
   git commit -m "Açıklama"
   git push origin main
   ```
2. **Vercel** → web’i otomatik deploy eder (pos.the-limon.com).
3. **Railway** → backend’i otomatik deploy eder (api.the-limon.com).

Laptop’u kapatman deploy’u etkilemez; her şey bulutta çalışır.

---

## 4. Verilerin silinmemesi (önemli)

- Backend’te **mutlaka** Railway **Volume** kullan: Mount Path = `/data`, değişken = `DATA_DIR=/data`.  
- Detay: `backend/README_STORAGE.md`  
- Neden gerekli: `DEPLOY_CLOUD.md`

---

## 5. Başka host kullanıyorsan

- **Web:** Netlify, Cloudflare Pages vb. → repo’yu bağla, root = `pos-backoffice`, env: `NEXT_PUBLIC_API_URL=https://api.the-limon.com/api`
- **Backend:** Render, Fly.io, kendi VPS’in → Node çalıştır (`npm install && npm run start`), kalıcı klasör için `DATA_DIR` ver (örn. `/var/data/limonpos`).

Özet: **Deploy = GitHub’a push; web ve backend otomatik güncellenir. Backend’te Volume + DATA_DIR ile veriyi kalıcı tut.**
