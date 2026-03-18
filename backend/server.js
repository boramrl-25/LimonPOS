import "dotenv/config";
console.log("[startup] Node", process.version, "PORT=" + (process.env.PORT || "3002"), "DATA_DIR=" + (process.env.DATA_DIR || "(not set)"), "ROLE=" + (process.env.ROLE || "cloud"));
import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import * as store from "./lib/store.js";
import { pushToZohoBooks, getZohoItems, getZohoItemGroups, getZohoContacts, syncFromZoho } from "./zoho.js";
import { startSyncLoop, pullCatalogFromCloud, pushSalesToCloud, forcePull, getSyncStatus } from "./lib/cloudSync.js";
import { prisma } from "./lib/prisma.js";
import {
  getBusinessDayRange,
  getBusinessDayKey,
  isAfterWarningTime,
  isInAutoCloseWindow,
  getBusinessDayRangeForDate,
  getBusinessDayRangesForDateRange,
  parseTimeToMinutes,
} from "./businessDay.js";

/** Inlined: closed day key when in auto-close window (avoids export dependency). */
function getClosedBusinessDayKeyForAutoClose(nowUtc, openingTime, closingTime, offsetMinutes = 0) {
  const closeMin = parseTimeToMinutes(closingTime);
  const openMin = parseTimeToMinutes(openingTime);
  if (isNaN(closeMin) || isNaN(openMin)) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const offMs = (offsetMinutes || 0) * 60 * 1000;
  const localNow = nowUtc + offMs;
  const localDayStartMs = Math.floor(localNow / dayMs) * dayMs;
  const minutesSinceMidnight = Math.floor((((localNow % dayMs) + dayMs) % dayMs) / (60 * 1000));
  const isCrossMidnight = closeMin <= openMin;
  const isInGap = isCrossMidnight && minutesSinceMidnight >= closeMin && minutesSinceMidnight < openMin;
  const dayStartMs = isInGap ? localDayStartMs - dayMs : localDayStartMs;
  const d = new Date(dayStartMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
import { fetchReconciliationEmails, aggregateReconciliationByDate } from "./reconciliation.js";
import { sendCatalogUpdatedToDevices } from "./lib/fcm.js";
import { WebSocketServer } from "ws";

// Production: yakalanmamış hatalar loglansın
process.on("uncaughtException", (err) => {
  console.error("[CRASH] uncaughtException:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  setTimeout(() => process.exit(1), 1000); // log flush icin kisa bekle
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRASH] unhandledRejection:", reason);
  setTimeout(() => process.exit(1), 1000);
});

const app = express();
// PORT env'den alınır; 0.0.0.0 ile dış erişime açılır.
const PORT = Number(process.env.PORT) || 3002;

// CORS: allow all origins for reliability (pos.the-limon.com, vercel, etc.). Reflect request origin when present.
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  optionsSuccessStatus: 200,
}));
app.use(express.json());

const DEFAULT_SETUP = { id: "u1", name: "Setup", pin: "2222", role: "setup", active: 1, permissions: "[]", cash_drawer_permission: 0 };

/** Resolve payment method to cash/card from id, code or name. */
function resolvePaymentMethodCode(method, paymentMethods) {
  if (!method) return null;
  const m = String(method).toLowerCase().trim();
  if (m === "cash" || m === "card") return m;
  const list = paymentMethods || [];
  const byId = list.find((pm) => (pm.id || "").toLowerCase() === m);
  const byCode = list.find((pm) => (pm.code || "").toLowerCase() === m);
  const byName = list.find((pm) => (pm.name || "").toLowerCase() === m);
  const pm = byId || byCode || byName;
  if (pm && (pm.code || "").toLowerCase() === "cash") return "cash";
  if (pm && (pm.code || "").toLowerCase() === "card") return "card";
  return null;
}

async function ensurePrismaReady() {
  await store.ensurePrismaReady();
}

function userCanAccessSettings(user) {
  if (user?.can_access_settings != null) return !!user.can_access_settings;
  const perms = typeof user?.permissions === "string" ? JSON.parse(user.permissions || "[]") : (user?.permissions || []);
  return user?.role === "admin" || user?.role === "manager" || perms.includes("web_settings");
}

function userCanAccessAppSettings(user) {
  if (user?.can_access_app_settings != null) return !!user.can_access_app_settings;
  return user?.role === "admin" || user?.role === "manager" || user?.role === "kds";
}

/** True if we are in the auto-close window (after closing+grace, before opening). Used for: no handover at closing time. */
async function getIsInAutoCloseWindow() {
  const s = await store.getSettings();
  const opening = s.opening_time ?? "07:00";
  const closing = s.closing_time ?? "01:30";
  const grace = Math.min(60, Math.max(0, (s.grace_minutes ?? 0) | 0));
  const off = await store.offsetMin();
  return isInAutoCloseWindow(Date.now(), closing, opening, grace, off);
}

const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.slice(7);
  store.getUserByIdOrPin(token).then((user) => {
    if (!user || !user.active) return res.status(401).json({ error: "Unauthorized" });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: "Unauthorized" }));
};

/** Hibrit mimari audit: X-Device-Id, X-Source (app | local_backend) */
function getAuditFromRequest(req) {
  const deviceId = (req.headers["x-device-id"] || req.body?.device_id || "").trim() || null;
  const source = (req.headers["x-source"] || req.body?.source || "app").toLowerCase();
  return { deviceId, source: ["app", "local_backend"].includes(source) ? source : "app" };
}

// Health check (no auth)
app.get("/", (req, res) => {
  res.status(200).send("OK");
});
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "LimonPOS API", ts: Date.now() });
});

// Hibrit mimari: Force Update — Backoffice "Zorunlu Güncelle" (WebSocket + FCM)
app.post("/api/admin/broadcast-catalog-update", authMiddleware, async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Permission denied" });
  }
  broadcastRealtimeEvent({ type: "catalog_updated", ts: Date.now() });
  let fcmResult = { sent: 0, failed: 0 };
  try {
    await ensurePrismaReady();
    const devices = await store.getDevices();
    fcmResult = await sendCatalogUpdatedToDevices(devices);
    if (fcmResult.sent > 0) console.log("[broadcast] FCM catalog_updated sent to", fcmResult.sent, "devices");
  } catch (e) {
    console.error("[broadcast] FCM error:", e?.message || e);
  }
  console.log("[broadcast] catalog_updated — WebSocket + FCM");
  res.json({ ok: true, message: "catalog_updated broadcast sent", fcmSent: fcmResult.sent, fcmFailed: fcmResult.failed });
});

// Hibrit mimari: Gün sonu audit raporu
app.get("/api/admin/audit-report", authMiddleware, async (req, res) => {
  if (req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Permission denied" });
  }
  await ensurePrismaReady();
  const report = await store.runDailyAuditReport();
  res.json(report);
});

// Debug: Android'den gelen veriler DB'ye nasıl yansımış? Son N sipariş + item + payment.
// Sadece web panel token'ı ile erişilsin diye authMiddleware arkasına koyuyoruz.
app.get("/api/debug/android-latest", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const [orders, orderItems, payments, paymentMethods] = await Promise.all([
    store.getOrders(),
    store.getAllOrderItems(),
    store.getPayments(),
    store.getAllPaymentMethods(),
  ]);
  const sortedOrders = [...orders].sort((a, b) => {
    const ta = a.createdAt || a.created_at || 0;
    const tb = b.createdAt || b.created_at || 0;
    return (tb instanceof Date ? tb.getTime() : tb) - (ta instanceof Date ? ta.getTime() : ta);
  }).slice(0, limit);
  const paymentByOrder = payments.reduce((acc, p) => {
    (acc[p.order_id] ||= []).push(p);
    return acc;
  }, {});
  const resolveCode = (m) => resolvePaymentMethodCode(m, paymentMethods) || "cash";
  const result = sortedOrders.map((o) => {
    const items = orderItems.filter((it) => it.order_id === o.id);
    const pays = paymentByOrder[o.id] || [];
    return {
      id: o.id,
      table_id: o.table_id,
      table_number: o.table_number,
      status: o.status,
      subtotal: o.subtotal,
      tax_amount: o.tax_amount,
      discount_percent: o.discount_percent,
      discount_amount: o.discount_amount,
      total: o.total,
      created_at: o.created_at ?? o.createdAt ?? null,
      paid_at: o.paid_at ?? null,
      items: items.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.quantity,
        price: it.price,
        notes: it.notes,
        status: it.status,
        sent_at: it.sent_at,
        client_line_id: it.client_line_id,
      })),
      payments: pays.map((p) => ({
        id: p.id,
        amount: p.amount,
        raw_method: p.method,
        resolved_method: resolveCode(p.method),
        received_amount: p.received_amount,
        change_amount: p.change_amount,
        user_id: p.user_id,
        created_at: p.created_at ?? p.createdAt ?? null,
      })),
    };
  });
  res.json({ count: result.length, orders: result });
});

/** Delta Sync: Son 'since' ms'den sonra güncellenen varlıkları döner. Android sadece değişenleri çeker. */
app.get("/api/sync/delta", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const sinceRaw = parseInt(req.query.since, 10);
  if (isNaN(sinceRaw) || sinceRaw <= 0) {
    return res.status(400).json({ error: "invalid_since", message: "Query param 'since' (ms timestamp) required" });
  }
  const data = await store.getDeltaSyncData(sinceRaw);
  const cats = Object.fromEntries((await store.getAllCategories()).map((c) => [c.id, c.name]));
  const catById = Object.fromEntries((await store.getAllCategories()).map((c) => [c.id, c]));
  function toModifierIds(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => {
      if (typeof x === "string") return x.trim() || null;
      if (typeof x === "number") return String(x);
      return (x?.id ?? x?.Id)?.toString?.()?.trim() || null;
    }).filter(Boolean);
  }
  const products = (data.products || []).filter((p) => p.sellable !== false).map((r) => {
    let modIds = toModifierIds(JSON.parse(r.modifier_groups || "[]"));
    const cat = r.category_id ? catById[r.category_id] : null;
    if (cat && cat.modifier_groups) {
      const catIds = toModifierIds(JSON.parse(cat.modifier_groups || "[]"));
      modIds = [...new Set([...modIds, ...catIds])];
    }
    return {
      ...r,
      tax_rate: r.tax_rate ?? 0,
      pos_enabled: r.pos_enabled === 1 ? 1 : 0,
      category: cats[r.category_id] || "",
      printers: JSON.parse(r.printers || "[]"),
      modifier_groups: modIds,
      zoho_suggest_remove: !!r.zoho_suggest_remove,
    };
  });
  const tablesMapped = [];
  for (const r of data.tables || []) {
    const num = typeof r.number === "string" ? parseInt(r.number, 10) || 0 : r.number ?? 0;
    const out = {
      ...r,
      number: num,
      current_order_id: r.current_order_id || null,
      waiter_id: r.waiter_id || null,
      waiter_name: r.waiter_name || null,
    };
    const isFree = !r.current_order_id;
    const activeRes = isFree ? await getActiveReservationForTable(r.id) : null;
    if (activeRes) {
      out.status = "reserved";
      out.reservation = {
        id: activeRes.id,
        guest_name: activeRes.guest_name || "",
        guest_phone: activeRes.guest_phone || "",
        from_time: activeRes.from_time,
        to_time: activeRes.to_time,
      };
    }
    tablesMapped.push(out);
  }
  const modifierGroups = (data.modifierGroups || []).map((r) => ({ ...r, options: JSON.parse(r.options || "[]") }));
  res.json({
    delta: true,
    since: sinceRaw,
    categories: data.categories || [],
    products,
    tables: tablesMapped,
    modifier_groups: modifierGroups,
    printers: data.printers || [],
    users: data.users || [],
  });
});

/** Export tüm veriyi data.json formatında döner. Sadece admin/manager. */
app.get("/api/export", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "manager") {
    return res.status(403).json({ error: "Forbidden", message: "Sadece admin veya manager export yapabilir." });
  }
  await ensurePrismaReady();
  const toMs = (d) => (d instanceof Date ? d.getTime() : d);
  const [users, categories, printers, paymentMethods, modifierGroups, products, tables, orders, orderItems, payments, voidLogs, discountReqs, devices, settings, zohoConfig, floorSections] = await Promise.all([
    store.getAllUsers(),
    store.getAllCategories(),
    store.getPrinters(),
    store.getAllPaymentMethods(),
    store.getModifierGroups(),
    store.getAllProducts(),
    store.getTables(),
    store.getOrders(),
    store.getAllOrderItems(),
    store.getPayments(),
    store.getVoidLogs(),
    store.getDiscountRequests(),
    store.getDevices(),
    store.getSettings(),
    store.getZohoConfig(),
    store.getFloorPlanSections(),
  ]);
  const mapOrder = (o) => ({
    id: o.id, table_id: o.table_id, table_number: o.table_number, waiter_id: o.waiter_id, waiter_name: o.waiter_name,
    status: o.status, subtotal: o.subtotal, tax_amount: o.tax_amount, discount_percent: o.discount_percent, discount_amount: o.discount_amount,
    total: o.total, created_at: toMs(o.created_at), paid_at: toMs(o.paid_at), zoho_receipt_id: o.zoho_receipt_id,
  });
  const mapOrderItem = (oi) => ({
    id: oi.id, order_id: oi.order_id, product_id: oi.product_id, product_name: oi.product_name,
    quantity: oi.quantity, price: oi.price, notes: oi.notes, status: oi.status,
    sent_at: toMs(oi.sent_at), delivered_at: toMs(oi.delivered_at), client_line_id: oi.client_line_id,
  });
  const mapPayment = (p) => ({
    id: p.id, order_id: p.order_id, amount: p.amount, method: p.method,
    received_amount: p.received_amount, change_amount: p.change_amount, user_id: p.user_id, created_at: toMs(p.created_at),
  });
  const mapVoidLog = (v) => ({
    id: v.id, type: v.type, order_id: v.order_id, order_item_id: v.order_item_id,
    product_name: v.product_name, quantity: v.quantity, price: v.price, amount: v.amount,
    source_table_id: v.source_table_id, source_table_number: v.source_table_number,
    user_id: v.user_id, user_name: v.user_name, details: v.details, created_at: toMs(v.created_at),
  });
  const s = settings || {};
  const data = {
    users: users.map((u) => ({ id: u.id, name: u.name, pin: u.pin, role: u.role, active: u.active, permissions: u.permissions, cash_drawer_permission: u.cash_drawer_permission })),
    categories: categories.map((c) => ({ ...c })),
    printers: printers.map((p) => ({ ...p })),
    payment_methods: paymentMethods.map((pm) => ({ ...pm })),
    modifier_groups: modifierGroups.map((mg) => ({ ...mg })),
    products: products.map((p) => ({ ...p })),
    tables: tables.map((t) => ({ ...t })),
    orders: orders.map(mapOrder),
    order_items: orderItems.map(mapOrderItem),
    payments: payments.map(mapPayment),
    void_logs: voidLogs.map(mapVoidLog),
    discount_requests: (discountReqs || []).map((d) => (d.payload && typeof d.payload === "object" ? d.payload : {})),
    devices: Array.isArray(devices) ? devices : [],
    settings: s,
    floor_plan_sections: floorSections || {},
    setup_complete: s.setup_complete !== false,
    reconciliation_bank_settings: s.reconciliation_bank_settings ?? null,
    reconciliation_bank_accounts: s.reconciliation_bank_accounts ?? null,
    physical_cash_count_by_date: s.physical_cash_count_by_date ?? null,
    migrations: s.migrations ?? null,
    business_operation_log: s.business_operation_log ?? null,
    eod_logs: s.eod_logs ?? null,
    cash_drawer_opens: s.cash_drawer_opens ?? null,
    daily_cash_entries: s.daily_cash_entries ?? null,
    custom_roles: s.custom_roles ?? null,
    reconciliation_imports: s.reconciliation_imports ?? null,
    reconciliation_inbox_config: s.reconciliation_inbox_config ?? null,
    reconciliation_warnings: s.reconciliation_warnings ?? null,
    zoho_config: zohoConfig || {},
  };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=data.json");
  res.send(JSON.stringify(data, null, 2));
});

app.post("/api/auth/login", async (req, res) => {
  await ensurePrismaReady();
  const body = req.body || {};
  const pin = String(body.pin || "").trim();
  const deviceId = String(body.device_id || body.deviceId || "").trim();
  const user = await store.getUserByIdOrPin(pin);
  if (!user || !user.active) return res.status(401).json({ error: "Invalid PIN" });
  // Removed: single-device-per-user restriction — multiple devices can have same user logged in
  const perms = JSON.parse(user.permissions || "[]");
  const canAccessSettings = user.can_access_settings != null ? !!user.can_access_settings : (user.role === "admin" || user.role === "manager" || perms.includes("web_settings"));
  const canAccessAppSettings = userCanAccessAppSettings(user);
  res.json({
    user: { id: user.id, name: user.name, pin: user.pin, role: user.role, active: !!user.active, permissions: perms, cash_drawer_permission: !!user.cash_drawer_permission, can_access_settings: canAccessSettings, can_access_app_settings: canAccessAppSettings },
    token: user.id,
  });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const user = req.user;
  const perms = JSON.parse(user.permissions || "[]");
  const canAccessSettings = user.can_access_settings != null ? !!user.can_access_settings : (user.role === "admin" || user.role === "manager" || perms.includes("web_settings"));
  const canAccessAppSettings = userCanAccessAppSettings(user);
  res.json({
    id: user.id,
    name: user.name,
    role: user.role,
    permissions: perms,
    cash_drawer_permission: !!user.cash_drawer_permission,
    can_access_settings: canAccessSettings,
    can_access_app_settings: canAccessAppSettings,
  });
});

app.post("/api/auth/logout", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  res.json({ success: true });
});

app.post("/api/auth/verify-cash-drawer", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const pin = String((req.body || {}).pin || "").trim();
  const user = await store.getUserByIdOrPin(pin);
  if (!user || !user.active || !(user.cash_drawer_permission || user.role === "admin" || user.role === "manager")) return res.status(403).json({ success: false, message: "No permission" });
  await store.addCashDrawerOpen({
    id: uuid(),
    user_id: user.id,
    user_name: user.name || "—",
    opened_at: Date.now(),
  });
  res.json({ success: true, message: null });
});

// Setup (first-time wizard)
app.get("/api/setup/status", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const s = await store.getSettings();
  res.json({ setupComplete: s.setup_complete === true });
});

app.post("/api/setup/complete", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  await store.updateSettings({ setup_complete: true });
  res.json({ setupComplete: true });
});

/** Cihaz heartbeat: Android senkron sırasında çağırır; web "çevrimiçi" listesi için last_seen güncellenir. */
const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000; // 3 dakika içinde heartbeat alan cihaz çevrimiçi sayılır
app.post("/api/devices/heartbeat", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body || {};
  const deviceId = String(body.device_id || body.deviceId || "").trim();
  if (!deviceId) return res.status(400).json({ error: "device_id required" });
  const now = Date.now();
  const devices = await store.getDevices();
  const existing = devices.find((d) => d.id === deviceId);
  const device = {
    ...(existing || {}),
    id: deviceId,
    name: body.device_name || body.deviceName || existing?.name || "Android POS",
    app_version: body.app_version || body.appVersion || existing?.app_version || null,
    last_seen: now,
    user_id: req.user?.id || existing?.user_id || null,
  };
  if (body.fcm_token != null && String(body.fcm_token).trim()) {
    device.fcm_token = String(body.fcm_token).trim();
  }
  const seqRaw = body.local_sequence ?? body.sequence ?? body.localSequence ?? null;
  if (seqRaw != null) {
    const seq = Number(seqRaw) || 0;
    if (seq > 0) {
      const lastSeq = Number(existing?.last_sequence || 0);
      let status = device.status || existing?.status || "active";
      if (lastSeq > 0 && seq < lastSeq) {
        status = "suspicious";
        await store.appendSecurityEvent({
          id: uuid(),
          ts: now,
          type: "sequence_reset",
          severity: "critical",
          device_id: deviceId,
          user_id: req.user?.id || null,
          details: { last_sequence: lastSeq, new_sequence: seq },
        });
      } else if (lastSeq > 0 && seq > lastSeq + 1) {
        await store.appendSecurityEvent({
          id: uuid(),
          ts: now,
          type: "sequence_gap",
          severity: "warning",
          device_id: deviceId,
          user_id: req.user?.id || null,
          details: { last_sequence: lastSeq, new_sequence: seq },
        });
      }
      device.last_sequence = seq;
      device.status = status;
    }
  }
  if (existing && existing.clear_local_data_requested === true) {
    device.clear_local_data_requested = true;
  }
  await store.upsertDevice(deviceId, device);
  const clearRequested = !!(device.clear_local_data_requested);
  res.json({ ok: true, last_seen: now, clear_local_data_requested: clearRequested });
});

app.post("/api/devices/:id/request-clear-local-data", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied" });
  }
  const deviceId = req.params.id;
  const devices = await store.getDevices();
  if (!devices.some((d) => d.id === deviceId)) return res.status(404).json({ error: "Device not found" });
  await store.updateDeviceClearRequested(deviceId, true);
  res.json({ ok: true, message: "Clear request sent. Device will clear local sales data on next sync." });
});

app.post("/api/devices/ack-clear", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const deviceId = String(req.body?.device_id || req.body?.deviceId || "").trim();
  if (!deviceId) return res.status(400).json({ error: "device_id required" });
  await store.deleteDeviceClearRequested(deviceId);
  res.json({ ok: true });
});

