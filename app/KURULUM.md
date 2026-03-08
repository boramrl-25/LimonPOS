# LimonPOS Android App — APK Kurulum

## 1. APK Oluşturma (Bilgisayar)

Proje kök dizininde (LimonPOS) terminal/CMD açın:

```bash
cd c:\Users\Dell\LimonPOS
gradlew assembleDebug
```

APK konumu: `app\build\outputs\apk\debug\app-debug.apk`

---

## 2. APK'yı Android Cihaza Gönderme

### Yöntem A — Mail
- APK dosyasını kendinize e-posta ile gönderin
- Telefonda maili açın, ekteki APK'ya tıklayıp indirin

### Yöntem B — Google Drive / Dropbox
- APK'yı Drive/Dropbox'a yükleyin, link paylaşın
- Telefonda linke girin, indirip kurun

### Yöntem C — USB
- Telefonu USB ile bağlayın
- APK'yı telefona kopyalayın, dosya yöneticisinden kurun

---

## 3. Android Kurulum

1. **Ayarlar** → **Güvenlik** → **Bilinmeyen kaynaklardan yükleme** → **Etkinleştir**
2. APK dosyasına tıklayın
3. **Kur** deyin

---

## Google Play için AAB Oluşturma

Google Play **AAB (Android App Bundle)** formatı ister, APK değil.

### 1. Keystore Oluşturma (ilk kez)

Proje kökünde (LimonPOS) terminal açın:

```powershell
keytool -genkey -v -keystore limonpos-release.keystore -alias limonpos -keyalg RSA -keysize 2048 -validity 10000
```

İsim, kurum, şehir vb. sorulacak; **şifreleri mutlaka kaydedin**, kaybederseniz uygulamayı güncelleyemezsiniz.

### 2. keystore.properties Dosyası

`keystore.properties.example` dosyasını `keystore.properties` olarak kopyalayın ve doldurun:

```
storeFile=limonpos-release.keystore
storePassword=ŞİFRENİZ
keyAlias=limonpos
keyPassword=ŞİFRENİZ
```

`limonpos-release.keystore` dosyası proje kökünde olmalı. Başka yerdeyse `storeFile` ile tam yol verebilirsiniz.

### 3. AAB Oluşturma

```powershell
.\build-google-play.ps1
```

veya:

```powershell
.\gradlew bundleRelease
```

AAB konumu: `app\build\outputs\bundle\release\app-release.aab`

Bu dosyayı [Google Play Console](https://play.google.com/console) → Uygulama → Sürüm → Üretim → Yeni sürüm oluştur ile yükleyin.

### 4. Sürüm Güncelleme

Yeni sürüm yayınlamadan önce `app/build.gradle.kts` içinde:

- `versionCode`: bir artırın (örn. 2 → 3)
- `versionName`: kullanıcıya görünen sürüm (örn. `"1.2"`)
