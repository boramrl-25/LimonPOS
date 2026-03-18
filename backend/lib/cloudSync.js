/**
 * LimonPOS — Cloud Sync Module
 * ============================================================
 * Hibrit mimarinin senkronizasyon katmanı.
 *
 * Yön 1 — AŞAĞI (Katalog): Cloud → Local
 *   Ürünler, kategoriler, modifier'lar, yazıcılar, ödeme
 *   yöntemleri ve ayarlar Hetzner'den çekilerek yerel DB'ye
 *   upsert edilir.
 *
 * Yön 2 — YUKARI (Satışlar): Local → Cloud
 *   Ödeme tamamlanan (status="paid") ve henüz cloud'a
 *   gönderilmemiş siparişler (cloudSyncedAt=null) Hetzner'e
 *   iletilir; başarılı olunca cloudSyncedAt doldurulur.
 *
 * Ortam Değişkenleri:
 *   ROLE=local              → sync loop başlar (local backend'de)
 *   CLOUD_API_URL=https://api.the-limon.com/api
 *   CLOUD_SYNC_KEY=gizli_anahtar   → her iki backendde aynı
 *   CATALOG_SYNC_MS=300000  → katalog çekme aralığı (ms, varsayılan 5dk)
 *   SALES_PUSH_MS=30000     → satış gönderme aralığı (ms, varsayılan 30s)
 * ============================================================
 */

import fetch from "node-fetch";
import * as store from "./store.js";
import { prisma } from "./prisma.js";

// ── Config ──────────────────────────────────────────────────
const CLOUD_API_URL      = (process.env.CLOUD_API_URL || "").replace(/\/+$/, "");
const CLOUD_SYNC_KEY     = process.env.CLOUD_SYNC_KEY  || "";
const CATALOG_SYNC_MS    = parseInt(process.env.CATALOG_SYNC_MS,    10) || 5 * 60 * 1000;
const SALES_PUSH_MS      = parseInt(process.env.SALES_PUSH_MS,      10) || 30 * 1000;
const LIVE_ORDERS_PUSH_MS = parseInt(process.env.LIVE_ORDERS_PUSH_MS, 10) || 10 * 1000;
const FETCH_TIMEOUT      = 15_000; // ms

function syncHeaders() {
  return { "Content-Type": "application/json", "X-Sync-Key": CLOUD_SYNC_KEY };
}

function isConfigured() {
  if (!CLOUD_API_URL)  { console.warn("[CloudSync] CLOUD_API_URL tanımlı değil"); return false; }
  if (!CLOUD_SYNC_KEY) { console.warn("[CloudSync] CLOUD_SYNC_KEY tanımlı değil"); return false; }
  return true;
}

// node-fetch v3 kendi AbortController kullanır; timeout wrapper
async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── 1. Katalog: Cloud → Local ────────────────────────────────

/**
 * Cloud'dan tüm katalog verisini çek, yerel DB'ye upsert et.
 */
