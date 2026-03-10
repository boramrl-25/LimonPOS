import "dotenv/config";
console.log("[startup] Node", process.version, "PORT=" + (process.env.PORT || "3002"), "DATA_DIR=" + (process.env.DATA_DIR || "(not set)"));
import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import * as store from "./lib/store.js";
import { pushToZohoBooks, getZohoItems, getZohoItemGroups, getZohoContacts, syncFromZoho } from "./zoho.js";
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

// Railway / production: yakalanmamış hatalar loglansın
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
// Railway sets PORT; must be number. Listen on 0.0.0.0 so external requests reach the app.
const PORT = Number(process.env.PORT) || 3002;

// CORS: allow all origins so pos.the-limon.com and Vercel can reach this API
app.use(cors({ origin: true, credentials: true }));
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

// Railway / load balancer health check (no auth)
app.get("/", (req, res) => {
  res.status(200).send("OK");
});
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "LimonPOS API", ts: Date.now() });
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
  const pin = String((req.body || {}).pin || "").trim();
  const user = await store.getUserByIdOrPin(pin);
  if (!user || !user.active) return res.status(401).json({ error: "Invalid PIN" });
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
    id: deviceId,
    name: body.device_name || body.deviceName || "Android POS",
    app_version: body.app_version || body.appVersion || null,
    last_seen: now,
    user_id: req.user?.id || null,
  };
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
  res.json(users.map((r) => ({
    ...r,
    active: !!(r.active !== 0 && r.active !== false),
    permissions: JSON.parse(r.permissions || "[]"),
    cash_drawer_permission: !!r.cash_drawer_permission,
  })));
});

app.post("/api/users", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const id = req.body.id || uuid().slice(0, 8);
  const body = req.body;
  const user = await store.createUser({
    id, name: body.name || "User", pin: body.pin || "0000", role: body.role || "waiter",
    active: body.active !== false ? 1 : 0, permissions: JSON.stringify(body.permissions || []), cash_drawer_permission: body.cash_drawer_permission ? 1 : 0,
  });
  res.json({ ...user, permissions: JSON.parse(user.permissions || "[]"), cash_drawer_permission: !!user.cash_drawer_permission });
});

app.put("/api/users/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const body = req.body;
  try {
    const user = await store.updateUser(id, {
      name: body.name, pin: body.pin, role: body.role || "waiter",
      active: body.active !== false ? 1 : 0, permissions: JSON.stringify(body.permissions || []), cash_drawer_permission: body.cash_drawer_permission ? 1 : 0,
    });
    res.json({ ...user, permissions: JSON.parse(user.permissions || "[]"), cash_drawer_permission: !!user.cash_drawer_permission });
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
  if (typeof str !== "string" || !/^\d{1,2}:\d{2}$/.test(str.trim())) return null;
  const [h, m] = str.trim().split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  const ot = validateTimeHHMM(req.body.opening_time);
  if (ot) updates.opening_time = ot;
  const ct = validateTimeHHMM(req.body.closing_time);
  if (ct) updates.closing_time = ct;
  const wt = validateTimeHHMM(req.body.open_tables_warning_time);
  if (wt) updates.open_tables_warning_time = wt;
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
app.get("/api/dashboard/stats", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const summary = await store.getTodaySalesSummary();
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
    const fromBounds = await store.getDayBounds(dateFromStr);
    const toBounds = await store.getDayBounds(dateToStr);
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

// Reconciliation: Cash & Card from UTAP/Bank emails (auto-forward)
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
    id, number: num, name: body.name || `Table ${num}`, capacity: body.capacity ?? 4, floor: body.floor || "main",
    status: body.status || "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null,
    x: body.x ?? 0, y: body.y ?? 0, width: body.width ?? 120, height: body.height ?? 100, shape: body.shape || "square",
  });
  res.json(t);
});

