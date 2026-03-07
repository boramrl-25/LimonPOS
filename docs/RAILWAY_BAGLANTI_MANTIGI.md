# Railway Bağlantı Mantığı – Git ve Sunucu

## Railway “Git’e gitme” nasıl çalışıyor?

Railway, **GitHub deposu (repo)** ile bağlı çalışır. Bağlantı tek yönlü: **GitHub → Railway**.

```
[GitHub: LimonPOS repo]  ──bağlı──►  [Railway projesi]
         │                                    │
         │ push / deploy tetiklenince         │
         └────────────────────────────────────┘
                    Railway:
                    1. Repoyu clone eder
                    2. Root Directory’ye gider (örn. backend)
                    3. Build + çalıştırır (node server.js)
```

### Adım adım

| Adım | Ne oluyor |
|------|-----------|
| 1 | Railway’de **+ New → GitHub Repo** ile LimonPOS reponuzu seçiyorsunuz. |
| 2 | Railway o repoya **bağlanıyor** (yetki bir kez verilir). |
| 3 | **Root Directory:** `backend` → Sadece `backend` klasörü build/deploy edilir. |
| 4 | **Deploy tetiklenir:** GitHub’a **push** (otomatik deploy açıksa) veya Railway panelinden **Deploy** / CLI’dan `railway up`. |
| 5 | Railway sunucusu repoyu alır, `backend` içinde `npm install` + `npm start` (veya Procfile) çalıştırır. |

Yani “git’e gitme” = **GitHub’daki kodu Railway’in alıp kendi sunucusunda çalıştırması**. Kod bilgisayarınızda değil, Railway’in ortamında çalışır.

---

## Cloudinary ile alakası var mı?

**Hayır.** Bu projede (LimonPOS) **Cloudinary kullanılmıyor**; kodda Cloudinary’e ait hiçbir referans yok.

| Servis | Ne işe yarar | LimonPOS’ta |
|--------|----------------|-------------|
| **Railway** | Backend API’yi (Node.js) host eder, GitHub’dan alır, sunucuda çalıştırır. | ✅ Backend (API) burada çalışıyor. |
| **Vercel** | Frontend (Next.js backoffice) host eder. | ✅ Backoffice burada. |
| **Cloudinary** | Resim/video depolama ve CDN (bulut dosya servisi). | ❌ Kullanılmıyor. |

İleride **ürün resimleri** gibi dosyaları Cloudinary’de tutmak isterseniz:

- Backend’te (Railway’de) sadece **env değişkeni** (örn. `CLOUDINARY_URL`) tanımlarsınız.
- Resim yükleme/gösterme mantığını backend veya backoffice’e Cloudinary SDK ile eklersiniz.
- Bu, **Railway’in “Git’e gitme” veya deploy mantığını değiştirmez**; sadece uygulama Cloudinary API’yi kullanır.

**Özet:** Railway = GitHub’dan kodu alıp API’yi çalıştıran sunucu. Cloudinary = isteğe bağlı resim/dosya servisi; şu an sistemde yok ve Railway bağlantı mantığından bağımsız.
