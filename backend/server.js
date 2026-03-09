import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import { db, getDataFileInfo } from "./db.js";
import { pushToZohoBooks, getZohoItems, getZohoItemGroups, syncFromZoho } from "./zoho.js";
import {
  parseTimeToMinutes,
  getBusinessDayRange,
  getBusinessDayKey,
  isAfterWarningTime,
  getBusinessDayRangeForDate,
  getBusinessDayRangesForDateRange,
} from "./businessDay.js";

// Railway / production: yakalanmamış hatalar loglansın, process çökmesin veya net exit ile yeniden başlasın
process.on("uncaughtException", (err) => {
  console.error("[CRASH] uncaughtException:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRASH] unhandledRejection:", reason);
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const DEFAULT_SETUP = { id: "u1", name: "Setup", pin: "2222", role: "setup", active: 1, permissions: "[]", cash_drawer_permission: 0 };

const offsetMin = () => (db.data?.settings?.timezone_offset_minutes ?? 0) | 0;

/** Business day range if opening/closing configured; else calendar day. */
function getTodayRange() {
  const s = db.data?.settings || {};
  const opening = s.opening_time;
  const closing = s.closing_time;
  const off = offsetMin();
  const now = Date.now();
  if (opening && closing && !isNaN(parseTimeToMinutes(opening)) && !isNaN(parseTimeToMinutes(closing))) {
    const r = getBusinessDayRange(now, opening, closing, off);
    if (r) return r;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const localNow = now + off * 60 * 1000;
  const startTs = Math.floor(localNow / dayMs) * dayMs - off * 60 * 1000;
  return { startTs, endTs: startTs + dayMs };
}

/** Verilen gün (YYYY-MM-DD) için: business day kullanılıyorsa o güne ait range; değilse calendar day. */
function getDayBounds(dateStr) {
  const s = db.data?.settings || {};
  const opening = s.opening_time;
  const closing = s.closing_time;
  const off = offsetMin();
  if (opening && closing && !isNaN(parseTimeToMinutes(opening)) && !isNaN(parseTimeToMinutes(closing))) {
    const r = getBusinessDayRangeForDate(dateStr, opening, closing, off);
    if (r) return r;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  const dayMs = 24 * 60 * 60 * 1000;
  const startTs = Date.UTC(y, m, d) - off * 60 * 1000;
  return { startTs, endTs: startTs + dayMs };
}

/** Belirli gün aralığı [startTs, endTs) için satış özeti. */
function getSalesSummaryForRange(startTs, endTs) {
  const orders = db.data.orders || [];
  const payments = db.data.payments || [];
  const paymentMethods = db.data.payment_methods || [];
  const voidLogs = db.data.void_logs || [];
  const rangeVoidsForExclusion = voidLogs.filter((v) => v.created_at >= startTs && v.created_at < endTs && (v.type === "refund_full" || v.type === "recalled_void"));
  const fullyVoidedOrderIds = new Set(rangeVoidsForExclusion.map((v) => v.order_id).filter(Boolean));
  const paidInRange = orders.filter((o) => {
    if (o.status !== "paid") return false;
    if (fullyVoidedOrderIds.has(o.id)) return false;
    const paidAt = o.paid_at ?? o.updated_at ?? o.created_at ?? 0;
    return paidAt >= startTs && paidAt < endTs;
  });
  const paidOrderIds = new Set(paidInRange.map((o) => o.id));
  let totalCash = 0;
  let totalCard = 0;
  for (const p of payments) {
    if (!paidOrderIds.has(p.order_id)) continue;
    const code = resolvePaymentMethodCode(p.method, paymentMethods);
    if (code === "cash") totalCash += p.amount || 0;
    else if (code === "card") totalCard += p.amount || 0;
  }
  const totalFromPayments = totalCash + totalCard;
  const totalFromOrders = paidInRange.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const totalSales = totalFromPayments > 0 ? totalFromPayments : totalFromOrders;
  if (totalFromPayments === 0 && totalFromOrders > 0) {
    totalCash = totalFromOrders;
    totalCard = 0;
  }
  const rangeVoids = voidLogs.filter((v) => v.created_at >= startTs && v.created_at < endTs);
  const totalVoidAmount = rangeVoids.filter((v) => v.type !== "refund_full" && v.type !== "recalled_void").reduce((s, v) => s + (v.amount || 0), 0);
  const totalRefundAmount = rangeVoids.filter((v) => v.type === "refund_full" || v.type === "refund").reduce((s, v) => s + (v.amount || 0), 0);
  const netSales = totalSales - totalRefundAmount;
  return { startTs, endTs, paidOrderIds, totalCash, totalCard, totalSales, totalVoidAmount, totalRefundAmount, netSales, paidToday: paidInRange };
}

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

/** Bugünün başlangıç timestamp'i (business day veya calendar day). */
function getTodayStartTimestamp() {
  return getTodayRange().startTs;
}

/** Tek kaynak: bugünkü ödemeler + iade/void. Dashboard ve daily-sales aynı mantığı kullanır. */
function getTodaySalesSummary() {
  const range = getTodayRange();
  const summary = getSalesSummaryForRange(range.startTs, range.endTs);
  return { ...summary, todayTs: range.startTs, todayEndTs: range.endTs };
}

async function ensureData() {
  await db.read();
  if (!db.data) db.data = { users: [], categories: [], products: [], printers: [], payment_methods: [], orders: [], order_items: [], payments: [], tables: [], void_logs: [], void_requests: [], closed_bill_access_requests: [], zoho_config: {}, migrations: {}, devices: [], floor_plan_sections: null, discount_requests: [], table_reservations: [] };
  if (!db.data.migrations) db.data.migrations = {};
  if (!Array.isArray(db.data.devices)) db.data.devices = [];
  if (!Array.isArray(db.data.products)) db.data.products = [];
  if (!Array.isArray(db.data.orders)) db.data.orders = [];
  if (!Array.isArray(db.data.order_items)) db.data.order_items = [];
  if (!Array.isArray(db.data.discount_requests)) db.data.discount_requests = [];
  if (!Array.isArray(db.data.table_reservations)) db.data.table_reservations = [];
  let needWrite = false;
  if (!db.data.floor_plan_sections) {
    db.data.floor_plan_sections = { A: [29, 30, 31, 32, 33, 34, 35, 40], B: [24, 25, 26, 27, 28, 29, 36, 37, 38, 39], C: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], D: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], E: [41, 42, 43] };
    needWrite = true;
  }
  if (!db.data.users?.length) {
    db.data.users = [DEFAULT_ADMIN];
    needWrite = true;
  }
  if (!db.data.categories?.length) {
    db.data.categories = [{ id: "cat1", name: "Beverages", color: "#84CC16", sort_order: 0, active: 1, show_till: 0, modifier_groups: "[]", printers: "[]" }];
    needWrite = true;
  }
  if (!db.data.payment_methods?.length) {
    db.data.payment_methods = [
      { id: "pm1", name: "Cash", code: "cash", active: 1, sort_order: 0 },
      { id: "pm2", name: "Card", code: "card", active: 1, sort_order: 1 },
    ];
    needWrite = true;
  }
  // Tables: only fill defaults when truly empty AND no orders (first run). If we have orders but tables empty (e.g. bad restart), rebuild from orders so data is not lost.
  if (!Array.isArray(db.data.tables)) db.data.tables = [];
  if (!Array.isArray(db.data.audit_log)) db.data.audit_log = [];
  if (!Array.isArray(db.data.eod_logs)) db.data.eod_logs = [];
  if (!db.data.settings || typeof db.data.settings.timezone_offset_minutes !== "number") {
    db.data.settings = db.data.settings || {};
    db.data.settings.timezone_offset_minutes = (db.data.settings.timezone_offset_minutes ?? 0) | 0;
  }
  if (typeof db.data.settings.overdue_undelivered_minutes !== "number") {
    db.data.settings.overdue_undelivered_minutes = Math.min(1440, Math.max(1, (db.data.settings.overdue_undelivered_minutes ?? 10) | 0));
  }
  if (typeof db.data.settings.opening_time !== "string") db.data.settings.opening_time = db.data.settings.opening_time ?? "07:00";
  if (typeof db.data.settings.closing_time !== "string") db.data.settings.closing_time = db.data.settings.closing_time ?? "01:30";
  if (typeof db.data.settings.open_tables_warning_time !== "string") db.data.settings.open_tables_warning_time = db.data.settings.open_tables_warning_time ?? "01:00";
  if (typeof db.data.settings.auto_close_open_tables !== "boolean") db.data.settings.auto_close_open_tables = !!db.data.settings.auto_close_open_tables;
  if (typeof db.data.settings.auto_close_payment_method !== "string") db.data.settings.auto_close_payment_method = db.data.settings.auto_close_payment_method ?? "cash";
  if (typeof db.data.settings.grace_minutes !== "number") db.data.settings.grace_minutes = Math.min(60, Math.max(0, (db.data.settings.grace_minutes ?? 0) | 0));
  if (typeof db.data.settings.warning_enabled !== "boolean") db.data.settings.warning_enabled = db.data.settings.warning_enabled !== false;
  if (!Array.isArray(db.data.business_operation_log)) db.data.business_operation_log = [];
  if (typeof db.data.settings.last_auto_close_for_business_day !== "string") db.data.settings.last_auto_close_for_business_day = db.data.settings.last_auto_close_for_business_day ?? null;
  if (db.data.tables.length === 0) {
    const defaultTable = (i) => ({
      id: `main-${i + 1}`,
      number: String(i + 1),
      name: `Table ${i + 1}`,
      capacity: 4,
      floor: "Main",
      status: "free",
      current_order_id: null,
      guest_count: 0,
      waiter_id: null,
      waiter_name: null,
      opened_at: null,
      x: 80 + (i % 10) * 90,
      y: 50 + Math.floor(i / 10) * 100,
      width: 80,
      height: 80,
      shape: "square",
    });
    db.data.tables = Array.from({ length: 43 }, (_, i) => defaultTable(i));
    const orders = db.data.orders || [];
    if (orders.length > 0) {
      for (const order of orders) {
        const tid = order.table_id;
        if (!tid) continue;
        const tIdx = db.data.tables.findIndex((t) => t.id === tid);
        if (tIdx >= 0) {
          const t = db.data.tables[tIdx];
          const isPaid = order.status === "paid";
          db.data.tables[tIdx] = {
            ...t,
            status: isPaid ? "free" : "occupied",
            current_order_id: isPaid ? null : order.id,
            waiter_id: isPaid ? null : (order.waiter_id ?? t.waiter_id),
            waiter_name: isPaid ? null : (order.waiter_name ?? t.waiter_name),
          };
        }
      }
    }
    needWrite = true;
  }
  if (!Array.isArray(db.data.printers)) db.data.printers = [];
  if (!Array.isArray(db.data.modifier_groups)) db.data.modifier_groups = [];
  if (needWrite) await db.write();
  // Migration: ensure setup user with PIN 2222 exists
  if (!db.data.migrations.ensureAdminPin1234) {
    const hasSetupPin = (db.data.users || []).some((u) => String(u.pin) === "2222");
    if (!hasSetupPin) {
      const existing = db.data.users.find((u) => u.id === "u1");
      if (existing) {
        existing.pin = "2222";
        existing.name = "Setup";
        existing.role = "setup";
        existing.permissions = "[]";
        existing.cash_drawer_permission = 0;
      } else {
        db.data.users = [DEFAULT_SETUP, ...(db.data.users || [])];
      }
      await db.write();
    }
    db.data.migrations.ensureAdminPin1234 = true;
    await db.write();
  }
  // Migration: Replace 1234 with 2222 as setup PIN
  if (!db.data.migrations.replace1234With2222) {
    const user1234 = (db.data.users || []).find((u) => String(u.pin) === "1234");
    if (user1234) {
      user1234.pin = "2222";
      user1234.role = "setup";
      user1234.name = "Setup";
      user1234.permissions = "[]";
      user1234.cash_drawer_permission = 0;
      await db.write();
    }
    const has2222 = (db.data.users || []).some((u) => String(u.pin) === "2222");
    if (!has2222) {
      db.data.users = [DEFAULT_SETUP, ...(db.data.users || [])];
      await db.write();
    }
    db.data.migrations.replace1234With2222 = true;
    await db.write();
  }
  // Migration: PIN 2222 must be setup role only (API URL)
  if (!db.data.migrations.pin2222SetupOnly) {
    const setupUser = (db.data.users || []).find((u) => String(u.pin) === "2222");
    if (setupUser) {
      setupUser.role = "setup";
      setupUser.name = "Setup";
      setupUser.permissions = "[]";
      setupUser.cash_drawer_permission = 0;
      await db.write();
    }
    db.data.migrations.pin2222SetupOnly = true;
    await db.write();
  }
  // Migration: Remove 1234 (and legacy 2222) from users — 1234 maintenance only
  if (!db.data.migrations.removeMaintenancePinsFromUsers) {
    db.data.users = (db.data.users || []).filter((u) => {
      const p = String(u?.pin ?? "");
      return p !== "1234" && p !== "2222";
    });
    db.data.migrations.removeMaintenancePinsFromUsers = true;
    await db.write();
  }
  // Migration: ensure default category has show_till and structure (one-time fix for old DBs)
  if (!db.data.migrations.ensureDefaultsForWeb) {
    if (db.data.categories?.length) {
      db.data.categories = db.data.categories.map((c) => ({
        ...c,
        show_till: c.show_till !== undefined ? c.show_till : 0,
        modifier_groups: c.modifier_groups ?? "[]",
        printers: c.printers ?? "[]",
      }));
    }
    if (!Array.isArray(db.data.printers)) db.data.printers = [];
    if (!Array.isArray(db.data.modifier_groups)) db.data.modifier_groups = [];
    db.data.migrations.ensureDefaultsForWeb = true;
    await db.write();
  }
  // Migration: initial Zoho import set pos_enabled = 0 for all products.
  // For POS app to show products in Order screen, default all existing products to pos_enabled = 1 once.
  // For existing DBs without setup_complete, treat as already set up
  if (db.data.setup_complete === undefined) {
    db.data.setup_complete = true;
    await db.write();
  }
  if (!db.data.migrations.posEnabledDefaultToOne) {
    db.data.products = (db.data.products || []).map((p) => {
      const val = p.pos_enabled;
      const enabled =
        val === undefined || val === null
          ? 1
          : val === 1 || val === "1" || val === true
            ? 1
            : 0;
      return { ...p, pos_enabled: enabled };
    });
    db.data.migrations.posEnabledDefaultToOne = true;
  }
  if (!db.data.migrations.posEnabledRespectZero) {
    db.data.products = (db.data.products || []).map((p) => {
      const val = p.pos_enabled;
      const enabled =
        val === undefined || val === null
          ? 1
          : val === 1 || val === "1" || val === true
            ? 1
            : 0;
      return { ...p, pos_enabled: enabled };
    });
    db.data.migrations.posEnabledRespectZero = true;
  }
  // Migration: normalize product modifier_groups to JSON array of string IDs (fix Zoho/old format)
  if (!db.data.migrations.productModifierGroupsNormalize) {
    function toModIds(val) {
      if (!val) return [];
      const arr = typeof val === "string" ? (() => { try { return JSON.parse(val); } catch { return []; } })() : Array.isArray(val) ? val : [];
      return arr.map((x) => (typeof x === "string" ? x : x?.id ?? x?.Id)?.toString?.()?.trim()).filter(Boolean);
    }
    db.data.products = (db.data.products || []).map((p) => {
      const ids = toModIds(p.modifier_groups);
      return { ...p, modifier_groups: JSON.stringify(ids) };
    });
    db.data.migrations.productModifierGroupsNormalize = true;
  }
  // Migration: normalize table layout so tables are ordered by number (1–10 together, then 11–20, etc.)
  if (!db.data.migrations.tablesGridLayoutV1) {
    const tables = Array.isArray(db.data.tables) ? [...db.data.tables] : [];
    tables.sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    tables.forEach((t, i) => {
      t.x = 80 + (i % 10) * 90;
      t.y = 50 + Math.floor(i / 10) * 100;
      t.width = 80;
      t.height = 80;
      t.shape = t.shape || "square";
    });
    db.data.tables = tables;
    db.data.migrations.tablesGridLayoutV1 = true;
  }
  await db.write();
}

const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.slice(7);
  const user = db.data.users.find((u) => u.id === token || u.pin === token);
  if (!user || !user.active) return res.status(401).json({ error: "Unauthorized" });
  req.user = user;
  next();
};

// No auth — telefondan tarayıcıda açıp bağlantı testi: http://192.168.1.169:3002/api/health
app.get("/api/health", (req, res) => {
  const dataDir = process.env.DATA_DIR || "";
  const fileInfo = getDataFileInfo();
  res.json({
    ok: true,
    message: "LimonPOS API",
    ts: Date.now(),
    data_dir: dataDir || "(not set)",
    persistent_storage: !!dataDir,
    data_file: fileInfo.path,
    data_file_ok: !fileInfo.inMemory && fileInfo.size != null,
    data_file_size: fileInfo.size ?? undefined,
    data_file_mtime: fileInfo.mtime ?? undefined,
  });
});

app.post("/api/auth/login", async (req, res) => {
  await ensureData();
  const pin = String((req.body || {}).pin || "").trim();
  const user = db.data.users.find((u) => String(u.pin) === pin && u.active);
  if (!user) return res.status(401).json({ error: "Invalid PIN" });
  const perms = JSON.parse(user.permissions || "[]");
  res.json({
    user: { id: user.id, name: user.name, pin: user.pin, role: user.role, active: !!user.active, permissions: perms, cash_drawer_permission: !!user.cash_drawer_permission },
    token: user.id,
  });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const user = req.user;
  const perms = JSON.parse(user.permissions || "[]");
  res.json({
    id: user.id,
    name: user.name,
    role: user.role,
    permissions: perms,
    cash_drawer_permission: !!user.cash_drawer_permission,
  });
});

app.post("/api/auth/verify-cash-drawer", authMiddleware, async (req, res) => {
  await ensureData();
  const pin = String((req.body || {}).pin || "").trim();
  const user = (db.data.users || []).find((u) => String(u.pin) === pin && u.active);
  if (!user || !(user.cash_drawer_permission || user.role === "admin" || user.role === "manager")) return res.status(403).json({ success: false, message: "No permission" });
  db.data.cash_drawer_opens = db.data.cash_drawer_opens || [];
  db.data.cash_drawer_opens.push({
    id: uuid(),
    user_id: user.id,
    user_name: user.name || "—",
    opened_at: Date.now(),
  });
  await db.write();
  res.json({ success: true, message: null });
});

// Setup (first-time wizard)
app.get("/api/setup/status", authMiddleware, async (req, res) => {
  await ensureData();
  const setupComplete = db.data.setup_complete === true;
  res.json({ setupComplete });
});

app.post("/api/setup/complete", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.setup_complete = true;
  await db.write();
  res.json({ setupComplete: true });
});