app.get("/api/devices", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const now = Date.now();
  const devices = await store.getDevices();
  const list = devices.map((d) => ({
    id: d.id,
    name: d.name || "POS",
    app_version: d.app_version || null,
    last_seen: d.last_seen || 0,
    user_id: d.user_id || null,
    status: d.status || "active",
    last_sequence: d.last_sequence || 0,
    online: (now - (d.last_seen || 0)) <= HEARTBEAT_TIMEOUT_MS,
  }));
  res.json(list);
});

function generateActivationCode() {
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

app.get("/api/security/activation-codes", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied" });
  }
  const list = await store.listActivationCodes(100);
  res.json(list);
});

app.post("/api/security/activation-codes", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied" });
  }
  const expiresInMinutesRaw = parseInt(req.body?.expires_in_minutes, 10);
  const expiresInMinutes = isNaN(expiresInMinutesRaw) ? 1440 : Math.max(5, Math.min(7 * 24 * 60, expiresInMinutesRaw));
  const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
  let code;
  for (let i = 0; i < 5; i++) {
    code = generateActivationCode();
    const existing = await store.getActivationCodeByCode(code);
    if (!existing) break;
  }
  if (!code) return res.status(500).json({ error: "failed_to_generate_code" });
  const created = await store.createActivationCode(code, req.user?.id || null, expiresAt);
  res.status(201).json(created);
});

app.post("/api/devices/activate", async (req, res) => {
  await ensurePrismaReady();
  const body = req.body || {};
  const codeRaw = String(body.code || body.activation_code || "").trim();
  if (!codeRaw || codeRaw.length !== 10) {
    return res.status(400).json({ error: "invalid_code", message: "10-digit activation code required" });
  }
  const record = await store.getActivationCodeByCode(codeRaw);
  if (!record) {
    return res.status(404).json({ error: "not_found", message: "Activation code not found" });
  }
  if (record.usedAt) {
    return res.status(400).json({ error: "used", message: "Activation code already used" });
  }
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ error: "expired", message: "Activation code expired" });
  }
  const deviceId = String(body.device_id || body.deviceId || uuid()).trim();
  const deviceName = String(body.device_name || body.deviceName || "Android POS").slice(0, 100);
  const appVersion = body.app_version || body.appVersion || null;
  const now = Date.now();
  const existing = await store.getDeviceById(deviceId);
  const base = existing || {};
  const settings = await store.getSecuritySettings();
  const status = settings.require_device_approval ? "pending" : "active";
  const payload = {
    ...base,
    id: deviceId,
    name: deviceName || base.name || "Android POS",
    app_version: appVersion || base.app_version || null,
    last_seen: now,
    status,
  };
  await store.upsertDevice(deviceId, payload);
  await store.markActivationCodeUsed(record.id, deviceId);
  await store.appendSecurityEvent({
    id: uuid(),
    ts: now,
    type: "device_activated",
    severity: "info",
    device_id: deviceId,
    user_id: record.createdByUserId || null,
    details: { code: record.code, status },
  });
  res.json({ device_id: deviceId, status });
});

// Security: settings, events, device management
app.get("/api/security/settings", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied. Security settings require admin, manager, or web_settings." });
  }
  const s = await store.getSecuritySettings();
  res.json(s);
});

app.patch("/api/security/settings", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied. Security settings require admin, manager, or web_settings." });
  }
  const updates = {};
  if (typeof req.body.require_device_approval === "boolean") updates.require_device_approval = req.body.require_device_approval;
  if (typeof req.body.alert_sequence_drop === "boolean") updates.alert_sequence_drop = req.body.alert_sequence_drop;
  if (typeof req.body.webhook_url === "string") updates.webhook_url = req.body.webhook_url.slice(0, 500);
  if (Object.keys(updates).length > 0) {
    await store.updateSecuritySettings(updates);
  }
  const s = await store.getSecuritySettings();
  res.json(s);
});

app.get("/api/security/events", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied. Security events require admin, manager, or web_settings." });
  }
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const events = await store.getSecurityEvents(limit);
  res.json(events);
});

app.patch("/api/devices/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied" });
  }
  const deviceId = req.params.id;
  const existing = await store.getDeviceById(deviceId);
  if (!existing) return res.status(404).json({ error: "Device not found" });
  const updates = { ...existing };
  if (typeof req.body.name === "string" && req.body.name.trim()) {
    updates.name = req.body.name.trim().slice(0, 100);
  }
  if (typeof req.body.status === "string") {
    const st = req.body.status.toLowerCase();
    if (st === "active" || st === "blocked" || st === "pending") {
      updates.status = st;
    }
  }
  await store.upsertDevice(deviceId, updates);
  res.json(updates);
});

// Roles and permissions list (for Web user management – assign to users; App reads same keys from user.permissions)
const ROLES = [
  { id: "setup", label: "Setup", labelTr: "Setup (API URL only)" },
  { id: "admin", label: "Admin", labelTr: "Admin" },
  { id: "manager", label: "Manager", labelTr: "Manager" },
  { id: "supervisor", label: "Supervisor", labelTr: "Supervisor" },
  { id: "waiter", label: "Waiter", labelTr: "Waiter" },
  { id: "cashier", label: "Cashier", labelTr: "Cashier" },
  { id: "kds", label: "KDS", labelTr: "Kitchen Display" },
];
const PERMISSIONS = [
  { id: "view_all_orders", scope: "app", label: "View all orders", labelTr: "View all orders" },
  { id: "pre_void", scope: "app", label: "Pre-void (remove item before kitchen)", labelTr: "Pre-void (remove item before kitchen)" },
  { id: "post_void", scope: "app", label: "Post-void (remove item after kitchen)", labelTr: "Post-void (remove item after kitchen)" },
  { id: "table_transfer_void", scope: "app", label: "Table transfer", labelTr: "Table transfer" },
  { id: "closed_bill_access", scope: "app", label: "Closed bills (view/refund, approve)", labelTr: "Closed bills (view/refund, approve)" },
  { id: "kds_mode", scope: "app", label: "Kitchen Display (KDS)", labelTr: "Kitchen Display (KDS)" },
  { id: "web_dashboard", scope: "web", label: "Web: Dashboard", labelTr: "Web: Dashboard" },
  { id: "web_floorplan", scope: "web", label: "Web: Floor Plan", labelTr: "Web: Floor Plan" },
  { id: "web_products", scope: "web", label: "Web: Products", labelTr: "Web: Products" },
  { id: "web_modifiers", scope: "web", label: "Web: Modifiers", labelTr: "Web: Modifiers" },
  { id: "web_categories", scope: "web", label: "Web: Categories", labelTr: "Web: Categories" },
  { id: "web_printers", scope: "web", label: "Web: Printers", labelTr: "Web: Printers" },
  { id: "web_reports", scope: "web", label: "Web: Reports", labelTr: "Web: Reports" },
  { id: "web_settings", scope: "web", label: "Web: Settings", labelTr: "Web: Settings" },
  { id: "web_users", scope: "web", label: "Web: Users", labelTr: "Web: Users" },
  { id: "web_clear_test_data", scope: "web", label: "Web: Clear test data", labelTr: "Web: Clear test data" },
  { id: "web_void_approvals", scope: "web", label: "Web: Void approvals", labelTr: "Web: Void approvals" },
  { id: "web_closed_bill_approvals", scope: "web", label: "Web: Closed bill approvals", labelTr: "Web: Closed bill approvals" },
  { id: "web_approve_discount", scope: "web", label: "Web: Approve discount requests", labelTr: "Web: Approve discount requests" },
];

app.get("/api/permissions", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const customRoles = (await store.getCustomRoles()).map((r) => ({ ...r, isCustom: true }));
  const builtIn = ROLES.map((r) => ({ ...r, isCustom: false }));
  res.json({ roles: [...builtIn, ...customRoles], permissions: PERMISSIONS });
});

app.post("/api/roles", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body || {};
  const id = (body.id || "custom_" + (body.label || "role").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")).trim();
  if (!id) return res.status(400).json({ error: "id or label required" });
  const customRoles = await store.getCustomRoles();
  const allRoleIds = [...ROLES.map((r) => r.id), ...customRoles.map((r) => r.id)];
  if (allRoleIds.includes(id)) return res.status(400).json({ error: "Role id already exists" });
  const label = (body.label || id).trim();
  const labelTr = (body.labelTr || body.label || id).trim();
  const updated = [...customRoles, { id, label, labelTr }];
  await store.updateSettings({ custom_roles: updated });
  res.json({ id, label, labelTr });
});

app.delete("/api/roles/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  if (ROLES.some((r) => r.id === id)) return res.status(400).json({ error: "Cannot delete built-in role" });
  const customRoles = (await store.getCustomRoles()).filter((r) => r.id !== id);
  await store.updateSettings({ custom_roles: customRoles });
  res.status(204).send();
});

// Users
app.get("/api/users", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const users = await store.getAllUsers();
  res.json(users.map((r) => {
    const perms = JSON.parse(r.permissions || "[]");
    const canAccessSettings = r.can_access_settings != null ? !!r.can_access_settings : (r.role === "admin" || r.role === "manager" || perms.includes("web_settings"));
    const canAccessAppSettings = userCanAccessAppSettings(r);
    return {
      ...r,
      active: !!(r.active !== 0 && r.active !== false),
      permissions: perms,
      cash_drawer_permission: !!r.cash_drawer_permission,
      can_access_settings: canAccessSettings,
      can_access_app_settings: canAccessAppSettings,
    };
  }));
});

app.post("/api/users", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const id = req.body.id || uuid().slice(0, 8);
  const body = req.body;
  const canAccessSettings = body.can_access_settings !== false;
  const canAccessAppSettings = body.can_access_app_settings !== false;
  const user = await store.createUser({
    id, name: body.name || "User", pin: body.pin || "0000", role: body.role || "waiter",
    active: body.active !== false ? 1 : 0, permissions: JSON.stringify(body.permissions || []), cash_drawer_permission: body.cash_drawer_permission ? 1 : 0,
    can_access_settings: canAccessSettings,
    can_access_app_settings: canAccessAppSettings,
  });
  res.json({ ...user, permissions: JSON.parse(user.permissions || "[]"), cash_drawer_permission: !!user.cash_drawer_permission, can_access_settings: !!user.can_access_settings, can_access_app_settings: !!user.can_access_app_settings });
});

