# Web Panel (Back Office) İnternete Deploy

pos.the-limon.com adresinden erişim için Railway'e deploy adımları.

---

## 1. Railway’de yeni servis ekle

1. **Railway** → Mevcut projeniz (accurate-reprieve) → **+ New** veya **Add Service**
2. **GitHub Repo** seçin → **LimonPOS** (boramrl-25/LimonPOS)
3. Repo seçildikten sonra servis oluşur

---

## 2. Root Directory ayarla

1. Yeni servise tıklayın (LimonPOS-2 veya benzeri isim)
2. **Settings** → **Source** bölümü
3. **Root Directory** → `pos-backoffice` yazın
4. Kaydedin (Railway otomatik redeploy yapar)

---

## 3. Environment Variables

1. **Variables** sekmesine gidin
2. Ekle:
   - `NEXT_PUBLIC_API_URL` = `https://api.the-limon.com/api`
   - `PORT` = `3000` (Railway zaten set eder, gerekirse)

---

## 4. Build & Deploy

Railway Next.js’i otomatik algılar. Root Directory `pos-backoffice` olduktan sonra:
- Build: `npm run build`
- Start: `npm start`

Deploy tamamlanınca yeşil **Online** görünmeli.

---

## 5. Custom Domain ekle

1. Bu serviste **Settings** → **Networking** → **Public Networking**
2. **Custom Domain** → **Add** → `pos.the-limon.com` yazın
3. Railway size DNS kayıtlarını gösterecek (CNAME + TXT doğrulama)

---

## 6. GoDaddy DNS

Railway’in gösterdiği kayıtları GoDaddy’ye ekleyin:

**CNAME:**
- Name: `pos`
- Value: Railway’in verdiği adres (örn. `xxxx.up.railway.app`)

**TXT (doğrulama):**
- Name: `_railway-verify.pos`
- Value: Railway’deki tam metin

---

## 7. Erişim

DNS yayıldıktan sonra (15–60 dk):

**https://pos.the-limon.com/pos**

Giriş PIN: **1234**

---

## Not

basePath `/pos` olduğu için adres `pos.the-limon.com/pos` olur. Ana sayfa: `https://pos.the-limon.com/pos`