/** Cihaz heartbeat: Android senkron sırasında çağırır; web "çevrimiçi" listesi için last_seen güncellenir. */
const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000; // 3 dakika içinde heartbeat alan cihaz çevrimiçi sayılır
app.post("/api/devices/heartbeat", authMiddleware, async (req, res) => {
  await ensureData();
  const body = req.body || {};
  const deviceId = String(body.device_id || body.deviceId || "").trim();
  if (!deviceId) return res.status(400).json({ error: "device_id required" });
  const now = Date.now();
  const device = {
    id: deviceId,
    name: body.device_name || body.deviceName || "Android POS",
    app_version: body.app_version || body.appVersion || null,
    last_seen: now,
    user_id: req.user?.id || null,
  };
  const idx = db.data.devices.findIndex((d) => d.id === deviceId);
  if (idx >= 0) {
    const existing = db.data.devices[idx];
    const merged = { ...existing, ...device };
    if (existing.clear_local_data_requested === true) {
      merged.clear_local_data_requested = true;
    }
    db.data.devices[idx] = merged;
  } else {
    db.data.devices.push(device);
  }
  await db.write();
  const dev = db.data.devices.find((d) => d.id === deviceId);
  const clearRequested = !!(dev && dev.clear_local_data_requested);
  res.json({ ok: true, last_seen: now, clear_local_data_requested: clearRequested });
});

app.post("/api/devices/:id/request-clear-local-data", authMiddleware, async (req, res) => {
  await ensureData();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied" });
  }
  const deviceId = req.params.id;
  const idx = db.data.devices.findIndex((d) => d.id === deviceId);
  if (idx < 0) {
    return res.status(404).json({ error: "Device not found" });
  }
  db.data.devices[idx].clear_local_data_requested = true;
  await db.write();
  res.json({ ok: true, message: "Clear request sent. Device will clear local sales data on next sync." });
});

app.post("/api/devices/ack-clear", authMiddleware, async (req, res) => {
  await ensureData();
  const deviceId = String(req.body?.device_id || req.body?.deviceId || "").trim();
  if (!deviceId) return res.status(400).json({ error: "device_id required" });
  const idx = db.data.devices.findIndex((d) => d.id === deviceId);
  if (idx >= 0) {
    delete db.data.devices[idx].clear_local_data_requested;
    await db.write();
  }
  res.json({ ok: true });
});

app.get("/api/devices", authMiddleware, async (req, res) => {
  await ensureData();
  const now = Date.now();
  const list = (db.data.devices || []).map((d) => ({
    id: d.id,
    name: d.name || "POS",
    app_version: d.app_version || null,
    last_seen: d.last_seen || 0,
    user_id: d.user_id || null,
    online: (now - (d.last_seen || 0)) <= HEARTBEAT_TIMEOUT_MS,
  }));
  res.json(list);
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
  await ensureData();
  const customRoles = (db.data.custom_roles || []).map((r) => ({ ...r, isCustom: true }));
  const builtIn = ROLES.map((r) => ({ ...r, isCustom: false }));
  res.json({ roles: [...builtIn, ...customRoles], permissions: PERMISSIONS });
});

app.post("/api/roles", authMiddleware, async (req, res) => {
  await ensureData();
  const body = req.body || {};
  const id = (body.id || "custom_" + (body.label || "role").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")).trim();
  if (!id) return res.status(400).json({ error: "id or label required" });
  const allRoleIds = [...ROLES.map((r) => r.id), ...(db.data.custom_roles || []).map((r) => r.id)];
  if (allRoleIds.includes(id)) return res.status(400).json({ error: "Role id already exists" });
  const label = (body.label || id).trim();
  const labelTr = (body.labelTr || body.label || id).trim();
  db.data.custom_roles = db.data.custom_roles || [];
  db.data.custom_roles.push({ id, label, labelTr });
  await db.write();
  res.json({ id, label, labelTr });
});

app.delete("/api/roles/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const { id } = req.params;
  if (ROLES.some((r) => r.id === id)) return res.status(400).json({ error: "Cannot delete built-in role" });
  db.data.custom_roles = (db.data.custom_roles || []).filter((r) => r.id !== id);
  await db.write();
  res.status(204).send();
});

