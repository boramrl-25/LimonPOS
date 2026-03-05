# Railway API – Sıfırdan Tek Tek Adımlar

Sadece yapılacaklar. Sırayla uygula.

---

## Adım 1 – Railway’i aç

Tarayıcıda adrese git: **https://railway.app**  
Giriş yap (GitHub ile).

---

## Adım 2 – Yeni proje

**New Project** butonuna tıkla.  
**Deploy from GitHub repo** seç.  
Listeden **LimonPOS** reponu seç (izin istenirse GitHub’da LimonPOS’u seç, Authorize de).  
Repo seçilince Railway tek bir servis oluşturur. Bu servis Backend (API) olacak.

---

## Adım 3 – Servise gir

Oluşan servis kartına (LimonPOS yazan kutuya) tıkla.  
Servis sayfasına giriyorsun.

---

## Adım 4 – Root Directory ayarla

Üstte **Settings** sekmesine tıkla.  
**Source** bölümünü bul.  
**Root Directory** kutusuna tam şunu yaz: **backend**  
Kaydet (Save / Deploy).  
Bekle, build bitsin.

---

## Adım 5 – Volume ekle

Sol menüden **Volumes** (veya **Storage**) sekmesine tıkla.  
**Add Volume** (veya **Create Volume**) butonuna tıkla.  
**Mount Path** kutusuna tam şunu yaz: **/data**  
**Add** (veya **Create**) butonuna tıkla.  
Volume eklendi.

---

## Adım 6 – Değişkenleri ekle

Sol menüden **Variables** sekmesine tıkla.  
**New Variable** veya **Add Variable** ile aşağıdakileri tek tek ekle.

Birinci değişken:
- Name: **DATA_DIR**
- Value: **/data**
- Kaydet.

İkinci değişken:
- Name: **PORT**
- Value: **3002**
- Kaydet.

Değişkenler kaydedilince Railway kendisi yeniden deploy eder. Bekle.

---

## Adım 7 – Domain ver (API adresi)

Aynı serviste **Settings** sekmesine git.  
**Networking** veya **Domains** bölümünü bul.  
**Generate Domain** butonuna tıkla.  
Railway bir adres verir (örn. `limonpos-backend-production-xxxx.up.railway.app`). Bu adresi kopyala veya not al.

Sonra **Custom Domain** kısmına git.  
**Add Custom Domain** (veya benzeri) tıkla.  
Kutuya yaz: **api.the-limon.com**  
Kaydet.

---

## Adım 8 – DNS ayarı (api.the-limon.com için)

Domain’i nerede yönettiğini biliyorsan (GoDaddy, Cloudflare, vb.) oraya gir.  
Yeni kayıt ekle:
- Tip: **CNAME**
- Name / Host: **api** (sadece api; bazı panellerde “api.the-limon.com” da yazılır)
- Value / Target / Points to: Railway’in verdiği adres (Adım 7’deki `xxxx.up.railway.app`)

Kaydet. Birkaç dakika bekleyebilir.

---

## Adım 9 – Kontrol

Tarayıcıda aç: **https://api.the-limon.com/api/health**

Şunu görürsen API ayakta:
```json
{"ok":true,"message":"LimonPOS API",...}
```

`data_dir` yanında **/data** ve **persistent_storage: true** görürsen Volume + DATA_DIR doğru demektir.

---

## Özet (sıra)

1. railway.app → giriş  
2. New Project → Deploy from GitHub repo → LimonPOS  
3. Oluşan servise tıkla  
4. Settings → Root Directory: **backend** → kaydet  
5. Volumes → Add Volume → Mount Path: **/data** → Add  
6. Variables → DATA_DIR = **/data**, PORT = **3002** ekle  
7. Settings → Generate Domain, sonra Custom Domain: **api.the-limon.com**  
8. DNS’te CNAME: **api** → Railway adresi  
9. https://api.the-limon.com/api/health ile test et  

Bunları sırayla yaptıysan Railway API yeniden kurulmuş olur.
