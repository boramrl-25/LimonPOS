# Overdue Warning Fix — Verification & Applied Changes

## Verification Results

| Item | Status |
|------|--------|
| AppSettingsPreferences.kt | **Was missing** — created |
| SettingsViewModel overdue state + save | **Was missing** — added |
| SettingsScreen overdue input + Save UI | **Was missing** — added |
| ApiSyncRepository using settings default | **Was missing** — getOverdueUndeliveredMinutes() + DataStore added |
| OrderRepository fallback (product > category > settings) | **Was wrong** — only product was used; now full fallback |
| LimonPOSApp passing default minutes | **Was missing** — now calls getOverdueUndeliveredMinutes() and getOverdueUndelivered(minutes) |
| Notification: English, configured minutes, tap → cart | **Updated** — text uses configured minutes; intent opens first table’s cart |

---

## What Was Actually Missing

1. **AppSettingsPreferences.kt**  
   File did not exist. There was no DataStore key for `overdue_undelivered_default_minutes`.

2. **SettingsViewModel**  
   No injection of `AppSettingsPreferences`, no state for overdue default minutes input/save/error, no save function.

3. **SettingsScreen**  
   No “Products not delivered to table warning” section, no number input, no Save button. Only notification permission and POS actions were present.

4. **ApiSyncRepository**  
   No `getOverdueUndeliveredMinutes()` and no `clearOverdueMinutesCache()`. No use of `AppSettingsPreferences` or API settings for overdue minutes.

5. **OrderRepository.getOverdueUndelivered()**  
   Had no parameter; used only `product.overdueUndeliveredMinutes` and excluded items without it (`return@filter false`). Category and global default were not used.

6. **LimonPOSApp**  
   Called `orderRepository.getOverdueUndelivered()` with no arguments. Did not obtain default minutes from anywhere.

7. **Notification**  
   Did not show the configured duration; tap did not open the relevant cart (no `open_table_id` intent).

---

## Applied Fix Now

### 1) AppSettingsPreferences.kt (new)

- **Path:** `app/src/main/java/com/limonpos/app/data/prefs/AppSettingsPreferences.kt`
- DataStore key: `overdue_undelivered_default_minutes` (Int, default 10, range 1..1440).
- API: `overdueUndeliveredDefaultMinutesFlow: Flow<Int>`, `getOverdueUndeliveredDefaultMinutes()`, `setOverdueUndeliveredDefaultMinutes(value)`.

### 2) Hilt / DI

- `AppSettingsPreferences` is `@Inject` constructor; no extra module (same pattern as other prefs).

### 3) SettingsViewModel

- Injects `AppSettingsPreferences`.
- State: `overdueDefaultMinutesFromPrefs`, `overdueDefaultMinutesInput`, `isSavingOverdueDefault`, `overdueDefaultError`, `overdueDefaultSavedMessage`.
- `loadOverdueDefaultIntoInput(current)` syncs input from prefs.
- `saveOverdueDefaultMinutes()`: parse input, validate 1..1440, write to prefs, call `apiSyncRepository.clearOverdueMinutesCache()`, set success/error.

### 4) SettingsScreen

- Section “Products not delivered to table warning” with description: “Default warning time in minutes when product/category override is not set (1–1440).”
- Number `OutlinedTextField` bound to `overdueDefaultMinutesInput`.
- “Save default minutes” button; error and “Saved” message shown.
- `LaunchedEffect(overdueFromPrefs)` loads prefs value into input when needed.

### 5) ApiSyncRepository

- Injects `AppSettingsPreferences`.
- `getOverdueUndeliveredMinutes()`: if online, calls `apiService.getSettings()`, uses `body?.overdueUndeliveredMinutes` or prefs value, coerces 1..1440, writes to DataStore, caches and returns. If offline/error, returns prefs value (no hardcoded 10).
- `clearOverdueMinutesCache()` clears cache so next call refetches.

### 6) OrderRepository

- `getOverdueUndelivered(settingsDefaultMinutes: Int)`.
- Per item: `minutes = (product?.overdueUndeliveredMinutes ?: category?.overdueUndeliveredMinutes ?: settingsDefaultMinutes).coerceIn(1, 1440)`.
- Delivered items still excluded (`item.deliveredAt != null`).

### 7) LimonPOSApp

- `startOverdueCheckLoop()`: calls `apiSyncRepository.clearOverdueMinutesCache()` once at start; then in loop gets `defaultMinutes = apiSyncRepository.getOverdueUndeliveredMinutes()`, then `orderRepository.getOverdueUndelivered(defaultMinutes)` and `overdueWarningHolder.update(list, defaultMinutes)`.

### 8) OverdueWarningHolder

- `update(list, defaultMinutes)` stores `lastUsedDefaultMinutes`.
- `getLastUsedDefaultMinutes()` used by notification to show configured duration.

### 9) Notification (English, duration, tap → cart)

