/**
 * Tüm satış verilerini siler: orders, order_items, payments, void_logs, void_requests
 * Masaları da sıfırlar (status: free, current_order_id: null)
 *
 * Kullanım: node clear-sales.js
 */

import { db } from "./db.js";

await db.read();

// Satış verilerini temizle
db.data.orders = [];
db.data.order_items = [];
db.data.payments = [];
db.data.void_logs = [];
db.data.void_requests = [];

// Masaları sıfırla
if (db.data.tables && Array.isArray(db.data.tables)) {
  db.data.tables = db.data.tables.map((t) => ({
    ...t,
    status: "free",
    current_order_id: null,
    guest_count: 0,
    waiter_id: null,
    waiter_name: null,
    opened_at: null,
  }));
}

await db.write();
console.log("Tüm satış verileri silindi. Masalar sıfırlandı.");