app.put("/api/users/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const body = req.body;
  try {
    const updateData = { name: body.name, pin: body.pin, role: body.role || "waiter", active: body.active !== false ? 1 : 0, permissions: JSON.stringify(body.permissions || []), cash_drawer_permission: body.cash_drawer_permission ? 1 : 0 };
    if (body.can_access_settings !== undefined) updateData.can_access_settings = !!body.can_access_settings;
    if (body.can_access_app_settings !== undefined) updateData.can_access_app_settings = !!body.can_access_app_settings;
    const user = await store.updateUser(id, updateData);
    res.json({ ...user, permissions: JSON.parse(user.permissions || "[]"), cash_drawer_permission: !!user.cash_drawer_permission, can_access_settings: !!user.can_access_settings, can_access_app_settings: !!user.can_access_app_settings });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.delete("/api/users/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  try {
    await store.deleteUser(req.params.id);
    res.status(204).send();
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

// Import users from Excel (parsed in frontend, sent as JSON)
app.post("/api/users/import", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { users: rawUsers } = req.body || {};
  if (!Array.isArray(rawUsers) || rawUsers.length === 0) {
    return res.status(400).json({ error: "users array required" });
  }
  const roleMap = { Admin: "admin", admin: "admin", Report: "cashier", report: "cashier", Manager: "manager", manager: "manager", Supervisor: "kds", supervisor: "kds", Waiter: "waiter", waiter: "waiter", Cashier: "cashier", cashier: "cashier", KDS: "kds", kds: "kds" };
  const created = [];
  for (const row of rawUsers) {
    const name = String(row.User || row.name || "").trim();
    if (!name) continue;
    const rawRole = String(row.role || row.Role || "waiter").trim();
    const role = roleMap[rawRole] || "waiter";
    const phone = String(row["Phone Number"] || row.phone || "").replace(/\D/g, "");
    const pin = phone.length >= 4 ? phone.slice(-4) : String(1000 + Math.floor(Math.random() * 9000));
    const id = "u_" + uuid().slice(0, 8);
    const user = await store.createUser({ id, name, pin, role, active: 1, permissions: "[]", cash_drawer_permission: role === "cashier" || role === "admin" ? 1 : 0 });
    created.push(user);
  }
  const users = await store.getAllUsers();
  res.json({ added: created.length, users });
});

// Categories — en az bir kategori don (app liste bos kalmasin); active olmayanlari da gonder, app filtreler
app.get("/api/categories", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  let cats = (await store.getAllCategories()).filter((c) => c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (cats.length === 0) cats = (await store.getAllCategories()).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json(cats.map((c) => ({
    ...c,
    show_till: c.show_till !== undefined && c.show_till !== null ? Number(c.show_till) : 0,
    modifier_groups: JSON.parse(c.modifier_groups || "[]"),
    printers: JSON.parse(c.printers || "[]"),
  })));
});

app.post("/api/categories", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const id = req.body.id || `cat_${uuid().slice(0, 8)}`;
  const body = req.body;
  const cat = await store.createCategory({
    id, name: body.name || "Category", color: body.color || "#84CC16", sort_order: body.sort_order ?? 0,
    active: body.active !== false ? 1 : 0, show_till: body.show_till ? 1 : 0,
    modifier_groups: JSON.stringify(body.modifier_groups || []), printers: JSON.stringify(body.printers || []),
  });
  res.json({ ...cat, modifier_groups: JSON.parse(cat.modifier_groups), printers: JSON.parse(cat.printers || "[]") });
});

app.put("/api/categories/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const body = req.body;
  try {
    const cat = await store.updateCategory(id, {
      name: body.name, color: body.color || "#84CC16", sort_order: body.sort_order ?? 0,
      active: body.active !== false ? 1 : 0, show_till: body.show_till ? 1 : 0,
      modifier_groups: JSON.stringify(body.modifier_groups || []), printers: JSON.stringify(body.printers || []),
    });
    res.json({ ...cat, modifier_groups: JSON.parse(cat.modifier_groups || "[]"), printers: JSON.parse(cat.printers || "[]") });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.delete("/api/categories/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  try {
    await store.deleteCategory(req.params.id);
    res.status(204).send();
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

// Products — only return sellable items (exclude sellable === false). Requires Authorization: Bearer <token>.
app.get("/api/products", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const categories = await store.getAllCategories();
  const cats = Object.fromEntries(categories.map((r) => [r.id, r.name]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const products = (await store.getProducts()).filter((p) => p.sellable !== false);
  console.log("GET /api/products - count:", products.length, "from", req.ip);
  function toModifierIds(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => {
      if (typeof x === "string") return x.trim() || null;
      if (typeof x === "number") return String(x);
      return (x?.id ?? x?.Id)?.toString?.()?.trim() || null;
    }).filter(Boolean);
  }
  res.json(
    products.map((r) => {
      let modIds = toModifierIds(JSON.parse(r.modifier_groups || "[]"));
      const cat = r.category_id ? catById[r.category_id] : null;
      if (cat && cat.modifier_groups) {
        const catIds = toModifierIds(JSON.parse(cat.modifier_groups || "[]"));
        modIds = [...new Set([...modIds, ...catIds])];
      }
      return {
        ...r,
        tax_rate: r.tax_rate ?? 0,
        pos_enabled: r.pos_enabled === 1 ? 1 : 0,
        category: cats[r.category_id] || "",
        printers: JSON.parse(r.printers || "[]"),
        modifier_groups: modIds,
        zoho_suggest_remove: !!r.zoho_suggest_remove,
      };
    }),
  );
});

app.post("/api/products", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const id = req.body.id || `p_${uuid().slice(0, 8)}`;
  const body = req.body;
  const posEnabled = body.pos_enabled === undefined ? 1 : (body.pos_enabled === true || body.pos_enabled === 1 || body.pos_enabled === "1" ? 1 : 0);
  const prod = await store.createProduct({
    id, name: body.name || "Product", name_arabic: body.name_arabic || "", name_turkish: body.name_turkish || "",
    sku: body.sku || "", category_id: body.category_id || null, price: body.price ?? 0, tax_rate: body.tax_rate ?? 0,
    image_url: body.image_url || "", printers: JSON.stringify(body.printers || []), modifier_groups: JSON.stringify(body.modifier_groups || []),
    active: body.active !== false ? 1 : 0, pos_enabled: posEnabled, sellable: true,
  });
  const categories = await store.getAllCategories();
  const cats = Object.fromEntries(categories.map((r) => [r.id, r.name]));
  res.json({ ...prod, category: cats[prod.category_id] || "", printers: JSON.parse(prod.printers || "[]"), modifier_groups: JSON.parse(prod.modifier_groups || "[]") });
});

/** Show in Till: Ürünün POS/Till ekranında görünüp görünmeyeceği. Sadece pos_enabled günceller. */
function parseShowInTill(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value ? 1 : 0;
  if (typeof value === "string") return ["1", "true", "on", "yes"].includes(String(value).toLowerCase()) ? 1 : 0;
  return undefined;
}

app.patch("/api/products/:id/show-in-till", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const show = parseShowInTill(req.body?.show);
  if (show === undefined) return res.status(400).json({ error: "show (boolean) required" });
  try {
    const r = await store.updateProduct(req.params.id, { pos_enabled: show });
    const categories = await store.getAllCategories();
    const cats = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    res.json({ ...r, category: cats[r.category_id] || "", printers: JSON.parse(r.printers || "[]"), modifier_groups: JSON.parse(r.modifier_groups || "[]"), pos_enabled: r.pos_enabled });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.put("/api/products/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const body = req.body;
  try {
    const products = await store.getAllProducts();
    const existing = products.find((p) => p.id === id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    const active = body.active === undefined ? existing.active : (body.active !== false && body.active !== 0 ? 1 : 0);
    const posEnabled = body.pos_enabled === undefined ? existing.pos_enabled : (body.pos_enabled !== false && body.pos_enabled !== 0 ? 1 : 0);
    const r = await store.updateProduct(id, {
      name: body.name, name_arabic: body.name_arabic || "", name_turkish: body.name_turkish || "", sku: body.sku || "",
      category_id: body.category_id || null, price: body.price ?? 0, tax_rate: body.tax_rate ?? 0,
      image_url: body.image_url ?? existing.image_url ?? "", printers: JSON.stringify(body.printers ?? existing.printers ?? "[]"), modifier_groups: JSON.stringify(body.modifier_groups ?? existing.modifier_groups ?? "[]"),
      active, pos_enabled: posEnabled,
    });
    const categories = await store.getAllCategories();
    const cats = Object.fromEntries(categories.map((r) => [r.id, r.name]));
    res.json({ ...r, category: cats[r.category_id] || "", printers: JSON.parse(r.printers || "[]"), modifier_groups: JSON.parse(r.modifier_groups || "[]") });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.delete("/api/products/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  try {
    await store.deleteProduct(req.params.id);
    res.status(204).send();
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

// Zoho'dan sync (upsert); önce silme yok. Hata olursa ürünler geri yüklenir – ürün kaybı önlenir.
app.post("/api/products/clear-and-sync", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  let syncResult = { categoriesAdded: 0, productsAdded: 0, productsUpdated: 0, productsRemoved: 0, productsSuggestedForRemoval: [], itemsFetched: 0, error: null };
  try {
    syncResult = await syncFromZoho({});
  } catch (e) {
    syncResult.error = (e && e.message) || "Sync failed";
  }
  const categories = await store.getAllCategories();
  const products = (await store.getProducts()).filter((p) => p.sellable !== false);
  const cats = Object.fromEntries(categories.map((r) => [r.id, r.name]));
  const productsMapped = products.map((r) => ({ ...r, category: cats[r.category_id] || "", printers: JSON.parse(r.printers || "[]"), modifier_groups: JSON.parse(r.modifier_groups || "[]"), zoho_suggest_remove: !!r.zoho_suggest_remove }));
  res.json({ ...syncResult, products: productsMapped });
});

// Zoho'da artık olmayan (silinecek önerisi) ürünler listesi; onay verilene kadar satışta kalır.
app.get("/api/products/pending-zoho-removal", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const categories = await store.getAllCategories();
  const cats = Object.fromEntries(categories.map((r) => [r.id, r.name]));
  const allProducts = await store.getAllProducts();
  const list = allProducts.filter((p) => p.zoho_suggest_remove === true).map((r) => ({
    ...r,
    category: cats[r.category_id] || "",
    printers: JSON.parse(r.printers || "[]"),
    modifier_groups: JSON.parse(r.modifier_groups || "[]"),
  }));
  res.json(list);
});

// Seçilen ürünleri kalıcı sil (onay sonrası). Sadece zoho_suggest_remove olanlar için kullanılır.
app.post("/api/products/confirm-removal", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds.map(String) : [];
  if (productIds.length === 0) return res.status(400).json({ error: "productIds required (array)" });
  let removed = 0;
  for (const id of productIds) {
    try {
      await store.deleteProduct(id);
      removed++;
    } catch {}
  }
  res.json({ removed, productIds });
});

// Printers
app.get("/api/printers", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  res.json(await store.getPrinters());
});

app.post("/api/printers", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const id = req.body.id || `pr_${uuid().slice(0, 8)}`;
  const body = req.body;
  const enabled = body.enabled === false || body.enabled === 0 ? 0 : 1;
  const pr = await store.createPrinter({
    id, name: body.name || "Printer", printer_type: body.printer_type || "kitchen",
    ip_address: body.ip_address || "", port: body.port ?? 9100, connection_type: body.connection_type || "network",
    status: body.status || "offline", is_backup: body.is_backup ? 1 : 0, kds_enabled: body.kds_enabled !== false ? 1 : 0, enabled,
  });
  res.json(pr);
});

app.put("/api/printers/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const body = req.body;
  const data = {
    name: body.name, printer_type: body.printer_type || "kitchen", ip_address: body.ip_address || "",
    port: body.port ?? 9100, connection_type: body.connection_type || "network", status: body.status || "offline",
    is_backup: body.is_backup ? 1 : 0, kds_enabled: body.kds_enabled !== false ? 1 : 0,
  };
  if (body.enabled !== undefined) data.enabled = body.enabled === false || body.enabled === 0 ? 0 : 1;
  try {
    const pr = await store.updatePrinter(id, data);
    res.json(pr);
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.put("/api/printers/:id/status", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  try {
    const pr = await store.updatePrinter(id, { status: req.query.status || "offline" });
    res.json(pr);
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.delete("/api/printers/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  try {
    await store.deletePrinter(req.params.id);
    res.status(204).send();
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

// Payment methods
app.get("/api/payment-methods", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const pms = await store.getPaymentMethods();
  res.json(pms.filter((p) => p.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
});

app.post("/api/payment-methods", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const id = req.body.id || `pm_${uuid().slice(0, 8)}`;
  const body = req.body;
  const pm = await store.createPaymentMethod({
    id, name: body.name || "Method", code: body.code || "other",
    active: body.active !== false ? 1 : 0, sort_order: body.sort_order ?? 0,
  });
  res.json(pm);
});

app.put("/api/payment-methods/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const body = req.body;
  try {
    const pm = await store.updatePaymentMethod(id, {
      name: body.name, code: body.code || "other", active: body.active !== false ? 1 : 0, sort_order: body.sort_order ?? 0,
    });
    res.json(pm);
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.delete("/api/payment-methods/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  try {
    await store.deletePaymentMethod(req.params.id);
    res.status(204).send();
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

// Modifier groups
app.get("/api/modifier-groups", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const mgs = await store.getModifierGroups();
  res.json(mgs.map((r) => ({ ...r, options: JSON.parse(r.options || "[]") })));
});

app.post("/api/modifier-groups", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const id = req.body.id || `mg_${uuid().slice(0, 8)}`;
  const body = req.body;
  const opts = (body.options || []).map((o, i) => ({ id: o.id || `mo_${id}_${i}`, name: o.name || "Option", price: o.price ?? 0 }));
  const mg = await store.createModifierGroup({
    id, name: body.name || "Modifier Group", min_select: body.min_select ?? 0, max_select: body.max_select ?? 1,
    required: body.required ? 1 : 0, options: JSON.stringify(opts),
  });
  res.json({ ...mg, options: opts });
});

app.put("/api/modifier-groups/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const body = req.body;
  const mgs = await store.getModifierGroups();
  const existing = mgs.find((m) => m.id === id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const opts = (body.options || []).map((o, i) => ({ id: o.id || `mo_${id}_${i}`, name: o.name || "Option", price: o.price ?? 0 }));
  try {
    const mg = await store.updateModifierGroup(id, {
      name: body.name || existing.name, min_select: body.min_select ?? 0, max_select: body.max_select ?? 1,
      required: body.required ? 1 : 0, options: JSON.stringify(opts),
    });
    res.json({ ...mg, options: opts });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.delete("/api/modifier-groups/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  try {
    await store.deleteModifierGroup(req.params.id);
    res.status(204).send();
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

// Settings (timezone, receipt/bill, kitchen, currency)
app.get("/api/settings", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const s = await store.getSettings();
  res.json({
    timezone_offset_minutes: s.timezone_offset_minutes ?? 0,
    overdue_undelivered_minutes: Math.min(1440, Math.max(1, (s.overdue_undelivered_minutes ?? 10) | 0)),
    company_name: s.company_name ?? "",
    company_address: s.company_address ?? "",
    receipt_header: s.receipt_header ?? "BILL / RECEIPT",
    receipt_footer_message: s.receipt_footer_message ?? "Thank you!",
    kitchen_header: s.kitchen_header ?? "KITCHEN",
    receipt_item_size: Math.min(2, Math.max(0, (s.receipt_item_size ?? 0) | 0)),
    currency_code: s.currency_code ?? "AED",
    opening_time: s.opening_time ?? "07:00",
    closing_time: s.closing_time ?? "01:30",
    open_tables_warning_time: s.open_tables_warning_time ?? "01:00",
    auto_close_open_tables: !!s.auto_close_open_tables,
    auto_close_payment_method: s.auto_close_payment_method ?? "cash",
    grace_minutes: Math.min(60, Math.max(0, (s.grace_minutes ?? 0) | 0)),
    warning_enabled: s.warning_enabled !== false,
    vat_percent: Math.min(100, Math.max(0, (s.vat_percent ?? 0) | 0)),
  });
});

function validateTimeHHMM(str) {
  if (str == null || (typeof str !== "string" && typeof str !== "number")) return null;
  const s = String(str).trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

app.patch("/api/settings", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied. Settings require admin, manager, or web_settings." });
  }
  const prevSettings = await store.getSettings();
  const updates = {};
  if (typeof req.body.timezone_offset_minutes === "number") {
    let v = Math.round(req.body.timezone_offset_minutes);
    if (v < -720) v = -720;
    if (v > 840) v = 840;
    updates.timezone_offset_minutes = v;
  }
  if (typeof req.body.overdue_undelivered_minutes === "number") {
    const v = Math.round(req.body.overdue_undelivered_minutes);
    updates.overdue_undelivered_minutes = Math.min(1440, Math.max(1, v));
  }
  if (typeof req.body.company_name === "string") updates.company_name = req.body.company_name.slice(0, 200);
  if (typeof req.body.company_address === "string") updates.company_address = req.body.company_address.slice(0, 400);
  if (typeof req.body.receipt_header === "string") updates.receipt_header = req.body.receipt_header.slice(0, 100) || "BILL / RECEIPT";
  if (typeof req.body.receipt_footer_message === "string") updates.receipt_footer_message = req.body.receipt_footer_message.slice(0, 300) || "Thank you!";
  if (typeof req.body.kitchen_header === "string") updates.kitchen_header = req.body.kitchen_header.slice(0, 100) || "KITCHEN";
  if (typeof req.body.receipt_item_size === "number") {
    updates.receipt_item_size = Math.min(2, Math.max(0, Math.round(req.body.receipt_item_size)));
  }
  const validCurrencyCodes = ["AED", "TRY", "USD", "EUR", "GBP"];
  if (typeof req.body.currency_code === "string" && validCurrencyCodes.includes(req.body.currency_code)) updates.currency_code = req.body.currency_code;
  if (req.body.opening_time != null) {
    const ot = validateTimeHHMM(req.body.opening_time);
    if (ot) updates.opening_time = ot;
    else return res.status(400).json({ error: "Invalid opening_time format. Use HH:mm (e.g. 07:00, 06:59)" });
  }
  if (req.body.closing_time != null) {
    const ct = validateTimeHHMM(req.body.closing_time);
    if (ct) updates.closing_time = ct;
    else return res.status(400).json({ error: "Invalid closing_time format. Use HH:mm (e.g. 06:59, 01:30)" });
  }
  if (req.body.open_tables_warning_time != null) {
    const wt = validateTimeHHMM(req.body.open_tables_warning_time);
    if (wt) updates.open_tables_warning_time = wt;
    else return res.status(400).json({ error: "Invalid open_tables_warning_time format. Use HH:mm" });
  }
  if (typeof req.body.auto_close_open_tables === "boolean") updates.auto_close_open_tables = req.body.auto_close_open_tables;
  if (typeof req.body.auto_close_payment_method === "string") updates.auto_close_payment_method = req.body.auto_close_payment_method.slice(0, 50) || "cash";
  if (typeof req.body.grace_minutes === "number") updates.grace_minutes = Math.min(60, Math.max(0, Math.round(req.body.grace_minutes)));
  if (typeof req.body.warning_enabled === "boolean") updates.warning_enabled = req.body.warning_enabled;
  if (typeof req.body.vat_percent === "number") updates.vat_percent = Math.min(100, Math.max(0, Math.round(req.body.vat_percent)));
  if (Object.keys(updates).length > 0) await store.updateSettings(updates);
  const businessKeys = ["opening_time", "closing_time", "open_tables_warning_time", "auto_close_open_tables", "auto_close_payment_method", "grace_minutes", "warning_enabled", "currency_code", "vat_percent"];
  const changed = businessKeys.filter((k) => String(prevSettings[k] ?? "") !== String(updates[k] ?? prevSettings[k] ?? ""));
  if (changed.length > 0) await store.appendBusinessOperationLog({ ts: Date.now(), action: "settings_changed", user_id: req.user?.id, user_name: req.user?.name, changed });
  const s = await store.getSettings();
  res.json({
    timezone_offset_minutes: s.timezone_offset_minutes ?? 0,
    overdue_undelivered_minutes: Math.min(1440, Math.max(1, (s.overdue_undelivered_minutes ?? 10) | 0)),
    company_name: s.company_name ?? "",
    company_address: s.company_address ?? "",
    receipt_header: s.receipt_header ?? "BILL / RECEIPT",
    receipt_footer_message: s.receipt_footer_message ?? "Thank you!",
    kitchen_header: s.kitchen_header ?? "KITCHEN",
    receipt_item_size: Math.min(2, Math.max(0, (s.receipt_item_size ?? 0) | 0)),
    currency_code: s.currency_code ?? "AED",
    opening_time: s.opening_time ?? "07:00",
    closing_time: s.closing_time ?? "01:30",
    open_tables_warning_time: s.open_tables_warning_time ?? "01:00",
    auto_close_open_tables: !!s.auto_close_open_tables,
    auto_close_payment_method: s.auto_close_payment_method ?? "cash",
    grace_minutes: Math.min(60, Math.max(0, (s.grace_minutes ?? 0) | 0)),
    warning_enabled: s.warning_enabled !== false,
    vat_percent: Math.min(100, Math.max(0, (s.vat_percent ?? 0) | 0)),
  });
});

// End of Day (Günü Kapat) – gece 12 sonrası satışlar için; açık masalar varsa uyarı veya kapatıp ödeme alınmış say
app.get("/api/eod/status", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const tables = await store.getTables();
  const orders = await store.getOrders();
  const eodLogs = await store.getEodLogs();
  const lastEod = eodLogs.length > 0 ? eodLogs[eodLogs.length - 1] : null;
  const openTablesNow = tables
    .filter((t) => t.current_order_id)
    .map((t) => {
      const order = orders.find((o) => o.id === t.current_order_id);
      return { table_id: t.id, table_number: t.number, order_id: t.current_order_id, order_total: order?.total ?? 0 };
    });
  res.json({
    lastEod: lastEod ? { ran_at: lastEod.ran_at, user_name: lastEod.user_name, tables_closed_count: lastEod.tables_closed?.length ?? 0, orders_closed_count: lastEod.orders_closed_count ?? 0 } : null,
    openTablesNow,
    openTablesCount: openTablesNow.length,
  });
});

app.post("/api/eod/run", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const closeOpenTables = !!req.body?.closeOpenTables;
  const tables = await store.getTables();
  const orders = await store.getOrders();
  const openTables = tables.filter((t) => t.current_order_id);
  const now = Date.now();
  const userId = req.user?.id ?? "";
  const userName = req.user?.name ?? "Admin";

  if (openTables.length > 0 && !closeOpenTables) {
    const openList = openTables.map((t) => {
      const order = orders.find((o) => o.id === t.current_order_id);
      return { table_id: t.id, table_number: t.number, order_id: t.current_order_id, order_total: order?.total ?? 0 };
    });
    return res.status(400).json({
      error: "OPEN_TABLES",
      message: `${openTables.length} masa hâlâ açık. Günü kapatmak için önce masaları kapatın veya "Açık masaları kapat (ödeme alınmış say)" ile onaylayın.`,
      openTablesCount: openTables.length,
      openTables: openList,
    });
  }

  const tablesClosed = [];
  for (const t of openTables) {
    const orderId = t.current_order_id;
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === "paid") continue;
    const amount = order.total ?? 0;
    await store.createPayment({
      id: `pay_${uuid().slice(0, 8)}`, order_id: orderId, amount, method: "cash",
      received_amount: amount, change_amount: 0, user_id: userId, created_at: new Date(now),
    });
    await store.updateOrder(orderId, { status: "paid", paid_at: new Date(now) });
    for (const tbl of tables) {
      if (tbl.current_order_id === orderId) {
        await store.updateTable(tbl.id, { status: "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null });
      }
    }
    tablesClosed.push({ table_id: t.id, table_number: t.number, order_id: orderId, amount });
  }

  await store.appendEodLog({
    id: `eod_${uuid().slice(0, 8)}`,
    ran_at: now,
    user_id: userId,
    user_name: userName,
    tables_closed: tablesClosed,
    orders_closed_count: tablesClosed.length,
  });

  res.json({
    success: true,
    tablesClosedCount: tablesClosed.length,
    lastEod: { ran_at: now, user_name: userName, tables_closed_count: tablesClosed.length, orders_closed_count: tablesClosed.length },
  });
});

// Dashboard stats. Open Tables = only tables that have an order with status open/sent (masaya bağlı açık hesap).
// Optional: ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD for date-range sales (matches daily-sales range logic).
app.get("/api/dashboard/stats", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const dateFromStr = (req.query.dateFrom || "").toString().trim();
  const dateToStr = (req.query.dateTo || "").toString().trim();
  let summary;
  if (dateFromStr && dateToStr) {
    const fromBounds = await store.getCalendarDayBoundsForDate(dateFromStr);
    const toBounds = await store.getCalendarDayBoundsForDate(dateToStr);
    if (fromBounds && toBounds && fromBounds.startTs <= toBounds.endTs) {
      summary = await store.getSalesSummaryForRange(fromBounds.startTs, toBounds.endTs);
    } else {
      summary = await store.getTodaySalesSummary();
    }
  } else {
    summary = await store.getTodaySalesSummary();
  }
  const orders = await store.getOrders();
  const tables = await store.getTables();
  const voidLogs = await store.getVoidLogs();
  const paymentByMethod = {};
  if (summary.totalCash) paymentByMethod.cash = summary.totalCash;
  if (summary.totalCard) paymentByMethod.card = summary.totalCard;
  const orderIdsOpenOrSent = new Set(orders.filter((o) => o.status === "open" || o.status === "sent").map((o) => o.id));
  const tablesWithOpenCheck = tables.filter((t) => t.current_order_id && orderIdsOpenOrSent.has(t.current_order_id));
  const openCount = tablesWithOpenCheck.length;
  const preVoids = voidLogs.filter((v) => v.type === "pre_void").length;
  const postVoids = voidLogs.filter((v) => v.type === "post_void").length;
  const eodLogs = await store.getEodLogs();
  const lastEod = eodLogs.length > 0 ? eodLogs[eodLogs.length - 1] : null;
  const voidRequests = await store.getVoidRequests();
  const closedBillAccessRequests = await store.getClosedBillAccessRequests();
  const pendingVoidRequestsCount = voidRequests.filter((v) => v.status === "pending").length;
  const pendingClosedBillAccessRequestsCount = closedBillAccessRequests.filter((r) => r.status === "pending").length;
  res.json({
    todaySales: summary.netSales,
    orderCount: summary.paidToday.length,
    openTables: openCount,
    openChecks: openCount,
    openOrdersCount: openCount,
    paymentBreakdown: paymentByMethod,
    prePrintVoids: preVoids,
    postPrintVoids: postVoids,
    lastEod: lastEod ? { ran_at: lastEod.ran_at, user_name: lastEod.user_name, tables_closed_count: lastEod.tables_closed?.length ?? 0 } : null,
    openTablesCount: openCount,
    pendingVoidRequestsCount,
    pendingClosedBillAccessRequestsCount,
  });
});

// Business day status: for warning banner, open tables count. Supervisor/manager only.
app.get("/api/dashboard/business-day-status", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const s = await store.getSettings();
  const opening = s.opening_time ?? "07:00";
  const closing = s.closing_time ?? "01:30";
  const warning = s.open_tables_warning_time ?? "01:00";
  const off = await store.offsetMin();
  const now = Date.now();
  const key = getBusinessDayKey(now, opening, closing, off);
  const afterWarning = isAfterWarningTime(now, warning, opening, closing, off);
  const tables = await store.getTables();
  const orders = await store.getOrders();
  const orderIdsOpenOrSent = new Set(orders.filter((o) => o.status === "open" || o.status === "sent").map((o) => o.id));
  const openCount = tables.filter((t) => t.current_order_id && orderIdsOpenOrSent.has(t.current_order_id)).length;
  const lastShown = s.last_warning_shown_for_business_day;
  const shouldShow = !!(s.warning_enabled !== false && afterWarning && openCount > 0 && lastShown !== key);
  res.json({
    currentBusinessDayKey: key,
    isAfterWarningTime: afterWarning,
    openTablesCount: openCount,
    shouldShowWarning: shouldShow,
  });
});

app.post("/api/dashboard/warning-shown", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const s = await store.getSettings();
  const key = getBusinessDayKey(Date.now(), s.opening_time ?? "07:00", s.closing_time ?? "01:30", await store.offsetMin());
  if (key) {
    await store.updateSettings({ last_warning_shown_for_business_day: key });
    await store.appendBusinessOperationLog({ ts: Date.now(), action: "warning_shown", user_id: req.user?.id, user_name: req.user?.name, business_day_key: key });
  }
  res.json({ ok: true });
});

// Open tables not closed: detailed list for dashboard "end of day" section.
app.get("/api/dashboard/open-tables-not-closed", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const orders = await store.getOrders();
  const orderItems = await store.getAllOrderItems();
  const tables = await store.getTables();
  const s = await store.getSettings();
  const key = getBusinessDayKey(Date.now(), s.opening_time ?? "07:00", s.closing_time ?? "01:30", await store.offsetMin());
  const orderIdsLinkedToTable = new Set(tables.filter((t) => t.current_order_id).map((t) => t.current_order_id));
  const openOrders = orders.filter((o) => (o.status === "open" || o.status === "sent") && orderIdsLinkedToTable.has(o.id));
  const list = openOrders.map((o) => {
    const items = orderItems.filter((i) => i.order_id === o.id);
    const itemCount = items.reduce((s, i) => s + (i.quantity || 0), 0);
    const openedAt = o.created_at ?? o.updated_at ?? 0;
    return {
      table_id: o.table_id,
      table_number: o.table_number || "",
      order_id: o.id,
      receipt_no: `#${(o.table_number || o.id).toString().slice(-6)}`,
      total: Number(o.total) || 0,
      item_count: itemCount,
      order_count: 1,
      opened_at: openedAt,
      duration_minutes: openedAt ? Math.floor((Date.now() - openedAt) / 60000) : 0,
      waiter_name: o.waiter_name || "—",
      business_day_key: key,
    };
  });
  res.json({ list, count: list.length });
});

// Kullanıcı sign-in/sign-out hareketleri (business_operation_log üzerinden) – tarih aralığı filtreli.
app.get("/api/security/user-shifts", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  if (!userCanAccessSettings(req.user)) {
    return res.status(403).json({ error: "Forbidden", message: "Ayarlar yetkisi gerekli." });
  }
  const s = await store.getSettings();
  const rawLog = Array.isArray(s.business_operation_log) ? s.business_operation_log : [];
  let events = rawLog.filter((e) => e && (e.action === "user_sign_in" || e.action === "user_sign_out"));

  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null;
  const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;
  let startTs = 0;
  let endTs = Number.MAX_SAFE_INTEGER;
  try {
    if (dateFrom && dateTo) {
      const fromRange = await store.getCalendarDayBoundsForDate(dateFrom);
      const toRange = await store.getCalendarDayBoundsForDate(dateTo);
      if (fromRange && toRange) {
        startTs = fromRange.startTs;
        endTs = toRange.endTs;
      }
    } else if (dateFrom) {
      const r = await store.getCalendarDayBoundsForDate(dateFrom);
      if (r) {
        startTs = r.startTs;
        endTs = r.endTs;
      }
    } else if (dateTo) {
      const r = await store.getCalendarDayBoundsForDate(dateTo);
      if (r) {
        startTs = r.startTs;
        endTs = r.endTs;
      }
    }
  } catch {
    // tarih parse hatalarında tüm logu dökmeye devam et (backend çökmemeli)
  }

  if (startTs || endTs !== Number.MAX_SAFE_INTEGER) {
    events = events.filter((e) => {
      const ts = e.ts || e.timestamp || 0;
      return ts >= startTs && ts < endTs;
    });
  }

  events.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  res.json({
    count: events.length,
    events,
  });
});

// Kitchen orders: KDS için. Masaya bağlı VEYA status=sent + en az 1 item sent_at (B cihazında görünsün diye fallback).
app.get("/api/kitchen/orders", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const printerFilter = (req.query.printers || "").toString().trim();
  const tables = await store.getTables();
  const orderIdsLinked = new Set(tables.filter((t) => t.current_order_id).map((t) => t.current_order_id));
  const orders = await store.getOrders();
  const orderItems = await store.getAllOrderItems();
  const products = await store.getAllProducts();
  const categories = await store.getAllCategories();
  const toMs = (v) => (v == null ? null : v instanceof Date ? v.getTime() : Number(v));
  const list = [];
  for (const o of orders) {
    if (o.status === "paid" || o.status === "closed") continue;
    let items = orderItems.filter((i) => i.order_id === o.id);
    const hasSentItems = items.some((i) => i.sent_at != null);
    const linkedToTable = orderIdsLinked.has(o.id);
    if (!linkedToTable && !(o.status === "sent" && hasSentItems)) continue;
    if (printerFilter && printerFilter !== "all") {
      const printerIds = new Set(printerFilter.split(",").map((p) => p.trim()).filter(Boolean));
      if (printerIds.size > 0) {
        items = items.filter((i) => {
          const prod = products.find((p) => p.id === i.product_id);
          const printerIdsStr = prod?.printers ? (Array.isArray(prod.printers) ? prod.printers.join(",") : String(prod.printers)) : "";
          const cat = prod ? categories.find((c) => c.id === prod.category_id) : null;
          const catPrinters = cat?.printers ? (Array.isArray(cat.printers) ? cat.printers.join(",") : String(cat.printers)) : "";
          const allPrinters = (printerIdsStr + "," + catPrinters).split(",").map((x) => x.trim()).filter(Boolean);
          if (allPrinters.length === 0) return true;
          return allPrinters.some((pid) => printerIds.has(pid));
        });
        if (items.length === 0) continue;
      }
    }
    if (items.length === 0) continue;
    list.push({
      id: o.id,
      tableNumber: o.table_number || "",
      waiterName: o.waiter_name || "",
      status: o.status,
      createdAt: toMs(o.created_at) || 0,
      items: items.map((i) => ({
        id: i.id,
        productName: i.product_name || "",
        quantity: i.quantity || 0,
        notes: i.notes || "",
        status: i.status || "sent",
        sentAt: toMs(i.sent_at),
      })),
    });
  }
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  res.json(list);
});

// Open orders: only orders that are linked to a table (current_order_id). App ile uyumlu.
app.get("/api/dashboard/open-orders", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const orders = await store.getOrders();
  const tables = await store.getTables();
  const orderIdsLinkedToTable = new Set(tables.filter((t) => t.current_order_id).map((t) => t.current_order_id));
  const openOrders = orders.filter((o) => (o.status === "open" || o.status === "sent") && orderIdsLinkedToTable.has(o.id));
  const list = openOrders.map((o) => ({
    order_id: o.id,
    receipt_no: `#${(o.table_number || o.id).toString().slice(-6)}`,
    table_number: o.table_number || "",
    total: Number(o.total) || 0,
    waiter_name: o.waiter_name || "—",
    created_at: o.created_at ?? o.updated_at ?? 0,
    status: o.status,
  }));
  res.json(list);
});

// Masalarda gecikmiş ürünü olan masa id'leri (mutfağa gitti, masaya gitmedi, ürün bazlı süre aşıldı). Web floor'da yanıp sönsün.
app.get("/api/dashboard/overdue-table-ids", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const settings = await store.getSettings();
  const defaultOverdueMinutes = Math.min(1440, Math.max(1, (settings.overdue_undelivered_minutes ?? 10) | 0));
  const tables = await store.getTables();
  const orders = await store.getOrders();
  const orderItems = await store.getAllOrderItems();
  const products = await store.getAllProducts();
  const orderIdsLinkedToTable = new Set(tables.filter((t) => t.current_order_id).map((t) => t.current_order_id));
  const openOrders = orders.filter((o) => (o.status === "open" || o.status === "sent") && orderIdsLinkedToTable.has(o.id));
  const now = Date.now();
  const tableIds = new Set();
  for (const order of openOrders) {
    const hasOverdue = orderItems.some((i) => {
      if (i.order_id !== order.id || i.sent_at == null || (i.delivered_at != null && i.delivered_at !== undefined)) return false;
      const product = i.product_id ? products.find((p) => p.id === i.product_id) : null;
      const itemMinutes = product?.overdue_undelivered_minutes != null ? product.overdue_undelivered_minutes : defaultOverdueMinutes;
      const thresholdMs = itemMinutes * 60 * 1000;
      return now - i.sent_at > thresholdMs;
    });
    if (hasOverdue) tableIds.add(order.table_id);
  }
  res.json({ tableIds: [...tableIds], overdueMinutes: defaultOverdueMinutes });
});

// Daily Sales: ?date=YYYY-MM-DD (tek gün) veya ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD (aralık); yoksa bugün.
app.get("/api/dashboard/daily-sales", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const dateStr = (req.query.date || "").toString().trim();
  const dateFromStr = (req.query.dateFrom || "").toString().trim();
  const dateToStr = (req.query.dateTo || "").toString().trim();
  let summary;
  let dayStartTs;
  let dayEndTs;
  if (dateFromStr && dateToStr) {
    const fromBounds = await store.getCalendarDayBoundsForDate(dateFromStr);
    const toBounds = await store.getCalendarDayBoundsForDate(dateToStr);
    if (!fromBounds || !toBounds) return res.status(400).json({ error: "invalid_date", message: "dateFrom and dateTo must be YYYY-MM-DD" });
    dayStartTs = fromBounds.startTs;
    dayEndTs = toBounds.endTs;
    if (dayStartTs > dayEndTs) return res.status(400).json({ error: "invalid_range", message: "dateFrom must be before or equal to dateTo" });
    summary = await store.getSalesSummaryForRange(dayStartTs, dayEndTs);
  } else if (dateStr) {
    const bounds = await store.getDayBounds(dateStr);
    if (!bounds) return res.status(400).json({ error: "invalid_date", message: "date must be YYYY-MM-DD" });
    summary = await store.getSalesSummaryForRange(bounds.startTs, bounds.endTs);
    dayStartTs = bounds.startTs;
    dayEndTs = bounds.endTs;
  } else {
    const todaySummary = await store.getTodaySalesSummary();
    summary = todaySummary;
    dayStartTs = todaySummary.todayTs;
    dayEndTs = todaySummary.todayEndTs;
  }
  const orders = await store.getOrders();
  const orderItems = await store.getAllOrderItems();
  const products = await store.getAllProducts();
  const categories = await store.getAllCategories();
  const voidLogs = await store.getVoidLogs();

  const catMap = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));
  const prodCat = Object.fromEntries((products || []).map((p) => [p.id, p.category_id]));
  const categorySales = {};
  const itemSales = {};
  for (const oi of orderItems) {
    const order = orders.find((o) => o.id === oi.order_id);
    if (!order || !summary.paidOrderIds.has(order.id)) continue;
    const amt = (oi.quantity || 0) * (oi.price || 0);
    const qty = oi.quantity || 0;
    const catId = prodCat[oi.product_id] || "uncategorized";
    const catName = catMap[catId] || catId;
    categorySales[catId] = categorySales[catId] || { categoryId: catId, categoryName: catName, totalAmount: 0, totalQuantity: 0 };
    categorySales[catId].totalAmount += amt;
    categorySales[catId].totalQuantity += qty;
    const pid = oi.product_id || oi.product_name || "unknown";
    const pname = oi.product_name || "Unknown";
    itemSales[pid] = itemSales[pid] || { productId: pid, productName: pname, categoryId: catId, totalAmount: 0, totalQuantity: 0 };
    itemSales[pid].totalAmount += amt;
    itemSales[pid].totalQuantity += qty;
  }
  const categorySalesList = Object.values(categorySales).sort((a, b) => b.totalAmount - a.totalAmount);
  const itemSalesList = Object.values(itemSales).sort((a, b) => b.totalAmount - a.totalAmount);

  const orderIdsSet = new Set(orders.map((o) => o.id));
  const todayVoids = voidLogs.filter((v) => v.created_at >= dayStartTs && v.created_at < dayEndTs);
  const voids = todayVoids.filter((v) => (v.type === "pre_void" || v.type === "post_void" || v.type === "recalled_void") && (v.order_id == null || orderIdsSet.has(v.order_id)));
  const refunds = todayVoids.filter((v) => (v.type === "refund" || v.type === "refund_full") && (v.order_id == null || orderIdsSet.has(v.order_id)));

  const paymentMethods = await store.getAllPaymentMethods();
  const payments = await store.getPayments();
  const paymentsByOrder = payments.reduce((acc, p) => {
    if (!acc[p.order_id]) acc[p.order_id] = [];
    acc[p.order_id].push(p);
    return acc;
  }, {});
  const paidTickets = summary.paidToday.map((o) => {
    const orderPayments = paymentsByOrder[o.id] || [];
    let cashAmount = 0;
    let cardAmount = 0;
    for (const p of orderPayments) {
      const code = resolvePaymentMethodCode(p.method, paymentMethods);
      if (code === "cash") cashAmount += p.amount || 0;
      else if (code === "card") cardAmount += p.amount || 0;
    }
    if (cashAmount === 0 && cardAmount === 0) cashAmount = Number(o.total) || 0;
    const paidAt = o.paid_at ?? o.updated_at ?? o.created_at ?? 0;
    return {
      order_id: o.id,
      receipt_no: `#${String(o.table_number || o.id).slice(-8)}`,
      table_number: o.table_number || "",
      total: Number(o.total) || 0,
      paid_at: paidAt,
      waiter_name: o.waiter_name || "—",
      cash_amount: cashAmount,
      card_amount: cardAmount,
      discount_amount: Number(o.discount_amount) || 0,
    };
  });

  const eodLogs = await store.getEodLogs();
  const lastEod = eodLogs.length > 0 ? eodLogs[eodLogs.length - 1] : null;
  const tablesForOpen = await store.getTables();
  const openTablesCount = tablesForOpen.filter((t) => t.current_order_id).length;
  res.json({
    date: dateStr || null,
    totalCash: summary.totalCash,
    totalCard: summary.totalCard,
    totalSales: summary.totalSales,
    netSales: summary.netSales,
    totalVoidAmount: summary.totalVoidAmount,
    totalRefundAmount: summary.totalRefundAmount,
    categorySales: categorySalesList,
    itemSales: itemSalesList,
    voids,
    refunds,
    paidTickets,
    lastEod: lastEod ? { ran_at: lastEod.ran_at, user_name: lastEod.user_name, tables_closed_count: lastEod.tables_closed?.length ?? 0 } : null,
    openTablesCount,
    dailyCashEntry: await getDailyCashEntryForBounds(dayStartTs, dayEndTs),
    dailyCashEntries: await getDailyCashEntriesForBounds(dayStartTs, dayEndTs),
    physicalCashTotal: await getPhysicalCashTotalForBounds(dayStartTs, dayEndTs),
  });
});

