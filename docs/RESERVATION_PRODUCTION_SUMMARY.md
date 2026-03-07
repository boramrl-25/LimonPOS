# Table Reservation – Production-Grade Summary

## Problem

Masa rezervasyonu özelliği temel akışlara sahipti ancak production kullanımı için eksikler vardı:

1. Rezervasyon başlamadan 30 dakika önce uygulama uyarısı yoktu.
2. Masa dolu iken yaklaşan rezervasyon kullanıcıya gösterilmiyordu.
3. Müşteri kalkınca masa her zaman “free” oluyordu; rezervasyon penceresi devam ediyorsa “reserved” kalması gerekiyordu.
4. Rezervasyon iptalini her rol yapabiliyordu; sadece supervisor/manager yapabilmeli.
5. Aynı rezervasyon için tekrarlayan (spam) uyarı riski vardı.

---

## Current State in Code (Before Changes)

- **TableEntity**: `reservationGuestName`, `reservationGuestPhone`, `reservationFrom`, `reservationTo` alanları mevcut.
- **ApiService**: `reserveTable`, `cancelTableReservation` endpoint’leri tanımlı.
- **ApiSyncRepository**: `reserveTable`, `cancelTableReservation` çağrıları ve sync sonrası `syncTables()` kullanılıyor. Rezervasyon verisi sync ile tüm cihazlara geliyor (TableDto.reservation → TableEntity).
- **FloorPlanViewModel**: `reserveTable`, `cancelReservation`, `showReserveTableDialog`, `showReservationInfoDialog` akışları; `onTableClick` ile reserved masada info dialog açılıyor.
- **FloorPlanScreen**: `ReserveTableDialog`, `ReservationInfoDialog`, `TableCard` (free/occupied/bill/reserved), masa tıklanınca open/reserve/info/order yönlendirmesi.
- **TableRepository.closeTable**: Her zaman `status = "free"` yapıyordu.
- **AuthRepository**: `isSupervisorRole()` (admin, manager, supervisor) zaten var.

---

## Applied Reservation Logic

### 1. Reservation status helper (ReservationStatusHelper)

- **Dosya**: `app/src/main/java/com/limonpos/app/data/repository/ReservationStatusHelper.kt`
- **Fonksiyonlar**:
  - `isReservationUpcoming(table, nowMs, leadMinutes = 30)`: `reservationFrom - leadMinutes <= now < reservationTo` ve from/to null değilse true.
  - `isReservationActive(table, nowMs)`: `now in [reservationFrom, reservationTo)`; from/to null ise false.
  - `shouldReturnToReservedAfterClose(table, nowMs)`: Masa kapatılırken slot bitmemişse (`now < reservationTo`) true; from/to null ise false.
  - `reservationKey(table)`: Spam önleme için `"${tableId}_${reservationFrom}"`.

### 2. Close table → reserved or free (TableRepository)

- **Dosya**: `app/src/main/java/com/limonpos/app/data/repository/TableRepository.kt`
- **Mantık**: `closeTable(tableId)` içinde masa alınıyor; `ReservationStatusHelper.shouldReturnToReservedAfterClose(table, now)` true ise `status = "reserved"`, değilse `status = "free"`. Order alanları (currentOrderId, waiterId, vb.) her iki durumda da temizleniyor; rezervasyon alanları korunuyor.

### 3. 30 dakika kala uyarı (ReservationReminderHolder + LimonPOSApp)

- **ReservationReminderHolder** (`app/.../ReservationReminderHolder.kt`): `UpcomingReservationAlert` listesi tutar; `announcedKeys` (tableId_reservationFrom) ile aynı rezervasyon için tek bildirim.
- **LimonPOSApp**: `startReservationReminderLoop()` her 45 saniyede bir tüm masaları alır, `ReservationStatusHelper.isReservationUpcoming(it, now, 30)` ile filtreler, listeyi `ReservationReminderHolder.update(list)` ile günceller.
- **FloorPlanScreen**: `reservationUpcoming` state’ini izler; liste doluysa `ReservationUpcomingDialog` gösterir. `shouldPlayReservationNotification(list)` true ise (ilk kez bu rezervasyonlar için) kısa bip sesi çalınır; aynı rezervasyon tekrar bildirilmez.

