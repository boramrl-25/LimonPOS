/**
 * Tüm satış verilerini siler: orders, order_items, payments, void_logs, void_requests
 * Masaları da sıfırlar (status: free, current_order_id: null)
 *
 * PostgreSQL (Prisma) kullanır - LowDB/data.json değil.
 * Kullanım: node clear-sales.js
 */

import * as store from "./lib/store.js";

await store.ensurePrismaReady();
await store.clearSales();
console.log("Tüm satış verileri silindi. Masalar sıfırlandı.");
