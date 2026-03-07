# Overdue warning fix — Dosya bazlı özet

## Hangi dosyada ne değişti

| Dosya | Değişiklik |
|-------|------------|
| **OrderRepository.kt** | `getOverdueUndelivered()` → `getOverdueUndelivered(settingsDefaultMinutes: Int)`. Dakika: product ?: category ?: settingsDefaultMinutes, sonra coerceIn(1, 1440). sentAt==null ve deliveredAt!=null dışlanıyor. |
| **ApiSyncRepository.kt** | `AppSettingsPreferences` inject. `getOverdueUndeliveredMinutes(): Int` ve `clearOverdueMinutesCache()` eklendi. API başarılıysa DataStore’a yazıp döndürüyor; offline/hata’da DataStore’dan okuyor. Hardcoded 10 yok. |
| **LimonPOSApp.kt** | Overdue loop: `clearOverdueMinutesCache()` sonra `defaultMinutes = getOverdueUndeliveredMinutes()`, `list = getOverdueUndelivered(defaultMinutes)`, `overdueWarningHolder.update(list, defaultMinutes)`. |
| **AppSettingsPreferences.kt** | (Yeni) DataStore key `overdue_undelivered_default_minutes`, default 10, 1..1440. |
| **OverdueWarningHolder.kt** | `update(list, defaultMinutes)` ile `lastUsedDefaultMinutes` saklanıyor; notification’da kullanılıyor. |
| **SettingsViewModel.kt** | Overdue default dakika state + save. |
| **SettingsScreen.kt** | Overdue bölümü: input + Save default minutes. |
| **OverdueNotificationHelper.kt** | `configuredMinutes` parametresi; İngilizce metin; intent’te `open_table_id`. |
| **NavGraph.kt** | Bildirime tıklanınca `open_table_id` ile ilgili masanın sipariş ekranına gidiliyor. |

---

## OrderRepository — getOverdueUndelivered: kodda olan son hali

**Dosya:** `app/src/main/java/com/limonpos/app/data/repository/OrderRepository.kt` (satır 192–225)

```kotlin
    /**
     * Items sent to kitchen but not delivered, past their due time.
     * Minutes: product.overdueUndeliveredMinutes ?: category.overdueUndeliveredMinutes ?: settingsDefaultMinutes, then coerceIn(1, 1440).
     * Excludes sentAt == null and deliveredAt != null.
     */
    suspend fun getOverdueUndelivered(settingsDefaultMinutes: Int): List<OverdueUndelivered> {
        val orders = orderDao.getOpenAndSentOrders()
        val result = mutableListOf<OverdueUndelivered>()
        val now = System.currentTimeMillis()
        for (order in orders) {
            if (order.status == "paid" || order.status == "closed") continue
            val table = tableRepository.getTableById(order.tableId)
            if (table == null || table.status == "free") continue
            if (table.currentOrderId == null || table.currentOrderId != order.id) continue
            val totalPaid = paymentDao.getPaymentsSumByOrder(order.id)
            if (totalPaid >= order.total - 0.01) continue
            val items = orderItemDao.getOrderItems(order.id).first()
            val overdue = items.filter { item ->
                if (item.sentAt == null) return@filter false
                if (item.deliveredAt != null) return@filter false
                val product = productDao.getProductById(item.productId)
                val category = product?.categoryId?.let { categoryDao.getCategoryById(it) }
                val minutes = (product?.overdueUndeliveredMinutes
                    ?: category?.overdueUndeliveredMinutes
                    ?: settingsDefaultMinutes).coerceIn(1, 1440)
                val cutoff = now - minutes * 60 * 1000L
                item.sentAt < cutoff
            }
            if (overdue.isNotEmpty()) {
                result.add(OverdueUndelivered(tableNumber = order.tableNumber, tableId = order.tableId, orderId = order.id, items = overdue))
            }
        }
        return result
    }
```

- **İmza:** `suspend fun getOverdueUndelivered(settingsDefaultMinutes: Int): List<OverdueUndelivered>`
- **Dakika:** product ?: category ?: settingsDefaultMinutes, sonra coerceIn(1, 1440)
- **Category lookup:** `product?.categoryId?.let { categoryDao.getCategoryById(it) }`
- **Dışlanan:** sentAt == null; deliveredAt != null

---

## LimonPOSApp — overdue check loop çağrı mantığı

```kotlin
private fun startOverdueCheckLoop() {
    applicationScope.launch {
        apiSyncRepository.clearOverdueMinutesCache()
        while (true) {
            try {
                val defaultMinutes = apiSyncRepository.getOverdueUndeliveredMinutes()
                val list = orderRepository.getOverdueUndelivered(defaultMinutes)
                // ...
                overdueWarningHolder.update(if (list.isNotEmpty()) list else null, defaultMinutes)
            } catch (e: Exception) { ... }
            kotlinx.coroutines.delay(15 * 1000L)
        }
    }
}
```

- `defaultMinutes` = ApiSyncRepository’den (DataStore/API).
- `list` = OrderRepository’den, `settingsDefaultMinutes = defaultMinutes` ile.
- Settings’te kaydedilen değer → AppSettingsPreferences → `getOverdueUndeliveredMinutes()` → `getOverdueUndelivered(defaultMinutes)` ile overdue hesabına girer.

---

## ApiSyncRepository — getOverdueUndeliveredMinutes() son hali

- **Yer:** `ApiSyncRepository` sınıfı, `isOnline()` sonrası.
- **Bağımlılık:** `AppSettingsPreferences` constructor’da inject.
- **Cache:** `cachedOverdueMinutes`, `cachedOverdueMinutesAt`, `OVERDUE_CACHE_MS = 15_000`.
- **clearOverdueMinutesCache():** `cachedOverdueMinutes = null`.
- **getOverdueUndeliveredMinutes():**
  1. Cache geçerliyse (15 sn içinde) cache değerini döndür.
  2. Online ise: `apiService.getSettings()`; başarılı ve body varsa: `minutes = (body.overdueUndeliveredMinutes ?: appSettingsPreferences.getOverdueUndeliveredDefaultMinutes()).coerceIn(1, 1440)`; bunu DataStore’a yaz, cache’le, döndür.
  3. Online değilse veya API hata: `appSettingsPreferences.getOverdueUndeliveredDefaultMinutes()` döndür, cache’le.
- **Hardcoded 10 yok;** sadece DataStore default (AppSettingsPreferences.DEFAULT_MINUTES = 10) kullanılıyor.

---

## Senin ortamında görmüyorsan

1. Projeyi senkron et / pull et; Clean & Rebuild.
2. Şunları ara:
   - `OrderRepository.kt` içinde `getOverdueUndelivered(settingsDefaultMinutes` ve `category?.overdueUndeliveredMinutes`.
   - `ApiSyncRepository.kt` içinde `getOverdueUndeliveredMinutes` ve `appSettingsPreferences`.
   - `LimonPOSApp.kt` içinde `getOverdueUndeliveredMinutes()` ve `getOverdueUndelivered(defaultMinutes)`.
3. Eğer hâlâ eski imza (`getOverdueUndelivered()` parametresiz) veya “Sadece product…” yorumu görüyorsan, bu dosyalar başka bir branch’ta veya revert edilmiş olabilir; yukarıdaki mantığı bu özetteki gibi uygulayabilirsin.