export async function pullCatalogFromCloud() {
  if (!isConfigured()) return { ok: false, reason: "not_configured" };

  let resp;
  try {
    resp = await fetchWithTimeout(`${CLOUD_API_URL}/sync/catalog-snapshot`, {
      headers: syncHeaders(),
    });
  } catch (err) {
    console.warn("[CloudSync] pullCatalogFromCloud ağ hatası:", err.message);
    return { ok: false, reason: "network", error: err.message };
  }

  if (!resp.ok) {
    console.warn("[CloudSync] pullCatalogFromCloud HTTP", resp.status);
    return { ok: false, reason: "http", status: resp.status };
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    return { ok: false, reason: "parse", error: err.message };
  }

  const {
    categories      = [],
    products        = [],
    modifierGroups  = [],
    printers        = [],
    paymentMethods  = [],
    users           = [],
    tables          = [],
    settings,
  } = data;

  // Kategoriler
  for (const c of categories) {
    const { id, createdAt, updatedAt, products: _p, ...rest } = c;
    await prisma.category.upsert({ where: { id }, create: { id, ...rest }, update: rest }).catch(() => {});
  }

  // Ürünler
  for (const p of products) {
    const { id, createdAt, updatedAt, orderItems, category, ...rest } = p;
    await prisma.product.upsert({ where: { id }, create: { id, ...rest }, update: rest }).catch(() => {});
  }

  // Modifier grupları
  for (const mg of modifierGroups) {
    const { id, createdAt, updatedAt, ...rest } = mg;
    await prisma.modifierGroup.upsert({ where: { id }, create: { id, ...rest }, update: rest }).catch(() => {});
  }

  // Yazıcılar
  for (const pr of printers) {
    const { id, createdAt, updatedAt, ...rest } = pr;
    await prisma.printer.upsert({ where: { id }, create: { id, ...rest }, update: rest }).catch(() => {});
  }

  // Ödeme yöntemleri
  for (const pm of paymentMethods) {
    const { id, createdAt, updatedAt, ...rest } = pm;
    await prisma.paymentMethod.upsert({ where: { id }, create: { id, ...rest }, update: rest }).catch(() => {});
  }

  // Kullanıcılar (PIN/roller dahil) — edge (local) auth için gerekir
  for (const u of users) {
    const { id, createdAt, updatedAt, ordersAsWaiter, payments, voidLogs, ...rest } = u;
    if (!id) continue;
    await prisma.user.upsert({ where: { id }, create: { id, ...rest }, update: rest }).catch(() => {});
  }

  // Masalar (floor plan) — cloud'dan local'e uygula
  for (const t of tables) {
    const { id, createdAt, updatedAt, orders, currentOrder, ...rest } = t;
    if (!id) continue;
    // status/current_order_id gibi canlı alanları güncelleme — sadece layout bilgisi
    const { status, current_order_id, guest_count, waiter_id, waiter_name, opened_at, ...layoutRest } = rest;
    await prisma.table.upsert({
      where: { id },
      create: { id, ...rest },
      update: layoutRest,
    }).catch(() => {});
  }

  // Ayarlar — sadece katalog/görünüm alanlarını güncelle
  if (settings) {
    const CATALOG_KEYS = [
      "company_name", "company_address", "receipt_header", "receipt_footer_message",
      "kitchen_header", "receipt_item_size", "currency_code", "vat_percent",
      "floor_plan_sections",
    ];
    const filtered = Object.fromEntries(
      Object.entries(settings).filter(([k]) => CATALOG_KEYS.includes(k))
    );
    if (Object.keys(filtered).length > 0) {
      await store.updateSettings(filtered).catch(() => {});
    }
  }

  console.log(
    `[CloudSync] ✓ Katalog çekildi: ${categories.length} kategori, ` +
    `${products.length} ürün, ${modifierGroups.length} modifier, ` +
    `${printers.length} yazıcı, ${tables.length} masa`
  );
  return { ok: true, categories: categories.length, products: products.length, users: users.length, tables: tables.length };
}

// ── 2. Satışlar: Local → Cloud ──────────────────────────────

/**
 * Henüz cloud'a gönderilmemiş ödeme tamamlı siparişleri gönder.
 */
export async function pushSalesToCloud() {
  if (!isConfigured()) return { ok: false, reason: "not_configured" };

  // cloudSyncedAt = null VE status = paid
  let unsyncedOrders;
  try {
    unsyncedOrders = await prisma.order.findMany({
      where: { status: "paid", cloudSyncedAt: null },
      include: {
        orderItems: { where: { deletedAt: null } },
        payments:   true,
      },
      take: 50, // batch boyutu
    });
  } catch (err) {
    console.warn("[CloudSync] pushSalesToCloud DB hatası:", err.message);
    return { ok: false, reason: "db", error: err.message };
  }

  if (unsyncedOrders.length === 0) return { ok: true, pushed: 0 };

  let resp;
  try {
    resp = await fetchWithTimeout(`${CLOUD_API_URL}/sync/receive-sales`, {
      method:  "POST",
      headers: syncHeaders(),
      body:    JSON.stringify({ orders: unsyncedOrders }),
      timeout: 20_000,
    });
  } catch (err) {
    console.warn("[CloudSync] pushSalesToCloud ağ hatası:", err.message);
    return { ok: false, reason: "network", error: err.message };
  }

  if (!resp.ok) {
    console.warn("[CloudSync] pushSalesToCloud HTTP", resp.status);
    return { ok: false, reason: "http", status: resp.status };
  }

  // Başarılı → cloudSyncedAt işaretle
  const now = new Date();
  const ids = unsyncedOrders.map((o) => o.id);
  await prisma.order.updateMany({ where: { id: { in: ids } }, data: { cloudSyncedAt: now } });

  console.log(`[CloudSync] ✓ ${unsyncedOrders.length} sipariş cloud'a gönderildi`);
  return { ok: true, pushed: unsyncedOrders.length };
}

// ── 2b. Canlı Siparişler: Local → Cloud ─────────────────────

/**
 * Açık/aktif siparişleri (status=open|sent) ve masa durumlarını cloud'a gönder.
 * Backoffice'in masa planı ve canlı sipariş ekranlarının gerçek zamanlı
 * çalışması için her ~10 saniyede bir çağrılır.
 */
