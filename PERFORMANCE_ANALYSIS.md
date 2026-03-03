# LimonPOS - Senior Android Performance Engineering Report

## Executive Summary

Bu rapor, LimonPOS Android Kotlin/Compose POS uygulamasının performans analizini içerir. Tespit edilen sorunlar öncelik sırasına göre listelenmiş, her biri için çözüm önerisi ve implementasyon detayı sunulmuştur.

---

## 1. Main Thread Blocking (KRİTİK)

### 1.1 KdsServer - runBlocking Kullanımı

**Sorun:** NanoHTTPD request handler içinde `runBlocking` kullanılıyor. Her HTTP isteği thread'i bloke ediyor.

**Dosya:** `app/src/main/java/com/limonpos/app/service/KdsServer.kt`

**Etki:** 
- Tüm HTTP işlemleri sıralı çalışıyor
- Eşzamanlı isteklerde timeout riski
- Database/network çağrıları blocking

**Eski Kod (Satır ~124-143):**
```kotlin
val orders = runBlocking {
    orderDao.getOrdersSentToKitchen().first().mapNotNull { order ->
        val allItems = orderItemDao.getOrderItems(order.id).first()
        // ... productDao.getProductById(item.productId) N+1 problemi
    }
}
```

**Öneri:** 
- `runBlocking` yerine `GlobalScope.launch(Dispatchers.IO)` veya `CoroutineScope(Dispatchers.IO).async` kullan
- Response'u `CompletableDeferred` veya callback ile döndür
- Alternatif: NanoHTTPD'nin AsyncRunner ile async handler kullan

**Performans Kazancı:** HTTP throughput %50-200 artabilir, timeout riski azalır.

---

## 2. Database Performance (YÜKSEK)

### 2.1 Eksik Room İndeksleri

**Sorun:** Sık filtreleme/sıralama yapılan kolonlarda index yok. Full table scan riski.

| Entity | Sorgu | Önerilen Index |
|--------|-------|----------------|
| OrderEntity | tableId, status | `@Index(["tableId", "status"])` |
| OrderEntity | status, paidAt | `@Index(["status", "paidAt"])` |
| OrderItemEntity | orderId | `@Index(["orderId"])` |
| ProductEntity | categoryId, active | `@Index(["categoryId", "active"])` |
| TableEntity | floor, status | `@Index(["floor", "status"])` |
| SyncQueueEntity | status, createdAt | `@Index(["status", "createdAt"])` |

**Performans Kazancı:** Sorgu süreleri %30-70 azalabilir (özellikle büyük tablolarda).

### 2.2 N+1 Query - KdsServer /kitchen-orders

**Sorun:** Her order için `getOrderItems`, her item için `getProductById` çağrılıyor.

**Eski Davranış:**
```
1 order query + N order_items queries + M product queries (M = toplam item sayısı)
```

**Öneri:**
- Tüm product ID'leri topla, tek `getProductsByIds(List<String>)` ile batch fetch
- Veya OrderRepository'e `getKitchenOrdersWithItemsAndProducts()` tek sorgu/relation ekle

**Performans Kazancı:** 10 sipariş, 50 item → ~61 sorgu yerine 3-4 sorgu.

---

## 3. Compose / LazyList Optimizasyonları (ORTA)

### 3.1 UsersScreen - Eksik Key

**Dosya:** `app/src/main/java/com/limonpos/app/ui/screens/users/UsersScreen.kt:79`

**Eski Kod:**
```kotlin
items(users) { user ->
    UserCard(...)
}
```

**Yeni Kod:**
```kotlin
items(users, key = { it.id }) { user ->
    UserCard(...)
}
```

**Neden:** Compose item identity için key kullanır. Key olmadan liste değişince gereksiz recomposition.

### 3.2 ProductsScreen - O(n) Category Lookup

**Dosya:** `app/src/main/java/com/limonpos/app/ui/screens/products/ProductsScreen.kt:92`

**Eski Kod:**
```kotlin
items(products, key = { it.id }) { product ->
    val categoryName = categories.find { it.id == product.categoryId }?.name ?: "-"
    ProductCard(..., categoryName = categoryName, ...)
}
```

**Sorun:** Her product için `categories.find` O(n). 100 ürün, 20 kategori = 2000 karşılaştırma.

**Yeni Kod:**
```kotlin
val categoryMap = remember(categories) { categories.associateBy { it.id } }
items(products, key = { it.id }) { product ->
    val categoryName = categoryMap[product.categoryId]?.name ?: "-"
    ProductCard(...)
}
```

**Performans Kazancı:** O(n*m) → O(n+m). Büyük listelerde belirgin fark.

---

## 4. Memory & Context (İYİ DURUMDA)

- ApplicationContext kullanımı doğru
- Static referans hatası yok
- NetworkMonitor callback lifecycle ile temizleniyor

---

## 5. Architecture (MEVCUT DURUM)

- **MVVM:** ViewModels kullanılıyor ✓
- **Repository Pattern:** Data layer ayrı ✓
- **Dependency Injection:** Hilt ✓
- **Single Activity:** Compose Navigation ✓

Mimari genel olarak iyi. KdsServer'ın Repository/DAO'ya direkt erişimi yerine Service/Repository katmanı eklenebilir.

---

## 6. Network Layer (İYİ DURUMDA)

- OkHttp timeout: 30 saniye ✓
- RetryInterceptor: 3 retry, connection/timeout/5xx ✓
- retryOnConnectionFailure(true) ✓

---

## 7. Build & APK

- **ProGuard:** `isMinifyEnabled = false` - production'da aktif edilmeli
- **Dependencies:** Gereksiz dependency görünmüyor
- **material-icons-extended:** Tüm ikonları içerir. Sadece kullanılanları `material-icons-core` ile değiştirilebilir (APK ~500KB küçülme)

---

## Öncelik Matrisi

| Öncelik | Aksiyon | Etki | Zorluk |
|---------|---------|------|--------|
| P0 | KdsServer runBlocking → async | Kritik | Orta |
| P0 | Room indeksleri ekle | Yüksek | Kolay |
| P1 | KdsServer N+1 düzelt | Yüksek | Orta |
| P1 | ProductsScreen categoryMap | Orta | Kolay |
| P2 | UsersScreen key ekle | Orta | Kolay |
| P2 | ProGuard aktif et (release) | Orta | Kolay |