async function getDailyCashEntriesForBounds(dayStartTs, dayEndTs) {
  const dailyEntries = await store.getDailyCashEntries();
  const entries = dailyEntries.filter((e) => {
    const t = e.date_ts ?? e.created_at ?? 0;
    return t >= dayStartTs && t < dayEndTs;
  });
  entries.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  return entries;
}

async function getPhysicalCashTotalForBounds(dayStartTs, dayEndTs) {
  const entries = await getDailyCashEntriesForBounds(dayStartTs, dayEndTs);
  return entries.reduce((sum, e) => sum + (e.physical_cash ?? 0), 0);
}

async function getDailyCashEntryForBounds(dayStartTs, dayEndTs) {
  const dailyEntries = await store.getDailyCashEntries();
  const entries = dailyEntries.filter((e) => {
    const t = e.date_ts ?? e.created_at ?? 0;
    return t >= dayStartTs && t < dayEndTs;
  });
  if (entries.length === 0) return null;
  entries.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  return entries[0];
}

app.post("/api/daily-cash-entry", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const physicalCash = parseFloat(req.body.physical_cash);
  if (isNaN(physicalCash) || physicalCash < 0) {
    return res.status(400).json({ error: "invalid_physical_cash", message: "physical_cash must be a non-negative number" });
  }
  const dateStr = (req.body.date || "").toString().trim() || new Date().toISOString().slice(0, 10);
  const bounds = await store.getDayBounds(dateStr);
  const todayRange = await store.getTodayRange();
  const dayStartTs = bounds ? bounds.startTs : todayRange.startTs;
  const dayEndTs = bounds ? bounds.endTs : todayRange.endTs;
  const summary = await store.getSalesSummaryForRange(dayStartTs, dayEndTs);
  const systemCash = summary.totalCash;
  const difference = physicalCash - systemCash;
  const entry = {
    id: uuid(),
    date: dateStr,
    date_ts: dayStartTs,
    system_cash: systemCash,
    physical_cash: physicalCash,
    difference,
    user_id: req.user?.id || "",
    user_name: req.user?.name || "—",
    created_at: Date.now(),
  };
  await store.appendDailyCashEntry(entry);
  res.json(entry);
});

app.get("/api/daily-cash-entry", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const dateStr = (req.query.date || "").toString().trim() || new Date().toISOString().slice(0, 10);
  const bounds = await store.getDayBounds(dateStr);
  if (!bounds) return res.status(400).json({ error: "invalid_date", message: "date must be YYYY-MM-DD" });
  const entry = await getDailyCashEntryForBounds(bounds.startTs, bounds.endTs);
  const summary = await store.getSalesSummaryForRange(bounds.startTs, bounds.endTs);
  res.json({
    date: dateStr,
    systemCash: summary.totalCash,
    dailyCashEntry: entry,
  });
});

// Daily Transaction: Cash (unlimited) + Card (unlimited, each with ref 1-15 digits)
app.post("/api/daily-transaction", authMiddleware, async (req, res) => {
  try {
    await ensurePrismaReady();
    const body = req.body || {};
    const type = (body.type || "cash").toString().toLowerCase().trim();
    const dateStr = (body.date || "").toString().trim() || new Date().toISOString().slice(0, 10);
    let bounds = null;
    try {
      bounds = await store.getDayBounds(dateStr);
    } catch (_) {}
    const todayRange = await store.getTodayRange();
    const dayStartTs = bounds ? bounds.startTs : todayRange.startTs;
    const dayEndTs = bounds ? bounds.endTs : todayRange.endTs;
    const summary = await store.getSalesSummaryForRange(dayStartTs, dayEndTs);
  if (type === "cash") {
    const physicalCash = parseFloat(body.physical_cash);
    if (isNaN(physicalCash) || physicalCash < 0) {
      return res.status(400).json({ error: "invalid_physical_cash", message: "physical_cash must be a non-negative number" });
    }
    const entry = {
      id: uuid(),
      type: "cash",
      date: dateStr,
      date_ts: dayStartTs,
      system_cash: summary.totalCash,
      physical_cash: physicalCash,
      difference: physicalCash - summary.totalCash,
      user_id: req.user?.id || "",
      user_name: req.user?.name || "—",
      created_at: Date.now(),
    };
    await store.appendDailyTransactionEntry(entry);
    res.json(entry);
  } else if (type === "card") {
    const amount = parseFloat(body.amount ?? body.physical_cash ?? 0);
    const cardRef = String(body.card_reference || body.cardReference || "").replace(/\D/g, "").slice(0, 15);
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: "invalid_amount", message: "amount must be a non-negative number" });
    }
    if (cardRef.length < 1) {
      return res.status(400).json({ error: "invalid_card_reference", message: "card_reference must have at least 1 digit" });
    }
    const entry = {
      id: uuid(),
      type: "card",
      date: dateStr,
      date_ts: dayStartTs,
      card_reference: cardRef,
      amount,
      system_card: summary.totalCard,
      user_id: req.user?.id || "",
      user_name: req.user?.name || "—",
      created_at: Date.now(),
    };
    await store.appendDailyTransactionEntry(entry);
    res.json(entry);
  } else {
    return res.status(400).json({ error: "invalid_type", message: "type must be cash or card" });
  }
  } catch (err) {
    console.error("[daily-transaction] POST error:", err?.message || err);
    res.status(500).json({ error: "server_error", message: String(err?.message || err) });
  }
});

app.get("/api/daily-transaction", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const dateStr = (req.query.date || "").toString().trim() || new Date().toISOString().slice(0, 10);
  const bounds = await store.getDayBounds(dateStr);
  if (!bounds) return res.status(400).json({ error: "invalid_date", message: "date must be YYYY-MM-DD" });
  const all = await store.getDailyTransactionEntries();
  const dayStart = bounds.startTs;
  const dayEnd = bounds.endTs;
  const forDay = all.filter((e) => {
    const ts = e.date_ts ?? e.created_at ?? 0;
    return ts >= dayStart && ts < dayEnd;
  });
  const cashEntries = forDay.filter((e) => !e.type || e.type === "cash");
  const cardEntries = forDay.filter((e) => e.type === "card");
  const summary = await store.getSalesSummaryForRange(dayStart, dayEnd);
  res.json({
    date: dateStr,
    systemCash: summary.totalCash,
    systemCard: summary.totalCard,
    cashEntries,
    cardEntries,
  });
});

// Reconciliation: Cash & Card from UTAP/Bank emails
app.get("/api/reconciliation/inbox-config", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const c = await store.getReconciliationInboxConfig();
  res.json({
    configured: !!(c && c.host && c.user),
    host: c?.host ? "***" : null,
    user: c?.user ? c.user.replace(/(.{2}).*(@.*)/, "$1***$2") : null,
  });
});

app.put("/api/reconciliation/inbox-config", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_settings") && !["admin", "manager"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { host, port, user, password, secure } = req.body || {};
  await store.updateSettings({
    reconciliation_inbox_config: {
      host: host?.trim() || null,
      port: port || 993,
      user: user?.trim() || null,
      password: password?.trim() || null,
      secure: secure !== false,
    },
  });
  res.json({ ok: true });
});

app.post("/api/reconciliation/fetch-now", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const result = await fetchReconciliationEmails();
  res.json(result);
});

app.get("/api/reconciliation/bank-settings", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  let s = await store.getReconciliationBankSettings();
  if (!s) {
    await store.updateSettings({ reconciliation_bank_settings: { default_percentage: 1.9, card_types: [{ name: "CREDIT PREMIUM", percentage: 2 }, { name: "INTERNATIONAL CARDS", percentage: 1.5 }] } });
    s = await store.getReconciliationBankSettings();
  }
  res.json(s);
});

app.put("/api/reconciliation/bank-settings", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_settings") && !["admin", "manager"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { default_percentage, card_types } = req.body || {};
  const current = await store.getReconciliationBankSettings();
  const updated = {
    default_percentage: typeof default_percentage === "number" ? default_percentage : (parseFloat(default_percentage) || 1.9),
    card_types: Array.isArray(card_types) ? card_types.map((c) => ({ name: String(c.name || "").trim() || "Card", percentage: parseFloat(c.percentage) || 0 })).filter((c) => c.name) : (current?.card_types || []),
  };
  await store.updateSettings({ reconciliation_bank_settings: updated });
  res.json(updated);
});

app.get("/api/reconciliation/bank-accounts", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const a = await store.getReconciliationBankAccounts();
  res.json(a);
});

app.put("/api/reconciliation/bank-accounts", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_settings") && !["admin", "manager"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { card_account, cash_account } = req.body || {};
  const updated = { card_account: String(card_account || "").trim(), cash_account: String(cash_account || "").trim() };
  await store.updateSettings({ reconciliation_bank_accounts: updated });
  res.json(updated);
});

app.get("/api/reconciliation/warnings", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const warnings = (await store.getReconciliationWarnings()).slice(-50).reverse();
  res.json({ warnings });
});

app.post("/api/reconciliation/warnings/clear", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  await store.updateSettings({ reconciliation_warnings: [] });
  res.json({ ok: true });
});