app.post("/api/tables/:id/open", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { id } = req.params;
  const guestCount = parseInt(req.query.guest_count) || 1;
  const waiterId = req.query.waiter_id || req.user?.id;
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
  const updates = {};
  if (body.status != null) updates.status = body.status;
  if (body.current_order_id != null) updates.current_order_id = body.current_order_id;
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
    const arr = Array.isArray(body[k]) ? body[k].map((n) => (typeof n === "number" && n >= 1 && n <= 43 ? n : parseInt(n, 10))).filter((n) => !isNaN(n) && n >= 1 && n <= 43) : [];
    sections[k] = [...new Set(arr)].sort((a, b) => a - b);
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

// Orders (full ticket detail: order, items, payments, voids, refunds). Items enriched with product overdue_undelivered_minutes for web floor.
app.get("/api/orders/:id", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const orders = await store.getOrders();
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });
  const rawItems = await store.getOrderItems(order.id);
  const products = await store.getAllProducts();
  const s = await store.getSettings();
  const defaultOverdue = Math.min(1440, Math.max(1, (s?.overdue_undelivered_minutes ?? 10) | 0));
  const items = rawItems.map((i) => {
    const product = i.product_id ? products.find((p) => p.id === i.product_id) : null;
    const overdue_undelivered_minutes = product?.overdue_undelivered_minutes != null ? product.overdue_undelivered_minutes : defaultOverdue;
    return { ...i, overdue_undelivered_minutes };
  });
  const allPayments = await store.getPayments();
  const payments = allPayments.filter((p) => p.order_id === order.id);
  const allVoids = await store.getVoidLogs();
  const voids = allVoids.filter((v) => v.order_id === order.id);
  res.json({ ...order, items, payments, voids });
});

app.post("/api/orders", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const body = req.body;
  const waiterId = req.query.waiter_id || req.user?.id;
  const users = await store.getAllUsers();
  const waiter = users.find((u) => u.id === waiterId);
  const tables = await store.getTables();
  const tbl = tables.find((t) => t.id === body.table_id);
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
  const orderId = body.id || `ord_${uuid().slice(0, 12)}`;
  const order = await store.createOrder({
    id: orderId, table_id: body.table_id, table_number: tbl?.number?.toString() || "1", waiter_id: waiterId, waiter_name: waiter?.name || "Waiter",
    status: "open", subtotal: 0, tax_amount: 0, discount_percent: 0, discount_amount: 0, total: 0,
    created_at: new Date(), paid_at: null, zoho_receipt_id: null,
  });
  if (tbl) {
    await store.updateTable(body.table_id, {
      status: "occupied", current_order_id: orderId, waiter_id: waiterId, waiter_name: waiter?.name || "Waiter",
      guest_count: body.guest_count ?? 1, opened_at: new Date(),
    });
  }
  const items = await store.getOrderItems(orderId);
  res.json({ ...order, items });
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
  await ensurePrismaReady();
  const orderId = req.params.id;
  const body = req.body;
  const clientLineId = body.client_line_id || null;
  const orderItems = await store.getOrderItems(orderId);

  // Idempotency: if client_line_id provided, find existing line in same order and update instead of create
  if (clientLineId) {
    const existing = orderItems.find((i) => i.client_line_id === clientLineId);
    if (existing) {
      const updated = await store.updateOrderItem(existing.id, {
        product_id: body.product_id ?? existing.product_id,
        product_name: body.product_name ?? existing.product_name,
        quantity: body.quantity ?? existing.quantity ?? 1,
        price: body.price ?? existing.price ?? 0,
        notes: body.notes ?? existing.notes ?? "",
      });
      await recalcOrderTotal(orderId);
      return res.json({ ...updated, order_id: orderId });
    }
  }

  const itemId = `item_${uuid().slice(0, 8)}`;
  const newItem = await store.createOrderItem({
    id: itemId, order_id: orderId, product_id: body.product_id || null, product_name: body.product_name || "Item",
    quantity: body.quantity ?? 1, price: body.price ?? 0, notes: body.notes || "", status: "pending", sent_at: null, client_line_id: clientLineId,
  });
  await recalcOrderTotal(orderId);
  res.json({ ...newItem, order_id: orderId });
});

