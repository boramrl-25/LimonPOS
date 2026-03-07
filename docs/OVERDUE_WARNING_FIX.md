# Products not delivered to table warning – Fix Report

## Problem

1. **Global default minutes had no single source of truth on device**  
   Default “overdue undelivered” minutes came only from API (`getSettings()`). On offline or API error the app used a hardcoded `10` in several places in `ApiSyncRepository`. There was no DataStore/Preferences key, and the Android Settings screen had no field for this value, so:
   - Offline: always 10
   - No way for the user to set or see the value on device
   - API and “fallback” were not one consistent source

2. **Repeated alerts**  
   - **Notification:** `NavGraph` called `showOverdueNotification(context, list)` on every `overdue` emission (every ~15s when list non-empty), so the same notification was effectively re-triggered every 15 seconds.  
   - **Sound:** `FloorPlanScreen` and `OrderScreen` used `LaunchedEffect(overdueWarning)` with `while (true) { tone; delay(1500) }`, so the alarm looped forever until the user dismissed the dialog. After dismiss, the next overdue cycle could show the same items again and restart the loop. There was no cooldown or “already announced” tracking.

3. **Fallback order**  
   Repository fallback order was already correct: product → category → default. The main issue was the source and management of the default, not the order.

---

## Intended Logic

- **Resolution order:** product-level `overdueUndeliveredMinutes` → category-level → **global default** (single source of truth).  
- **Global default:** Stored in DataStore (e.g. `overdue_undelivered_default_minutes`). Editable from Settings; when online, API can update it so web and device stay in sync; when offline/error, use stored value (or 10 if never set).  
- **Delivered:** Items with `deliveredAt != null` are excluded from overdue.  
- **Alerts:** Written (dialog + notification) and sound once per “batch”; same set of items does not re-trigger notification/sound within a short cooldown (e.g. 2 minutes).

---

## Review of Your Comment

| Your point | Assessment |
|------------|------------|
| “Repository içinde temel fallback mantığı büyük ihtimalle zaten var.” | **Doğru.** `OrderRepository.getOverdueUndelivered(defaultMinutes)` zaten `product?.overdueUndeliveredMinutes ?: category?.overdueUndeliveredMinutes ?: defaultMinutes` kullanıyor. |
| “Asıl problem fallback sırasının yanlış olması değil, global default minutes kaynağının sağlıklı yönetilmemesi olabilir.” | **Doğru.** Default sadece API + hardcoded 10 idi; cihazda kalıcı tek kaynak yoktu. |
| “Settings -> viewmodel -> persistence -> overdue warning akışı tek source of truth ile bağlı değilse…” | **Doğru.** Android’de bu ayar için ne Settings ekranı ne de persistence vardı; akış sadece API + 10 idi. |
| “Product/category override alanları DB’de olabilir ama settings tarafındaki default değer sağlam bağlı değilse mantık pratikte bozulur.” | **Doğru.** Product/category DB’de (sync ile geliyor); default ise sadece API/10 olduğu için offline veya API hatalarında tutarsızlık riski vardı. |
| “Delivered işaretleme, overdue filtreleme ve sesli/yazılı uyarı tekrar kontrolü de sorunlu olabilir.” | **Kısmen.** Delivered işaretleme ve overdue filtreleme doğruydu (`deliveredAt != null` hariç tutuluyor). Sorunlu olan: bildirim her 15 sn’de tekrar tetikleniyordu, ses ise sonsuz döngüde çalışıyordu; tekrar kontrolü yoktu. |

**Eksik/yanlış görülen nokta:** Yok. Yorumun kök nedene (default kaynağı + tekrar uyarı) uygun.

---

## Actual Root Cause

1. **Global default:** Cihazda `overdue_undelivered_default_minutes` için tek kaynak yoktu; sadece API + dağınık hardcoded 10 kullanılıyordu.  
2. **Tekrarlayan uyarılar:**  
   - Bildirim: `overdue` her emit’te (≈15 sn) tetikleniyordu, aynı liste için cooldown yoktu.  
   - Ses: Aynı liste için `while (true)` ile sürekli çalıyordu; cooldown veya “bir kez çal then dur” mantığı yoktu.

---

## Applied Fix

1. **AppSettingsPreferences (DataStore)**  
   - Key: `overdue_undelivered_default_minutes` (Int).  
   - Varsayılan: 10; sınır: 1..1440.  
   - `getOverdueUndeliveredDefaultMinutes()`, `setOverdueUndeliveredDefaultMinutes()`, API’den gelen değeri yazmak için `setOverdueUndeliveredDefaultMinutesFromApi()`.

2. **ApiSyncRepository.getOverdueUndeliveredMinutes()**  
   - Online + API başarılı: API’den dakikayı al, 1..1440 ile sınırla, DataStore’a yaz (setOverdueUndeliveredDefaultMinutesFromApi), cache’le, döndür.  
   - Offline veya API hata: DataStore’dan oku (`getOverdueUndeliveredDefaultMinutes()`); hiç yazılmamışsa 10 döner.  
   - Tüm sabit 10 kullanımları kaldırıldı; tek kaynak DataStore (API sadece günceller).