app.get("/api/reconciliation/summary", authMiddleware, async (req, res) => {
  try {
    await ensurePrismaReady();
    const dateStr = (req.query.date || "").toString().trim() || new Date().toISOString().slice(0, 10);
    const bounds = await store.getDayBounds(dateStr);
    if (!bounds) return res.status(400).json({ error: "invalid_date" });

    const summary = await store.getSalesSummaryForRange(bounds.startTs, bounds.endTs);
    const imports = await store.getReconciliationImports();
    const byDate = aggregateReconciliationByDate(imports);
    const dayData = byDate[dateStr] || { cash: 0, card: 0 };

    const dailyCashEntries = await getDailyCashEntriesForBounds(bounds.startTs, bounds.endTs);
    const physicalCashTotal = await getPhysicalCashTotalForBounds(bounds.startTs, bounds.endTs);

    const utapImportsForDate = (await store.getReconciliationImports()).filter((i) => i.source === "utap" && i.date === dateStr);
    const totalUtapDeduction = utapImportsForDate.reduce((s, i) => s + (i.deduction ?? 0), 0);
    const bankSettings = await store.getReconciliationBankSettings() || {};
    const defaultPct = bankSettings.default_percentage ?? 1.9;
    const expectedDeduction = summary.totalCard * (defaultPct / 100);
    const deductionDiff = totalUtapDeduction > 0 ? totalUtapDeduction - expectedDeduction : null;

    // Manual physical count (next day) - for verification
    const physicalCountStore = await store.getPhysicalCashCountByDate() || {};
    const manualPhysicalCount = physicalCountStore[dateStr] || null;
    // When manual count exists, use it for difference (manually counted cash - system); else use app deposits
    const effectivePhysicalCash = manualPhysicalCount ? manualPhysicalCount.amount : (physicalCashTotal > 0 ? physicalCashTotal : null);
    const cashDiff = effectivePhysicalCash != null ? effectivePhysicalCash - summary.totalCash : null;

    // Bank cash deposits near this date (date±2): bank may process next day or aggregate several days
    const addDaysStr = (s, n) => {
      const d = new Date(s + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const fromStr = addDaysStr(dateStr, -2);
    const toStr = addDaysStr(dateStr, 2);
    const bankCashNearby = (imports || [])
      .filter((i) => i.source === "bank_email_cash" && i.date >= fromStr && i.date <= toStr)
      .map((i) => ({ date: i.date, amount: i.amount ?? 0, description: i.description || "Cash deposit" }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    res.json({
    date: dateStr,
    cash: {
      systemCash: summary.totalCash,
      physicalCash: physicalCashTotal > 0 ? physicalCashTotal : null,
      physicalCashTotal,
      bankDeposit: dayData.cash,
      difference: cashDiff,
      dailyCashEntries,
      bankCashDepositsNearby: bankCashNearby,
      manualPhysicalCount: manualPhysicalCount ? { amount: manualPhysicalCount.amount, user_name: manualPhysicalCount.user_name, created_at: manualPhysicalCount.created_at } : null,
    },
    card: {
      systemCard: summary.totalCard,
      utapTotal: dayData.card,
      bankDeposit: dayData.card,
      difference: dayData.card > 0 ? dayData.card - summary.totalCard : null,
      deduction: {
        bankPercentage: defaultPct,
        expectedFromPOS: expectedDeduction,
        actualFromCSV: totalUtapDeduction,
        difference: deductionDiff,
      },
    },
  });
  } catch (err) {
    console.error("[reconciliation/summary] Error:", err?.message || err);
    res.status(500).json({ error: "reconciliation_summary_error", message: err?.message || "Internal error" });
  }
});

/** Set manual physical cash count (next day). */
app.put("/api/reconciliation/physical-count", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const amount = parseFloat(req.body.amount);
  if (isNaN(amount) || amount < 0) return res.status(400).json({ error: "invalid_amount", message: "amount must be a non-negative number" });
  const dateStr = (req.body.date || "").toString().trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return res.status(400).json({ error: "invalid_date" });
  const physStore = await store.getPhysicalCashCountByDate() || {};
  physStore[dateStr] = {
    amount,
    user_id: req.user?.id || "",
    user_name: req.user?.name || "—",
    created_at: Date.now(),
  };
  await store.updateSettings({ physical_cash_count_by_date: physStore });
  res.json({ ok: true, amount, date: dateStr });
});

/** Card transaction detail for reconciliation: POS vs UTAP, match status. */
app.get("/api/reconciliation/card-detail", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const dateStr = (req.query.date || "").toString().trim() || new Date().toISOString().slice(0, 10);
  const bounds = await store.getDayBounds(dateStr);
  if (!bounds) return res.status(400).json({ error: "invalid_date" });

  const summary = await store.getSalesSummaryForRange(bounds.startTs, bounds.endTs);
  const paymentMethods = await store.getAllPaymentMethods();
  const ordersList = await store.getOrders();
  const orders = ordersList.reduce((acc, o) => {
    acc[o.id] = o;
    return acc;
  }, {});

  const posTransactions = [];
  const paymentsList = await store.getPayments();
  for (const p of paymentsList) {
    if (!summary.paidOrderIds.has(p.order_id)) continue;
    const code = resolvePaymentMethodCode(p.method, paymentMethods);
    if (code !== "card") continue;
    const order = orders[p.order_id];
    posTransactions.push({
      id: p.id,
      amount: p.amount || 0,
      order_id: p.order_id,
      table_number: order?.table_number || "—",
      receipt_no: order ? `#${String(order.table_number || order.id).slice(-8)}` : "—",
      created_at: p.created_at,
    });
  }
  posTransactions.sort((a, b) => a.created_at - b.created_at);

  const utapImports = (await store.getReconciliationImports()).filter((i) => (i.source === "utap" || i.source === "bank_email_card") && i.date === dateStr);
  const utapTransactions = utapImports.map((i) => ({
    id: i.id,
    amount: i.amount,
    deduction: i.deduction ?? null,
    net_amount: i.net_amount ?? null,
    description: i.description || "",
    created_at: i.created_at,
  })).sort((a, b) => a.created_at - b.created_at);

  const bankSettings = (await store.getReconciliationBankSettings()) || {};
  const defaultPct = bankSettings.default_percentage ?? 1.9;
  const totalUtapGross = utapTransactions.reduce((s, u) => s + u.amount, 0);
  const totalUtapDeduction = utapTransactions.reduce((s, u) => s + (u.deduction ?? 0), 0);
  const expectedDeduction = summary.totalCard * (defaultPct / 100);
  const deductionDifference = totalUtapDeduction > 0 ? totalUtapDeduction - expectedDeduction : null;

  const TOLERANCE = 0.01;
  const posUsed = new Set();
  const utapUsed = new Set();
  const matched = [];
  for (const pos of posTransactions) {
    const idx = utapTransactions.findIndex(
      (u, i) => !utapUsed.has(i) && Math.abs(u.amount - pos.amount) < TOLERANCE
    );
    if (idx >= 0) {
      utapUsed.add(idx);
      posUsed.add(pos.id);
      matched.push({ pos, utap: utapTransactions[idx], status: "ok" });
    }
  }

  const posUnmatched = posTransactions.filter((p) => !posUsed.has(p.id));
  const utapUnmatched = utapTransactions.filter((_, i) => !utapUsed.has(i));

  res.json({
    date: dateStr,
    systemCard: summary.totalCard,
    utapTotal: totalUtapGross,
    difference: summary.totalCard - totalUtapGross,
    deduction: {
      bankPercentage: defaultPct,
      expectedFromPOS: expectedDeduction,
      actualFromCSV: totalUtapDeduction,
      difference: deductionDifference,
    },
    posTransactions: posTransactions.map((p) => ({
      ...p,
      status: posUsed.has(p.id) ? "matched" : "unmatched",
    })),
    utapTransactions: utapTransactions.map((u, i) => ({
      ...u,
      status: utapUsed.has(i) ? "matched" : "unmatched",
    })),
    matchedCount: matched.length,
    posUnmatchedCount: posUnmatched.length,
    utapUnmatchedCount: utapUnmatched.length,
  });
});

// Table reservations: expire 10 min after end time
const RESERVATION_GRACE_MS = 10 * 60 * 1000;

function parseReservationTime(v) {
  if (v == null) return NaN;
  if (typeof v === "number" && !isNaN(v)) return v;
  const t = new Date(v).getTime();
  return isNaN(t) ? NaN : t;
}

async function expireTableReservations() {
  const now = Date.now();
  const list = await store.getTableReservations();
  let changed = false;
  for (const r of list) {
    if (r.status === "active" && r.to_time != null && now > r.to_time + RESERVATION_GRACE_MS) {
      await store.updateTableReservation(r.id, { ...r, status: "expired" });
      changed = true;
    }
  }
  return changed;
}

async function getActiveReservationForTable(tableId) {
  const now = Date.now();
  const list = await store.getTableReservations();
  return list.find(
    (r) => r.table_id === tableId && r.status === "active" && r.to_time != null && now <= r.to_time + RESERVATION_GRACE_MS
  );
}

// Tables
app.get("/api/tables", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  await expireTableReservations();
  const tables = await store.getTables();
  const tablesMapped = [];
  for (const r of tables) {
      const num = typeof r.number === "string" ? parseInt(r.number, 10) || 0 : r.number ?? 0;
      const out = {
        ...r,
        number: num,
        current_order_id: r.current_order_id || null,
        waiter_id: r.waiter_id || null,
        waiter_name: r.waiter_name || null,
      };
      const isFree = !r.current_order_id;
      const activeRes = isFree ? await getActiveReservationForTable(r.id) : null;
      if (activeRes) {
        out.status = "reserved";
        out.reservation = {
          id: activeRes.id,
          guest_name: activeRes.guest_name || "",
          guest_phone: activeRes.guest_phone || "",
          from_time: activeRes.from_time,
          to_time: activeRes.to_time,
        };
      }
    tablesMapped.push(out);
  }
  res.json(tablesMapped);
});

app.post("/api/tables", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const id = req.body.id || `t_${uuid().slice(0, 8)}`;
  const body = req.body;
  const num = typeof body.number === "number" ? body.number : parseInt(body.number, 10) || 1;
  const t = await store.createTable({
    id, number: num, name: body.name || `Table ${num}`, capacity: body.capacity ?? 4, floor: body.floor || "Main",
    status: body.status || "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null,
    x: body.x ?? 80, y: body.y ?? 50, width: body.width ?? 80, height: body.height ?? 80, shape: body.shape || "square",
  });
  res.json(t);
});

// Bulk import tables from CSV/Excel (JSON array). Columns: Number, Name, Section, Capacity, X, Y, Width, Height
app.post("/api/tables/import", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const rows = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.rows) ? req.body.rows : [];
  const sections = { A: [], B: [], C: [], D: [], E: [] };
  const existingTables = await store.getTables();
  const byNumber = new Map(existingTables.map((t) => [typeof t.number === "number" ? t.number : parseInt(t.number, 10) || 0, t]));
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const num = typeof row.Number === "number" ? row.Number : parseInt(row.Number ?? row.number, 10);
    if (isNaN(num) || num < 1) continue;
    const name = String(row.Name ?? row.name ?? `Table ${num}`).trim() || `Table ${num}`;
    const section = String(row.Section ?? row.section ?? "").trim().toUpperCase();
    const capacity = parseInt(row.Capacity ?? row.capacity, 10) || 4;
    const x = parseInt(row.X ?? row.x, 10) || 80;
    const y = parseInt(row.Y ?? row.y, 10) || 50;
    const width = parseInt(row.Width ?? row.width, 10) || 80;
    const height = parseInt(row.Height ?? row.height, 10) || 80;
    const existing = byNumber.get(num);
    const payload = { number: num, name, capacity, floor: "Main", x, y, width, height };
    if (existing) {
      await store.updateTable(existing.id, payload);
      updated++;
    } else {
      await store.createTable({
        id: `t_${uuid().slice(0, 8)}`,
        ...payload,
        status: "free",
        current_order_id: null,
        guest_count: 0,
        waiter_id: null,
        waiter_name: null,
        opened_at: null,
        shape: "square",
      });
      created++;
    }
    if (section && ["A", "B", "C", "D", "E"].includes(section)) {
      const arr = sections[section];
      if (!arr.includes(num)) arr.push(num);
    }
  }
  const settings = await store.getSettings();
  const currentSections = (settings?.floor_plan_sections && typeof settings.floor_plan_sections === "object")
    ? { ...settings.floor_plan_sections } : { A: [], B: [], C: [], D: [], E: [] };
  for (const k of ["A", "B", "C", "D", "E"]) {
    const merged = [...new Set([...(currentSections[k] || []), ...(sections[k] || [])])].sort((a, b) => a - b);
    currentSections[k] = merged;
  }
  await store.updateSettings({ floor_plan_sections: currentSections });
  res.json({ ok: true, created, updated, sections: currentSections });
});

app.post("/api/tables/:id/open", authMiddleware, async (req, res) => {
  try {
    await ensurePrismaReady();
    const user = req.user;
    const body = req.body || {};
    console.log("ANDROID_RAW_DATA [POST /api/tables/:id/open]:", JSON.stringify({ ...body, params: req.params, query: req.query }));
    const { id } = req.params;
    const guestCount = Number(req.query.guest_count ?? body.guest_count ?? body.guestCount ?? 1) || 1;
    const waiterId = req.query.waiter_id ?? req.user?.id ?? body.waiter_id ?? body.waiterId;
  const users = await store.getAllUsers();
  const waiter = users.find((u) => u.id === waiterId);
  const tables = await store.getTables();
  const tbl = tables.find((t) => t.id === id);
  if (!tbl) return res.status(404).json({ error: "Not found" });
  const existingOrderId = tbl.current_order_id || null;
  const orders = await store.getOrders();
  const existingOrder = existingOrderId ? orders.find((o) => o.id === existingOrderId) : null;
  if (existingOrder && existingOrder.status !== "paid") {
    return res.status(409).json({
      error: "table_already_occupied",
      message: "Masa zaten açık; mevcut siparişi kullanın.",
      current_order_id: existingOrderId,
      table: { ...tbl, number: typeof tbl.number === "string" ? parseInt(tbl.number, 10) || 0 : (tbl.number ?? 0) },
    });
  }
  const orderId = `ord_${uuid().slice(0, 12)}`;
  const now = Date.now();
  await store.createOrder({
    id: orderId, table_id: id, table_number: String(tbl.number), waiter_id: waiterId, waiter_name: waiter?.name || "Waiter",
    status: "open", subtotal: 0, tax_amount: 0, discount_percent: 0, discount_amount: 0, total: 0,
    created_at: new Date(now), paid_at: null, zoho_receipt_id: null,
  });
  const updated = await store.updateTable(id, {
    status: "occupied", current_order_id: orderId, guest_count: guestCount, waiter_id: waiterId,
    waiter_name: waiter?.name || "Waiter", opened_at: new Date(now),
  });
  res.json(updated);
  } catch (e) {
    console.error("[ANDROID_TABLE_OPEN_ERR]", req.params?.id, e?.message || e);
    if (e?.stack) console.error(e.stack);
    res.status(500).json({ error: "Table open failed", message: String(e?.message || e) });
  }
});

app.post("/api/tables/:id/close", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  try {
    const t = await store.updateTable(req.params.id, { status: "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null });
    res.json(t);
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.put("/api/tables/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body || {};
  // Kapanış saatinde devir yapılamaz: masa/garson devri (waiter_id değişikliği) auto-close penceresinde engellenir.
  if (body.waiter_id != null) {
    const inCloseWindow = await getIsInAutoCloseWindow();
    if (inCloseWindow) {
      return res.status(403).json({
        error: "HANDOVER_DISALLOWED_AT_CLOSING",
        message: "Kapanış saatinde devir yapılamaz.",
      });
    }
  }
  const updates = {};
  if (body.status != null) updates.status = body.status;
  if (Object.prototype.hasOwnProperty.call(body, "current_order_id")) updates.current_order_id = body.current_order_id;
  if (body.waiter_id != null) updates.waiter_id = body.waiter_id;
  if (body.waiter_name != null) updates.waiter_name = body.waiter_name;
  if (body.guest_count != null) updates.guest_count = body.guest_count;
  if (body.opened_at != null) updates.opened_at = body.opened_at;
  try {
    const t = await store.updateTable(req.params.id, updates);
    res.json({ ...t, number: typeof t.number === "string" ? parseInt(t.number, 10) || 0 : (t.number ?? 0), current_order_id: t.current_order_id || null, waiter_id: t.waiter_id || null, waiter_name: t.waiter_name || null });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

// Delete table (even when opened – cancels reservations, cascade deletes orders)
app.delete("/api/tables/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const tables = await store.getTables();
  const tbl = tables.find((t) => t.id === id);
  if (!tbl) return res.status(404).json({ error: "Table not found" });
  const list = await store.getTableReservations();
  for (const r of list) {
    if (r.table_id === id && r.status === "active") {
      await store.updateTableReservation(r.id, { ...r, status: "cancelled" });
    }
  }
  try {
    await store.deleteTable(id);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

// ============ Data Audit & Recovery (Veri Denetim ve Kurtarma) ============
app.get("/api/recovery/deleted", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  if (!userCanAccessSettings(req.user)) {
    return res.status(403).json({ error: "Forbidden", message: "Ayarlar yetkisi gerekli." });
  }
  const data = await store.getDeletedRecords();
  res.json(data);
});

app.post("/api/recovery/restore/table/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  if (!userCanAccessSettings(req.user)) {
    return res.status(403).json({ error: "Forbidden", message: "Ayarlar yetkisi gerekli." });
  }
  try {
    const t = await store.restoreTable(req.params.id);
    res.json({ ok: true, table: t });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.post("/api/recovery/restore/order/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  if (!userCanAccessSettings(req.user)) {
    return res.status(403).json({ error: "Forbidden", message: "Ayarlar yetkisi gerekli." });
  }
  try {
    const o = await store.restoreOrder(req.params.id);
    res.json({ ok: true, order: o });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.post("/api/recovery/restore/order-item/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  if (!userCanAccessSettings(req.user)) {
    return res.status(403).json({ error: "Forbidden", message: "Ayarlar yetkisi gerekli." });
  }
  try {
    const i = await store.restoreOrderItem(req.params.id);
    res.json({ ok: true, orderItem: i });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "Not found" });
    throw e;
  }
});

app.get("/api/recovery/sync-errors", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  if (!userCanAccessSettings(req.user)) {
    return res.status(403).json({ error: "Forbidden", message: "Ayarlar yetkisi gerekli." });
  }
  const list = await store.getSyncErrors();
  res.json(list);
});

app.post("/api/sync-errors", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body || {};
  const { source = "android", entity_type, entity_id, message, payload } = body;
  if (!entity_type) return res.status(400).json({ error: "entity_type required" });
  await store.createSyncError({ source, entity_type, entity_id: entity_id || null, message: message || null, payload: payload || null });
  res.json({ ok: true });
});

// Reserve table: guest name + time range. Reservation auto-expires 10 min after end time.
app.post("/api/tables/:id/reserve", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id: tableId } = req.params;
  const tables = await store.getTables();
  const tbl = tables.find((t) => t.id === tableId);
  if (!tbl) return res.status(404).json({ error: "Table not found" });
  if (tbl.current_order_id) return res.status(409).json({ error: "Table is occupied" });
  const guestName = (req.body.guest_name || req.body.guestName || "").toString().trim();
  if (!guestName) return res.status(400).json({ error: "guest_name is required" });
  const guestPhone = (req.body.guest_phone || req.body.guestPhone || "").toString().trim();
  const fromTime = parseReservationTime(req.body.from_time ?? req.body.fromTime);
  const toTime = parseReservationTime(req.body.to_time ?? req.body.toTime);
  if (isNaN(fromTime) || isNaN(toTime) || toTime <= fromTime)
    return res.status(400).json({ error: "Valid from_time and to_time (ISO or ms) required; to_time must be after from_time" });
  const now = Date.now();
  const list = await store.getTableReservations();
  const overlapping = list.some(
    (r) =>
      r.table_id === tableId &&
      r.status === "active" &&
      r.to_time != null &&
      now <= r.to_time + RESERVATION_GRACE_MS &&
      !(toTime < r.from_time || fromTime > r.to_time + RESERVATION_GRACE_MS)
  );
  if (overlapping) return res.status(409).json({ error: "Table already has an active reservation in this time range" });
  const reservationId = `res_${uuid().slice(0, 12)}`;
  const reservation = {
    id: reservationId,
    table_id: tableId,
    guest_name: guestName,
    guest_phone: guestPhone,
    from_time: fromTime,
    to_time: toTime,
    created_at: now,
    status: "active",
  };
  await store.createTableReservation(reservation);
  res.status(201).json(reservation);
});

// Cancel reservation for table (by reservation id or any active for table)
app.post("/api/tables/:id/reservation/cancel", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id: tableId } = req.params;
  const reservationId = req.body.reservation_id ?? req.body.reservationId ?? req.query.reservation_id;
  const list = await store.getTableReservations();
  const idx = reservationId
    ? list.findIndex((r) => r.id === reservationId && r.table_id === tableId)
    : list.findIndex((r) => r.table_id === tableId && r.status === "active");
  if (idx < 0) return res.status(404).json({ error: "Reservation not found" });
  const r = list[idx];
  await store.updateTableReservation(r.id, { ...r, status: "cancelled" });
  res.json({ ok: true, reservation: { ...r, status: "cancelled" } });
});

// Floor plan sections (A,B,C,D,E filters)
app.get("/api/floor-plan-sections", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  res.json(await store.getFloorPlanSections() || {});
});

app.put("/api/floor-plan-sections", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body || {};
  if (typeof body !== "object") return res.status(400).json({ error: "Body must be object" });
  const sections = { A: [], B: [], C: [], D: [], E: [] };
  for (const k of ["A", "B", "C", "D", "E"]) {
    const arr = Array.isArray(body[k]) ? body[k].map((n) => (typeof n === "number" && n >= 1 ? n : parseInt(n, 10))).filter((n) => !isNaN(n) && n >= 1) : [];
    sections[k] = [...new Set(arr)].sort((a, b) => a - b);
  }
  await store.updateSettings({ floor_plan_sections: sections });
  res.json(sections);
});

// Import floor plan section filters (JSON array). Rows: { Section: "A", TableNumbers: "1,2,3,4,5" } or { Section: "A", Tables: "1,2,3" }
app.post("/api/floor-plan-sections/import", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const rows = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.rows) ? req.body.rows : [];
  const sections = { A: [], B: [], C: [], D: [], E: [] };
  for (const row of rows) {
    const section = String(row.Section ?? row.section ?? "").trim().toUpperCase();
    if (!["A", "B", "C", "D", "E"].includes(section)) continue;
    const numsStr = String(row.TableNumbers ?? row.tableNumbers ?? row.Tables ?? row.tables ?? "").trim();
    const nums = numsStr.split(/[,;\s]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n >= 1);
    const arr = sections[section];
    for (const n of nums) {
      if (!arr.includes(n)) arr.push(n);
    }
  }
  for (const k of ["A", "B", "C", "D", "E"]) {
    sections[k].sort((a, b) => a - b);
  }
  await store.updateSettings({ floor_plan_sections: sections });
  res.json(sections);
});

// List pending discount requests (must be before /api/orders/:id so "discount-requests" is not matched as id)
app.get("/api/orders/discount-requests", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_approve_discount") && req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Permission denied" });
  }
  const status = req.query.status || "pending";
  const discountReqs = await store.getDiscountRequests();
  let list = discountReqs.filter((r) => r.status === status);
  const orders = await store.getOrders();
  list = list.map((r) => {
    const order = orders.find((o) => o.id === r.order_id);
    return { ...r, order_subtotal: order?.subtotal, order_total_before_discount: order ? (order.subtotal || 0) + (order.tax_amount || 0) : 0 };
  });
  list.sort((a, b) => (a.requested_at || 0) - (b.requested_at || 0));
  res.json({ requests: list });
});

