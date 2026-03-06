# Till, Modifier ve Overdue Düzeltmeleri – Detaylı Dokümantasyon

Bu dokümanda: **sorunlar**, **çözümler** ve **hangi dosyada hangi kod** değiştiği açıklanmaktadır.

---

## 1. SHOW TILL (Till Off olan ürünler Till’de görünüyor)

### Sorun
Web’de Products sayfasında bir ürünün Till’i Off yapılsa bile, telefonda Till ekranında hâlâ görünüyor.

### Kök neden
`ProductRepository.getCategoriesWithProductsForOrder()` fonksiyonu **`getActiveProductsByCategoryOnce`** kullanıyordu. Bu sorgu sadece `active = 1` ile filtreliyordu, **`showInTill`** (pos_enabled) kontrolü yoktu.

### Veri akışı
1. **Web** → Products → Till Off → `pos_enabled: false` backend’e kaydedilir
2. **Backend** → `GET /api/products` → `pos_enabled: 0` veya `false` döner
3. **App sync** → `ApiSyncRepository.syncProducts()` → `showInTill = (posEnabled != 0)` ile `ProductEntity` oluşturulur
4. **App UI** → `getCategoriesWithProductsForOrder()` → Ürün listesi alınır

### Çözüm

**Dosya:** `app/src/main/java/com/limonpos/app/data/repository/ProductRepository.kt`

**Değişiklik:** `getActiveProductsByCategoryOnce` yerine `getProductsForTillByCategoryOnce` kullanıldı.

```kotlin
// ÖNCE (YANLIŞ):
val withProducts = categories.map { cat ->
    cat to productDao.getActiveProductsByCategoryOnce(cat.id)  // showInTill filtresi YOK
}
val otherProducts = productDao.getActiveProductsByCategoryOnce("all")

// SONRA (DOĞRU):
val withProducts = categories.map { cat ->
    cat to productDao.getProductsForTillByCategoryOnce(cat.id)  // showInTill = 1 filtresi VAR
}
val otherProducts = productDao.getProductsForTillByCategoryOnce("all")
```

**İlgili DAO:** `app/src/main/java/com/limonpos/app/data/local/dao/ProductDao.kt`

```kotlin
// getActiveProductsByCategoryOnce - showInTill filtresi YOK (eski, yanlış)
@Query("SELECT * FROM products WHERE categoryId = :categoryId AND active = 1 ORDER BY name")

// getProductsForTillByCategoryOnce - showInTill = 1 filtresi VAR (doğru)
@Query("SELECT * FROM products WHERE categoryId = :categoryId AND active = 1 AND showInTill = 1 ORDER BY name")
```

**Sync tarafı:** `app/src/main/java/com/limonpos/app/data/repository/ApiSyncRepository.kt` (satır 653-676)

```kotlin
val showInTill = when (dto.posEnabled) {
    is Boolean -> dto.posEnabled
    is Number -> (dto.posEnabled as Number).toInt() != 0
    else -> true
}
ProductEntity(..., showInTill = showInTill, ...)
```

### Hâlâ çalışmıyorsa kontrol edilecekler
- **Yeni APK kuruldu mu?** Eski APK’da bu değişiklik yok.
- **Sync yapıldı mı?** Web’de Till Off yaptıktan sonra telefonda Sync (yenile) gerekli.
- **Backend doğru mu?** `GET /api/products` cevabında `pos_enabled: 0` gelmeli.

---

## 2. MODIFIER SEÇİMİ (Modifier seçilmiyor / çalışmıyor)

### Sorun
Modifier’lı ürüne tıklanınca modifier seçim ekranı açılıyor ama seçim yapılamıyor veya Add’e basınca eklenmiyor.

### Kök nedenler
1. **Checkbox + Row clickable çakışması:** Hem Row’un `clickable`’ı hem Checkbox’ın `onCheckedChange`’i aynı tıklamada tetikleniyordu; seçim iki kez değişip iptal oluyordu.
2. **Modifier grupları sync edilmiyordu:** `syncCatalog()` içinde `syncModifierGroups()` yoktu; manuel sync’te modifier grupları gelmiyordu.
3. **Boş modifier listesi:** Gruplar boşsa kullanıcıya bilgi verilmiyordu.

### Veri akışı
1. **Web** → Products → Modifier Groups atanır → `modifier_groups: ["mod1", "mod2"]`
2. **Web** → Modifiers sayfası → Gruplar ve seçenekler tanımlanır
3. **App sync** → `syncModifierGroups()` → `modifier_groups` ve `modifier_options` tabloları doldurulur
4. **App** → Ürüne tıklanınca `addProduct()` → `parseModifierGroupIds()` → modifier varsa `AddProductModifiersDialog` açılır
5. **Dialog** → `getModifierGroupsForProduct()` → `ModifierGroupDao` + `ModifierOptionDao` ile gruplar ve seçenekler alınır