// Users
app.get("/api/users", authMiddleware, async (req, res) => {
  await ensureData();
  res.json(db.data.users.map((r) => ({
    ...r,
    active: !!(r.active !== 0 && r.active !== false),
    permissions: JSON.parse(r.permissions || "[]"),
    cash_drawer_permission: !!r.cash_drawer_permission,
  })));
});

app.post("/api/users", authMiddleware, async (req, res) => {
  await ensureData();
  const id = req.body.id || uuid().slice(0, 8);
  const body = req.body;
  const user = { id, name: body.name || "User", pin: body.pin || "0000", role: body.role || "waiter", active: body.active !== false ? 1 : 0, permissions: JSON.stringify(body.permissions || []), cash_drawer_permission: body.cash_drawer_permission ? 1 : 0 };
  db.data.users = db.data.users.filter((u) => u.id !== id);
  db.data.users.push(user);
  await db.write();
  res.json({ ...user, permissions: JSON.parse(user.permissions || "[]"), cash_drawer_permission: !!user.cash_drawer_permission });
});

app.put("/api/users/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const { id } = req.params;
  const body = req.body;
  const idx = db.data.users.findIndex((u) => u.id === id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  db.data.users[idx] = { ...db.data.users[idx], name: body.name, pin: body.pin, role: body.role || "waiter", active: body.active !== false ? 1 : 0, permissions: JSON.stringify(body.permissions || []), cash_drawer_permission: body.cash_drawer_permission ? 1 : 0 };
  await db.write();
  res.json({ ...db.data.users[idx], permissions: JSON.parse(db.data.users[idx].permissions || "[]"), cash_drawer_permission: !!db.data.users[idx].cash_drawer_permission });
});

app.delete("/api/users/:id", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.users = db.data.users.filter((u) => u.id !== req.params.id);
  await db.write();
  res.status(204).send();
});

// Import users from Excel (parsed in frontend, sent as JSON)
app.post("/api/users/import", authMiddleware, async (req, res) => {
  await ensureData();
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
    const user = { id, name, pin, role, active: 1, permissions: "[]", cash_drawer_permission: role === "cashier" || role === "admin" ? 1 : 0 };
    db.data.users.push(user);
    created.push(user);
  }
  await db.write();
  res.json({ added: created.length, users: db.data.users });
});

// Categories — en az bir kategori don (app liste bos kalmasin); active olmayanlari da gonder, app filtreler
app.get("/api/categories", authMiddleware, async (req, res) => {
  await ensureData();
  let cats = (db.data.categories || []).filter((c) => c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (cats.length === 0) cats = (db.data.categories || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json(cats.map((c) => ({
    ...c,
    show_till: c.show_till !== undefined && c.show_till !== null ? Number(c.show_till) : 0,
    modifier_groups: JSON.parse(c.modifier_groups || "[]"),
    printers: JSON.parse(c.printers || "[]"),
  })));
});

app.post("/api/categories", authMiddleware, async (req, res) => {
  await ensureData();
  const id = req.body.id || `cat_${uuid().slice(0, 8)}`;
  const body = req.body;
  const cat = { id, name: body.name || "Category", color: body.color || "#84CC16", sort_order: body.sort_order ?? 0, active: body.active !== false ? 1 : 0, show_till: body.show_till ? 1 : 0, modifier_groups: JSON.stringify(body.modifier_groups || []), printers: JSON.stringify(body.printers || []), overdue_undelivered_minutes: body.overdue_undelivered_minutes != null && body.overdue_undelivered_minutes !== "" ? Math.min(1440, Math.max(1, Number(body.overdue_undelivered_minutes) || 10)) : null };
  db.data.categories = db.data.categories.filter((c) => c.id !== id);
  db.data.categories.push(cat);
  await db.write();
  res.json({ ...cat, modifier_groups: JSON.parse(cat.modifier_groups), printers: JSON.parse(cat.printers || "[]") });
});

app.put("/api/categories/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.categories.findIndex((c) => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  db.data.categories[idx] = { ...db.data.categories[idx], name: body.name, color: body.color || "#84CC16", sort_order: body.sort_order ?? 0, active: body.active !== false ? 1 : 0, show_till: body.show_till ? 1 : 0, modifier_groups: JSON.stringify(body.modifier_groups || []), printers: JSON.stringify(body.printers || []), overdue_undelivered_minutes: body.overdue_undelivered_minutes != null && body.overdue_undelivered_minutes !== "" ? Math.min(1440, Math.max(1, Number(body.overdue_undelivered_minutes) || 10)) : (db.data.categories[idx].overdue_undelivered_minutes ?? null) };
  await db.write();
  res.json({ ...db.data.categories[idx], modifier_groups: JSON.parse(db.data.categories[idx].modifier_groups || "[]"), printers: JSON.parse(db.data.categories[idx].printers || "[]") });
});

app.delete("/api/categories/:id", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.categories = db.data.categories.filter((c) => c.id !== req.params.id);
  await db.write();
  res.status(204).send();
});

// Products — only return sellable items (exclude sellable === false). Requires Authorization: Bearer <token>.
app.get("/api/products", authMiddleware, async (req, res) => {
  await ensureData();
  const cats = Object.fromEntries((db.data.categories || []).map((r) => [r.id, r.name]));
  const catById = Object.fromEntries((db.data.categories || []).map((c) => [c.id, c]));
  const products = (db.data.products || []).filter((p) => p.sellable !== false);
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
  await ensureData();
  const id = req.body.id || `p_${uuid().slice(0, 8)}`;
  const body = req.body;
  const posEnabled = body.pos_enabled === undefined ? 1 : (body.pos_enabled === true || body.pos_enabled === 1 || body.pos_enabled === "1" ? 1 : 0);
  const prod = { id, name: body.name || "Product", name_arabic: body.name_arabic || "", name_turkish: body.name_turkish || "", sku: body.sku || "", category_id: body.category_id || null, price: body.price ?? 0, tax_rate: body.tax_rate ?? 0, image_url: body.image_url || "", printers: JSON.stringify(body.printers || []), modifier_groups: JSON.stringify(body.modifier_groups || []), active: body.active !== false ? 1 : 0, pos_enabled: posEnabled, sellable: true, overdue_undelivered_minutes: body.overdue_undelivered_minutes != null && body.overdue_undelivered_minutes !== "" ? Math.min(1440, Math.max(1, Number(body.overdue_undelivered_minutes) || 10)) : null };
  db.data.products = db.data.products.filter((p) => p.id !== id);
  db.data.products.push(prod);
  await db.write();
  const cats = Object.fromEntries((db.data.categories || []).map((r) => [r.id, r.name]));
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
  await ensureData();
  const idx = db.data.products.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const show = parseShowInTill(req.body?.show);
  if (show === undefined) return res.status(400).json({ error: "show (boolean) required" });
  db.data.products[idx].pos_enabled = show;
  await db.write();
  const r = db.data.products[idx];
  const cats = Object.fromEntries((db.data.categories || []).map((c) => [c.id, c.name]));
  res.json({ ...r, category: cats[r.category_id] || "", printers: JSON.parse(r.printers || "[]"), modifier_groups: JSON.parse(r.modifier_groups || "[]"), pos_enabled: r.pos_enabled });
});

app.put("/api/products/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.products.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  const existing = db.data.products[idx];
  const active = body.active === undefined ? existing.active : (body.active !== false && body.active !== 0 ? 1 : 0);
  const posEnabled = body.pos_enabled === undefined ? existing.pos_enabled : (body.pos_enabled !== false && body.pos_enabled !== 0 ? 1 : 0);
  db.data.products[idx] = { ...existing, name: body.name, name_arabic: body.name_arabic || "", name_turkish: body.name_turkish || "", sku: body.sku || "", category_id: body.category_id || null, price: body.price ?? 0, tax_rate: body.tax_rate ?? 0, image_url: body.image_url ?? existing.image_url ?? "", printers: JSON.stringify(body.printers || []), modifier_groups: JSON.stringify(body.modifier_groups || []), active, pos_enabled: posEnabled, overdue_undelivered_minutes: body.overdue_undelivered_minutes != null && body.overdue_undelivered_minutes !== "" ? Math.min(1440, Math.max(1, Number(body.overdue_undelivered_minutes) || 10)) : (existing.overdue_undelivered_minutes ?? null) };
  await db.write();
  const cats = Object.fromEntries((db.data.categories || []).map((r) => [r.id, r.name]));
  res.json({ ...db.data.products[idx], category: cats[db.data.products[idx].category_id] || "", printers: JSON.parse(db.data.products[idx].printers || "[]"), modifier_groups: JSON.parse(db.data.products[idx].modifier_groups || "[]") });
});

app.delete("/api/products/:id", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.products = db.data.products.filter((p) => p.id !== req.params.id);
  await db.write();
  res.status(204).send();
});

// Zoho'dan sync (upsert); önce silme yok. Hata olursa ürünler geri yüklenir – ürün kaybı önlenir.
app.post("/api/products/clear-and-sync", authMiddleware, async (req, res) => {
  await ensureData();
  const backupProducts = [...(db.data.products || [])];
  const backupCategories = [...(db.data.categories || [])];
  let syncResult = { categoriesAdded: 0, productsAdded: 0, productsUpdated: 0, productsRemoved: 0, productsSuggestedForRemoval: [], itemsFetched: 0, error: null };
  try {
    syncResult = await syncFromZoho(db, {});
  } catch (e) {
    syncResult.error = (e && e.message) || "Sync failed";
    db.data.products = backupProducts;
    db.data.categories = backupCategories;
    await db.write();
  }
  await db.read();
  const cats = Object.fromEntries((db.data.categories || []).map((r) => [r.id, r.name]));
  const products = (db.data.products || []).filter((p) => p.sellable !== false).map((r) => ({ ...r, category: cats[r.category_id] || "", printers: JSON.parse(r.printers || "[]"), modifier_groups: JSON.parse(r.modifier_groups || "[]"), zoho_suggest_remove: !!r.zoho_suggest_remove }));
  res.json({ ...syncResult, products });
});

// Zoho'da artık olmayan (silinecek önerisi) ürünler listesi; onay verilene kadar satışta kalır.
app.get("/api/products/pending-zoho-removal", authMiddleware, async (req, res) => {
  await ensureData();
  const cats = Object.fromEntries((db.data.categories || []).map((r) => [r.id, r.name]));
  const list = (db.data.products || []).filter((p) => p.zoho_suggest_remove === true).map((r) => ({
    ...r,
    category: cats[r.category_id] || "",
    printers: JSON.parse(r.printers || "[]"),
    modifier_groups: JSON.parse(r.modifier_groups || "[]"),
  }));
  res.json(list);
});

// Seçilen ürünleri kalıcı sil (onay sonrası). Sadece zoho_suggest_remove olanlar için kullanılır.
app.post("/api/products/confirm-removal", authMiddleware, async (req, res) => {
  await ensureData();
  const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds.map(String) : [];
  if (productIds.length === 0) return res.status(400).json({ error: "productIds required (array)" });
  const before = (db.data.products || []).length;
  db.data.products = (db.data.products || []).filter((p) => !productIds.includes(p.id));
  const removed = before - db.data.products.length;
  await db.write();
  res.json({ removed, productIds });
});