// Orders (full ticket detail: order, items, payments, voids). Items from DB, shape for web floor.
app.get("/api/orders/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const order = await store.getOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });
  const rawItems = await store.getOrderItems(order.id);
  const products = await store.getAllProducts();
  const s = await store.getSettings();
  const defaultOverdue = Math.min(1440, Math.max(1, (s?.overdue_undelivered_minutes ?? 10) | 0));
  const toTs = (v) => (v == null ? null : v instanceof Date ? v.getTime() : Number(v));
  const items = rawItems.map((i) => {
    const product = i.product_id ? products.find((p) => p.id === i.product_id) : null;
    const overdue_undelivered_minutes = product?.overdue_undelivered_minutes != null ? product.overdue_undelivered_minutes : defaultOverdue;
    return {
      id: i.id,
      order_id: i.order_id,
      product_id: i.product_id,
      product_name: i.product_name ?? "",
      quantity: Number(i.quantity) || 0,
      price: Number(i.price) || 0,
      notes: i.notes ?? "",
      status: i.status ?? "pending",
      sent_at: toTs(i.sent_at),
      delivered_at: toTs(i.delivered_at),
      client_line_id: i.client_line_id ?? null,
      overdue_undelivered_minutes,
    };
  });
  const payments = Array.isArray(order.payments) ? order.payments : (await store.getPayments()).filter((p) => p.order_id === order.id);
  const allVoids = await store.getVoidLogs();
  const voids = allVoids.filter((v) => v.order_id === order.id);
  const { orderItems, created_at, paid_at, createdAt, ...orderRest } = order;
  const createdAtMs = created_at ? toTs(created_at) : toTs(createdAt);
  const paidAtMs = paid_at ? toTs(paid_at) : null;
  res.json({ ...orderRest, created_at: createdAtMs, paid_at: paidAtMs, items, payments, voids });
});

app.patch("/api/orders/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const orderId = req.params.id;
  const body = req.body || {};
  const existing = await store.getOrderById(orderId);
  if (!existing) return res.status(404).json({ error: "Order not found" });

  const updates = {};
  if (body.table_id != null) updates.table_id = body.table_id;
  if (body.table_number != null) updates.table_number = body.table_number;
  if (body.status != null) updates.status = body.status;

  // Değişiklik yoksa mevcut order'ı full detayla döndür (items dahil).
  if (Object.keys(updates).length === 0) {
    const rawItems = await store.getOrderItems(orderId);
    const products = await store.getAllProducts();
    const s = await store.getSettings();
    const defaultOverdue = Math.min(1440, Math.max(1, (s?.overdue_undelivered_minutes ?? 10) | 0));
    const toTs = (v) => (v == null ? null : v instanceof Date ? v.getTime() : Number(v));
    const items = rawItems.map((i) => {
      const product = i.product_id ? products.find((p) => p.id === i.product_id) : null;
      const overdue_undelivered_minutes = product?.overdue_undelivered_minutes != null ? product.overdue_undelivered_minutes : defaultOverdue;
      return {
        id: i.id,
        order_id: i.order_id,
        product_id: i.product_id,
        product_name: i.product_name ?? "",
        quantity: Number(i.quantity) || 0,
        price: Number(i.price) || 0,
        notes: i.notes ?? "",
        status: i.status ?? "pending",
        sent_at: toTs(i.sent_at),
        delivered_at: toTs(i.delivered_at),
        client_line_id: i.client_line_id ?? null,
        overdue_undelivered_minutes,
      };
    });
    const payments = Array.isArray(existing.payments) ? existing.payments : (await store.getPayments()).filter((p) => p.order_id === existing.id);
    const allVoids = await store.getVoidLogs();
    const voids = allVoids.filter((v) => v.order_id === existing.id);
    const { orderItems, created_at, paid_at, createdAt, ...orderRest } = existing;
    const createdAtMs = created_at ? toTs(created_at) : toTs(createdAt);
    const paidAtMs = paid_at ? toTs(paid_at) : null;
    return res.json({ ...orderRest, created_at: createdAtMs, paid_at: paidAtMs, items, payments, voids });
  }

  try {
    const now = new Date();
    const isSentTransition = updates.status === "sent" && existing.status !== "sent";

    if (isSentTransition) {
      // Sipariş status'ü "sent" oluyorsa: order + pending item'lar aynı transaction içinde güncellensin.
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: orderId },
          data: {
            ...updates,
          },
        });

        await tx.orderItem.updateMany({
          where: {
            order_id: orderId,
            status: "pending",
            sent_at: null,
          },
          data: {
            status: "sent",
            sent_at: now,
          },
        });
      });
    } else {
      // Status "sent" değilse normal update.
      await store.updateOrder(orderId, updates);
    }

    // Her durumda güncel order'ı items ile birlikte döndür.
    const order = await store.getOrderById(orderId);
    const rawItems = await store.getOrderItems(orderId);
    const products = await store.getAllProducts();
    const s = await store.getSettings();
    const defaultOverdue = Math.min(1440, Math.max(1, (s?.overdue_undelivered_minutes ?? 10) | 0));
    const toTs = (v) => (v == null ? null : v instanceof Date ? v.getTime() : Number(v));
    const items = rawItems.map((i) => {
      const product = i.product_id ? products.find((p) => p.id === i.product_id) : null;
      const overdue_undelivered_minutes = product?.overdue_undelivered_minutes != null ? product.overdue_undelivered_minutes : defaultOverdue;
      return {
        id: i.id,
        order_id: i.order_id,
        product_id: i.product_id,
        product_name: i.product_name ?? "",
        quantity: Number(i.quantity) || 0,
        price: Number(i.price) || 0,
        notes: i.notes ?? "",
        status: i.status ?? "pending",
        sent_at: toTs(i.sent_at),
        delivered_at: toTs(i.delivered_at),
        client_line_id: i.client_line_id ?? null,
        overdue_undelivered_minutes,
      };
    });
    const payments = Array.isArray(order.payments) ? order.payments : (await store.getPayments()).filter((p) => p.order_id === order.id);
    const allVoids = await store.getVoidLogs();
    const voids = allVoids.filter((v) => v.order_id === order.id);
    const { orderItems, created_at, paid_at, createdAt, ...orderRest } = order;
    const createdAtMs = created_at ? toTs(created_at) : toTs(createdAt);
    const paidAtMs = paid_at ? toTs(paid_at) : null;
    res.json({ ...orderRest, created_at: createdAtMs, paid_at: paidAtMs, items, payments, voids });
  } catch (e) {
    console.error("PATCH /api/orders/:id failed", e);
    res.status(500).json({ error: "order_update_failed", message: e?.message || "Failed to update order" });
  }
});

app.post("/api/orders", authMiddleware, async (req, res) => {
  try {
    await ensurePrismaReady();
    const user = req.user;
    const body = req.body || {};
    console.log("ANDROID_RAW_DATA [POST /api/orders]:", JSON.stringify(body));

    const tableId = body.table_id || body.tableId;
    if (!tableId) {
      return res.status(400).json({ error: "table_id or tableId required" });
    }
    const waiterId = req.query.waiter_id || req.user?.id || body.waiter_id || body.waiterId;
    const users = await store.getAllUsers();
    const waiter = waiterId ? users.find((u) => u.id === waiterId) : null;
    const tables = await store.getTables();
    const tbl = tables.find((t) => t.id === tableId);
    if (tbl?.current_order_id) {
      const orders = await store.getOrders();
      const existingOrder = orders.find((o) => o.id === tbl.current_order_id);
      if (existingOrder && existingOrder.status !== "paid") {
        const items = await store.getOrderItems(existingOrder.id);
        return res.status(409).json({
          error: "table_already_occupied",
          message: "Bu masada zaten açık sipariş var.",
          current_order_id: existingOrder.id,
          order: { ...existingOrder, items },
        });
      }
    }
    const subtotal = Number(body.subtotal ?? body.sub_total ?? 0) || 0;
    const taxAmount = Number(body.tax_amount ?? body.taxAmount ?? body.tax ?? 0) || 0;
    const discountPercent = Number(body.discount_percent ?? body.discountPercent ?? 0) || 0;
    const discountAmount = Number(body.discount_amount ?? body.discountAmount ?? 0) || 0;
    const total = Number(body.total ?? body.total_price ?? body.totalAmount ?? body.totalPrice ?? 0) || 0;

    const audit = getAuditFromRequest(req);
    const orderId = body.id || body.order_id || `ord_${uuid().slice(0, 12)}`;
    const order = await store.createOrder({
      id: orderId,
      table_id: tableId,
      table_number: String(tbl?.number ?? body.table_number ?? body.tableNumber ?? "1"),
      waiter_id: waiterId || null,
      waiter_name: waiter?.name ?? body.waiter_name ?? body.waiterName ?? "Waiter",
      status: body.status || "open",
      subtotal,
      tax_amount: taxAmount,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      total,
      created_at: body.created_at ? new Date(body.created_at) : new Date(),
      paid_at: body.paid_at ? new Date(body.paid_at) : null,
      zoho_receipt_id: body.zoho_receipt_id ?? null,
      source: audit.source,
      device_id: audit.deviceId,
    });
    if (tbl) {
      await store.updateTable(tableId, {
        status: "occupied",
        current_order_id: orderId,
        waiter_id: waiterId,
        waiter_name: waiter?.name ?? "Waiter",
        guest_count: body.guest_count ?? body.guestCount ?? 1,
        opened_at: new Date(),
      });
    }
    const itemsArray = body.items ?? body.orderItems ?? body.order_items ?? [];
    const products = await store.getAllProducts();
    const productIds = new Set((products || []).map((p) => p.id));
    const fallbackProductId = products[0]?.id || "p_unknown";
    for (let i = 0; i < itemsArray.length; i++) {
      const it = itemsArray[i] || {};
      let prodId = it.product_id ?? it.productId ?? fallbackProductId;
      if (!productIds.has(prodId)) prodId = fallbackProductId;
      const prodName = it.product_name ?? it.productName ?? it.name ?? "Item";
      const qty = Number(it.quantity ?? 1) || 1;
      const price = Number(it.price ?? it.unit_price ?? it.unitPrice ?? 0) || 0;
      try {
        await store.createOrderItem({
          id: it.id || `item_${uuid().slice(0, 8)}`,
          order_id: orderId,
          product_id: prodId,
          product_name: prodName,
          quantity: qty,
          price,
          notes: it.notes ?? "",
          status: it.status ?? "pending",
          sent_at: it.sent_at ? new Date(it.sent_at) : null,
          client_line_id: it.client_line_id ?? it.clientLineId ?? null,
        });
      } catch (itemErr) {
        console.error("[ANDROID_ORDER_ITEM_ERR]", orderId, it, itemErr?.message || itemErr);
      }
    }
    const items = await store.getOrderItems(orderId);
    if (items.length > 0 && (subtotal === 0 || total === 0)) await recalcOrderTotal(orderId);
    const finalOrder = await store.getOrderById(orderId);
    res.json({ ...(finalOrder || order), items });
  } catch (e) {
    console.error("[ANDROID_ORDER_SAVE_ERR]", e?.message || e);
    if (e?.stack) console.error(e.stack);
    res.status(500).json({ error: "Order save failed", message: String(e?.message || e) });
  }
});

async function recalcOrderTotal(orderId) {
  const items = await store.getOrderItems(orderId);
  let subtotal = 0;
  for (const i of items) subtotal += (i.quantity || 0) * (i.price || 0);
  const s = await store.getSettings();
  const vatPercent = Math.min(100, Math.max(0, (s?.vat_percent ?? 0) | 0));
  const taxAmount = subtotal * (vatPercent / 100);
  const order = await store.getOrderById(orderId);
  if (!order) return;
  const discountPercent = Number(order.discount_percent) || 0;
  const discountAmount = Number(order.discount_amount) || 0;
  const discount = (subtotal + taxAmount) * (discountPercent / 100) + discountAmount;
  const total = Math.max(0, subtotal + taxAmount - discount);
  await store.updateOrder(orderId, { subtotal, tax_amount: taxAmount, discount_percent: discountPercent, discount_amount: discountAmount, total });
}

app.post("/api/orders/:id/items", authMiddleware, async (req, res) => {
  try {
    await ensurePrismaReady();
    const orderId = req.params.id;
    const body = req.body || {};
    console.log("ANDROID_RAW_DATA [POST /api/orders/:id/items]:", JSON.stringify(body));

    const products = await store.getAllProducts();
    const productIdsSet = new Set((products || []).map((p) => p.id));
    const fallbackProductId = products[0]?.id || "p_unknown";
    const clientLineId = body.client_line_id ?? body.clientLineId ?? null;
    let productId = body.product_id ?? body.productId ?? fallbackProductId;
    if (!productIdsSet.has(productId)) productId = fallbackProductId;
    const productName = body.product_name ?? body.productName ?? body.name ?? "Item";
    const quantity = Number(body.quantity ?? 1) || 1;
    const price = Number(body.price ?? body.unit_price ?? body.unitPrice ?? 0) || 0;

    // Sipariş zaten "sent" mi? Öyleyse yeni/güncellenen item'lar da "sent" olmalı.
    const parentOrder = await store.getOrderById(orderId);
    const orderAlreadySent = parentOrder?.status === "sent";
    const now = new Date();

    const orderItems = await store.getOrderItems(orderId);
    if (clientLineId) {
      const existing = orderItems.find((i) => i.client_line_id === clientLineId);
      if (existing) {
        // status: gelen "sent" ise güncelle; mevcut "sent" ise koru; sipariş "sent" ise koru; yoksa pending
        const incomingStatus = body.status ?? null;
        const resolvedStatus =
          incomingStatus === "sent" ? "sent"
          : existing.status === "sent" ? "sent"
          : orderAlreadySent ? "sent"
          : incomingStatus ?? existing.status ?? "pending";
        const incomingSentAt = body.sent_at ? new Date(body.sent_at) : null;
        const resolvedSentAt = resolvedStatus === "sent"
          ? (incomingSentAt ?? existing.sent_at ?? now)
          : existing.sent_at;
        const updated = await store.updateOrderItem(existing.id, {
          product_id: productId,
          product_name: productName,
          quantity,
          price,
          notes: body.notes ?? existing.notes ?? "",
          status: resolvedStatus,
          sent_at: resolvedSentAt,
        });
        await recalcOrderTotal(orderId);
        return res.json({ ...updated, order_id: orderId });
      }
    }

    // Yeni item: sipariş zaten "sent" ise bu item da "sent" olarak kaydedilsin.
    const newItemStatus = body.status === "sent" ? "sent" : orderAlreadySent ? "sent" : "pending";
    const newItemSentAt = newItemStatus === "sent"
      ? (body.sent_at ? new Date(body.sent_at) : now)
      : null;

    const itemId = body.id ?? body.item_id ?? `item_${uuid().slice(0, 8)}`;
    const newItem = await store.createOrderItem({
      id: itemId,
      order_id: orderId,
      product_id: productId,
      product_name: productName,
      quantity,
      price,
      notes: body.notes ?? "",
      status: newItemStatus,
      sent_at: newItemSentAt,
      client_line_id: clientLineId,
    });
    await recalcOrderTotal(orderId);
    res.json({ ...newItem, order_id: orderId });
  } catch (e) {
    console.error("[ANDROID_ORDER_ITEM_SAVE_ERR]", req.params.id, e?.message || e);
    if (e?.stack) console.error(e.stack);
    res.status(500).json({ error: "Item save failed", message: String(e?.message || e) });
  }
});

app.put("/api/orders/:orderId/items/:itemId", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { orderId, itemId } = req.params;
  const body = req.body;
  const items = await store.getOrderItems(orderId);
  const item = items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: "Not found" });
  // Sipariş zaten "sent" ise item da "sent" olmalı
  const parentOrder = await store.getOrderById(orderId);
  const orderAlreadySent = parentOrder?.status === "sent";
  const incomingStatus = body.status ?? null;
  const resolvedStatus =
    incomingStatus === "sent" ? "sent"
    : item.status === "sent" ? "sent"
    : orderAlreadySent ? "sent"
    : incomingStatus ?? item.status ?? "pending";
  const incomingSentAt = body.sent_at ? new Date(body.sent_at) : null;
  const resolvedSentAt = resolvedStatus === "sent"
    ? (incomingSentAt ?? item.sent_at ?? new Date())
    : item.sent_at;
  const updated = await store.updateOrderItem(itemId, {
    product_id: body.product_id || null,
    product_name: body.product_name,
    quantity: body.quantity ?? 1,
    price: body.price ?? 0,
    notes: body.notes || "",
    status: resolvedStatus,
    sent_at: resolvedSentAt,
  });
  await recalcOrderTotal(orderId);
  res.json(updated);
});

app.delete("/api/orders/:orderId/items/:itemId", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { orderId, itemId } = req.params;
  const items = await store.getOrderItems(orderId);
  const item = items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: "Not found" });
  await store.deleteOrderItem(itemId);
  await recalcOrderTotal(orderId);
  res.status(204).send();
});

app.post("/api/orders/:id/send", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const orderId = req.params.id;
  const now = new Date();

  try {
    // Tek transaction içinde: order.status = "sent" + ilgili item'ların status/sent_at güncellemesi.
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: "sent" },
      });

      await tx.orderItem.updateMany({
        where: {
          order_id: orderId,
          // Yalnızca henüz gönderilmemiş satırlar: pending + sent_at=null
          status: "pending",
          sent_at: null,
        },
        data: {
          status: "sent",
          sent_at: now,
        },
      });
    });

    // Güncel durumu dön: KDS / diğer cihazlar doğru state'i görsün.
    // created_at ve paid_at'i Android'in beklediği ms cinsinden döndür (raw Prisma Date nesnesi değil).
    const order = await store.getOrderById(orderId);
    const itemsList = await store.getOrderItems(orderId);
    const { created_at, paid_at, ...orderRest } = order || {};
    const createdAtMs = created_at ? (created_at instanceof Date ? created_at.getTime() : new Date(created_at).getTime()) : null;
    const paidAtMs = paid_at ? (paid_at instanceof Date ? paid_at.getTime() : new Date(paid_at).getTime()) : null;
    const normalizedItems = (itemsList || []).map((it) => {
      const { sent_at, delivered_at, ...itRest } = it;
      return {
        ...itRest,
        sent_at: sent_at ? (sent_at instanceof Date ? sent_at.getTime() : new Date(sent_at).getTime()) : null,
        delivered_at: delivered_at ? (delivered_at instanceof Date ? delivered_at.getTime() : new Date(delivered_at).getTime()) : null,
      };
    });
    res.json({ ...orderRest, created_at: createdAtMs, paid_at: paidAtMs, items: normalizedItems });
  } catch (e) {
    console.error("POST /api/orders/:id/send failed", e);
    res.status(500).json({ error: "send_failed", message: e?.message || "Failed to mark order as sent" });
  }
});

// Discount request (app): waiter requests discount; web approves
app.post("/api/orders/:id/discount-request", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const orderId = req.params.id;
  const ordersList = await store.getOrders();
  const order = ordersList.find((o) => o.id === orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const body = req.body || {};
  const discountReqs = await store.getDiscountRequests();
  const existing = discountReqs.find((r) => r.order_id === orderId && r.status === "pending");
  if (existing) return res.status(409).json({ error: "Already requested", request: existing });
  const id = `dr_${uuid().slice(0, 8)}`;
  const request = {
    id,
    order_id: orderId,
    table_number: order.table_number || "",
    requested_by_user_id: req.user?.id || "",
    requested_by_user_name: req.user?.name || "",
    requested_at: Date.now(),
    requested_percent: body.requested_percent != null ? Number(body.requested_percent) : null,
    requested_amount: body.requested_amount != null ? Number(body.requested_amount) : null,
    note: body.note || "",
    status: "pending",
    approved_by_user_id: null,
    approved_by_user_name: null,
    approved_at: null,
    discount_percent: null,
    discount_amount: null,
    approved_note: null,
  };
  const created = await store.createDiscountRequest(request);
  res.status(201).json(created);
});

app.get("/api/orders/:id/discount-request", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const orderId = req.params.id;
  const discountReqs2 = await store.getDiscountRequests();
  const pending = discountReqs2.find((r) => r.order_id === orderId && r.status === "pending");
  res.json({ request: pending || null });
});

app.post("/api/orders/:orderId/discount-request/:requestId/approve", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_approve_discount") && req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Permission denied" });
  }
  const { orderId, requestId } = req.params;
  const body = req.body || {};
  const discountReqs3 = await store.getDiscountRequests();
  const reqItem = discountReqs3.find((r) => r.id === requestId && r.order_id === orderId && r.status === "pending");
  if (!reqItem) return res.status(404).json({ error: "Request not found or already processed" });
  const orderCheck = await store.getOrderById(orderId);
  if (!orderCheck) return res.status(404).json({ error: "Order not found" });
  const discountPercent = body.discount_percent != null ? Number(body.discount_percent) : 0;
  const discountAmount = body.discount_amount != null ? Number(body.discount_amount) : 0;
  await store.updateOrder(orderId, { discount_percent: discountPercent, discount_amount: discountAmount });
  await recalcOrderTotal(orderId);
  const updatedReq = {
    ...reqItem,
    status: "approved",
    approved_by_user_id: req.user?.id || "",
    approved_by_user_name: req.user?.name || "",
    approved_at: Date.now(),
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    approved_note: body.note || "",
  };
  await store.updateDiscountRequest(requestId, updatedReq);
  const order = await store.getOrderById(orderId);
  const items = await store.getOrderItems(orderId);
  res.json({ request: updatedReq, order: { ...order, items } });
});