### Çözümler

#### 2a. Checkbox ve Row clickable – ikisi de kullanılıyor

**Dosya:** `app/src/main/java/com/limonpos/app/ui/screens/order/OrderScreen.kt` (satır 862-888)

```kotlin
Row(
    modifier = Modifier.fillMaxWidth().clickable { /* toggle logic */ },
    ...
) {
    Checkbox(
        checked = opt.id in selectedOptions,
        onCheckedChange = { checked ->
            val set = selectedOptions.toMutableSet()
            if (checked) {
                if (gwo.group.maxSelect == 1) set.removeAll(gwo.options.map { it.id })
                set.add(opt.id)
            } else set.remove(opt.id)
            selectedOptions = set
        }
    )
    Text("${opt.name} (+${CurrencyUtils.format(opt.price)})", ...)
}
```

Hem satıra hem checkbox’a tıklanınca seçim güncelleniyor.

#### 2b. syncCatalog’a modifier sync eklendi

**Dosya:** `app/src/main/java/com/limonpos/app/data/repository/ApiSyncRepository.kt`

```kotlin
// ÖNCE:
suspend fun syncCatalog(): Boolean {
    ...
    syncCategories()
    syncProducts()
    syncPrinters()
    syncUsers()
    ...
}

// SONRA:
suspend fun syncCatalog(): Boolean {
    ...
    syncCategories()
    syncProducts()
    syncModifierGroups()   // EKLENDI
    syncPrinters()
    syncUsers()
    ...
}
```

#### 2c. Boş modifier durumunda mesaj

**Dosya:** `app/src/main/java/com/limonpos/app/ui/screens/order/OrderScreen.kt` (satır 854-859)

```kotlin
if (loading) {
    Text("Yükleniyor...", color = LimonTextSecondary)
} else if (groups.isEmpty()) {
    Text("Modifier grubu bulunamadı. Sync yapıp tekrar deneyin.", ...)
}
```

### Hâlâ çalışmıyorsa kontrol edilecekler
- **Web’de modifier atandı mı?** Products → ürün düzenle → Modifier Groups seçili olmalı.
- **Modifiers sayfasında grup ve seçenek var mı?** Modifiers → grup + options tanımlı olmalı.
- **Sync yapıldı mı?** Order ekranında Sync butonu veya uygulama açılışında sync çalışmalı.
- **`product.modifierGroups` formatı:** `["mod1"]` gibi JSON array olmalı; `parseModifierGroupIds()` bunu parse eder.

---

## 3. OVERDUE BİLDİRİMİ (Masaya gitmedi uyarısı gelmiyor)

### Sorun
Ürünler mutfağa gönderildikten sonra belirlenen süre geçtiğinde uyarı/dialog/bildirim gelmiyor.

### Kök nedenler
1. **Overdue kontrolü sadece Order/FloorPlan ekranındayken çalışıyordu:** Başka ekranda veya uygulama arka plandayken kontrol yapılmıyordu.
2. **`showOverdueNotification` hiç çağrılmıyordu:** Kod vardı ama tetiklenmiyordu.
3. **Android 13+ bildirim izni:** `POST_NOTIFICATIONS` runtime’da istenmiyordu.
4. **Kilit ekranında görünmüyordu:** Full-screen intent ve lock screen ayarları eksikti.

### Veri akışı
1. **Web** → Settings → Genel → "Masaya gitmeyen ürün uyarı süresi" (dakika)
2. **App** → `ApiSyncRepository.getOverdueUndeliveredMinutes()` → API’den ayar alınır
3. **App** → `OrderRepository.getOverdueUndelivered(minutes)` → `sentAt` dolu, `deliveredAt` boş ve süre aşan item’lar bulunur
4. **App** → `OverdueWarningHolder.update(list)` → global state güncellenir
5. **App** → `NavGraph` → `overdue.collect` → `showOverdueNotification()` çağrılır

### Çözümler

#### 3a. Uygulama genelinde overdue kontrolü

**Dosya:** `app/src/main/java/com/limonpos/app/LimonPOSApp.kt` (satır 39-51)

```kotlin
private fun startOverdueCheckLoop() {
    applicationScope.launch {
        apiSyncRepository.clearOverdueMinutesCache()
        while (true) {
            try {
                val minutes = apiSyncRepository.getOverdueUndeliveredMinutes()
                val list = orderRepository.getOverdueUndelivered(minutes)
                overdueWarningHolder.update(if (list.isNotEmpty()) list else null)
            } catch (_: Exception) { /* ignore */ }
            kotlinx.coroutines.delay(30 * 1000L)  // Her 30 saniyede bir
        }
    }
}
```

