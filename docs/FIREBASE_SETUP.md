# Firebase / FCM Kurulumu

Hibrit mimari Force Update için Android cihazlara FCM push göndermek için:

## 1. App — google-services.json

1. [Firebase Console](https://console.firebase.google.com/) → Yeni proje veya mevcut proje
2. **Proje Ayarları** (⚙) → **Genel** → **Uygulamanız** → Android uygulaması ekle
3. Package name: `com.limonpos.app`
4. `google-services.json` indir → `app/google-services.json` olarak kaydet (mevcut dosyayı değiştir)
5. `app/google-services.json.example` şablon olarak kullanılabilir

## 2. Backend — Firebase Admin SDK

Backend `firebase-admin` kullanıyor. Service account yapılandırması:

1. Firebase Console → **Proje Ayarları** → **Hizmet Hesapları** → **Yeni özel anahtar oluştur**
2. İndirilen JSON dosyasını güvenli bir yere koyun
3. `.env` dosyasına ekleyin:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/tam/yol/serviceAccountKey.json
   ```
   veya `FCM_SERVICE_ACCOUNT_PATH=...`

## 3. Akış

1. **App** → Heartbeat ile FCM token backend'e gönderilir
2. **Backoffice** → "Zorunlu Güncelle" butonu
3. **Backend** → WebSocket + FCM data mesajı (`type: catalog_updated`)
4. **App** → `LimonFcmService` → `syncFromApi()` tetiklenir