### 4. Masa doluyken yaklaşan rezervasyon (Floor plan + Order)

- **Floor plan**: `TableCard` için `isOccupiedWithUpcomingReservation = (status occupied/bill) && isReservationUpcoming(table, now, 30)`. Bu masalar kırmızı border + “Reservation soon” + “Occupied” ile gösterilir; legend’a “Reservation soon” eklendi.
- **OrderScreen**: Masa `isReservationUpcoming(table, now, 30)` ise sipariş ekranında “Upcoming reservation at HH:mm – [Guest]” banner’ı gösterilir.
- **Close table dialog (Floor + Order)**: Kapatırken `shouldReturnToReservedAfterClose(table, now)` true ise “Table will remain reserved for the upcoming reservation.” metni gösterilir.

### 5. Sadece supervisor/manager rezervasyon iptali

- **FloorPlanViewModel.cancelReservation**: Önce `authRepository.isSupervisorRole()` kontrolü; false ise `reserveTableError = "Only supervisor or manager can cancel reservations."` set edilip API çağrılmıyor.
- **ApiSyncRepository.cancelTableReservation**: İlk satırda `if (!authRepository.isSupervisorRole()) return false`; UI bypass edilse bile iptal yapılmıyor.
- **ReservationInfoDialog**: `canCancelReservation` parametresi eklendi; sadece true iken “Cancel reservation” butonu gösteriliyor. Hata mesajı (waiter iptal denemesi) dialog içinde `error` ile gösteriliyor.

### 6. Sync ve close sonrası reserved state

- Rezervasyon verisi zaten API sync ile geliyor (mevcut `syncTables` / table mapping).
- Masa “reserved” yapıldıktan sonra sunucuya gidebilmesi için: `closeTable` (hem FloorPlanViewModel hem OrderViewModel.doCloseTable) sonrası `pushCloseTable(tableId)` + `pushTableStatesNow()` çağrılıyor; böylece local “reserved” state push ediliyor.

---

## Files Changed

| File | Change |
|------|--------|
| `app/.../ReservationStatusHelper.kt` | **New.** isReservationUpcoming, isReservationActive, shouldReturnToReservedAfterClose, reservationKey. |
| `app/.../ReservationReminderHolder.kt` | **New.** UpcomingReservationAlert, holder state, announcedKeys, shouldShowNotification. |
| `app/.../TableRepository.kt` | closeTable: shouldReturnToReservedAfterClose’a göre status = reserved \| free. |
| `app/.../ApiSyncRepository.kt` | AuthRepository inject; cancelTableReservation öncesi isSupervisorRole() kontrolü. |
| `app/.../LimonPOSApp.kt` | TableRepository, ReservationReminderHolder inject; startReservationReminderLoop() (45 sn). |
| `app/.../FloorPlanViewModel.kt` | ReservationReminderHolder inject; reservationUpcoming, canCancelReservation; cancelReservation’da role check; closeTable’da pushTableStatesNow(); dismissReservationReminder, shouldPlayReservationNotification. |
| `app/.../FloorPlanScreen.kt` | reservationUpcoming, canCancelReservation; ReservationUpcomingDialog + sound LaunchedEffect; TableCard isOccupiedWithUpcomingReservation; ReservationInfoDialog canCancelReservation + error; close dialog’da “will remain reserved”; legend “Reservation soon”. |
| `app/.../OrderScreen.kt` | ReservationStatusHelper import; upcoming reservation banner; close table dialog’da “will remain reserved”. |
| `app/.../OrderViewModel.kt` | doCloseTable içinde pushTableStatesNow() eklendi. |
| `app/.../PaymentViewModel.kt` | Ödeme tamamlanınca pushCloseTable sonrası pushTableStatesNow() (2 yerde). |

---

## Reminder Flow

1. **LimonPOSApp** her 45 sn: `tableRepository.getAllTables().first()` → `isReservationUpcoming(30)` ile filtrele → `UpcomingReservationAlert` listesi → `reservationReminderHolder.update(list)`.
2. **FloorPlanScreen** `reservationUpcoming` collect eder; liste doluysa:
   - `viewModel.shouldPlayReservationNotification(reservationUpcoming)` çağrılır; true ise (yeni rezervasyonlar, daha önce announce edilmemiş) kısa bip, sonra bu set için key’ler `announcedKeys`’e eklenir.
   - `ReservationUpcomingDialog` açılır (masa listesi, tap to go).
