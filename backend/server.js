import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuid } from "uuid";
import { db } from "./db.js";
import { pushToZohoBooks, getZohoItems, getZohoItemGroups, syncFromZoho } from "./zoho.js";

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const DEFAULT_ADMIN = { id: "u1", name: "Admin", pin: "1234", role: "admin", active: 1, permissions: "[\"post_void\",\"pre_void\"]", cash_drawer_permission: 1 };

async function ensureData() {
  await db.read();
  if (!db.data) db.data = { users: [], categories: [], products: [], printers: [], payment_methods: [], orders: [], order_items: [], payments: [], tables: [], void_logs: [], void_requests: [], zoho_config: {}, migrations: {}, devices: [] };
  if (!db.data.migrations) db.data.migrations = {};
  if (!Array.isArray(db.data.devices)) db.data.devices = [];
  if (!db.data.users?.length) {
    db.data.users = [DEFAULT_ADMIN];
  }
  // Migration: initial Zoho import set pos_enabled = 0 for all products.
  // For POS app to show products in Order screen, default all existing products to pos_enabled = 1 once.
  if (!db.data.migrations.posEnabledDefaultToOne) {
    db.data.products = (db.data.products || []).map((p) => {
      const val = p.pos_enabled;
      const enabled =
        val === undefined ||
        val === null ||
        val === 0 ||
        val === "0" ||
        val === false
          ? 1
          : val;
      return { ...p, pos_enabled: enabled };
    });
    db.data.migrations.posEnabledDefaultToOne = true;
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
  res.json({ ok: true, message: "LimonPOS API", ts: Date.now() });
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

app.post("/api/auth/verify-cash-drawer", authMiddleware, (req, res) => {
  if (!req.user.cash_drawer_permission) return res.status(403).json({ success: false, message: "No permission" });
  res.json({ success: true, message: null });
});

// Users
app.get("/api/users", authMiddleware, async (req, res) => {
  await ensureData();
  res.json(db.data.users.map((r) => ({ ...r, permissions: JSON.parse(r.permissions || "[]"), cash_drawer_permission: !!r.cash_drawer_permission })));
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

// Categories
app.get("/api/categories", authMiddleware, async (req, res) => {
  await ensureData();
  const cats = (db.data.categories || []).filter((c) => c.active).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json(cats.map((c) => ({ ...c, modifier_groups: JSON.parse(c.modifier_groups || "[]"), printers: JSON.parse(c.printers || "[]") })));
});

app.post("/api/categories", authMiddleware, async (req, res) => {
  await ensureData();
  const id = req.body.id || `cat_${uuid().slice(0, 8)}`;
  const body = req.body;
  const cat = { id, name: body.name || "Category", color: body.color || "#84CC16", sort_order: body.sort_order ?? 0, active: body.active !== false ? 1 : 0, modifier_groups: JSON.stringify(body.modifier_groups || []), printers: JSON.stringify(body.printers || []) };
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
  db.data.categories[idx] = { ...db.data.categories[idx], name: body.name, color: body.color || "#84CC16", sort_order: body.sort_order ?? 0, active: body.active !== false ? 1 : 0, modifier_groups: JSON.stringify(body.modifier_groups || []), printers: JSON.stringify(body.printers || []) };
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
  const products = (db.data.products || []).filter((p) => p.sellable !== false);
  console.log("GET /api/products - count:", products.length, "from", req.ip);
  res.json(
    products.map((r) => ({
      ...r,
      tax_rate: r.tax_rate ?? 0,
      pos_enabled: r.pos_enabled ?? 1,
      category: cats[r.category_id] || "",
      printers: JSON.parse(r.printers || "[]"),
      modifier_groups: JSON.parse(r.modifier_groups || "[]"),
    })),
  );
});

app.post("/api/products", authMiddleware, async (req, res) => {
  await ensureData();
  const id = req.body.id || `p_${uuid().slice(0, 8)}`;
  const body = req.body;
  const prod = { id, name: body.name || "Product", name_arabic: body.name_arabic || "", name_turkish: body.name_turkish || "", sku: body.sku || "", category_id: body.category_id || null, price: body.price ?? 0, tax_rate: body.tax_rate ?? 0, image_url: body.image_url || "", printers: JSON.stringify(body.printers || []), modifier_groups: JSON.stringify(body.modifier_groups || []), active: body.active !== false ? 1 : 0, pos_enabled: body.pos_enabled !== false ? 1 : 0 };
  db.data.products = db.data.products.filter((p) => p.id !== id);
  db.data.products.push(prod);
  await db.write();
  const cats = Object.fromEntries((db.data.categories || []).map((r) => [r.id, r.name]));
  res.json({ ...prod, category: cats[prod.category_id] || "", printers: JSON.parse(prod.printers || "[]"), modifier_groups: JSON.parse(prod.modifier_groups || "[]") });
});

app.put("/api/products/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const idx = db.data.products.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const body = req.body;
  db.data.products[idx] = { ...db.data.products[idx], name: body.name, name_arabic: body.name_arabic || "", name_turkish: body.name_turkish || "", sku: body.sku || "", category_id: body.category_id || null, price: body.price ?? 0, tax_rate: body.tax_rate ?? 0, image_url: body.image_url ?? db.data.products[idx].image_url ?? "", printers: JSON.stringify(body.printers || []), modifier_groups: JSON.stringify(body.modifier_groups || []), active: body.active !== false ? 1 : 0, pos_enabled: body.pos_enabled !== false ? 1 : 0 };
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

// Hepsini sil ve Zoho'dan sync yapıp listeyi döndür
app.post("/api/products/clear-and-sync", authMiddleware, async (req, res) => {
  await ensureData();
  const previousCount = (db.data.products || []).length;
  db.data.products = [];
  await db.write();
  let syncResult = { categoriesAdded: 0, productsAdded: 0, productsUpdated: 0, productsRemoved: previousCount, itemsFetched: 0, error: null };
  try {
    syncResult = await syncFromZoho(db, {});
  } catch (e) {
    syncResult.error = (e && e.message) || "Sync failed";
  }
  await db.read();
  const cats = Object.fromEntries((db.data.categories || []).map((r) => [r.id, r.name]));
  const products = (db.data.products || []).filter((p) => p.sellable !== false).map((r) => ({ ...r, category: cats[r.category_id] || "", printers: JSON.parse(r.printers || "[]"), modifier_groups: JSON.parse(r.modifier_groups || "[]") }));
  res.json({ ...syncResult, products });
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
  const pr = { id, name: body.name || "Printer", printer_type: body.printer_type || "kitchen", ip_address: body.ip_address || "", port: body.port ?? 9100, connection_type: body.connection_type || "network", status: body.status || "offline", is_backup: body.is_backup ? 1 : 0, kds_enabled: body.kds_enabled !== false ? 1 : 0 };
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
  db.data.printers[idx] = { ...db.data.printers[idx], name: body.name, printer_type: body.printer_type || "kitchen", ip_address: body.ip_address || "", port: body.port ?? 9100, connection_type: body.connection_type || "network", status: body.status || "offline", is_backup: body.is_backup ? 1 : 0, kds_enabled: body.kds_enabled !== false ? 1 : 0 };
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

// Dashboard stats
app.get("/api/dashboard/stats", authMiddleware, async (req, res) => {
  await ensureData();
  const orders = db.data.orders || [];
  const payments = db.data.payments || [];
  const tables = db.data.tables || [];
  const voidLogs = db.data.void_logs || [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();
  const paidToday = orders.filter((o) => o.status === "paid" && o.paid_at >= todayTs);
  const todaySales = paidToday.reduce((s, o) => s + (o.total || 0), 0);
  const paymentByMethod = {};
  for (const p of payments) {
    const o = orders.find((x) => x.id === p.order_id);
    if (!o || o.status !== "paid" || o.paid_at < todayTs) continue;
    paymentByMethod[p.method] = (paymentByMethod[p.method] || 0) + (p.amount || 0);
  }
  const openTables = tables.filter((t) => t.status === "occupied" || t.current_order_id).length;
  const openChecks = orders.filter((o) => o.status === "open" || o.status === "sent").length;
  const preVoids = voidLogs.filter((v) => v.type === "pre_void").length;
  const postVoids = voidLogs.filter((v) => v.type === "post_void").length;
  res.json({
    todaySales,
    orderCount: paidToday.length,
    openTables,
    openChecks,
    paymentBreakdown: paymentByMethod,
    prePrintVoids: preVoids,
    postPrintVoids: postVoids,
  });
});

// Daily Sales (matches app Daily Sales screen)
app.get("/api/dashboard/daily-sales", authMiddleware, async (req, res) => {
  await ensureData();
  const orders = db.data.orders || [];
  const orderItems = db.data.order_items || [];
  const payments = db.data.payments || [];
  const products = db.data.products || [];
  const categories = db.data.categories || [];
  const voidLogs = db.data.void_logs || [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  const paidOrderIds = new Set(orders.filter((o) => o.status === "paid" && o.paid_at >= todayTs).map((o) => o.id));
  let totalCash = 0;
  let totalCard = 0;
  for (const p of payments) {
    if (!paidOrderIds.has(p.order_id)) continue;
    const m = (p.method || "").toLowerCase();
    if (m === "cash") totalCash += p.amount || 0;
    else if (m === "card") totalCard += p.amount || 0;
  }
  const totalSales = totalCash + totalCard;

  const catMap = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));
  const prodCat = Object.fromEntries((products || []).map((p) => [p.id, p.category_id]));
  const categorySales = {};
  const itemSales = {};
  for (const oi of orderItems) {
    const order = orders.find((o) => o.id === oi.order_id);
    if (!order || !paidOrderIds.has(order.id)) continue;
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

  const todayVoids = voidLogs.filter((v) => v.created_at >= todayTs);
  const totalVoidAmount = todayVoids.filter((v) => v.type !== "refund_full" && v.type !== "recalled_void").reduce((s, v) => s + (v.amount || 0), 0);
  const totalRefundAmount = todayVoids.filter((v) => v.type === "refund_full" || v.type === "refund").reduce((s, v) => s + (v.amount || 0), 0);
  const voids = todayVoids.filter((v) => v.type === "pre_void" || v.type === "post_void" || v.type === "recalled_void");
  const refunds = todayVoids.filter((v) => v.type === "refund" || v.type === "refund_full");

  res.json({
    totalCash,
    totalCard,
    totalSales,
    totalVoidAmount,
    totalRefundAmount,
    categorySales: categorySalesList,
    itemSales: itemSalesList,
    voids,
    refunds,
  });
});

// Tables
app.get("/api/tables", authMiddleware, async (req, res) => {
  await ensureData();
  res.json((db.data.tables || []).map((r) => ({ ...r, current_order_id: r.current_order_id || null })));
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
  const orderId = `ord_${uuid().slice(0, 12)}`;
  const now = Date.now();
  const tbl = db.data.tables.find((t) => t.id === id);
  if (!tbl) return res.status(404).json({ error: "Not found" });
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

// Orders
app.get("/api/orders/:id", authMiddleware, async (req, res) => {
  await ensureData();
  const order = db.data.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Not found" });
  const items = (db.data.order_items || []).filter((i) => i.order_id === order.id);
  res.json({ ...order, items });
});

app.post("/api/orders", authMiddleware, async (req, res) => {
  await ensureData();
  const body = req.body;
  const orderId = body.id || `ord_${uuid().slice(0, 12)}`;
  const waiterId = req.query.waiter_id || req.user?.id;
  const waiter = db.data.users.find((u) => u.id === waiterId);
  const tbl = db.data.tables.find((t) => t.id === body.table_id);
  db.data.orders.push({ id: orderId, table_id: body.table_id, table_number: tbl?.number?.toString() || "1", waiter_id: waiterId, waiter_name: waiter?.name || "Waiter", status: "open", subtotal: 0, tax_amount: 0, discount_percent: 0, discount_amount: 0, total: 0, created_at: Date.now(), paid_at: null, zoho_receipt_id: null });
  const tidx = db.data.tables.findIndex((t) => t.id === body.table_id);
  if (tidx >= 0) db.data.tables[tidx].status = "occupied";
  if (tidx >= 0) db.data.tables[tidx].current_order_id = orderId;
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
  const total = subtotal + taxAmount;
  const oidx = db.data.orders.findIndex((o) => o.id === orderId);
  if (oidx >= 0) db.data.orders[oidx] = { ...db.data.orders[oidx], subtotal, tax_amount: taxAmount, total };
}

app.post("/api/orders/:id/items", authMiddleware, async (req, res) => {
  await ensureData();
  const orderId = req.params.id;
  const body = req.body;
  const itemId = `item_${uuid().slice(0, 8)}`;
  db.data.order_items = db.data.order_items || [];
  db.data.order_items.push({ id: itemId, order_id: orderId, product_id: body.product_id || null, product_name: body.product_name || "Item", quantity: body.quantity ?? 1, price: body.price ?? 0, notes: body.notes || "", status: "pending", sent_at: null });
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

// KDS: update order item status (preparing / ready) for local-first sync
app.put("/api/orders/:orderId/items/:itemId/status", authMiddleware, async (req, res) => {
  await ensureData();
  const { orderId, itemId } = req.params;
  const status = (req.body && req.body.status) || req.query.status;
  if (!status || !["preparing", "ready"].includes(status)) {
    return res.status(400).json({ error: "status must be 'preparing' or 'ready'" });
  }
  const idx = (db.data.order_items || []).findIndex((i) => i.id === itemId && i.order_id === orderId);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  db.data.order_items[idx].status = status;
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
    const primaryMethod = payments[0]?.method || "cash";
    await pushToZohoBooks(db, order, items, primaryMethod);
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

app.post("/api/zoho/sync", authMiddleware, async (req, res) => {
  try {
    const clearFirst = !!(req.body && req.body.clearZohoProductsFirst);
    const result = await syncFromZoho(db, { clearZohoProductsFirst: clearFirst });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Sync failed", categoriesAdded: 0, productsAdded: 0, productsUpdated: 0, productsRemoved: 0, itemsFetched: 0 });
  }
});

// Zoho tanı: token ve ürün sayısı (sync yapmadan)
app.get("/api/zoho/check", authMiddleware, async (req, res) => {
  try {
    const { getZohoAccessToken, getZohoItems, getZohoItemGroups } = await import("./zoho.js");
    await db.read();
    const cfg = db.data?.zoho_config || {};
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

app.get("/api/health", (req, res) => res.json({ ok: true }));

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
app.listen(PORT, HOST, () => {
  console.log(`LimonPOS Backend running on http://localhost:${PORT}`);
  if (HOST === "0.0.0.0") {
    console.log("Listening on all interfaces – use this PC's IP (e.g. http://192.168.x.x:3002/api/) from phone.");
  }
});