3. **Settings ekranı + ViewModel**  
   - “Products not delivered to table warning” bölümü: 1–1440 dakika input + “Save default minutes”.  
   - SettingsViewModel: `appSettingsPreferences` ile okuma/yazma, `setOverdueUndeliveredDefaultMinutes()` ve `clearOverdueMinutesCache()` çağrısı.

4. **OverdueWarningHolder**  
   - `lastNotifiedItemIds`, `lastNotifiedAt`, 2 dakika cooldown.  
   - `shouldShowNotification(list)`: Aynı item set’i ve cooldown içindeyse false; değilse true döndürüp state güncellenir.

5. **NavGraph**  
   - Bildirim sadece `overdueWarningHolder.shouldShowNotification(list)` true ise gösterilir.

6. **FloorPlanScreen & OrderScreen**  
   - Overdue sesi: `while (true)` kaldırıldı; 3 kez beep + 500 ms aralık, sonra dur.

---

## Files Changed

| File | Change |
|------|--------|
| `app/.../data/prefs/AppSettingsPreferences.kt` | **New.** DataStore ile `overdue_undelivered_default_minutes` (get/set, 1..1440, default 10). |
| `app/.../data/repository/ApiSyncRepository.kt` | `AppSettingsPreferences` inject; `getOverdueUndeliveredMinutes()` DataStore + API, hardcoded 10 kaldırıldı. |
| `app/.../ui/screens/settings/SettingsViewModel.kt` | `AppSettingsPreferences` inject; `overdueUndeliveredDefaultMinutes` StateFlow, `setOverdueUndeliveredDefaultMinutes()`. |
| `app/.../ui/screens/settings/SettingsScreen.kt` | “Products not delivered to table warning” kartı: dakika input + Save. |
| `app/.../data/repository/OverdueWarningHolder.kt` | `lastNotifiedItemIds`, `lastNotifiedAt`, 2 dk cooldown, `shouldShowNotification(list)`. |
| `app/.../ui/navigation/NavGraph.kt` | Bildirim sadece `shouldShowNotification(list)` true ise. |
| `app/.../ui/screens/floorplan/FloorPlanScreen.kt` | Overdue sesi: 3 beep sonra dur. |
| `app/.../ui/screens/order/OrderScreen.kt` | Aynı ses düzeltmesi. |

---

## Resolution Order (product > category > settings)

- `OrderRepository.getOverdueUndelivered(defaultMinutes)` içinde:  
  `(product?.overdueUndeliveredMinutes ?: category?.overdueUndeliveredMinutes ?: defaultMinutes).coerceIn(1, 1440)`.  
- `defaultMinutes` artık `ApiSyncRepository.getOverdueUndeliveredMinutes()` üzerinden gelir; o da DataStore (ve gerekiyorsa API) tek kaynağı kullanır.  
- Product/category null/blank = inherit (üst seviyeye geçer); sayı varsa override.

---

## How Delivered Marking Works

- Garson ürün satırına tıklayınca `OrderViewModel.markItemDelivered(item.id)` → `OrderRepository.markItemDelivered(itemId)` → `orderItemDao.markDelivered(itemId, now)` ile `deliveredAt` set edilir.  
- `getOverdueUndelivered` içinde `if (item.deliveredAt != null) return@filter false` ile delivered item’lar overdue listesine girmez.  
- Sync tarafında `deliveredAt` korunur / backend’e push edilir (mevcut mantık aynı).

---

## How Warning Timing Works

- Her ~15 sn `LimonPOSApp.startOverdueCheckLoop()`:  
  `minutes = apiSyncRepository.getOverdueUndeliveredMinutes()` (DataStore/API tek kaynak) → `orderRepository.getOverdueUndelivered(minutes)` → `overdueWarningHolder.update(list)`.  
- Dakika çözümlemesi: her item için product → category → default (yukarıdaki resolution order).

---

## How Repeated Alerts Are Prevented

- **Bildirim:** `NavGraph` içinde `overdue.collect` → `if (!list.isNullOrEmpty() && overdueWarningHolder.shouldShowNotification(list))` → `showOverdueNotification(...)`. Aynı item set’i için 2 dakika içinde tekrar `shouldShowNotification` false döner.  
- **Ses:** Overdue dialog gösterildiğinde 3 beep sonra LaunchedEffect biter; sonsuz döngü yok. Aynı liste tekrar görünse bile ses sadece 3 beep (cooldown bildirim tarafında ayrıca sınırlıyor).

---

## Risks / Notes

- **İlk kurulum:** DataStore’da key yokken default 10 kullanılır; ilk başarılı API `getSettings()` sonrası değer yazılır.  
- **Web + cihaz:** Web’den değiştirilen “overdue undelivered minutes” bir sonraki online `getOverdueUndeliveredMinutes()` çağrısında cihaz DataStore’una yazılır; cihazda Settings’ten de değiştirilebilir (son yazan geçerli).  
- **Migration:** Sadece yeni DataStore key; mevcut DB/order verisi değişmedi.  
- Build: `./gradlew :app:compileDebugKotlin` başarılı.