3. Aynı rezervasyon (aynı tableId + reservationFrom) bir kez announce edildikten sonra tekrar ses/bildirim tetiklenmez.

---

## Occupied Table With Upcoming Reservation Flow

1. Masa status’u “occupied” veya “bill” ve `isReservationUpcoming(table, now, 30)` true → **Floor plan**’da kırmızı çerçeve + “Reservation soon” + “Occupied”.
2. Bu masaya tıklanınca normal şekilde sipariş ekranına gidilir.
3. **OrderScreen**’de bu masa için “Upcoming reservation at HH:mm – [Guest]” banner’ı gösterilir.
4. Masa kapatılırken (Floor veya Order’daki close dialog) “Table will remain reserved for the upcoming reservation.” metni gösterilir; kapatma sonrası local (ve push ile sunucu) state “reserved” olur.

---

## Close Table → Reserved Flow

1. Kullanıcı “Close table” seçer (Floor plan veya Order).
2. `orderRepository.closeTableManually(tableId)` → order silinir, `tableRepository.closeTable(tableId)` çağrılır.
3. **TableRepository.closeTable**: `shouldReturnToReservedAfterClose(table, now)` true ise `status = "reserved"` (order alanları temizlenir, reservation alanları kalır), false ise `status = "free"`.
4. `apiSyncRepository.pushCloseTable(tableId)` → sunucuda masa/order kapatılır.
5. `apiSyncRepository.pushTableStatesNow()` → pending table state’ler (yeni “reserved” dahil) push edilir.

---

## Supervisor-Only Cancel Logic

1. **UI**: `canCancelReservation` = `authRepository.isSupervisorRole()` (ViewModel’de loadTables + init’te güncellenir). ReservationInfoDialog’da sadece `canCancelReservation == true` iken “Cancel reservation” butonu görünür.
2. **ViewModel**: `cancelReservation(tableId)` önce `isSupervisorRole()` kontrolü; false ise `reserveTableError = "Only supervisor or manager can cancel reservations."` set edilir, API çağrılmaz.
3. **Repository**: `ApiSyncRepository.cancelTableReservation(tableId)` ilk satırda `if (!authRepository.isSupervisorRole()) return false`; böylece UI dışından veya yetkisiz kullanıcı ile çağrılsa bile iptal yapılmaz.

---

## How To Test

1. **Rezervasyon 30 dk kala uyarı**: Web veya POS’tan yarın 17:00–17:30 için bir masa rezerve et. Cihaz saatini 16:30’a ayarla (veya 30 dk kala bir slot kullan). 45 sn içinde “Upcoming reservations (30 min)” dialog’u açılmalı; aynı rezervasyon için tekrar açıldığında ses tekrarlanmamalı.
2. **Masa dolu + yaklaşan rezervasyon**: Masa rezerveli ve 30 dk kala penceresinde olsun; masayı “Open table” ile doldur. Floor plan’da masa kırmızı çerçeve ve “Reservation soon” göstermeli. Masaya girince Order ekranında “Upcoming reservation at …” banner’ı görünmeli.
3. **Close → reserved**: Yukarıdaki senaryoda masayı kapat (Close table). Dialog’da “Table will remain reserved…” yazmalı. Kapatınca masa listede “reserved” olarak kalmalı; sync sonrası diğer cihazda da reserved görünmeli.
4. **Supervisor-only iptal**: Waiter ile giriş yap, reserved masaya tıkla → Reservation info dialog’da “Cancel reservation” butonu görünmemeli. Supervisor/manager ile giriş yap → buton görünmeli. Waiter rolü ile bir şekilde cancel çağrılırsa (ör. eski build) ViewModel/Repository “Only supervisor or manager…” hatası veya false dönmeli.
5. **Sync**: Web’den yeni rezervasyon veya iptal yap; uygulamada sync (pull) sonrası floor plan’ın güncel rezervasyonları göstermesi gerekir.
