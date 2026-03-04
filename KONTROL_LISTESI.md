# Laptop Kapalıyken Çalışsın – Adım Adım Kontrol Listesi

Her adımı sırayla yap. Her adımın sonunda ne gördüğünü not et; çalışmıyorsa o adımda takılıyoruz demektir.

---

## Adım 1: Backend (API) nerede çalışıyor?

**Yap:** Laptop’u **açık** tut. Tarayıcıda şu adresi aç:

**https://api.the-limon.com/api/health**

**Görmen gereken:** Bir JSON sayfası, örneğin:
```json
{"ok":true,"message":"LimonPOS API","ts":1234567890,"data_dir":"...","persistent_storage":true veya false}
```

**Sonucunu yaz:**
- [ ] Sayfa açıldı, JSON gördüm → API bir yerde çalışıyor (Adım 2’ye geç)
- [ ] Sayfa açılmadı / hata / “siteye ulaşılamıyor” → API’ye ulaşılamıyor (Backend’i Railway’e deploy etmemiz veya domain’i düzeltmemiz gerekiyor)

---

## Adım 2: Bu API laptop’tan mı yoksa Railway’den mi?

**Yap:** Laptop’u **kapat** (veya en azından backend’i durdur – terminalde `node server.js` çalışıyorsa kapat).  
Birkaç dakika sonra **telefondan** (Wi‑Fi’yi kapat, sadece mobil veri kullan) veya başka bir bilgisayardan tekrar aç:

**https://api.the-limon.com/api/health**

**Görmen gereken:** Aynı JSON (ok: true vb.) gelmeli.

**Sonucunu yaz:**
- [ ] Laptop kapalıyken de aynı sayfa açıldı → API gerçekten bulutta (Railway vb.), Adım 3’e geç
- [ ] Laptop kapalıyken sayfa açılmadı / hata → API hâlâ laptop’ta veya api.the-limon.com laptop’a yönleniyor; Backend’i Railway’e alıp domain’i oraya yönlendirmemiz lazım

---

## Adım 3: Railway’de Backend servisi var mı?

**Yap:** https://railway.app → Giriş yap → Projeni aç.

**Kontrol et:** Projede **en az bir servis** “backend” / “API” gibi bir isimle var mı? (Root Directory’si `backend` olan servis.)

**Sonucunu yaz:**
- [ ] Var, Root Directory = `backend` (veya benzeri) → Adım 4’e geç
- [ ] Yok / emin değilim → Railway’de “New → GitHub Repo → LimonPOS” ile yeni servis ekleyip Root Directory = `backend` yapacağız

---

## Adım 4: Backend servisine domain bağlı mı?

**Yap:** Railway’de **Backend** servisine tıkla → **Settings** → **Networking** veya **Domains**.

**Kontrol et:** `api.the-limon.com` (veya `xxx.up.railway.app`) bu servise bağlı mı?

**Sonucunu yaz:**
- [ ] api.the-limon.com bu servise bağlı → Adım 5’e geç
- [ ] Bağlı değil / farklı bir adres → Custom Domain ekleyip `api.the-limon.com` yazacağız; DNS’te CNAME’i bu servisin Railway adresine yönlendireceğiz

---

## Adım 5: DNS (GoDaddy vb.) doğru mu?

**Yap:** Domain sağlayıcında (GoDaddy, Cloudflare vb.) **api** için bir kayıt var mı bak.

**Olması gereken:**  
- Tip: **CNAME**  
- Name: **api** (veya `api.the-limon.com`’a gidecek şekilde)  
- Value: Railway’in verdiği adres (örn. `xxxx.backend.up.railway.app` veya projedeki backend servisinin domain’i)

**Sonucunu yaz:**
- [ ] CNAME api → Railway adresi var → Adım 6’ya geç
- [ ] Yok / yanlış → CNAME’i ekleyip veya düzelteceğiz

---

## Adım 6: Web (pos.the-limon.com) nerede host ediliyor?

**Yap:** Laptop **kapalı** iken tarayıcıda aç:

**https://pos.the-limon.com/pos**

**Görmen gereken:** Giriş ekranı (PIN ile giriş) veya “Yükleniyor…” sonrası panel.

**Sonucunu yaz:**
- [ ] Sayfa açılıyor (içerik yüklenmese bile) → Web bir yerde host ediliyor (Vercel/Railway vb.), Adım 7’ye geç
- [ ] Sayfa hiç açılmıyor → pos.the-limon.com’u da Railway (veya Vercel) + DNS ile yayına almamız lazım

---

## Adım 7: Web, API’ye doğru adresten istek atıyor mu?

**Yap:** Railway’de **Web** servisine (pos-backoffice) tıkla → **Variables**.

**Kontrol et:**  
`NEXT_PUBLIC_API_URL` = **https://api.the-limon.com/api**  
(yoksa ekle; başka bir değer varsa düzelt.)

**Sonucunu yaz:**
- [ ] Var ve değer tam bu → Adım 8’e geç
- [ ] Yok / farklı → Değişkeni ekleyip veya düzeltip redeploy edeceğiz

---

## Adım 8: Veriler kalıcı mı? (Volume + DATA_DIR)

**Yap:** Railway’de **Backend** servisi → **Volumes** (veya Storage) ve **Variables**.

**Kontrol et:**  
1. **Volume** var mı? Mount path = **/data**  
2. **Variable:** `DATA_DIR` = **/data**

**Sonucunu yaz:**
- [ ] İkisi de var → Veriler restart’ta silinmemeli; Adım 9’a geç
- [ ] Biri veya ikisi yok → Volume ekleyip DATA_DIR=/data yazacağız, redeploy edeceğiz

---

## Adım 9: Son test – Laptop kapalıyken tam akış

**Yap:**  
1. Laptop’u kapat (veya en azından projede hiçbir şey çalıştırma).  
2. Telefondan veya başka cihazdan: **https://pos.the-limon.com/pos** aç.  
3. PIN ile giriş yap (örn. 1234).  
4. Products veya başka bir sayfaya gir.

**Görmen gereken:** Veriler gelmeli, sayfa normal çalışmalı.

**Sonucunu yaz:**
- [ ] Giriş yaptım, veriler geldi → Tamam, laptop kapalıyken çalışıyor
- [ ] Giriş yapamıyorum / veri gelmiyor → Hata mesajını veya ekran görüntüsünü yaz; hangi adımda kaldığımızı birlikte netleştiririz

---

## Özet tablo (senin dolduracağın)

| Adım | Konu                    | Sonuç (✓ / ✗ / ?) |
|------|-------------------------|---------------------|
| 1    | api/health açılıyor mu? |                     |
| 2    | Laptop kapalıyken API?  |                     |
| 3    | Railway’de Backend var? |                     |
| 4    | api.the-limon.com bağlı?|                    |
| 5    | DNS CNAME doğru?       |                     |
| 6    | pos.the-limon.com açılıyor? |                |
| 7    | NEXT_PUBLIC_API_URL doğru? |                 |
| 8    | Volume + DATA_DIR var? |                     |
| 9    | Laptop kapalıyken giriş + veri? |            |

Bu listeyi doldurup hangi adımda takıldığını yazarsan, o adımdan devam ederiz.