// Printers
app.get("/api/printers", authMiddleware, async (req, res) => {
  await ensureData();
  res.json(db.data.printers || []);
});

app.post("/api/printers", authMiddleware, async (req, res) => {
  await ensureData();
  const id = req.body.id || `pr_${uuid().slice(0, 8)}`;
  const body = req.body;
  const pr = { id, name: body.name || "Printer", printer_type: body.printer_type || "kitchen", ip_address: body.ip_address || "", port: body.port ?? 9100, connection_type: body.connection_type || "network", status: body.status || "offline", is_backup: body.is_backup ? 1 : 0, kds_enabled: body.kds_enabled !== false ? 1 : 0, enabled: body.enabled !== false ? 1 : 0 };
  db.data.printers = db.data.printers.filter((p) => p.id !== id);
  db.data.printers.push(pr);
  await db.write();
  res.json(pr);
});

app.put("/api/printers/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.printers.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  db.data.printers[idx] = { ...db.data.printers[idx], name: body.name, printer_type: body.printer_type || "kitchen", ip_address: body.ip_address || "", port: body.port ?? 9100, connection_type: body.connection_type || "network", status: body.status || "offline", is_backup: body.is_backup ? 1 : 0, kds_enabled: body.kds_enabled !== false ? 1 : 0, enabled: body.enabled !== false ? 1 : 0 };
  await db.write();
  res.json(db.data.printers[idx]);
});

app.put("/api/printers/:id/status", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.printers.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  db.data.printers[idx].status = req.query.status || "offline";
  await db.write();
  res.json(db.data.printers[idx]);
});

app.delete("/api/printers/:id", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.printers = db.data.printers.filter((p) => p.id !== req.params.id);
  await db.write();
  res.status(204).send();
});

// Payment methods
app.get("/api/payment-methods", authMiddleware, async (req, res) => {
  await ensureData();
  res.json((db.data.payment_methods || []).filter((p) => p.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
});

app.post("/api/payment-methods", authMiddleware, async (req, res) => {
  await ensureData();
  const id = req.body.id || `pm_${uuid().slice(0, 8)}`;
  const body = req.body;
  const pm = { id, name: body.name || "Method", code: body.code || "other", active: body.active !== false ? 1 : 0, sort_order: body.sort_order ?? 0 };
  db.data.payment_methods = db.data.payment_methods.filter((p) => p.id !== id);
  db.data.payment_methods.push(pm);
  await db.write();
  res.json(pm);
});

app.put("/api/payment-methods/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.payment_methods.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  db.data.payment_methods[idx] = { ...db.data.payment_methods[idx], name: body.name, code: body.code || "other", active: body.active !== false ? 1 : 0, sort_order: body.sort_order ?? 0 };
  await db.write();
  res.json(db.data.payment_methods[idx]);
});

app.delete("/api/payment-methods/:id", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.payment_methods = db.data.payment_methods.filter((p) => p.id !== req.params.id);
  await db.write();
  res.status(204).send();
});

// Modifier groups
app.get("/api/modifier-groups", authMiddleware, async (req, res) => {
  await ensureData();
  res.json((db.data.modifier_groups || []).map((r) => ({ ...r, options: JSON.parse(r.options || "[]") })));
});

app.post("/api/modifier-groups", authMiddleware, async (req, res) => {
  await ensureData();
  const id = req.body.id || `mg_${uuid().slice(0, 8)}`;
  const body = req.body;
  const opts = (body.options || []).map((o, i) => ({ id: o.id || `mo_${id}_${i}`, name: o.name || "Option", price: o.price ?? 0 }));
  const mg = { id, name: body.name || "Modifier Group", min_select: body.min_select ?? 0, max_select: body.max_select ?? 1, required: body.required ? 1 : 0, options: JSON.stringify(opts) };
  db.data.modifier_groups = db.data.modifier_groups || [];
  db.data.modifier_groups = db.data.modifier_groups.filter((m) => m.id !== id);
  db.data.modifier_groups.push(mg);
  await db.write();
  res.json({ ...mg, options: opts });
});

app.put("/api/modifier-groups/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = (db.data.modifier_groups || []).findIndex((m) => m.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  const opts = (body.options || []).map((o, i) => ({ id: o.id || `mo_${req.params.id}_${i}`, name: o.name || "Option", price: o.price ?? 0 }));
  db.data.modifier_groups[idx] = { ...db.data.modifier_groups[idx], name: body.name || db.data.modifier_groups[idx].name, min_select: body.min_select ?? 0, max_select: body.max_select ?? 1, required: body.required ? 1 : 0, options: JSON.stringify(opts) };
  await db.write();
  res.json({ ...db.data.modifier_groups[idx], options: opts });
});

app.delete("/api/modifier-groups/:id", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.modifier_groups = (db.data.modifier_groups || []).filter((m) => m.id !== req.params.id);
  await db.write();
  res.status(204).send();
});

// Settings (timezone, receipt/bill, kitchen, currency)
app.get("/api/settings", authMiddleware, async (req, res) => {
  await ensureData();
  const s = db.data.settings || {};
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
  });
});

function validateTimeHHMM(str) {
  if (typeof str !== "string" || !/^\d{1,2}:\d{2}$/.test(str.trim())) return null;
  const [h, m] = str.trim().split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

app.patch("/api/settings", authMiddleware, async (req, res) => {
  await ensureData();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (req.user?.role !== "admin" && req.user?.role !== "manager" && !perms.includes("web_settings")) {
    return res.status(403).json({ error: "Permission denied. Settings require admin, manager, or web_settings." });
  }
  db.data.settings = db.data.settings || {};
  const prevSettings = { ...db.data.settings };
  if (typeof req.body.timezone_offset_minutes === "number") {
    db.data.settings.timezone_offset_minutes = Math.round(req.body.timezone_offset_minutes);
    if (db.data.settings.timezone_offset_minutes < -720) db.data.settings.timezone_offset_minutes = -720;
    if (db.data.settings.timezone_offset_minutes > 840) db.data.settings.timezone_offset_minutes = 840;
  }
  if (typeof req.body.overdue_undelivered_minutes === "number") {
    const v = Math.round(req.body.overdue_undelivered_minutes);
    db.data.settings.overdue_undelivered_minutes = Math.min(1440, Math.max(1, v));
  }
  if (typeof req.body.company_name === "string") db.data.settings.company_name = req.body.company_name.slice(0, 200);
  if (typeof req.body.company_address === "string") db.data.settings.company_address = req.body.company_address.slice(0, 400);
  if (typeof req.body.receipt_header === "string") db.data.settings.receipt_header = req.body.receipt_header.slice(0, 100) || "BILL / RECEIPT";
  if (typeof req.body.receipt_footer_message === "string") db.data.settings.receipt_footer_message = req.body.receipt_footer_message.slice(0, 300) || "Thank you!";
  if (typeof req.body.kitchen_header === "string") db.data.settings.kitchen_header = req.body.kitchen_header.slice(0, 100) || "KITCHEN";
  if (typeof req.body.receipt_item_size === "number") {
    const v = Math.round(req.body.receipt_item_size);
    db.data.settings.receipt_item_size = Math.min(2, Math.max(0, v));
  }
  const validCurrencyCodes = ["AED", "TRY", "USD", "EUR", "GBP"];
  if (typeof req.body.currency_code === "string" && validCurrencyCodes.includes(req.body.currency_code)) {
    db.data.settings.currency_code = req.body.currency_code;
  }
  const ot = validateTimeHHMM(req.body.opening_time);
  if (ot) db.data.settings.opening_time = ot;
  const ct = validateTimeHHMM(req.body.closing_time);
  if (ct) db.data.settings.closing_time = ct;
  const wt = validateTimeHHMM(req.body.open_tables_warning_time);
  if (wt) db.data.settings.open_tables_warning_time = wt;
  if (typeof req.body.auto_close_open_tables === "boolean") db.data.settings.auto_close_open_tables = req.body.auto_close_open_tables;
  if (typeof req.body.auto_close_payment_method === "string") db.data.settings.auto_close_payment_method = req.body.auto_close_payment_method.slice(0, 50) || "cash";
  if (typeof req.body.grace_minutes === "number") db.data.settings.grace_minutes = Math.min(60, Math.max(0, Math.round(req.body.grace_minutes)));
  if (typeof req.body.warning_enabled === "boolean") db.data.settings.warning_enabled = req.body.warning_enabled;
  const businessKeys = ["opening_time", "closing_time", "open_tables_warning_time", "auto_close_open_tables", "auto_close_payment_method", "grace_minutes", "warning_enabled", "currency_code"];
  const changed = businessKeys.filter((k) => String(prevSettings[k] ?? "") !== String(db.data.settings[k] ?? ""));
  if (changed.length > 0) {
    db.data.business_operation_log = db.data.business_operation_log || [];
    db.data.business_operation_log.push({
      ts: Date.now(),
      action: "settings_changed",
      user_id: req.user?.id,
      user_name: req.user?.name,
      changed,
    });
    if (db.data.business_operation_log.length > 2000) db.data.business_operation_log = db.data.business_operation_log.slice(-2000);
  }
  await db.write();
  const s = db.data.settings;
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
  });
});

// End of Day (Günü Kapat) – gece 12 sonrası satışlar için; açık masalar varsa uyarı veya kapatıp ödeme alınmış say
app.get("/api/eod/status", authMiddleware, async (req, res) => {
  await ensureData();
  const tables = db.data.tables || [];
  const orders = db.data.orders || [];
  const eodLogs = db.data.eod_logs || [];
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
  await ensureData();
  const closeOpenTables = !!req.body?.closeOpenTables;
  const tables = db.data.tables || [];
  const orders = db.data.orders || [];
  db.data.payments = db.data.payments || [];
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
    db.data.payments.push({ id: `pay_${uuid().slice(0, 8)}`, order_id: orderId, amount, method: "cash", received_amount: amount, change_amount: 0, user_id: userId, created_at: now });
    const oidx = orders.findIndex((o) => o.id === orderId);
    if (oidx >= 0) {
      db.data.orders[oidx].status = "paid";
      db.data.orders[oidx].paid_at = now;
    }
    db.data.tables.forEach((tbl) => {
      if (tbl.current_order_id === orderId) {
        tbl.status = "free";
        tbl.current_order_id = null;
        tbl.guest_count = 0;
        tbl.waiter_id = null;
        tbl.waiter_name = null;
        tbl.opened_at = null;
      }
    });
    tablesClosed.push({ table_id: t.id, table_number: t.number, order_id: orderId, amount });
  }

  db.data.eod_logs = db.data.eod_logs || [];
  db.data.eod_logs.push({
    id: `eod_${uuid().slice(0, 8)}`,
    ran_at: now,
    user_id: userId,
    user_name: userName,
    tables_closed: tablesClosed,
    orders_closed_count: tablesClosed.length,
  });
  await db.write();

  res.json({
    success: true,
    tablesClosedCount: tablesClosed.length,
    lastEod: { ran_at: now, user_name: userName, tables_closed_count: tablesClosed.length, orders_closed_count: tablesClosed.length },
  });
});

