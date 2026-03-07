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

## Release APK (Dağıtım)

```bash
gradlew assembleRelease
```

Release için keystore gerekir. Keystore yoksa `app/build.gradle.kts` içinde signingConfig tanımlayın.