// İndirim talebini iptal et (web). Aynı yetki: web_approve_discount.
app.post("/api/orders/:orderId/discount-request/:requestId/cancel", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_approve_discount") && req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Permission denied" });
  }
  const { orderId, requestId } = req.params;
  const discountReqs4 = await store.getDiscountRequests();
  const reqItem2 = discountReqs4.find((r) => r.id === requestId && r.order_id === orderId && r.status === "pending");
  if (!reqItem2) return res.status(404).json({ error: "Request not found or already processed" });
  const cancelledReq = {
    ...reqItem2,
    status: "cancelled",
    approved_by_user_id: req.user?.id || "",
    approved_by_user_name: req.user?.name || "",
    approved_at: Date.now(),
    approved_note: (req.body && req.body.note) ? String(req.body.note) : "",
  };
  await store.updateDiscountRequest(requestId, cancelledReq);
  res.json({ request: cancelledReq });
});

app.get("/api/dashboard/discounts-today", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const date = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);
  const dayStart = new Date(date + "T00:00:00.000Z").getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const discountReqs5 = await store.getDiscountRequests();
  const ordersForDiscount = await store.getOrders();
  const list = discountReqs5
    .filter((r) => r.status === "approved" && r.approved_at >= dayStart && r.approved_at < dayEnd)
    .map((r) => {
      const order = ordersForDiscount.find((o) => o.id === r.order_id);
      const subtotal = Number(order?.subtotal) || 0;
      const taxAmount = Number(order?.tax_amount) || 0;
      const total = Number(order?.total) || 0;
      const discountApplied = Math.max(0, subtotal + taxAmount - total);
      return {
        id: r.id,
        order_id: r.order_id,
        table_number: r.table_number,
        discount_percent: r.discount_percent,
        discount_amount: r.discount_amount,
        approved_note: r.approved_note,
        approved_by_user_name: r.approved_by_user_name,
        approved_at: r.approved_at,
        order_total: total,
        discount_applied: discountApplied,
      };
    })
    .sort((a, b) => (b.approved_at || 0) - (a.approved_at || 0));
  const totalDiscountAmount = list.reduce((s, r) => s + (r.discount_applied || 0), 0);
  res.json({ count: list.length, list, totalDiscountAmount });
});

// KDS: update order item status (preparing / ready / delivered) for local-first sync
app.put("/api/orders/:orderId/items/:itemId/status", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { orderId, itemId } = req.params;
  const status = (req.body && req.body.status) || req.query.status;
  if (!status || !["preparing", "ready", "delivered"].includes(status)) {
    return res.status(400).json({ error: "status must be 'preparing', 'ready' or 'delivered'" });
  }
  const items = await store.getOrderItems(orderId);
  const item = items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: "Not found" });
  const updates = { status };
  if (status === "delivered") updates.delivered_at = new Date();
  const updated = await store.updateOrderItem(itemId, updates);
  res.json(updated);
});

// Payments
app.post("/api/payments", authMiddleware, async (req, res) => {
  try {
    await ensurePrismaReady();
    const user = req.user;
    const body = req.body || {};
    const audit = getAuditFromRequest(req);
    console.log("ANDROID_RAW_DATA [POST /api/payments]:", JSON.stringify(body));

    const userId = req.query.user_id ?? req.user?.id ?? body.user_id ?? body.userId ?? null;
    let orderId = body.order_id ?? body.orderId ?? null;
    if (!orderId) return res.status(400).json({ error: "order_id or orderId required" });
    const paymentsRaw = body.payments ?? body.payment ?? body.payment_methods ?? [];
    const payments = Array.isArray(paymentsRaw) ? paymentsRaw : [paymentsRaw].filter(Boolean);
    console.log("[Zoho] POST /api/payments received:", orderId, "payments:", payments?.length, "total:", payments?.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const now = Date.now();

  const order = await store.getOrderById(orderId);
  const items = await store.getOrderItems(orderId);
  const existingPayments = await store.getPayments();
  const paymentMethods = await store.getAllPaymentMethods();
  const totalExisting = existingPayments.filter((p) => p.order_id === orderId).reduce((s, p) => s + p.amount, 0);
  const totalNew = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalPaid = totalExisting + totalNew;
  const totalMatch = order && Math.abs(totalPaid - (order.total || 0)) < 0.01;
  const hasItems = items.length > 0;
  const notSentYet = !order?.zoho_receipt_id;
  const willPushZoho = order && totalMatch && hasItems && notSentYet;

  console.log("[Zoho] POST /api/payments check:", {
    order_id: orderId,
    order_found: !!order,
    items_count: items.length,
    totalPaid,
    order_total: order?.total,
    totalMatch,
    notSentYet,
    willPushZoho,
  });

  const orderTotal = order ? (order.total || 0) : 0;
  if (order && totalPaid > orderTotal + 0.01) {
    return res.status(400).json({
      error: "OVERPAYMENT_NOT_ALLOWED",
      message: "Payment total cannot exceed order total. Excess payments are not accepted.",
    });
  }

  const paymentPayloads = (payments || []).map((p) => {
    const amt = Number(p.amount ?? p.total ?? p.value ?? 0) || 0;
    let rawMethod = p.method ?? p.payment_method ?? p.paymentMethod ?? p.type ?? p.payment_method_id ?? p.method_id ?? "cash";
    rawMethod = rawMethod == null ? "cash" : String(rawMethod);
    const m = rawMethod.toLowerCase().trim();
    let method = "cash";
    if (m === "card" || m === "2" || m.includes("card") || m.includes("kart") || m.includes("kredi") || m.includes("credit") || m.includes("debit")) method = "card";
    else if (m === "cash" || m === "1" || m.includes("cash") || m.includes("nakit")) method = "cash";
    else method = store.resolveIncomingPaymentMethod(rawMethod, paymentMethods);
    return {
      id: p.id ?? `pay_${uuid().slice(0, 8)}`,
      amount: amt,
      method,
      received_amount: Number(p.received_amount ?? p.receivedAmount ?? p.amount ?? amt) || amt,
      change_amount: Number(p.change_amount ?? p.changeAmount ?? 0) || 0,
    };
  });

  if (!order) {
    console.log("[Zoho] Order", orderId, "NOT FOUND - attempting create from payload");
    const orderData = body.order ?? body.orderData ?? {};
    const tableId = orderData.table_id ?? orderData.tableId ?? body.table_id ?? body.tableId;
    if (tableId && (orderData.items?.length || payments?.length)) {
      try {
        const tables = await store.getTables();
        const tbl = tables.find((t) => t.id === tableId);
        const audit = getAuditFromRequest(req);
        const orderPayload = {
          id: orderId,
          table_id: tableId,
          table_number: String(tbl?.number ?? orderData.table_number ?? "1"),
          waiter_id: userId,
          waiter_name: orderData.waiter_name ?? "Waiter",
          status: "paid",
          subtotal: Number(orderData.subtotal ?? orderData.sub_total ?? 0) || 0,
          tax_amount: Number(orderData.tax_amount ?? orderData.taxAmount ?? 0) || 0,
          discount_percent: Number(orderData.discount_percent ?? 0) || 0,
          discount_amount: Number(orderData.discount_amount ?? orderData.discountAmount ?? 0) || 0,
          total: (totalNew > 0 ? totalNew : 0) || Number(orderData.total ?? orderData.total_price ?? orderData.totalAmount ?? 0) || 0,
          created_at: new Date(),
          paid_at: new Date(now),
          zoho_receipt_id: null,
          source: audit.source,
          device_id: audit.deviceId,
        };
        await store.createOrder(orderPayload);
        await store.updateTable(tableId, {
          status: "occupied",
          current_order_id: orderId,
          waiter_id: userId,
          waiter_name: orderPayload.waiter_name,
          guest_count: 1,
          opened_at: new Date(now),
        });
        const itemsArray = orderData.items ?? orderData.orderItems ?? [];
        const products = await store.getAllProducts();
        const productIdsSet = new Set((products || []).map((p) => p.id));
        const fallbackPid = products[0]?.id || "p_unknown";
        for (const it of itemsArray) {
          let pid = it.product_id ?? it.productId ?? fallbackPid;
          if (!productIdsSet.has(pid)) pid = fallbackPid;
          const pname = it.product_name ?? it.productName ?? it.name ?? "Item";
          const qty = Number(it.quantity ?? 1) || 1;
          const pr = Number(it.price ?? it.unit_price ?? it.unitPrice ?? 0) || 0;
          try {
            await store.createOrderItem({
              id: it.id || `item_${uuid().slice(0, 8)}`,
              order_id: orderId,
              product_id: pid,
              product_name: pname,
              quantity: qty,
              price: pr,
              notes: it.notes ?? "",
              status: "delivered",
              sent_at: new Date(now),
              client_line_id: it.client_line_id ?? it.clientLineId ?? null,
            });
          } catch (ie) {
            console.error("[ANDROID_PAYMENT_ORDER_ITEM_ERR]", ie?.message || ie);
          }
        }
        const order2 = await store.getOrderById(orderId);
        const items2 = await store.getOrderItems(orderId);
        if (order2 && paymentPayloads.length > 0) {
          const totPaid = paymentPayloads.reduce((s, p) => s + p.amount, 0);
          const totOrd = order2.total || 0;
          if (Math.abs(totPaid - totOrd) < 0.01) {
            await store.completePaymentTransaction({ orderId, paymentPayloads, userId, now, source: audit.source, deviceId: audit.deviceId });
          } else {
            for (const p of paymentPayloads) {
              const payMethod = (String(p.method || "cash").toLowerCase().trim() === "card") ? "card" : "cash";
              await store.createPayment({
                id: p.id, order_id: orderId, amount: p.amount, method: payMethod,
                received_amount: p.received_amount ?? p.amount, change_amount: p.change_amount ?? 0,
                user_id: userId, created_at: new Date(now), source: audit.source, device_id: audit.deviceId,
              });
            }
          }
        }
        return res.json({ success: true, created: true });
      } catch (createErr) {
        console.error("[ANDROID_PAYMENT_ORDER_CREATE_ERR]", createErr?.message || createErr);
      }
    }
    console.log("[Zoho] Skip: order", orderId, "NOT FOUND - App must sync order first. Server URL = api.the-limon.com ?");
    return res.status(404).json({ error: "Order not found", order_id: orderId });
  }
  if (!totalMatch) console.log("[Zoho] Skip: totalPaid", totalPaid, "!= order.total", order.total, "- wait for all split payments?");
  if (!hasItems) console.log("[Zoho] Skip: 0 items for order", orderId, "- App must sync items before payment (includeAllItems=true in ensureOrderExistsOnApi)");
  if (!notSentYet) console.log("[Zoho] Skip: already sent (zoho_receipt_id:", order.zoho_receipt_id, ")");

  if (order && paymentPayloads.length > 0) {
    if (totalMatch) {
      await store.completePaymentTransaction({
        orderId, paymentPayloads, userId, now, source: audit.source, deviceId: audit.deviceId,
      });
    } else {
      for (const p of paymentPayloads) {
        await store.createPayment({
          id: p.id, order_id: orderId, amount: Number(p.amount) || 0,
          method: String(p.method || "cash").toLowerCase() === "card" ? "card" : "cash",
          received_amount: Number(p.received_amount ?? p.amount) || p.amount,
          change_amount: Number(p.change_amount ?? 0) || 0, user_id: userId || null,
          created_at: new Date(now), source: audit.source, device_id: audit.deviceId,
        });
      }
    }
  }

  if (order && willPushZoho) {
    console.log("[Zoho] Pushing order", orderId, "to Zoho Books...");
    const orderPayments = (await store.getPayments()).filter((p) => p.order_id === orderId);
    const products = await store.getAllProducts();
    const ok = await pushToZohoBooks(order, items, orderPayments.map((p) => ({ amount: p.amount, method: p.method })), products);
    console.log("[Zoho] Result:", ok ? "OK" : "FAILED");
  }
  try {
    const todaySummary = await store.getTodaySalesSummary();
    broadcastRealtimeEvent({
      type: "payment_update",
      ts: Date.now(),
      data: {
        totalCash: todaySummary.totalCash ?? 0,
        totalCard: todaySummary.totalCard ?? 0,
        totalSales: todaySummary.totalSales ?? 0,
      },
    });
  } catch (e) {
    console.error("[realtime] broadcast payment_update failed:", e?.message || e);
  }
  res.json({ success: true });
  } catch (e) {
    console.error("[ANDROID_PAYMENT_SAVE_ERR]", e?.message || e);
    if (e?.stack) console.error(e.stack);
    res.status(500).json({ error: "Payment save failed", message: String(e?.message || e) });
  }
});

// Voids
app.post("/api/voids", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body;
  const v = await store.createVoidLog({
    id: `void_${uuid().slice(0, 8)}`, type: body.type || "post_void", order_id: body.order_id, order_item_id: body.order_item_id,
    product_name: body.product_name, quantity: body.quantity ?? 1, price: body.price ?? 0, amount: body.amount ?? 0,
    source_table_id: body.source_table_id, source_table_number: body.source_table_number, target_table_id: body.target_table_id, target_table_number: body.target_table_number,
    user_id: body.user_id, user_name: body.user_name, details: body.details || "", created_at: new Date(),
  });
  res.json({ id: v.id });
});

// Void requests
app.get("/api/void-requests", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const status = (req.query.status || "pending").toString().toLowerCase();
  const voidReqs = await store.getVoidRequests();
  if (status === "all" || status === "") {
    res.json(voidReqs.slice(-200));
  } else {
    res.json(voidReqs.filter((v) => v.status === status));
  }
});

app.post("/api/void-requests", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body;
  const id = body.id || `vr_${uuid().slice(0, 8)}`;
  const payload = { id, order_id: body.order_id, order_item_id: body.order_item_id, product_name: body.product_name, quantity: body.quantity ?? 1, price: body.price ?? 0, table_number: body.table_number, requested_by_user_id: body.requested_by_user_id, requested_by_user_name: body.requested_by_user_name, requested_at: Date.now(), status: "pending", approved_by_supervisor_user_id: null, approved_by_supervisor_user_name: null, approved_by_supervisor_at: null, approved_by_kds_user_id: null, approved_by_kds_user_name: null, approved_by_kds_at: null };
  const created = await store.createVoidRequest(payload);
  res.json(created);
});

app.patch("/api/void-requests/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const voidReqs = await store.getVoidRequests();
  const vr = voidReqs.find((v) => v.id === req.params.id);
  if (!vr) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  const newStatus = body.status || "approved";
  const updated = await store.updateVoidRequest(req.params.id, { ...vr, status: newStatus, approved_by_supervisor_user_id: body.approved_by_supervisor_user_id, approved_by_supervisor_user_name: body.approved_by_supervisor_user_name, approved_by_supervisor_at: body.approved_by_supervisor_at, approved_by_kds_user_id: body.approved_by_kds_user_id, approved_by_kds_user_name: body.approved_by_kds_user_name, approved_by_kds_at: body.approved_by_kds_at });
  if (newStatus === "approved" && vr.order_id && vr.order_item_id) {
    try {
      const items = await store.getOrderItems(vr.order_id);
      const item = items.find((i) => i.id === vr.order_item_id);
      if (item) {
        const amount = (vr.quantity ?? item.quantity) * (vr.price ?? item.price);
        const voidLogPayload = { id: `void_${uuid().slice(0, 8)}`, type: "post_void", order_id: vr.order_id, order_item_id: vr.order_item_id, product_name: vr.product_name || item.product_name, quantity: vr.quantity ?? item.quantity, price: vr.price ?? item.price, amount, user_name: body.approved_by_supervisor_user_name || "Web", details: "Void approved from web" };
        await store.createVoidLog(voidLogPayload);
        await store.deleteOrderItem(vr.order_item_id);
        await recalcOrderTotal(vr.order_id);
      }
    } catch (err) {
      console.error("[void-request] approve: delete item failed", err?.message);
    }
  }
  res.json(updated);
});

// Closed bill access requests (user requests access; approver approves from app or web)
app.get("/api/closed-bill-access-requests", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const status = (req.query.status || "pending").toString();
  let list = await store.getClosedBillAccessRequests();
  if (status === "all" || status === "") {
    res.json(list.slice(-100));
  } else {
    res.json(list.filter((r) => r.status === status));
  }
});

app.post("/api/closed-bill-access-requests", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body;
  const id = body.id || `cbar_${uuid().slice(0, 8)}`;
  const cbarPayload = {
    id,
    requested_by_user_id: body.requested_by_user_id,
    requested_by_user_name: body.requested_by_user_name || "—",
    requested_at: Date.now(),
    status: "pending",
    approved_by_user_id: null,
    approved_by_user_name: null,
    approved_at: null,
    expires_at: body.expires_at || null,
  };
  const created = await store.createClosedBillAccessRequest(cbarPayload);
  res.json(created);
});

app.patch("/api/closed-bill-access-requests/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const list = await store.getClosedBillAccessRequests();
  const r = list.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  const updated = {
    ...r,
    status: body.status || "approved",
    approved_by_user_id: body.approved_by_user_id ?? r.approved_by_user_id,
    approved_by_user_name: body.approved_by_user_name ?? r.approved_by_user_name,
    approved_at: body.approved_at ?? (body.status === "approved" || body.status === "rejected" ? Date.now() : r.approved_at),
    expires_at: body.expires_at !== undefined ? body.expires_at : r.expires_at,
  };
  await store.updateClosedBillAccessRequest(req.params.id, updated);
  res.json(updated);
});

// Closed bill changes: ?date= or ?dateFrom=&dateTo= (same as daily-sales).
app.get("/api/dashboard/closed-bill-changes", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const dateStr = (req.query.date || "").toString().trim();
  const dateFromStr = (req.query.dateFrom || "").toString().trim();
  const dateToStr = (req.query.dateTo || "").toString().trim();
  const todayTs = (await store.getTodayRange()).startTs;
  const dayMs = 24 * 60 * 60 * 1000;
  let startTs = todayTs;
  let endTs = todayTs + dayMs;
  if (dateFromStr && dateToStr) {
    const fromBounds = await store.getDayBounds(dateFromStr);
    const toBounds = await store.getDayBounds(dateToStr);
    if (!fromBounds || !toBounds) return res.status(400).json({ error: "invalid_date" });
    startTs = fromBounds.startTs;
    endTs = toBounds.endTs;
    if (startTs > endTs) return res.status(400).json({ error: "invalid_range" });
  } else if (dateStr) {
    const bounds = await store.getDayBounds(dateStr);
    if (!bounds) return res.status(400).json({ error: "invalid_date" });
    startTs = bounds.startTs;
    endTs = bounds.endTs;
  }
  const voidLogs = await store.getVoidLogs();
  const orders = await store.getOrders();
  const orderIds = new Set(orders.map((o) => o.id));
  const changes = voidLogs
    .filter((v) => v.created_at >= startTs && v.created_at < endTs && (v.type === "refund" || v.type === "refund_full" || v.type === "payment_method_change") && orderIds.has(v.order_id))
    .map((v) => {
      const order = orders.find((o) => o.id === v.order_id);
      return {
        id: v.id,
        order_id: v.order_id,
        receipt_no: order ? `#${(order.table_number || order.id).toString().slice(-6)}` : null,
        table_number: order?.table_number || v.source_table_number || "—",
        type: v.type,
        product_name: v.product_name || null,
        amount: v.amount || 0,
        user_name: v.user_name || "—",
        created_at: v.created_at,
        details: v.details || null,
      };
    });
  const count = changes.length;
  const fullRefunds = changes.filter((c) => c.type === "refund_full").length;
  const itemRefunds = changes.filter((c) => c.type === "refund").length;
  const paymentMethodChanges = changes.filter((c) => c.type === "payment_method_change").length;
  res.json({
    count,
    summary: { fullRefunds, itemRefunds, paymentMethodChanges },
    changes,
  });
});

// Cash drawer opens (no sale): who opened and when. ?date= or ?dateFrom=&dateTo=
app.get("/api/dashboard/cash-drawer-opens", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const dateStr = (req.query.date || "").toString().trim();
  const dateFromStr = (req.query.dateFrom || "").toString().trim();
  const dateToStr = (req.query.dateTo || "").toString().trim();
  const todayTs = (await store.getTodayRange()).startTs;
  const dayMs = 24 * 60 * 60 * 1000;
  let startTs = todayTs;
  let endTs = todayTs + dayMs;
  if (dateFromStr && dateToStr) {
    const fromBounds = await store.getDayBounds(dateFromStr);
    const toBounds = await store.getDayBounds(dateToStr);
    if (!fromBounds || !toBounds) return res.status(400).json({ error: "invalid_date" });
    startTs = fromBounds.startTs;
    endTs = toBounds.endTs;
  } else if (dateStr) {
    const bounds = await store.getDayBounds(dateStr);
    if (!bounds) return res.status(400).json({ error: "invalid_date" });
    startTs = bounds.startTs;
    endTs = bounds.endTs;
  }
  const cashOpens = await store.getCashDrawerOpens();
  const list = cashOpens.filter((e) => e.opened_at >= startTs && e.opened_at < endTs);
  list.sort((a, b) => (b.opened_at || 0) - (a.opened_at || 0));
  res.json({ count: list.length, opens: list });
});