// Dashboard stats. Open Tables = only tables that have an order with status open/sent (masaya bağlı açık hesap).
app.get("/api/dashboard/stats", authMiddleware, async (req, res) => {
  await ensureData();
  const summary = getTodaySalesSummary();
  const orders = db.data.orders || [];
  const tables = db.data.tables || [];
  const voidLogs = db.data.void_logs || [];
  const paymentByMethod = {};
  if (summary.totalCash) paymentByMethod.cash = summary.totalCash;
  if (summary.totalCard) paymentByMethod.card = summary.totalCard;
  const orderIdsOpenOrSent = new Set(orders.filter((o) => o.status === "open" || o.status === "sent").map((o) => o.id));
  const tablesWithOpenCheck = tables.filter((t) => t.current_order_id && orderIdsOpenOrSent.has(t.current_order_id));
  const openCount = tablesWithOpenCheck.length;
  const preVoids = voidLogs.filter((v) => v.type === "pre_void").length;
  const postVoids = voidLogs.filter((v) => v.type === "post_void").length;
  const eodLogs = db.data.eod_logs || [];
  const lastEod = eodLogs.length > 0 ? eodLogs[eodLogs.length - 1] : null;
  const voidRequests = db.data.void_requests || [];
  const closedBillAccessRequests = db.data.closed_bill_access_requests || [];
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
  await ensureData();
  const s = db.data.settings || {};
  const opening = s.opening_time ?? "07:00";
  const closing = s.closing_time ?? "01:30";
  const warning = s.open_tables_warning_time ?? "01:00";
  const off = offsetMin();
  const now = Date.now();
  const key = getBusinessDayKey(now, opening, closing, off);
  const afterWarning = isAfterWarningTime(now, warning, opening, closing, off);
  const tables = db.data.tables || [];
  const orders = db.data.orders || [];
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
  await ensureData();
  const s = db.data.settings || {};
  const key = getBusinessDayKey(Date.now(), s.opening_time ?? "07:00", s.closing_time ?? "01:30", offsetMin());
  if (key) {
    db.data.settings.last_warning_shown_for_business_day = key;
    db.data.business_operation_log = db.data.business_operation_log || [];
    db.data.business_operation_log.push({
      ts: Date.now(),
      action: "warning_shown",
      user_id: req.user?.id,
      user_name: req.user?.name,
      business_day_key: key,
    });
    if (db.data.business_operation_log.length > 2000) db.data.business_operation_log = db.data.business_operation_log.slice(-2000);
    await db.write();
  }
  res.json({ ok: true });
});

// Open tables not closed: detailed list for dashboard "end of day" section.
app.get("/api/dashboard/open-tables-not-closed", authMiddleware, async (req, res) => {
  await ensureData();
  const orders = db.data.orders || [];
  const orderItems = db.data.order_items || [];
  const tables = db.data.tables || [];
  const s = db.data.settings || {};
  const key = getBusinessDayKey(Date.now(), s.opening_time ?? "07:00", s.closing_time ?? "01:30", offsetMin());
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

// Open orders: only orders that are linked to a table (current_order_id). App ile uyumlu.
app.get("/api/dashboard/open-orders", authMiddleware, async (req, res) => {
  await ensureData();
  const orders = db.data.orders || [];
  const tables = db.data.tables || [];
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
  await ensureData();
  const settings = db.data.settings || {};
  const defaultOverdueMinutes = Math.min(1440, Math.max(1, (settings.overdue_undelivered_minutes ?? 10) | 0));
  const tables = db.data.tables || [];
  const orders = db.data.orders || [];
  const orderItems = db.data.order_items || [];
  const products = db.data.products || [];
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
  await ensureData();
  const dateStr = (req.query.date || "").toString().trim();
  const dateFromStr = (req.query.dateFrom || "").toString().trim();
  const dateToStr = (req.query.dateTo || "").toString().trim();
  let summary;
  let dayStartTs;
  let dayEndTs;
  if (dateFromStr && dateToStr) {
    const fromBounds = getDayBounds(dateFromStr);
    const toBounds = getDayBounds(dateToStr);
    if (!fromBounds || !toBounds) return res.status(400).json({ error: "invalid_date", message: "dateFrom and dateTo must be YYYY-MM-DD" });
    dayStartTs = fromBounds.startTs;
    dayEndTs = toBounds.endTs;
    if (dayStartTs > dayEndTs) return res.status(400).json({ error: "invalid_range", message: "dateFrom must be before or equal to dateTo" });
    summary = getSalesSummaryForRange(dayStartTs, dayEndTs);
  } else if (dateStr) {
    const bounds = getDayBounds(dateStr);
    if (!bounds) return res.status(400).json({ error: "invalid_date", message: "date must be YYYY-MM-DD" });
    summary = getSalesSummaryForRange(bounds.startTs, bounds.endTs);
    dayStartTs = bounds.startTs;
    dayEndTs = bounds.endTs;
  } else {
    const todaySummary = getTodaySalesSummary();
    summary = todaySummary;
    dayStartTs = todaySummary.todayTs;
    dayEndTs = todaySummary.todayEndTs;
  }
  const orders = db.data.orders || [];
  const orderItems = db.data.order_items || [];
  const products = db.data.products || [];
  const categories = db.data.categories || [];
  const voidLogs = db.data.void_logs || [];

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

  const paymentMethods = db.data.payment_methods || [];
  const paymentsByOrder = (db.data.payments || []).reduce((acc, p) => {
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

  const eodLogs = db.data.eod_logs || [];
  const lastEod = eodLogs.length > 0 ? eodLogs[eodLogs.length - 1] : null;
  const openTablesCount = (db.data.tables || []).filter((t) => t.current_order_id).length;
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

function expireTableReservations() {
  const now = Date.now();
  const list = db.data.table_reservations || [];
  let changed = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].status === "active" && list[i].to_time != null && now > list[i].to_time + RESERVATION_GRACE_MS) {
      list[i] = { ...list[i], status: "expired" };
      changed = true;
    }
  }
  return changed;
}

function getActiveReservationForTable(tableId) {
  const now = Date.now();
  return (db.data.table_reservations || []).find(
    (r) => r.table_id === tableId && r.status === "active" && r.to_time != null && now <= r.to_time + RESERVATION_GRACE_MS
  );
}

// Tables
app.get("/api/tables", authMiddleware, async (req, res) => {
  await ensureData();
  if (expireTableReservations()) await db.write();
  const tables = db.data.tables || [];
  res.json(
    tables.map((r) => {
      const num = typeof r.number === "string" ? parseInt(r.number, 10) || 0 : r.number ?? 0;
      const out = {
        ...r,
        number: num,
        current_order_id: r.current_order_id || null,
        waiter_id: r.waiter_id || null,
        waiter_name: r.waiter_name || null,
      };
      const isFree = !r.current_order_id;
      const activeRes = isFree ? getActiveReservationForTable(r.id) : null;
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
      return out;
    })
  );
});

app.post("/api/tables", authMiddleware, async (req, res) => {
  await ensureData();
  const id = req.body.id || `t_${uuid().slice(0, 8)}`;
  const body = req.body;
  const t = { id, number: body.number ?? 1, name: body.name || `Table ${body.number || 1}`, capacity: body.capacity ?? 4, floor: body.floor || "main", status: body.status || "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null, x: body.x ?? 0, y: body.y ?? 0, width: body.width ?? 120, height: body.height ?? 100, shape: body.shape || "square" };
  db.data.tables = db.data.tables.filter((x) => x.id !== id);
  db.data.tables.push(t);
  await db.write();
  res.json(t);
});

app.post("/api/tables/:id/open", authMiddleware, async (req, res) => {
  await ensureData();
  const { id } = req.params;
  const guestCount = parseInt(req.query.guest_count) || 1;
  const waiterId = req.query.waiter_id || req.user?.id;
  const waiter = db.data.users.find((u) => u.id === waiterId);
  const tbl = db.data.tables.find((t) => t.id === id);
  if (!tbl) return res.status(404).json({ error: "Not found" });
  const existingOrderId = tbl.current_order_id || null;
  const existingOrder = existingOrderId ? db.data.orders.find((o) => o.id === existingOrderId) : null;
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
  db.data.orders.push({ id: orderId, table_id: id, table_number: String(tbl.number), waiter_id: waiterId, waiter_name: waiter?.name || "Waiter", status: "open", subtotal: 0, tax_amount: 0, discount_percent: 0, discount_amount: 0, total: 0, created_at: now, paid_at: null, zoho_receipt_id: null });
  const tidx = db.data.tables.findIndex((t) => t.id === id);
  db.data.tables[tidx] = { ...db.data.tables[tidx], status: "occupied", current_order_id: orderId, guest_count: guestCount, waiter_id: waiterId, waiter_name: waiter?.name || "Waiter", opened_at: new Date(now).toISOString() };
  await db.write();
  res.json(db.data.tables[tidx]);
});

app.post("/api/tables/:id/close", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.tables.findIndex((t) => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  db.data.tables[idx] = { ...db.data.tables[idx], status: "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null };
  await db.write();
  res.json(db.data.tables[idx]);
});

app.put("/api/tables/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.tables.findIndex((t) => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body || {};
  const t = db.data.tables[idx];
  if (body.status != null) t.status = body.status;
  if (body.current_order_id != null) t.current_order_id = body.current_order_id;
  if (body.waiter_id != null) t.waiter_id = body.waiter_id;
  if (body.waiter_name != null) t.waiter_name = body.waiter_name;
  if (body.guest_count != null) t.guest_count = body.guest_count;
  if (body.opened_at != null) t.opened_at = body.opened_at;
  await db.write();
  res.json({ ...t, number: typeof t.number === "string" ? parseInt(t.number, 10) || 0 : (t.number ?? 0), current_order_id: t.current_order_id || null, waiter_id: t.waiter_id || null, waiter_name: t.waiter_name || null });
});

// Reserve table: guest name + time range. Reservation auto-expires 10 min after end time.
app.post("/api/tables/:id/reserve", authMiddleware, async (req, res) => {
  await ensureData();
  const { id: tableId } = req.params;
  const tbl = db.data.tables.find((t) => t.id === tableId);
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
  const list = db.data.table_reservations || [];
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
  db.data.table_reservations.push(reservation);
  await db.write();
  res.status(201).json(reservation);
});

// Cancel reservation for table (by reservation id or any active for table)
app.post("/api/tables/:id/reservation/cancel", authMiddleware, async (req, res) => {
  await ensureData();
  const { id: tableId } = req.params;
  const reservationId = req.body.reservation_id ?? req.body.reservationId ?? req.query.reservation_id;
  const list = db.data.table_reservations || [];
  const idx = reservationId
    ? list.findIndex((r) => r.id === reservationId && r.table_id === tableId)
    : list.findIndex((r) => r.table_id === tableId && r.status === "active");
  if (idx < 0) return res.status(404).json({ error: "Reservation not found" });
  db.data.table_reservations[idx] = { ...db.data.table_reservations[idx], status: "cancelled" };
  await db.write();
  res.json({ ok: true, reservation: db.data.table_reservations[idx] });
});

// Floor plan sections (A,B,C,D,E filters)
app.get("/api/floor-plan-sections", authMiddleware, async (req, res) => {
  await ensureData();
  res.json(db.data.floor_plan_sections || {});
});

app.put("/api/floor-plan-sections", authMiddleware, async (req, res) => {
  await ensureData();
  const body = req.body || {};
  if (typeof body !== "object") return res.status(400).json({ error: "Body must be object" });
  db.data.floor_plan_sections = { A: [], B: [], C: [], D: [], E: [] };
  for (const k of ["A", "B", "C", "D", "E"]) {
    const arr = Array.isArray(body[k]) ? body[k].map((n) => (typeof n === "number" && n >= 1 && n <= 43 ? n : parseInt(n, 10))).filter((n) => !isNaN(n) && n >= 1 && n <= 43) : [];
    db.data.floor_plan_sections[k] = [...new Set(arr)].sort((a, b) => a - b);
  }
  await db.write();
  res.json(db.data.floor_plan_sections);
});

// List pending discount requests (must be before /api/orders/:id so "discount-requests" is not matched as id)
app.get("/api/orders/discount-requests", authMiddleware, async (req, res) => {
  await ensureData();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_approve_discount") && req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Permission denied" });
  }
  const status = req.query.status || "pending";
  let list = (db.data.discount_requests || []).filter((r) => r.status === status);
  list = list.map((r) => {
    const order = db.data.orders.find((o) => o.id === r.order_id);
    return { ...r, order_subtotal: order?.subtotal, order_total_before_discount: order ? (order.subtotal || 0) + (order.tax_amount || 0) : 0 };
  });
  list.sort((a, b) => (a.requested_at || 0) - (b.requested_at || 0));
  res.json({ requests: list });
});

// Orders (full ticket detail: order, items, payments, voids, refunds). Items enriched with product overdue_undelivered_minutes for web floor.
app.get("/api/orders/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const order = db.data.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });
  const rawItems = (db.data.order_items || []).filter((i) => i.order_id === order.id);
  const products = db.data.products || [];
  const defaultOverdue = Math.min(1440, Math.max(1, (db.data.settings?.overdue_undelivered_minutes ?? 10) | 0));
  const items = rawItems.map((i) => {
    const product = i.product_id ? products.find((p) => p.id === i.product_id) : null;
    const overdue_undelivered_minutes = product?.overdue_undelivered_minutes != null ? product.overdue_undelivered_minutes : defaultOverdue;
    return { ...i, overdue_undelivered_minutes };
  });
  const payments = (db.data.payments || []).filter((p) => p.order_id === order.id);
  const voids = (db.data.void_logs || []).filter((v) => v.order_id === order.id);
  res.json({ ...order, items, payments, voids });
});