app.put("/api/orders/:orderId/items/:itemId", authMiddleware, async (req, res) => {
  await ensurePrismaReady();
  const { orderId, itemId } = req.params;
  const body = req.body;
  const items = await store.getOrderItems(orderId);
  const item = items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: "Not found" });
  const updated = await store.updateOrderItem(itemId, {
    product_id: body.product_id || null, product_name: body.product_name, quantity: body.quantity ?? 1, price: body.price ?? 0, notes: body.notes || "",
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
  const now = Date.now();
  const items = await store.getOrderItems(req.params.id);
  for (const i of items) {
    await store.updateOrderItem(i.id, { status: "sent", sent_at: new Date(now) });
  }
  await store.updateOrder(req.params.id, { status: "sent" });
  const order = await store.getOrderById(req.params.id);
  const itemsList = await store.getOrderItems(req.params.id);
  res.json({ ...order, items: itemsList });
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
  await ensurePrismaReady();
  const userId = req.query.user_id || req.user?.id;
  const { order_id, payments } = req.body;
  console.log("[Zoho] POST /api/payments received:", order_id, "payments:", payments?.length, "total:", payments?.reduce((s, p) => s + (p.amount || 0), 0));
  const now = Date.now();
  for (const p of payments) {
    await store.createPayment({
      id: `pay_${uuid().slice(0, 8)}`, order_id, amount: p.amount, method: p.method || "cash",
      received_amount: p.received_amount ?? p.amount, change_amount: p.change_amount ?? 0, user_id: userId, created_at: new Date(now),
    });
  }
  const allPayments = await store.getPayments();
  const totalPaid = allPayments.filter((p) => p.order_id === order_id).reduce((s, p) => s + p.amount, 0);
  const order = await store.getOrderById(order_id);
  const items = await store.getOrderItems(order_id);
  const totalMatch = Math.abs(totalPaid - (order?.total || 0)) < 0.01;
  const hasItems = items.length > 0;
  const notSentYet = !order?.zoho_receipt_id;
  const willPushZoho = order && totalMatch && hasItems && notSentYet;

  console.log("[Zoho] POST /api/payments check:", {
    order_id,
    order_found: !!order,
    items_count: items.length,
    totalPaid,
    order_total: order?.total,
    totalMatch,
    notSentYet,
    willPushZoho,
  });

  if (!order) console.log("[Zoho] Skip: order", order_id, "NOT FOUND - App must sync order first (ensureOrderExistsOnApi). Check: Server URL = api.the-limon.com ?");
  else if (!totalMatch) console.log("[Zoho] Skip: totalPaid", totalPaid, "!= order.total", order.total, "- wait for all split payments?");
  else if (!hasItems) console.log("[Zoho] Skip: 0 items for order", order_id, "- App must sync items before payment (includeAllItems=true in ensureOrderExistsOnApi)");
  else if (!notSentYet) console.log("[Zoho] Skip: already sent (zoho_receipt_id:", order.zoho_receipt_id, ")");

  if (order && willPushZoho) {
    console.log("[Zoho] Pushing order", order_id, "to Zoho Books...");
    const orderPayments = (await store.getPayments()).filter((p) => p.order_id === order_id);
    const products = await store.getAllProducts();
    const ok = await pushToZohoBooks(order, items, orderPayments.map((p) => ({ amount: p.amount, method: p.method })), products);
    console.log("[Zoho] Result:", ok ? "OK" : "FAILED");
  }
  if (order && Math.abs(totalPaid - (order.total || 0)) < 0.01) {
    await store.updateOrder(order_id, { status: "paid", paid_at: new Date(now) });
    const tablesForPay = await store.getTables();
    for (const t of tablesForPay) {
      if (t.current_order_id === order_id) {
        await store.updateTable(t.id, { status: "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null });
      }
    }
  }
  res.json({ success: true });
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
  const status = req.query.status || "pending";
  const voidReqs = await store.getVoidRequests();
  res.json(voidReqs.filter((v) => v.status === status));
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
  const updated = await store.updateVoidRequest(req.params.id, { ...vr, status: body.status || "approved", approved_by_supervisor_user_id: body.approved_by_supervisor_user_id, approved_by_supervisor_user_name: body.approved_by_supervisor_user_name, approved_by_supervisor_at: body.approved_by_supervisor_at, approved_by_kds_user_id: body.approved_by_kds_user_id, approved_by_kds_user_name: body.approved_by_kds_user_name, approved_by_kds_at: body.approved_by_kds_at });
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
  const orders = await store.getOrders();
  const orderIdsArr = orders.filter((o) => {
    const created = o.created_at ? (typeof o.created_at === "number" ? o.created_at : new Date(o.created_at).getTime()) : (o.updatedAt ? new Date(o.updatedAt).getTime() : 0);
    return created >= startTs && created <= endTs;
  }).map((o) => o.id);
  const orderIdsInRange = new Set(orderIdsArr);

  await store.deleteManyOrders(orderIdsArr);
  const voidLogsBefore = (await store.getVoidLogs()).length;
  await store.deleteVoidLogsByOrderIdsOrDateRange(Array.from(orderIdsInRange), startTs, endTs);
  const deletedVoids = voidLogsBefore - (await store.getVoidLogs()).length;

  const discountReqs = await store.getDiscountRequests();
  const toDeleteDiscount = discountReqs.filter((r) => {
    if (orderIdsInRange.has(r.order_id)) return true;
    const t = r.requested_at ?? r.approved_at ?? 0;
    return t >= startTs && t <= endTs;
  });
  for (const r of toDeleteDiscount) await store.deleteDiscountRequest(r.id);
  const deletedDiscounts = toDeleteDiscount.length;

  const cashOpens = await store.getCashDrawerOpens();
  const filteredCash = cashOpens.filter((e) => {
    const t = e.opened_at ?? 0;
    return t < startTs || t > endTs;
  });
  await store.updateSettings({ cash_drawer_opens: filteredCash });
  const deletedCashDrawer = cashOpens.length - filteredCash.length;

  const tables = await store.getTables();
  for (const t of tables) {
    if (t.current_order_id && orderIdsInRange.has(t.current_order_id)) {
      await store.updateTable(t.id, { status: "free", current_order_id: null, guest_count: 0, waiter_id: null, waiter_name: null, opened_at: null });
    }
  }
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
    // Debug: exchange-code request değerleri (source: REQUEST BODY – UI'dan)
    const dcVal = (dc || process.env.ZOHO_DC || "").toString().trim().toLowerCase();
    console.log("[Zoho] exchange-code RECEIVED from request:", {
      source: "request_body",
      dc: dcVal,
      client_id_prefix: String(client_id).slice(0, 12) + "...",
      client_secret_length: String(client_secret || "").length,
      redirect_uri_sent: redirect_uri || "(backend will choose)",
    });
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
      <p><strong>Backoffice:</strong> <a href="http://localhost:3000/pos">http://localhost:3000/pos</a></p>
    </body>
    </html>
  `);
});

const HOST = process.env.HOST || "0.0.0.0"; // 0.0.0.0 required for Railway
const DATA_DIR = process.env.DATA_DIR;

let lastAutoCloseRunTs = 0;

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

async function startServer() {
  // Listen first – Railway health check needs quick response. ensureData in background.
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
    ensurePrismaReady().then(() => console.log("[startup] ensurePrismaReady OK")).catch((e) => console.error("[startup] ensurePrismaReady failed:", e?.message || e));
    setInterval(() => runAutoCloseIfDue().catch((e) => console.error("[auto-close]", e?.message)), 60 * 1000);
    setInterval(() => fetchReconciliationEmails().catch((e) => console.error("[reconciliation]", e?.message)), 5 * 60 * 1000);
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