export async function pushLiveOrdersToCloud() {
  if (!isConfigured()) return { ok: false, reason: "not_configured" };

  let liveOrders, tables;
  try {
    liveOrders = await prisma.order.findMany({
      where:   { status: { in: ["open", "sent"] }, deletedAt: null },
      include: { orderItems: { where: { deletedAt: null } }, payments: true },
    });
    tables = await prisma.table.findMany({ where: { deletedAt: null } });
  } catch (err) {
    console.warn("[CloudSync] pushLiveOrdersToCloud DB hatası:", err.message);
    return { ok: false, reason: "db", error: err.message };
  }

  let resp;
  try {
    resp = await fetchWithTimeout(`${CLOUD_API_URL}/sync/receive-live-orders`, {
      method:  "POST",
      headers: syncHeaders(),
      body:    JSON.stringify({ orders: liveOrders, tables }),
      timeout: 20_000,
    });
  } catch (err) {
    console.warn("[CloudSync] pushLiveOrdersToCloud ağ hatası:", err.message);
    return { ok: false, reason: "network", error: err.message };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.warn("[CloudSync] pushLiveOrdersToCloud HTTP", resp.status, text.slice(0, 200));
    return { ok: false, reason: "http", status: resp.status };
  }

  console.log(`[CloudSync] ✓ Canlı: ${liveOrders.length} açık sipariş, ${tables.length} masa cloud'a gönderildi`);
  return { ok: true, orders: liveOrders.length, tables: tables.length };
}

// ── 3. Sync Loop ────────────────────────────────────────────

let _catalogTimer    = null;
let _salesTimer      = null;
let _liveOrdersTimer = null;

/**
 * Periyodik sync döngüsünü başlat.
 * Yalnızca ROLE=local olan backend'de çağrılmalı.
 */
export function startSyncLoop() {
  if (!CLOUD_API_URL) {
    console.warn("[CloudSync] CLOUD_API_URL ayarlı değil — sync loop başlatılmadı");
    return;
  }
  console.log(
    `[CloudSync] Sync loop başladı » Katalog: ${CATALOG_SYNC_MS / 1000}s, ` +
    `Satışlar: ${SALES_PUSH_MS / 1000}s, ` +
    `Canlı siparişler: ${LIVE_ORDERS_PUSH_MS / 1000}s`
  );

  // İlk çalışma — DB tam hazır olsun diye kısa bekleme
  setTimeout(() => pullCatalogFromCloud().catch((e)    => console.error("[CloudSync] ilk katalog hatası:",         e.message)), 6_000);
  setTimeout(() => pushSalesToCloud().catch((e)        => console.error("[CloudSync] ilk satış hatası:",           e.message)), 10_000);
  setTimeout(() => pushLiveOrdersToCloud().catch((e)   => console.error("[CloudSync] ilk canlı sipariş hatası:",   e.message)), 8_000);

  _catalogTimer    = setInterval(() => pullCatalogFromCloud().catch((e)  => console.error("[CloudSync] katalog hatası:",         e.message)), CATALOG_SYNC_MS);
  _salesTimer      = setInterval(() => pushSalesToCloud().catch((e)      => console.error("[CloudSync] satış hatası:",           e.message)), SALES_PUSH_MS);
  _liveOrdersTimer = setInterval(() => pushLiveOrdersToCloud().catch((e) => console.error("[CloudSync] canlı sipariş hatası:",   e.message)), LIVE_ORDERS_PUSH_MS);
}

export function stopSyncLoop() {
  if (_catalogTimer)    { clearInterval(_catalogTimer);    _catalogTimer    = null; }
  if (_salesTimer)      { clearInterval(_salesTimer);      _salesTimer      = null; }
  if (_liveOrdersTimer) { clearInterval(_liveOrdersTimer); _liveOrdersTimer = null; }
}

/** Anlık katalog çekimi (force-pull endpoint'i tarafından çağrılır) */
export async function forcePull() {
  return pullCatalogFromCloud();
}

/** Son sync durumu — health/status endpoint'i için */
export function getSyncStatus() {
  return {
    role:              process.env.ROLE || "cloud",
    cloudApiUrl:       CLOUD_API_URL || null,
    syncConfigured:    isConfigured(),
    loopActive:        !!_catalogTimer,
    catalogSyncMs:     CATALOG_SYNC_MS,
    salesPushMs:       SALES_PUSH_MS,
    liveOrdersPushMs:  LIVE_ORDERS_PUSH_MS,
  };
}