// Clear sales (test data) by date range: deletes orders with created_at in [dateFrom start, dateTo end], related data, and all void_logs in that date range.
app.post("/api/settings/clear-sales-by-date-range", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const dateFromStr = (req.body?.dateFrom || req.query?.dateFrom || "").toString().trim();
  const dateToStr = (req.body?.dateTo || req.query?.dateTo || "").toString().trim();
  if (!dateFromStr || !dateToStr) {
    return res.status(400).json({ error: "dateFrom and dateTo required (YYYY-MM-DD)" });
  }
  const fromBounds = await store.getDayBounds(dateFromStr);
  const toBounds = await store.getDayBounds(dateToStr);
  if (!fromBounds || !toBounds) {
    return res.status(400).json({ error: "Invalid date format (use YYYY-MM-DD)" });
  }
  const startTs = fromBounds.startTs;
  const endTs = toBounds.endTs;
  if (startTs > endTs) {
    return res.status(400).json({ error: "dateFrom must be before or equal to dateTo" });
  }
  const result = await store.clearSalesByDateRangeTransaction({ startTs, endTs });
  const { deletedOrders, deletedVoids, deletedDiscounts, deletedCashDrawer } = result;
  const msg = [
    deletedOrders > 0 && `Deleted ${deletedOrders} order(s) and related data`,
    deletedVoids > 0 && `Deleted ${deletedVoids} void log(s) in date range`,
    deletedDiscounts > 0 && `Deleted ${deletedDiscounts} discount request(s)`,
    deletedCashDrawer > 0 && `Deleted ${deletedCashDrawer} cash drawer open(s)`,
  ].filter(Boolean).join(". ") || "No orders, voids, discounts or cash drawer entries in date range";
  res.json({ deletedOrders, deletedVoids, deletedDiscounts, deletedCashDrawer, message: msg });
});

// Zoho callback: Zoho OAuth buraya yönlendirir (?code=xxx). Frontend'e code ile yönlendir.
app.get("/api/zoho/callback", (req, res) => {
  const code = req.query?.code;
  const frontendUrl = process.env.FRONTEND_URL || "https://pos.the-limon.com";
  const target = `${frontendUrl.replace(/\/$/, "")}/settings/zoho${code ? `?code=${encodeURIComponent(String(code))}` : ""}`;
  res.redirect(302, target);
});

// Zoho config
app.post("/api/zoho/exchange-code", authMiddleware, async (req, res) => {
  try {
    const { exchangeCodeForRefreshToken } = await import("./zoho.js");
    const { code, client_id, client_secret, redirect_uri, dc } = req.body || {};
    if (!code || !client_id || !client_secret) {
      return res.status(400).json({ error: "code, client_id, client_secret gerekli" });
    }
    const effectiveRedirectUri = process.env.ZOHO_REDIRECT_URI || redirect_uri;
    const dcVal = (dc || process.env.ZOHO_DC || process.env.ZOHO_REGION || "").toString().trim().toLowerCase();
    console.log("[Zoho] exchange-code RECEIVED:", {
      dc: dcVal,
      client_id_prefix: String(client_id).slice(0, 12) + "...",
      redirect_uri: effectiveRedirectUri || "(backend default)",
    });
    let rt;
    try {
      const r = await exchangeCodeForRefreshToken(code, client_id, client_secret, effectiveRedirectUri, dc || process.env.ZOHO_DC || process.env.ZOHO_REGION);
      rt = r.refresh_token;
    } catch (e1) {
      const alt = dcVal === "eu" || process.env.ZOHO_DC === "eu" ? "com" : "eu";
      try {
        const r = await exchangeCodeForRefreshToken(code, client_id, client_secret, effectiveRedirectUri, alt);
        rt = r.refresh_token;
      } catch (e2) {
        throw e1;
      }
    }
    await store.updateZohoConfig({ refresh_token: rt, client_id, client_secret, dc: dc && String(dc).trim() ? String(dc).trim().toLowerCase() : undefined });
    res.json({ refresh_token: rt, success: true });
  } catch (e) {
    const d = e.response?.data;
    const msg = d?.error_description || d?.error || (e && e.message) || "Token alınamadı";
    console.error("[Zoho] exchange-code FAILED:", { status: e.response?.status, zoho: d, message: msg });
    res.status(400).json({ error: String(msg) });
  }
});

app.get("/api/zoho-config", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const cfg = await store.getZohoConfig();
  res.json(cfg);
});

app.put("/api/zoho-config", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const updates = {};
  for (const [k, v] of Object.entries(req.body)) updates[k] = v != null ? String(v) : "";
  await store.updateZohoConfig(updates);
  const cfg = await store.getZohoConfig();
  console.log("[Zoho] updateZohoConfig SAVED to DB:", {
    dc: cfg.dc,
    client_id_prefix: (cfg.client_id || "").slice(0, 12) + "...",
    client_secret_length: (cfg.client_secret || "").length,
    has_refresh_token: !!(cfg.refresh_token),
  });
  res.json(cfg);
});

app.get("/api/zoho/items", authMiddleware, async (req, res) => {
  try {
    const result = await getZohoItems();
    if (!result) return res.status(400).json({ error: "Zoho Books bağlantısı yok veya yapılandırılmamış" });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e && e.message) || "Zoho ürün listesi alınamadı" });
  }
});

app.get("/api/zoho/item-groups", authMiddleware, async (req, res) => {
  const result = await getZohoItemGroups();
  res.json(result);
});

app.get("/api/zoho/contacts", authMiddleware, async (req, res) => {
  try {
    const result = await getZohoContacts();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e && e.message) || "Zoho kişi listesi alınamadı", contacts: [] });
  }
});

// Zoho sync: sadece upsert (clearZohoProductsFirst kullanılmaz – ürün kaybı önlenir).
app.post("/api/zoho/sync", authMiddleware, async (req, res) => {
  try {
    const result = await syncFromZoho({});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Sync failed", categoriesAdded: 0, productsAdded: 0, productsUpdated: 0, productsRemoved: 0, itemsFetched: 0 });
  }
});

// Zoho tanı: token, satış push durumu, ürün sayısı – env veya db'den okur
app.get("/api/zoho/check", authMiddleware, async (req, res) => {
  try {
    const { getZohoConfig, getZohoAccessToken, getZohoItems, getZohoItemGroups } = await import("./zoho.js");
    const cfg = await getZohoConfig();
    const status = {
      ok: false,
      salesPushReady: false,
      hasToken: false,
      itemsCount: 0,
      groupsCount: 0,
      region: (cfg.dc || "").toLowerCase() === "eu" ? "EU" : "Global",
      checks: { enabled: false, orgId: false, customerId: false, refreshToken: false, clientId: false, clientSecret: false },
      error: null,
    };
    status.checks.enabled = cfg.enabled === "true";
    status.checks.orgId = !!cfg.organization_id;
    status.checks.customerId = !!cfg.customer_id;
    status.checks.refreshToken = !!cfg.refresh_token;
    status.checks.clientId = !!cfg.client_id;
    status.checks.clientSecret = !!cfg.client_secret;

    const hasConfig = status.checks.orgId && status.checks.enabled && status.checks.refreshToken && status.checks.clientId && status.checks.clientSecret;
    if (!hasConfig) {
      const missing = [];
      if (!status.checks.enabled) missing.push("Enabled");
      if (!status.checks.orgId) missing.push("Organization ID");
      if (!status.checks.customerId) missing.push("Customer ID");
      if (!status.checks.refreshToken) missing.push("Refresh Token");
      if (!status.checks.clientId) missing.push("Client ID");
      if (!status.checks.clientSecret) missing.push("Client Secret");
      status.error = "Zoho ayarları eksik: " + missing.join(", ");
      return res.json(status);
    }
    if (!status.checks.customerId) {
      status.error = "Customer ID (Walk-in müşteri) eksik – satışlar Zoho'ya gidemez";
      return res.json(status);
    }
    let token;
    try {
      token = await getZohoAccessToken();
    } catch (e) {
      let errMsg = e?.message || "Refresh Token / Client kontrol edin";
      try {
        token = await getZohoAccessToken(true);
      } catch (e2) {
        const msg = e?.message || e2?.message || "Refresh Token / Client kontrol edin";
        status.error = "Token alınamadı: " + msg;
        const m = msg.match(/\[Zoho: ([^\]]+)\]/);
        if (m) status.zohoError = m[1];
        return res.json(status);
      }
    }
    if (!token) {
      status.error = "Token alınamadı (Refresh Token / Client ID-Secret kontrol edin)";
      return res.json(status);
    }
    status.hasToken = true;
    status.salesPushReady = true;
    try {
      const itemsRes = await getZohoItems();
      const groupsRes = await getZohoItemGroups();
      status.itemsCount = itemsRes?.items?.length ?? 0;
      status.groupsCount = groupsRes?.item_groups?.length ?? 0;
      status.ok = true;
    } catch (e) {
      status.ok = true;
      status.error = "Ürün listesi alınamadı (satış push çalışır): " + (e?.message || "");
    }
    return res.json(status);
  } catch (e) {
    res.json({ ok: false, salesPushReady: false, hasToken: false, itemsCount: 0, groupsCount: 0, checks: {}, error: (e && e.message) || "Check failed" });
  }
});

app.get("/", (req, res) => {
  res.set("Content-Type", "text/html");
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>LimonPOS API</title></head>
    <body style="font-family:sans-serif;padding:40px;max-width:500px;margin:0 auto;">
      <h1>LimonPOS API</h1>
      <p>API çalışıyor.</p>
      <p><a href="/api/health">/api/health</a> – sağlık kontrolü</p>
      <p><strong>Backoffice:</strong> <a href="http://localhost:3000">http://localhost:3000</a></p>
    </body>
    </html>
  `);
});

const HOST = process.env.HOST || "0.0.0.0"; // Dış erişim için 0.0.0.0 gerekli
const DATA_DIR = process.env.DATA_DIR;

let lastAutoCloseRunTs = 0;
let lastAuditRunDate = ""; // YYYY-MM-DD

async function runDailyAuditIfDue() {
  const now = new Date();
  const hour = now.getUTCHours();
  const min = now.getUTCMinutes();
  const dayStr = now.toISOString().slice(0, 10);
  if (hour !== 23 || min > 5 || lastAuditRunDate === dayStr) return;
  try {
    await store.ensurePrismaReady();
    const report = await store.runDailyAuditReport();
    lastAuditRunDate = dayStr;
    console.log("[audit] Gün sonu rapor:", JSON.stringify(report));
  } catch (e) {
    console.error("[audit] runDailyAuditReport error:", e?.message || e);
  }
}

async function runAutoCloseIfDue() {
  try {
    await store.ensurePrismaReady();
  } catch {
    return;
  }
  const s = await store.getSettings();
  if (!s?.auto_close_open_tables) return;
  const opening = s.opening_time ?? "07:00";
  const closing = s.closing_time ?? "01:30";
  const grace = Math.min(60, Math.max(0, (s.grace_minutes ?? 0) | 0));
  const off = (s.timezone_offset_minutes ?? 0) | 0;
  const now = Date.now();
  if (!isInAutoCloseWindow(now, closing, opening, grace, off)) return;
  if (now - lastAutoCloseRunTs < 2 * 60 * 1000) return;
  const key = getClosedBusinessDayKeyForAutoClose(now, opening, closing, off);
  if (!key || s.last_auto_close_for_business_day === key) return;

  const tables = await store.getTables();
  const orders = await store.getOrders();
  const openTables = tables.filter((t) => t.current_order_id);
  const tablesClosed = [];
  const pmCode = (s.auto_close_payment_method || "cash").toLowerCase();
  for (const t of openTables) {
    const order = orders.find((o) => o.id === t.current_order_id);
    if (!order || order.status === "paid") continue;
    const amount = order.total ?? 0;
    await store.createPayment({
      id: `pay_${uuid().slice(0, 8)}`,
      order_id: order.id,
      amount,
      method: pmCode === "cash" ? "cash" : pmCode,
      received_amount: amount,
      change_amount: 0,
      user_id: "system",
      created_at: new Date(now),
    });
    await store.updateOrder(order.id, { status: "paid", paid_at: new Date(now) });
    const tbls = tables.filter((tbl) => tbl.current_order_id === order.id);
    for (const tbl of tbls) {
      await store.updateTable(tbl.id, { status: "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null });
    }
    tablesClosed.push({ table_id: t.id, table_number: t.number ?? t.id, order_id: order.id, amount });
  }
  if (tablesClosed.length > 0) {
    await store.updateSettings({ last_auto_close_for_business_day: key });
    await store.appendEodLog({
      id: `eod_auto_${uuid().slice(0, 8)}`,
      ran_at: now,
      user_id: "system",
      user_name: "Auto-close",
      tables_closed: tablesClosed,
      orders_closed_count: tablesClosed.length,
    });
    await store.appendBusinessOperationLog({
      ts: now,
      action: "open_tables_auto_closed",
      business_day_key: key,
      tables_closed: tablesClosed,
    });
    lastAutoCloseRunTs = now;
  }
}

const WS_CLIENTS = new Set();

function broadcastRealtimeEvent(event) {
  const payload = JSON.stringify(event);
  for (const ws of WS_CLIENTS) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(payload);
      } catch {
        // ignore send errors
      }
    }
  }
}

// ============================================================
// HİBRİT MİMARİ — CLOUD SYNC ENDPOINT'LERİ
// ============================================================

/** Sync key doğrulama middleware — sadece bilinen backend'ler erişsin */
const syncKeyMiddleware = (req, res, next) => {
  const key = process.env.CLOUD_SYNC_KEY || "";
  if (!key) return res.status(503).json({ error: "sync_not_configured", message: "CLOUD_SYNC_KEY tanımlı değil" });
  if (req.headers["x-sync-key"] !== key) return res.status(401).json({ error: "invalid_sync_key" });
  next();
};

/**
 * GET /api/sync/catalog-snapshot
 * Cloud backend üzerinde çalışır. Local backend bu endpoint'i
 * çağırarak tüm katalog verisini tek seferde çeker.
 */
app.get("/api/sync/catalog-snapshot", syncKeyMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const [categories, products, modifierGroups, printers, paymentMethods, settings, users, tables] = await Promise.all([
    store.getAllCategories(),
    store.getAllProducts(),
    store.getModifierGroups(),
    store.getPrinters(),
    store.getAllPaymentMethods(),
    store.getSettings(),
    store.getAllUsers(),
    prisma.table.findMany({ where: { deletedAt: null } }),
  ]);
  res.json({ categories, products, modifierGroups, printers, paymentMethods, settings, users, tables });
});

/**
 * POST /api/sync/receive-sales
 * Cloud backend üzerinde çalışır. Local backend ödeme tamamlanan
 * siparişleri buraya gönderir; cloud bunları kendi DB'sine upsert eder.
 * Body: { orders: [ {id, table_id, ..., orderItems: [], payments: [] } ] }
 */
app.post("/api/sync/receive-sales", syncKeyMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { orders = [] } = req.body || {};
  if (!Array.isArray(orders)) return res.status(400).json({ error: "orders must be an array" });

  const results = { upserted: 0, errors: [] };

  for (const order of orders) {
    try {
      const { orderItems = [], payments = [], ...orderData } = order;
      // Order upsert (cloudSyncedAt kaydını görmezden gel — cloud kendi DB'sinde işaretle)
      const { cloudSyncedAt, createdAt, updatedAt, deletedAt, tablesAsCurrent, table, waiter, ...cleanOrder } = orderData;

      try {
        await prisma.order.upsert({
          where: { id: cleanOrder.id },
          // cloud DB'de bu alan henüz yoksa yazıp sorgulamayalım (P2022 engeli)
          create: { ...cleanOrder },
          update: { ...cleanOrder },
          select: { id: true },
        });
      } catch (e) {
        // Tablo foreign key ihlali — ignore, satışı yine de logla
        console.warn(`[sync/receive-sales] Order ${cleanOrder.id} upsert warn: ${e.message}`);
      }

      // OrderItems upsert
      for (const item of orderItems) {
        const { createdAt: _ca, updatedAt: _ua, order: _o, product: _pr, voidLogs: _vl, ...cleanItem } = item;
        await prisma.orderItem.upsert({
          where: { id: cleanItem.id },
          create: cleanItem,
          update: cleanItem,
          select: { id: true },
        }).catch(() => {});
      }

      // Payments upsert
      for (const pay of payments) {
        const { cloudSyncedAt: _cs, createdAt: _ca, updatedAt: _ua, order: _o, user: _u, ...cleanPay } = pay;
        await prisma.payment.upsert({
          where: { id: cleanPay.id },
          create: { ...cleanPay },
          update: { ...cleanPay },
          select: { id: true },
        }).catch(() => {});
      }

      results.upserted++;
    } catch (err) {
      results.errors.push({ order_id: order?.id, error: err.message });
    }
  }

  console.log(`[sync/receive-sales] ${results.upserted} sipariş alındı, ${results.errors.length} hata`);
  res.json({ ok: true, ...results });
});

/**
 * POST /api/sync/receive-live-orders
 * Cloud backend üzerinde çalışır. Local backend açık/aktif siparişleri
 * (status=open|sent) ve masa durumlarını her ~10s'de bir buraya gönderir.
 * Cloud DB upsert eder → pos.the-limon.com/pos gerçek zamanlı görür.
 * Body: { orders: [...], tables: [...] }
 */
app.post("/api/sync/receive-live-orders", syncKeyMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { orders = [], tables = [] } = req.body || {};
  if (!Array.isArray(orders) || !Array.isArray(tables)) {
    return res.status(400).json({ error: "orders and tables must be arrays" });
  }

  const results = { ordersUpserted: 0, tablesUpdated: 0, errors: [] };

  // ── Açık siparişler + kalemleri upsert ───────────────────
  for (const order of orders) {
    try {
      const { orderItems = [], payments = [], ...orderData } = order;
      const { cloudSyncedAt, createdAt, updatedAt, deletedAt, tablesAsCurrent, table, waiter, ...cleanOrder } = orderData;

      // cloudSyncedAt'e dokunmuyoruz — sadece paid siparişler için geçerli
      try {
        await prisma.order.upsert({
          where:  { id: cleanOrder.id },
          create: { ...cleanOrder },
          update: { ...cleanOrder },
          select: { id: true },
        });
      } catch (e) {
        console.warn(`[sync/receive-live-orders] Order ${cleanOrder.id} upsert warn: ${e.message}`);
      }

      // OrderItems
      for (const item of orderItems) {
        const { createdAt: _ca, updatedAt: _ua, order: _o, product: _pr, voidLogs: _vl, ...cleanItem } = item;
        await prisma.orderItem.upsert({
          where:  { id: cleanItem.id },
          create: cleanItem,
          update: cleanItem,
          select: { id: true },
        }).catch(() => {});
      }

      results.ordersUpserted++;
    } catch (err) {
      results.errors.push({ order_id: order?.id, error: err.message });
    }
  }

  // ── Masa durumları upsert ─────────────────────────────────
  for (const tableData of tables) {
    try {
      const {
        createdAt, updatedAt, deletedAt,
        currentOrder, reservations, floorSections,
        ...cleanTable
      } = tableData;

      await prisma.table.upsert({
        where:  { id: cleanTable.id },
        create: { ...cleanTable },
        update: {
          status:           cleanTable.status,
          current_order_id: cleanTable.current_order_id ?? null,
        },
      });
      results.tablesUpdated++;
    } catch (e) {
      results.errors.push({ table_id: tableData?.id, error: e.message });
    }
  }

  console.log(
    `[sync/receive-live-orders] ${results.ordersUpserted} açık sipariş, ` +
    `${results.tablesUpdated} masa güncellendi, ${results.errors.length} hata`
  );
  res.json({ ok: true, ...results });
});

/**
 * POST /api/sync/force-pull
 * Local backend'e "hemen katalog çek" komutu gönderir.
 * Backoffice fiyat değiştirince Cloud bu endpoint'i local'e POST eder.
 * ROLE=local olan makinede anlık pullCatalogFromCloud() tetikler.
 */
app.post("/api/sync/force-pull", syncKeyMiddleware, async (req, res) => {
  const result = await forcePull();
  res.json({ ok: result.ok, ...result });
});

/**
 * GET /api/sync/status
 * Sync durumunu döner (her iki tarafta da çalışır, auth gerekmiyor).
 */
app.get("/api/sync/status", authMiddleware, async (req, res) => {
  res.json(getSyncStatus());
});

// ============================================================

async function startServer() {
  // Listen first – health check için hızlı yanıt. ensureData arka planda.
  const server = app.listen(PORT, HOST, () => {
    console.log(`LimonPOS Backend running on http://${HOST}:${PORT}`);
    if (DATA_DIR) {
      console.log(`DATA_DIR=${DATA_DIR} – veriler kalıcı (restart'ta silinmez).`);
    } else {
      console.warn("UYARI: DATA_DIR tanımlı değil. Veriler geçici diskte; her restart'ta SİLİNİR. Docker'da volume mount + DATA_DIR=/data kullanın.");
    }
    if (HOST === "0.0.0.0") {
      console.log("Listening on all interfaces – dış erişim için hazır.");
    }
    ensurePrismaReady().then(() => console.log("[startup] ensurePrismaReady OK")).catch((e) => console.error("[startup] ensurePrismaReady failed:", e?.message || e));
    setInterval(() => runAutoCloseIfDue().catch((e) => console.error("[auto-close]", e?.message)), 60 * 1000);
    setInterval(() => fetchReconciliationEmails().catch((e) => console.error("[reconciliation]", e?.message)), 5 * 60 * 1000);
    setInterval(() => runDailyAuditIfDue().catch((e) => console.error("[audit]", e?.message)), 60 * 60 * 1000);
    // Hibrit mimari: ROLE=local ise cloud sync loop'unu başlat
    if ((process.env.ROLE || "cloud") === "local") {
      startSyncLoop();
    }
  });
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    WS_CLIENTS.add(ws);
    ws.on("close", () => {
      WS_CLIENTS.delete(ws);
    });
    ws.on("error", () => {
      WS_CLIENTS.delete(ws);
    });
  });
  process.on("SIGTERM", () => {
    console.log("[SIGTERM] Graceful shutdown...");
    server.close(() => {
      console.log("[SIGTERM] Server closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000);
  });
}

startServer().catch((e) => {
  console.error("[startup] startServer failed:", e?.message || e);
  if (e?.stack) console.error(e.stack);
  setTimeout(() => process.exit(1), 2000);
});
