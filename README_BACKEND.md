# LimonPOS Backend & Web Admin

## the-limon.com Hosting'e Deploy

- **API:** https://the-limon.com/api  
- **Web panel:** https://the-limon.com/pos.html (veya https://the-limon.com/pos/)

1. **Backend (Node.js)** – Hosting'inizde Node.js varsa:
   - `backend/` klasörünü yükleyin, `npm install` + `npm start`
   - Port 3002 veya `PORT` env ile belirttiğiniz port açık olmalı

2. **Web (Next.js)** – `pos-backoffice/`:
   - `NEXT_PUBLIC_API_URL=https://the-limon.com/api` ile build: `npm run build` + `npm start`
   - Panel `/pos` basePath ile derlenir; adres: https://the-limon.com/pos/

3. **Reverse proxy** – the-limon.com üzerinden:
   - `/api` → Backend (port 3002)
   - `/pos` ve `/pos.html` → Next.js (port 3000)
   - Nginx/Apache'de `/pos.html` → `/pos/` yönlendirmesi ekleyebilirsiniz

4. **Android uygulaması** varsayılan olarak `https://the-limon.com/api/` adresine bağlanır.

---

## Hızlı Başlangıç

**Web’in çalışması için önce backend açık olmalı.** İkisini birlikte başlatmak için proje kökünde:

```bash
npm start
```

Bu komut backend (port 3002) ve web (port 3000) sunucularını aynı anda açar. Tarayıcıda **http://localhost:3000** adresine gidin, giriş için PIN: **1234**.

---

### Sadece Backend (API)

```bash
cd backend
npm install
npm run dev        # http://localhost:3002 - varsayılan admin PIN: 1234
```

### Sadece Web Admin Panel

```bash
cd pos-backoffice
npm install
# Backend'in 3002'de çalıştığından emin olun. .env.local: NEXT_PUBLIC_API_URL=http://localhost:3002/api
npm run dev        # http://localhost:3000 (port doluysa 3001, 3003... yazar)
```

**Web çalışmıyorsa:**  
1. Önce backend’i başlatın: `cd backend` → `npm run dev` (3002’de dinlemeli).  
2. Sonra web: `cd pos-backoffice` → `npm run dev`.  
3. Tarayıcıda terminalde yazan adresi açın (örn. http://localhost:3000 veya http://localhost:3001).  
4. "Backend yanıt vermiyor" hatası alırsanız backend kapalı veya 3002 portu meşgul demektir.

### 3. Android Uygulaması

**Production (the-limom.com):** Varsayılan olarak `https://the-limom.com/api/` kullanılır, ek ayar gerekmez.

**Lokal ağ:** Ayarlar → Sunucu Adresi ekranından kendi backend adresinizi girin (örn. `http://192.168.1.100:3002/api/`).

---

## Web Admin Özellikleri

- **Giriş:** PIN 1234 (varsayılan admin)
- **Ürünler:** Ekle, düzenle, sil, kategori ve yazıcı atama
- **Kategoriler:** Ekle, düzenle, sil, renk
- **Yazıcılar:** Mutfak ve fiş yazıcıları
- **Kullanıcılar:** Personel, PIN, rol
- **Ödeme Metodları:** Nakit, kart, özel metodlar
- **Zoho Books:** Client ID, Secret, Refresh Token, Org ID, Customer ID

---

## Zoho Books (Backend)

1. Web admin → Zoho Books → Bilgileri girin
2. Ödeme tamamlandığında satışlar otomatik Zoho Books'a Sales Receipt olarak gönderilir
3. Uygulama içi Zoho ayarını kapatın (çift kayıt önleme)
