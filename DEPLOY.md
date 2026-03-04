# Deploy – Değişikliklerin Canlıda Görünmesi

Kod değişiklikleri **sadece projede** durur. **App’te Sync** veya **web’te giriş/çıkış** yapmak yeni kodu yüklemez. Değişiklikleri görmek için aşağıdaki adımları uygulayın.

---

## 1. Web (pos.the-limon.com) – Yeni arayüz için

Web sitesi genelde **Vercel** (veya benzeri) ile deploy edilir. Yeni kodu yayına almak için:

1. **Terminalde proje kökünde:**
   ```bash
   cd pos-backoffice
   npm run build
   ```
   Build hatasız bitmeli.

2. **Kodu push edin** (Vercel repo’ya bağlıysa otomatik deploy olur):
   ```bash
   git add .
   git commit -m "Web: categories edit/show_till, floor plan, fixes"
   git push origin main
   ```
   (Branch adınız `main` değilse onu kullanın.)

3. **Vercel Dashboard:**  
   [vercel.com](https://vercel.com) → Projeniz → **Deployments**  
   En son deploy’un “Ready” olduğunu kontrol edin.

4. **Tarayıcıda:**  
   `https://pos.the-limon.com/pos` adresini **zorla yenileyin**:  
   `Ctrl+Shift+R` (Windows) veya `Cmd+Shift+R` (Mac).  
   Gerekirse çıkış yapıp tekrar giriş yapın.

---

## 2. Backend (api.the-limon.com) – Tablo/waiter vb. için

Backend’i nerede çalıştırıyorsanız (Railway, VPS, vb.) orada **yeni kodu çekip servisi yeniden başlatmanız** gerekir.

**Örnek (Railway / Git ile):**
- Repo’ya `git push` yaptığınızda otomatik deploy oluyorsa, backend değişiklikleri de push ile yayına girer.

**Örnek (kendi sunucunuz):**
```bash
cd backend
git pull
npm install
# PM2 kullanıyorsanız:
pm2 restart all
# veya node ile:
# node server.js
```

Böylece tablo cevabındaki `number`, `waiter_id`, `waiter_name` düzeltmeleri canlıya geçer.

---

## 3. Android App – Yeni davranış için

App’teki değişiklikler (floor plan filtreleri, garson adı, “sadece kendi masalarım”) **yeni bir APK kurulana kadar** gelmez. Sync sadece **veriyi** günceller, **uygulama kodunu** değiştirmez.

1. **Android Studio** ile projeyi açın: `LimonPOS` (app klasörünün olduğu kök).

2. **Debug APK üretin:**
   - Windows (PowerShell / CMD):
     ```bash
     cd c:\Users\Dell\LimonPOS
     .\gradlew.bat assembleDebug
     ```
   - APK burada oluşur:  
     `app/build/outputs/apk/debug/app-debug.apk`

3. **Telefona yükleyin:**
   - APK’yı telefona atıp dosyadan kurun, **veya**
   - USB ile bağlayıp Android Studio’dan **Run** (yeşil oynat) ile aynı cihaza yükleyin.

4. Kurduktan sonra uygulamada **Sync** yapın. Artık yeni kod (garson adı, filtreler, “sadece kendi masalarım”) çalışır.

---

## Özet

| Nerede | Ne yapmalı |
|--------|------------|
| **Web** | `git push` (+ Vercel otomatik deploy), sonra sayfayı Ctrl+Shift+R ile yenile |
| **Backend** | Sunucuda `git pull` + servisi yeniden başlat (veya Railway’da push) |
| **App** | `.\gradlew.bat assembleDebug` → `app-debug.apk`’yı telefona kur → Sync |

Sync ve giriş/çıkış **sadece veri/oturumu** günceller; **yeni kodu deploy etmek** yukarıdaki adımlarla yapılır.