- `showOverdueNotification(context, list, configuredMinutes: Int)`.
- String: `notification_overdue_text` = “Items not delivered within %1$d minutes. Tables: %2$s. Tap to open.” (English, no fixed “10 dk”).
- Intent: `putExtra("open_table_id", firstTableId)`.
- NavGraph: when `open_table_id` is present, navigate to FLOOR_PLAN then to `Routes.order(tableId)` so tap opens the relevant cart and Back returns to floor plan.

### 10) Repeated alerts

- Existing logic kept: `OverdueWarningHolder.shouldShowNotification(list)` (2 min cooldown), and in-app sound is 3 beeps then stop (no infinite loop).

---

## Files Changed

| File | Change |
|------|--------|
| `app/.../data/prefs/AppSettingsPreferences.kt` | **New** |
| `app/.../data/remote/dto/SettingsDto.kt` | Added `overdueUndeliveredMinutes` |
| `app/.../data/repository/ApiSyncRepository.kt` | Injected `AppSettingsPreferences`; added `getOverdueUndeliveredMinutes()`, `clearOverdueMinutesCache()` |
| `app/.../data/repository/OrderRepository.kt` | `getOverdueUndelivered(settingsDefaultMinutes)`; product ?: category ?: settings |
| `app/.../data/repository/OverdueWarningHolder.kt` | `update(list, defaultMinutes)`, `getLastUsedDefaultMinutes()` |
| `app/.../ui/screens/settings/SettingsViewModel.kt` | `AppSettingsPreferences`; overdue state and save |
| `app/.../ui/screens/settings/SettingsScreen.kt` | Overdue section: input + Save + messages |
| `app/.../LimonPOSApp.kt` | Loop uses getOverdueUndeliveredMinutes() and passes defaultMinutes to repo and holder |
| `app/.../util/OverdueNotificationHelper.kt` | `configuredMinutes` param; English text; intent `open_table_id` |
| `app/.../res/values/strings.xml` | `notification_overdue_text` with %1$d minutes, %2$s tables |
| `app/.../ui/navigation/NavGraph.kt` | Pass minutes to notification; handle `open_table_id` → navigate to order(tableId) |

---

## How Settings Default Flows End-to-End

1. **Storage:** DataStore key `overdue_undelivered_default_minutes` (default 10).
2. **Settings screen:** User edits number and taps “Save default minutes” → ViewModel calls `appSettingsPreferences.setOverdueUndeliveredDefaultMinutes(value)` and `apiSyncRepository.clearOverdueMinutesCache()`.
3. **Overdue loop (LimonPOSApp):** Every ~15 s, `getOverdueUndeliveredMinutes()` runs: if online, API value is read and written to DataStore; if offline/error, value is read from DataStore. That value is passed to `getOverdueUndelivered(defaultMinutes)` and to `overdueWarningHolder.update(list, defaultMinutes)`.
4. **Per item:** In `OrderRepository.getOverdueUndelivered(settingsDefaultMinutes)`, each item uses `product?.overdueUndeliveredMinutes ?: category?.overdueUndeliveredMinutes ?: settingsDefaultMinutes` (then coerceIn(1, 1440)). Delivered items are excluded.

---

## Resolution Order (product > category > settings)

- **Product** override: if `product.overdueUndeliveredMinutes` in 1..1440, use it.
- **Category** override: else if `category.overdueUndeliveredMinutes` in 1..1440, use it.
- **Settings default:** else use `settingsDefaultMinutes` (from DataStore/API), coerceIn(1, 1440).
- Delivered items (`deliveredAt != null`) are never included in overdue.

---

## How To Test

1. **Settings default**  
   Open Settings → “Products not delivered to table warning” → set e.g. 2 minutes → Save. Confirm “Saved” and value persists after reopening Settings.

2. **Overdue list**  
   Create an order, send to kitchen, do not mark items delivered. Wait longer than the configured default (and longer than any product/category override). Confirm overdue dialog and notification appear.

3. **Notification text**  
   Check notification body: “Items not delivered within **X** minutes. Tables: …” with X = your configured value (no fixed “10 dk”).

4. **Tap notification**  
   Tap the notification → app opens to the cart (Order screen) for the first overdue table. Back goes to Floor Plan.

5. **Delivered**  
   Mark an item as delivered → it disappears from overdue list and no longer triggers warning for that item.

6. **Cooldown**  
   Same overdue set should not trigger notification again within 2 minutes; in-app sound plays 3 beeps then stops.

7. **Offline**  
   Turn off network; change default in Settings and save. Overdue check should use the new value from DataStore (no hardcoded 10).

---

## Risks / Notes

- **Backend:** `GET /api/settings` should return `overdue_undelivered_minutes` (number). If it does not, the app uses the value already in DataStore (or 10 when never set).
- **Notification from background:** If the app is brought to front by tapping the notification and the activity is reused, `onNewIntent` may need to be handled in MainActivity to read `open_table_id` again; current implementation covers the “app was not running” case.
- Build: `./gradlew :app:compileDebugKotlin` succeeds.