app.post("/api/orders", authMiddleware, async (req, res) => {
  await ensureData();
  const body = req.body;
  const waiterId = req.query.waiter_id || req.user?.id;
  const waiter = db.data.users.find((u) => u.id === waiterId);
  const tbl = db.data.tables.find((t) => t.id === body.table_id);
  if (tbl?.current_order_id) {
    const existingOrder = db.data.orders.find((o) => o.id === tbl.current_order_id);
    if (existingOrder && existingOrder.status !== "paid") {
      const items = (db.data.order_items || []).filter((i) => i.order_id === existingOrder.id);
      return res.status(409).json({
        error: "table_already_occupied",
        message: "Bu masada zaten açık sipariş var.",
        current_order_id: existingOrder.id,
        order: { ...existingOrder, items },
      });
    }
  }
  const orderId = body.id || `ord_${uuid().slice(0, 12)}`;
  db.data.orders.push({ id: orderId, table_id: body.table_id, table_number: tbl?.number?.toString() || "1", waiter_id: waiterId, waiter_name: waiter?.name || "Waiter", status: "open", subtotal: 0, tax_amount: 0, discount_percent: 0, discount_amount: 0, total: 0, created_at: Date.now(), paid_at: null, zoho_receipt_id: null });
  const tidx = db.data.tables.findIndex((t) => t.id === body.table_id);
  if (tidx >= 0) {
    db.data.tables[tidx].status = "occupied";
    db.data.tables[tidx].current_order_id = orderId;
    db.data.tables[tidx].waiter_id = waiterId;
    db.data.tables[tidx].waiter_name = waiter?.name || "Waiter";
    db.data.tables[tidx].guest_count = body.guest_count ?? 1;
    db.data.tables[tidx].opened_at = new Date().toISOString();
  }
  await db.write();
  const order = db.data.orders.find((o) => o.id === orderId);
  const items = (db.data.order_items || []).filter((i) => i.order_id === orderId);
  res.json({ ...order, items });
});

function recalcOrderTotal(orderId) {
  const items = (db.data.order_items || []).filter((i) => i.order_id === orderId);
  let subtotal = 0;
  for (const i of items) subtotal += (i.quantity || 0) * (i.price || 0);
  const taxAmount = subtotal * 0.05;
  const oidx = db.data.orders.findIndex((o) => o.id === orderId);
  if (oidx < 0) return;
  const order = db.data.orders[oidx];
  const discountPercent = Number(order.discount_percent) || 0;
  const discountAmount = Number(order.discount_amount) || 0;
  const discount = (subtotal + taxAmount) * (discountPercent / 100) + discountAmount;
  const total = Math.max(0, subtotal + taxAmount - discount);
  db.data.orders[oidx] = { ...order, subtotal, tax_amount: taxAmount, discount_percent: discountPercent, discount_amount: discountAmount, total };
}

app.post("/api/orders/:id/items", authMiddleware, async (req, res) => {
  await ensureData();
  const orderId = req.params.id;
  const body = req.body;
  const clientLineId = body.client_line_id || null;
  db.data.order_items = db.data.order_items || [];

  // Idempotency: if client_line_id provided, find existing line in same order and update instead of create
  if (clientLineId) {
    const idx = db.data.order_items.findIndex((i) => i.order_id === orderId && i.client_line_id === clientLineId);
    if (idx >= 0) {
      const existing = db.data.order_items[idx];
      const updated = {
        ...existing,
        product_id: body.product_id ?? existing.product_id,
        product_name: body.product_name ?? existing.product_name,
        quantity: body.quantity ?? existing.quantity ?? 1,
        price: body.price ?? existing.price ?? 0,
        notes: body.notes ?? existing.notes ?? "",
      };
      db.data.order_items[idx] = updated;
      recalcOrderTotal(orderId);
      await db.write();
      return res.json({ ...updated, order_id: orderId });
    }
  }

  const itemId = `item_${uuid().slice(0, 8)}`;
  const newItem = { id: itemId, order_id: orderId, product_id: body.product_id || null, product_name: body.product_name || "Item", quantity: body.quantity ?? 1, price: body.price ?? 0, notes: body.notes || "", status: "pending", sent_at: null, client_line_id: clientLineId };
  db.data.order_items.push(newItem);
  recalcOrderTotal(orderId);
  await db.write();
  const item = db.data.order_items.find((i) => i.id === itemId);
  res.json({ ...item, order_id: orderId });
});

app.put("/api/orders/:orderId/items/:itemId", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.order_items.findIndex((i) => i.id === req.params.itemId && i.order_id === req.params.orderId);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  db.data.order_items[idx] = { ...db.data.order_items[idx], product_id: body.product_id || null, product_name: body.product_name, quantity: body.quantity ?? 1, price: body.price ?? 0, notes: body.notes || "" };
  recalcOrderTotal(req.params.orderId);
  await db.write();
  res.json(db.data.order_items[idx]);
});

app.delete("/api/orders/:orderId/items/:itemId", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.order_items = db.data.order_items.filter((i) => !(i.id === req.params.itemId && i.order_id === req.params.orderId));
  recalcOrderTotal(req.params.orderId);
  await db.write();
  res.status(204).send();
});

app.post("/api/orders/:id/send", authMiddleware, async (req, res) => {
  await ensureData();
  const now = Date.now();
  db.data.order_items.forEach((i) => { if (i.order_id === req.params.id) { i.status = "sent"; i.sent_at = now; } });
  const oidx = db.data.orders.findIndex((o) => o.id === req.params.id);
  if (oidx >= 0) db.data.orders[oidx].status = "sent";
  await db.write();
  const order = db.data.orders.find((o) => o.id === req.params.id);
  const items = (db.data.order_items || []).filter((i) => i.order_id === req.params.id);
  res.json({ ...order, items });
});

// Discount request (app): waiter requests discount; web approves
app.post("/api/orders/:id/discount-request", authMiddleware, async (req, res) => {
  await ensureData();
  const orderId = req.params.id;
  const order = db.data.orders.find((o) => o.id === orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const body = req.body || {};
  const existing = (db.data.discount_requests || []).find((r) => r.order_id === orderId && r.status === "pending");
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
  db.data.discount_requests = db.data.discount_requests || [];
  db.data.discount_requests.push(request);
  await db.write();
  res.status(201).json(request);
});

app.get("/api/orders/:id/discount-request", authMiddleware, async (req, res) => {
  await ensureData();
  const orderId = req.params.id;
  const pending = (db.data.discount_requests || []).find((r) => r.order_id === orderId && r.status === "pending");
  res.json({ request: pending || null });
});

app.post("/api/orders/:orderId/discount-request/:requestId/approve", authMiddleware, async (req, res) => {
  await ensureData();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_approve_discount") && req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Permission denied" });
  }
  const { orderId, requestId } = req.params;
  const body = req.body || {};
  const reqIdx = (db.data.discount_requests || []).findIndex((r) => r.id === requestId && r.order_id === orderId && r.status === "pending");
  if (reqIdx < 0) return res.status(404).json({ error: "Request not found or already processed" });
  const oidx = db.data.orders.findIndex((o) => o.id === orderId);
  if (oidx < 0) return res.status(404).json({ error: "Order not found" });
  const discountPercent = body.discount_percent != null ? Number(body.discount_percent) : 0;
  const discountAmount = body.discount_amount != null ? Number(body.discount_amount) : 0;
  db.data.orders[oidx] = { ...db.data.orders[oidx], discount_percent: discountPercent, discount_amount: discountAmount };
  recalcOrderTotal(orderId);
  db.data.discount_requests[reqIdx] = {
    ...db.data.discount_requests[reqIdx],
    status: "approved",
    approved_by_user_id: req.user?.id || "",
    approved_by_user_name: req.user?.name || "",
    approved_at: Date.now(),
    discount_percent: discountPercent,
    discount_amount: discountAmount,
    approved_note: body.note || "",
  };
  await db.write();
  const order = db.data.orders.find((o) => o.id === orderId);
  const items = (db.data.order_items || []).filter((i) => i.order_id === orderId);
  res.json({ request: db.data.discount_requests[reqIdx], order: { ...order, items } });
});

// İndirim talebini iptal et (web). Aynı yetki: web_approve_discount.
app.post("/api/orders/:orderId/discount-request/:requestId/cancel", authMiddleware, async (req, res) => {
  await ensureData();
  const perms = JSON.parse(req.user?.permissions || "[]");
  if (!perms.includes("web_approve_discount") && req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ error: "Permission denied" });
  }
  const { orderId, requestId } = req.params;
  const reqIdx = (db.data.discount_requests || []).findIndex((r) => r.id === requestId && r.order_id === orderId && r.status === "pending");
  if (reqIdx < 0) return res.status(404).json({ error: "Request not found or already processed" });
  db.data.discount_requests[reqIdx] = {
    ...db.data.discount_requests[reqIdx],
    status: "cancelled",
    approved_by_user_id: req.user?.id || "",
    approved_by_user_name: req.user?.name || "",
    approved_at: Date.now(),
    approved_note: (req.body && req.body.note) ? String(req.body.note) : "",
  };
  await db.write();
  res.json({ request: db.data.discount_requests[reqIdx] });
});