`Application` sürekli çalıştığı için kontrol her ekranda ve arka planda da devam eder.

#### 3b. Bildirim tetikleyicisi

**Dosya:** `app/src/main/java/com/limonpos/app/ui/navigation/NavGraph.kt` (satır 118-125)

```kotlin
LaunchedEffect(Unit) {
    overdueWarningHolder.overdue.collect { list ->
        if (!list.isNullOrEmpty()) {
            showOverdueNotification(context, list)
        }
    }
}
```

`overdue` dolduğunda `showOverdueNotification` çağrılıyor.

#### 3c. Bildirim izni (Android 13+)

**Dosya:** `app/src/main/java/com/limonpos/app/MainActivity.kt` (satır 30-39)

```kotlin
private val requestNotificationPermission = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
) { /* granted or denied */ }

override fun onCreate(savedInstanceState: Bundle?) {
    ...
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    ...
}
```

**Manifest:** `app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

#### 3d. Kilit ekranında gösterme

**Dosya:** `app/src/main/AndroidManifest.xml`

```xml
<activity
    android:name=".MainActivity"
    android:showWhenLocked="true"
    android:turnScreenOn="true"
    ...>
```

**Dosya:** `app/src/main/java/com/limonpos/app/util/OverdueNotificationHelper.kt`

- `lockscreenVisibility = Notification.VISIBILITY_PUBLIC`
- `setFullScreenIntent(fullScreenIntent, true)`
- Alarm sesi ve titreşim

#### 3e. Overdue mantığı

**Dosya:** `app/src/main/java/com/limonpos/app/data/repository/OrderRepository.kt` (satır 157-185)

```kotlin
suspend fun getOverdueUndelivered(defaultMinutes: Int): List<OverdueUndelivered> {
    val orders = orderDao.getOpenAndSentOrders()
    ...
    for (order in orders) {
        ...
        val overdue = items.filter { item ->
            if (item.sentAt == null || item.deliveredAt != null) return@filter false
            val minutes = (product?.overdueUndeliveredMinutes ?: category?.overdueUndeliveredMinutes ?: defaultMinutes).coerceIn(1, 1440)
            val cutoff = now - minutes * 60 * 1000L
            item.sentAt < cutoff
        }
        ...
    }
}
```

**Koşullar:**
- `item.sentAt != null` (Mutfağa Gönder yapılmış)
- `item.deliveredAt == null` (Delivered işaretlenmemiş)
- `item.sentAt < (now - minutes)` (süre aşılmış)

### Hâlâ çalışmıyorsa kontrol edilecekler
- **Mutfağa Gönder:** Sipariş eklenip "Send to Kitchen" yapılmış olmalı.
- **Bildirim izni:** İlk açılışta "İzin ver" seçilmeli (Android 13+).
- **Ayarlar:** Web’de Settings → Genel → süre 1–1440 dakika aralığında olmalı.
- **Backend:** `GET /api/settings` → `overdue_undelivered_minutes` dönmeli.

---

## Özet tablo

| Özellik      | Sorun                                      | Çözüm dosyası                                      | Değişen kod / fonksiyon                          |
|-------------|---------------------------------------------|----------------------------------------------------|--------------------------------------------------|
| Show Till   | Till Off ürünler Till’de görünüyor          | `ProductRepository.kt`                              | `getActiveProductsByCategoryOnce` → `getProductsForTillByCategoryOnce` |
| Modifier    | Seçim çalışmıyor / boş                      | `OrderScreen.kt`, `ApiSyncRepository.kt`           | Checkbox handler, `syncModifierGroups` ekleme, boş durum mesajı |
| Overdue     | Uyarı/bildirim gelmiyor                     | `LimonPOSApp.kt`, `NavGraph.kt`, `MainActivity.kt`, `OverdueNotificationHelper.kt`, `AndroidManifest.xml` | `startOverdueCheckLoop`, `overdue.collect`, bildirim izni, lock screen |

---

## Kritik: Yeni APK kurulumu

Tüm bu değişiklikler **yeni build** içinde. Eski APK ile çalışmaz.

```bash
cd c:\Users\Dell\LimonPOS
.\gradlew assembleDebug
```

APK: `app\build\outputs\apk\debug\app-debug.apk`

Versiyon: `versionCode = 2`, `versionName = "1.1"` (Ayarlar → Uygulama bilgisi ile kontrol edilebilir)