app.get("/api/dashboard/discounts-today", authMiddleware, async (req, res) => {
  await ensureData();
  const date = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);
  const dayStart = new Date(date + "T00:00:00.000Z").getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const list = (db.data.discount_requests || [])
    .filter((r) => r.status === "approved" && r.approved_at >= dayStart && r.approved_at < dayEnd)
    .map((r) => {
      const order = db.data.orders.find((o) => o.id === r.order_id);
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
  await ensureData();
  const { orderId, itemId } = req.params;
  const status = (req.body && req.body.status) || req.query.status;
  if (!status || !["preparing", "ready", "delivered"].includes(status)) {
    return res.status(400).json({ error: "status must be 'preparing', 'ready' or 'delivered'" });
  }
  const idx = (db.data.order_items || []).findIndex((i) => i.id === itemId && i.order_id === orderId);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  db.data.order_items[idx].status = status;
  if (status === "delivered") {
    db.data.order_items[idx].delivered_at = Date.now();
  }
  await db.write();
  res.json(db.data.order_items[idx]);
});

// Payments
app.post("/api/payments", authMiddleware, async (req, res) => {
  await ensureData();
  const userId = req.query.user_id || req.user?.id;
  const { order_id, payments } = req.body;
  const now = Date.now();
  db.data.payments = db.data.payments || [];
  for (const p of payments) {
    db.data.payments.push({ id: `pay_${uuid().slice(0, 8)}`, order_id, amount: p.amount, method: p.method || "cash", received_amount: p.received_amount ?? p.amount, change_amount: p.change_amount ?? 0, user_id: userId, created_at: now });
  }
  const totalPaid = (db.data.payments || []).filter((p) => p.order_id === order_id).reduce((s, p) => s + p.amount, 0);
  const order = db.data.orders.find((o) => o.id === order_id);
  const items = (db.data.order_items || []).filter((i) => i.order_id === order_id);
  if (order && Math.abs(totalPaid - (order.total || 0)) < 0.01 && items.length > 0 && !order.zoho_receipt_id) {
    const orderPayments = (db.data.payments || []).filter((p) => p.order_id === order_id);
    const products = db.data.products || [];
    await pushToZohoBooks(db, order, items, orderPayments.map((p) => ({ amount: p.amount, method: p.method })), products);
  }
  if (order && Math.abs(totalPaid - (order.total || 0)) < 0.01) {
    const oidx = db.data.orders.findIndex((o) => o.id === order_id);
    if (oidx >= 0) { db.data.orders[oidx].status = "paid"; db.data.orders[oidx].paid_at = now; }
    db.data.tables.forEach((t) => { if (t.current_order_id === order_id) { t.status = "free"; t.current_order_id = null; t.guest_count = 0; t.waiter_id = null; t.waiter_name = null; t.opened_at = null; } });
  }
  await db.write();
  res.json({ success: true });
});

// Voids
app.post("/api/voids", authMiddleware, async (req, res) => {
  await ensureData();
  const body = req.body;
  db.data.void_logs = db.data.void_logs || [];
  db.data.void_logs.push({ id: `void_${uuid().slice(0, 8)}`, type: body.type || "post_void", order_id: body.order_id, order_item_id: body.order_item_id, product_name: body.product_name, quantity: body.quantity ?? 1, price: body.price ?? 0, amount: body.amount ?? 0, source_table_id: body.source_table_id, source_table_number: body.source_table_number, target_table_id: body.target_table_id, target_table_number: body.target_table_number, user_id: body.user_id, user_name: body.user_name, details: body.details || "", created_at: Date.now() });
  await db.write();
  res.json({ id: db.data.void_logs[db.data.void_logs.length - 1].id });
});

// Void requests
app.get("/api/void-requests", authMiddleware, async (req, res) => {
  await ensureData();
  const status = req.query.status || "pending";
  res.json((db.data.void_requests || []).filter((v) => v.status === status));
});

app.post("/api/void-requests", authMiddleware, async (req, res) => {
  await ensureData();
  const body = req.body;
  const id = body.id || `vr_${uuid().slice(0, 8)}`;
  db.data.void_requests = db.data.void_requests || [];
  db.data.void_requests.push({ id, order_id: body.order_id, order_item_id: body.order_item_id, product_name: body.product_name, quantity: body.quantity ?? 1, price: body.price ?? 0, table_number: body.table_number, requested_by_user_id: body.requested_by_user_id, requested_by_user_name: body.requested_by_user_name, requested_at: Date.now(), status: "pending", approved_by_supervisor_user_id: null, approved_by_supervisor_user_name: null, approved_by_supervisor_at: null, approved_by_kds_user_id: null, approved_by_kds_user_name: null, approved_by_kds_at: null });
  await db.write();
  res.json(db.data.void_requests.find((v) => v.id === id));
});

app.patch("/api/void-requests/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.void_requests.findIndex((v) => v.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  db.data.void_requests[idx] = { ...db.data.void_requests[idx], status: body.status || "approved", approved_by_supervisor_user_id: body.approved_by_supervisor_user_id, approved_by_supervisor_user_name: body.approved_by_supervisor_user_name, approved_by_supervisor_at: body.approved_by_supervisor_at, approved_by_kds_user_id: body.approved_by_kds_user_id, approved_by_kds_user_name: body.approved_by_kds_user_name, approved_by_kds_at: body.approved_by_kds_at };
  await db.write();
  res.json(db.data.void_requests[idx]);
});

// Closed bill access requests (user requests access; approver approves from app or web)
app.get("/api/closed-bill-access-requests", authMiddleware, async (req, res) => {
  await ensureData();
  const status = (req.query.status || "pending").toString();
  db.data.closed_bill_access_requests = db.data.closed_bill_access_requests || [];
  const list = db.data.closed_bill_access_requests;
  if (status === "all" || status === "") {
    res.json(list.slice(-100));
  } else {
    res.json(list.filter((r) => r.status === status));
  }
});

app.post("/api/closed-bill-access-requests", authMiddleware, async (req, res) => {
  await ensureData();
  const body = req.body;
  const id = body.id || `cbar_${uuid().slice(0, 8)}`;
  db.data.closed_bill_access_requests = db.data.closed_bill_access_requests || [];
  db.data.closed_bill_access_requests.push({
    id,
    requested_by_user_id: body.requested_by_user_id,
    requested_by_user_name: body.requested_by_user_name || "—",
    requested_at: Date.now(),
    status: "pending",
    approved_by_user_id: null,
    approved_by_user_name: null,
    approved_at: null,
    expires_at: body.expires_at || null,
  });
  await db.write();
  res.json(db.data.closed_bill_access_requests.find((r) => r.id === id));
});

app.patch("/api/closed-bill-access-requests/:id", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.closed_bill_access_requests = db.data.closed_bill_access_requests || [];
  const idx = db.data.closed_bill_access_requests.findIndex((r) => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  const r = db.data.closed_bill_access_requests[idx];
  db.data.closed_bill_access_requests[idx] = {
    ...r,
    status: body.status || "approved",
    approved_by_user_id: body.approved_by_user_id ?? r.approved_by_user_id,
    approved_by_user_name: body.approved_by_user_name ?? r.approved_by_user_name,
    approved_at: body.approved_at ?? (body.status === "approved" || body.status === "rejected" ? Date.now() : r.approved_at),
    expires_at: body.expires_at !== undefined ? body.expires_at : r.expires_at,
  };
  await db.write();
  res.json(db.data.closed_bill_access_requests[idx]);
});

// Closed bill changes: ?date= or ?dateFrom=&dateTo= (same as daily-sales).
app.get("/api/dashboard/closed-bill-changes", authMiddleware, async (req, res) => {
  await ensureData();
  const dateStr = (req.query.date || "").toString().trim();
  const dateFromStr = (req.query.dateFrom || "").toString().trim();
  const dateToStr = (req.query.dateTo || "").toString().trim();
  const todayTs = getTodayStartTimestamp();
  const dayMs = 24 * 60 * 60 * 1000;
  let startTs = todayTs;
  let endTs = todayTs + dayMs;
  if (dateFromStr && dateToStr) {
    const fromBounds = getDayBounds(dateFromStr);
    const toBounds = getDayBounds(dateToStr);
    if (!fromBounds || !toBounds) return res.status(400).json({ error: "invalid_date" });
    startTs = fromBounds.startTs;
    endTs = toBounds.endTs;
    if (startTs > endTs) return res.status(400).json({ error: "invalid_range" });
  } else if (dateStr) {
    const bounds = getDayBounds(dateStr);
    if (!bounds) return res.status(400).json({ error: "invalid_date" });
    startTs = bounds.startTs;
    endTs = bounds.endTs;
  }
  const voidLogs = db.data.void_logs || [];
  const orders = db.data.orders || [];
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
  await ensureData();
  const dateStr = (req.query.date || "").toString().trim();
  const dateFromStr = (req.query.dateFrom || "").toString().trim();
  const dateToStr = (req.query.dateTo || "").toString().trim();
  const todayTs = getTodayStartTimestamp();
  const dayMs = 24 * 60 * 60 * 1000;
  let startTs = todayTs;
  let endTs = todayTs + dayMs;
  if (dateFromStr && dateToStr) {
    const fromBounds = getDayBounds(dateFromStr);
    const toBounds = getDayBounds(dateToStr);
    if (!fromBounds || !toBounds) return res.status(400).json({ error: "invalid_date" });
    startTs = fromBounds.startTs;
    endTs = toBounds.endTs;
  } else if (dateStr) {
    const bounds = getDayBounds(dateStr);
    if (!bounds) return res.status(400).json({ error: "invalid_date" });
    startTs = bounds.startTs;
    endTs = bounds.endTs;
  }
  const list = (db.data.cash_drawer_opens || []).filter((e) => e.opened_at >= startTs && e.opened_at < endTs);
  list.sort((a, b) => (b.opened_at || 0) - (a.opened_at || 0));
  res.json({ count: list.length, opens: list });
});

// Clear sales (test data) by date range: deletes orders with created_at in [dateFrom start, dateTo end], related data, and all void_logs in that date range.
app.post("/api/settings/clear-sales-by-date-range", authMiddleware, async (req, res) => {
  await ensureData();
  const dateFromStr = (req.body?.dateFrom || req.query?.dateFrom || "").toString().trim();
  const dateToStr = (req.body?.dateTo || req.query?.dateTo || "").toString().trim();
  if (!dateFromStr || !dateToStr) {
    return res.status(400).json({ error: "dateFrom and dateTo required (YYYY-MM-DD)" });
  }
  const fromBounds = getDayBounds(dateFromStr);
  const toBounds = getDayBounds(dateToStr);
  if (!fromBounds || !toBounds) {
    return res.status(400).json({ error: "Invalid date format (use YYYY-MM-DD)" });
  }
  const startTs = fromBounds.startTs;
  const endTs = toBounds.endTs;
  if (startTs > endTs) {
    return res.status(400).json({ error: "dateFrom must be before or equal to dateTo" });
  }
  const orders = db.data.orders || [];
  const orderIdsInRange = new Set(orders.filter((o) => {
    const created = o.created_at ?? o.updated_at ?? 0;
    return created >= startTs && created <= endTs;
  }).map((o) => o.id));

  // Remove order_items, payments for orders in range; remove orders in range
  db.data.order_items = (db.data.order_items || []).filter((i) => !orderIdsInRange.has(i.order_id));
  db.data.payments = (db.data.payments || []).filter((p) => !orderIdsInRange.has(p.order_id));
  db.data.orders = (db.data.orders || []).filter((o) => !orderIdsInRange.has(o.id));

  // Remove void_logs: either belonging to deleted orders OR created_at in the date range (so Total Void drops for that period)
  const voidLogsBefore = (db.data.void_logs || []).length;
  db.data.void_logs = (db.data.void_logs || []).filter((v) => {
    if (orderIdsInRange.has(v.order_id)) return false;
    const created = v.created_at ?? 0;
    if (created >= startTs && created <= endTs) return false;
    return true;
  });
  const deletedVoids = voidLogsBefore - (db.data.void_logs || []).length;

  // Remove discount_requests: for deleted orders OR requested_at in date range
  const discountBefore = (db.data.discount_requests || []).length;
  db.data.discount_requests = (db.data.discount_requests || []).filter((r) => {
    if (orderIdsInRange.has(r.order_id)) return false;
    const ts = r.requested_at ?? r.approved_at ?? 0;
    if (ts >= startTs && ts <= endTs) return false;
    return true;
  });
  const deletedDiscounts = discountBefore - (db.data.discount_requests || []).length;

  // Remove cash_drawer_opens in date range
  const cashDrawerBefore = (db.data.cash_drawer_opens || []).length;
  db.data.cash_drawer_opens = (db.data.cash_drawer_opens || []).filter((e) => {
    const ts = e.opened_at ?? 0;
    return ts < startTs || ts > endTs;
  });
  const deletedCashDrawer = cashDrawerBefore - (db.data.cash_drawer_opens || []).length;

  const tables = db.data.tables || [];
  for (let i = 0; i < tables.length; i++) {
    if (tables[i].current_order_id && orderIdsInRange.has(tables[i].current_order_id)) {
      db.data.tables[i] = {
        ...db.data.tables[i],
        status: "free",
        current_order_id: null,
        guest_count: 0,
        waiter_id: null,
        waiter_name: null,
        opened_at: null,
      };
    }
  }
  await db.write();
  const msg = [
    orderIdsInRange.size > 0 && `Deleted ${orderIdsInRange.size} order(s) and related data`,
    deletedVoids > 0 && `Deleted ${deletedVoids} void log(s) in date range`,
    deletedDiscounts > 0 && `Deleted ${deletedDiscounts} discount request(s)`,
    deletedCashDrawer > 0 && `Deleted ${deletedCashDrawer} cash drawer open(s)`,
  ].filter(Boolean).join(". ") || "No orders, voids, discounts or cash drawer entries in date range";
  res.json({ deletedOrders: orderIdsInRange.size, deletedVoids, deletedDiscounts, deletedCashDrawer, message: msg });
});

// Zoho config
app.post("/api/zoho/exchange-code", authMiddleware, async (req, res) => {
  try {
    const { exchangeCodeForRefreshToken } = await import("./zoho.js");
    const { code, client_id, client_secret, redirect_uri, dc } = req.body || {};
    if (!code || !client_id || !client_secret) {
      return res.status(400).json({ error: "code, client_id, client_secret gerekli" });
    }
    // dc: "eu" or "com" - Self Client region (api-console.zoho.eu vs .com)
    let rt;
    try {
      const r = await exchangeCodeForRefreshToken(code, client_id, client_secret, redirect_uri, dc || process.env.ZOHO_DC);
      rt = r.refresh_token;
    } catch (e1) {
      // Try opposite DC if user client may be in other region
      const alt = dc === "eu" || process.env.ZOHO_DC === "eu" ? "com" : "eu";
      try {
        const r = await exchangeCodeForRefreshToken(code, client_id, client_secret, redirect_uri, alt);
        rt = r.refresh_token;
      } catch (e2) {
        throw e1;
      }
    }
    await db.read();
    db.data.zoho_config = db.data.zoho_config || {};
    db.data.zoho_config.refresh_token = rt;
    db.data.zoho_config.client_id = client_id;
    db.data.zoho_config.client_secret = client_secret;
    await db.write();
    res.json({ refresh_token: rt, success: true });
  } catch (e) {
    const msg = e.response?.data?.error_description || e.response?.data?.error || (e && e.message) || "Token alınamadı";
    res.status(400).json({ error: String(msg) });
  }
});

app.get("/api/zoho-config", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.zoho_config = db.data.zoho_config || {};
  res.json(db.data.zoho_config);
});

app.put("/api/zoho-config", authMiddleware, async (req, res) => {
  await ensureData();
  db.data.zoho_config = db.data.zoho_config || {};
  for (const [k, v] of Object.entries(req.body)) db.data.zoho_config[k] = String(v);
  await db.write();
  res.json(db.data.zoho_config);
});

app.get("/api/zoho/items", authMiddleware, async (req, res) => {
  try {
    const result = await getZohoItems(db);
    if (!result) return res.status(400).json({ error: "Zoho Books bağlantısı yok veya yapılandırılmamış" });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e && e.message) || "Zoho ürün listesi alınamadı" });
  }
});

app.get("/api/zoho/item-groups", authMiddleware, async (req, res) => {
  const result = await getZohoItemGroups(db);
  res.json(result);
});

// Zoho sync: sadece upsert (clearZohoProductsFirst kullanılmaz – ürün kaybı önlenir).
app.post("/api/zoho/sync", authMiddleware, async (req, res) => {
  try {
    const result = await syncFromZoho(db, {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Sync failed", categoriesAdded: 0, productsAdded: 0, productsUpdated: 0, productsRemoved: 0, itemsFetched: 0 });
  }
});

// Zoho tanı: token ve ürün sayısı (sync yapmadan) – env veya db'den okur
app.get("/api/zoho/check", authMiddleware, async (req, res) => {
  try {
    const { getZohoConfig, getZohoAccessToken, getZohoItems, getZohoItemGroups } = await import("./zoho.js");
    await db.read();
    const cfg = getZohoConfig(db);
    const hasConfig = !!(cfg.organization_id && cfg.enabled === "true" && cfg.refresh_token && cfg.client_id && cfg.client_secret);
    if (!hasConfig) {
      return res.json({ ok: false, error: "Zoho ayarları eksik", hasToken: false, itemsCount: 0, groupsCount: 0 });
    }
    const token = await getZohoAccessToken(db);
    if (!token) {
      return res.json({ ok: false, error: "Token alınamadı (Refresh Token / Client ID-Secret kontrol edin)", hasToken: false, itemsCount: 0, groupsCount: 0 });
    }
    const itemsRes = await getZohoItems(db);
    const groupsRes = await getZohoItemGroups(db);
    const itemsCount = itemsRes?.items?.length ?? 0;
    const groupsCount = (groupsRes?.item_groups?.length ?? 0);
    return res.json({ ok: true, hasToken: true, itemsCount, groupsCount, error: itemsRes ? null : "Ürün listesi alınamadı" });
  } catch (e) {
    res.json({ ok: false, error: (e && e.message) || "Check failed", hasToken: false, itemsCount: 0, groupsCount: 0 });
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

const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR;

let lastAutoCloseRunTs = 0;

async function runAutoCloseIfDue() {
  try {
    await db.read();
  } catch {
    return;
  }
  const s = db.data?.settings || {};
  if (!s.auto_close_open_tables) return;
  const opening = s.opening_time ?? "07:00";
  const closing = s.closing_time ?? "01:30";
  const grace = Math.min(60, Math.max(0, (s.grace_minutes ?? 0) | 0));
  const off = (s.timezone_offset_minutes ?? 0) | 0;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const localNow = now + off * 60 * 1000;
  const minutesSinceMidnight = ((localNow % dayMs) + dayMs) % dayMs / (60 * 1000);
  const closeMin = parseTimeToMinutes(closing);
  if (isNaN(closeMin)) return;
  const openMin = parseTimeToMinutes(opening);
  const threshold = closeMin + grace;
  const wrap = closeMin <= openMin;
  const pastClosing = wrap
    ? minutesSinceMidnight >= threshold && minutesSinceMidnight < openMin
    : minutesSinceMidnight >= threshold;
  if (!pastClosing) return;
  if (now - lastAutoCloseRunTs < 30 * 60 * 1000) return;
  const key = getBusinessDayKey(now, opening, closing, off);
  if (s.last_auto_close_for_business_day === key) return;

  const tables = db.data.tables || [];
  const orders = db.data.orders || [];
  const openTables = tables.filter((t) => t.current_order_id);
  const tablesClosed = [];
  const pmCode = (s.auto_close_payment_method || "cash").toLowerCase();
  for (const t of openTables) {
    const order = orders.find((o) => o.id === t.current_order_id);
    if (!order || order.status === "paid") continue;
    const amount = order.total ?? 0;
    db.data.payments = db.data.payments || [];
    db.data.payments.push({
      id: `pay_${uuid().slice(0, 8)}`,
      order_id: order.id,
      amount,
      method: pmCode === "cash" ? "cash" : pmCode,
      received_amount: amount,
      change_amount: 0,
      user_id: "system",
      created_at: now,
    });
    const oidx = orders.findIndex((o) => o.id === order.id);
    if (oidx >= 0) {
      db.data.orders[oidx].status = "paid";
      db.data.orders[oidx].paid_at = now;
    }
    db.data.tables.forEach((tbl) => {
      if (tbl.current_order_id === order.id) {
        tbl.status = "free";
        tbl.current_order_id = null;
        tbl.guest_count = 0;
        tbl.waiter_id = null;
        tbl.waiter_name = null;
        tbl.opened_at = null;
      }
    });
    tablesClosed.push({ table_id: t.id, table_number: t.number ?? t.id, order_id: order.id, amount });
  }
  if (tablesClosed.length > 0) {
    db.data.settings.last_auto_close_for_business_day = key;
    db.data.eod_logs = db.data.eod_logs || [];
    db.data.eod_logs.push({
      id: `eod_auto_${uuid().slice(0, 8)}`,
      ran_at: now,
      user_id: "system",
      user_name: "Auto-close",
      tables_closed: tablesClosed,
      orders_closed_count: tablesClosed.length,
    });
    db.data.business_operation_log = db.data.business_operation_log || [];
    db.data.business_operation_log.push({
      ts: now,
      action: "open_tables_auto_closed",
      business_day_key: key,
      tables_closed: tablesClosed,
    });
    if (db.data.business_operation_log.length > 2000) db.data.business_operation_log = db.data.business_operation_log.slice(-2000);
    await db.write();
    lastAutoCloseRunTs = now;
  }
}

async function startServer() {
  try {
    await ensureData();
    console.log("[startup] ensureData OK");
  } catch (e) {
    console.error("[startup] ensureData failed (server will still start):", e?.message || e);
  }
  setInterval(() => runAutoCloseIfDue().catch((e) => console.error("[auto-close]", e?.message)), 60 * 1000);
  const server = app.listen(PORT, HOST, () => {
    console.log(`LimonPOS Backend running on http://${HOST}:${PORT}`);
    if (DATA_DIR) {
      console.log(`DATA_DIR=${DATA_DIR} – veriler kalıcı (restart'ta silinmez).`);
    } else {
      console.warn("UYARI: DATA_DIR tanımlı değil. Veriler geçici diskte; her restart/redeploy'da SİLİNİR. Railway'de Volume ekleyip DATA_DIR=/data yapın.");
    }
    if (HOST === "0.0.0.0") {
      console.log("Listening on all interfaces – Railway/dış erişim için hazır.");
    }
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
  process.exit(1);
});
