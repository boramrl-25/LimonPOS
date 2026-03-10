/**
 * Prisma data access layer - replaces LowDB db.data usage.
 * DATABASE_URL must be set in .env for PostgreSQL (DigitalOcean, etc.)
 */
import crypto from "crypto";
import { prisma } from "./prisma.js";
import {
  getBusinessDayRange,
  getBusinessDayRangeForDate,
  parseTimeToMinutes,
} from "../businessDay.js";

/** Timestamp: Date | number -> number (ms) */
function ts(d) {
  if (d == null) return null;
  if (typeof d === "number") return d;
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

// ============ Startup ============
const DEFAULT_ADMIN = {
  id: "u1",
  name: "Admin",
  pin: "1234",
  role: "admin",
  active: 1,
  permissions: "[]",
  cash_drawer_permission: 1,
};

export async function ensurePrismaReady() {
  await prisma.$connect();
  await getSettings();
  const users = await prisma.user.findMany();
  if (users.length === 0) {
    await prisma.user.create({ data: DEFAULT_ADMIN });
  }
}

// ============ Settings ============
export async function getSettings() {
  let s = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!s) s = await prisma.settings.create({ data: { id: "default" } });
  return s;
}

export async function getZohoConfig() {
  let z = await prisma.zohoConfig.findUnique({ where: { id: "default" } });
  if (!z) z = await prisma.zohoConfig.create({ data: { id: "default" } });
  return {
    enabled: z.enabled ?? "false",
    client_id: z.client_id ?? "",
    client_secret: z.client_secret ?? "",
    refresh_token: z.refresh_token ?? "",
    organization_id: z.organization_id ?? "",
    customer_id: z.customer_id ?? "",
    dc: z.dc ?? "",
  };
}

export async function updateZohoConfig(updates) {
  await prisma.zohoConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...updates },
    update: updates,
  });
}

export async function getUsers() {
  return prisma.user.findMany({ where: { active: 1 } });
}

export async function getAllUsers() {
  return prisma.user.findMany();
}

export async function getUserByIdOrPin(idOrPin) {
  return prisma.user.findFirst({
    where: {
      OR: [{ id: idOrPin }, { pin: idOrPin }],
      active: 1,
    },
  });
}

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { sort_order: "asc" } });
}

export async function getProducts() {
  return prisma.product.findMany({ where: { sellable: true } });
}

export async function getAllProducts() {
  return prisma.product.findMany();
}

export async function getAllCategories() {
  return prisma.category.findMany({ orderBy: { sort_order: "asc" } });
}

export async function getPrinters() {
  return prisma.printer.findMany();
}

export async function getPaymentMethods() {
  return prisma.paymentMethod.findMany({ where: { active: 1 }, orderBy: { sort_order: "asc" } });
}

export async function getAllPaymentMethods() {
  return prisma.paymentMethod.findMany({ orderBy: { sort_order: "asc" } });
}

export async function getModifierGroups() {
  return prisma.modifierGroup.findMany();
}

export async function getTables() {
  return prisma.table.findMany();
}

export async function getOrders() {
  return prisma.order.findMany();
}

export async function getOrderById(id) {
  return prisma.order.findUnique({
    where: { id },
    include: { orderItems: true, payments: true },
  });
}

export async function getOrderItems(orderId) {
  return prisma.orderItem.findMany({ where: { order_id: orderId } });
}

export async function getAllOrderItems() {
  return prisma.orderItem.findMany();
}

export async function getPayments() {
  return prisma.payment.findMany();
}

export async function getVoidLogs() {
  return prisma.voidLog.findMany();
}

// JSON arrays from Settings
export async function getCashDrawerOpens() {
  const s = await getSettings();
  return (s.cash_drawer_opens && Array.isArray(s.cash_drawer_opens) ? s.cash_drawer_opens : []);
}

export async function getCustomRoles() {
  const s = await getSettings();
  return (s.custom_roles && Array.isArray(s.custom_roles) ? s.custom_roles : []);
}

export async function getDevices() {
  const list = await prisma.device.findMany();
  return list.map((d) => (d.payload && typeof d.payload === "object" ? d.payload : { id: d.id }));
}

// ============ Settings JSON merge & writes ============
export async function updateSettings(updates) {
  const s = await getSettings();
  const scalarKeys = [
    "timezone_offset_minutes", "overdue_undelivered_minutes", "opening_time", "closing_time",
    "open_tables_warning_time", "auto_close_open_tables", "auto_close_payment_method", "grace_minutes",
    "warning_enabled", "last_warning_shown_for_business_day", "last_auto_close_for_business_day",
    "setup_complete", "company_name", "company_address", "receipt_header", "receipt_footer_message",
    "kitchen_header", "receipt_item_size", "currency_code", "vat_percent",
  ];
  const data = { ...s };
  for (const k of scalarKeys) {
    if (k in updates) data[k] = updates[k];
  }
  const jsonKeys = [
    "floor_plan_sections", "migrations", "cash_drawer_opens", "custom_roles", "eod_logs",
    "daily_cash_entries", "business_operation_log", "reconciliation_imports", "reconciliation_inbox_config",
    "reconciliation_bank_settings", "reconciliation_bank_accounts", "reconciliation_warnings",
    "physical_cash_count_by_date",
  ];
  for (const k of jsonKeys) {
    if (k in updates) data[k] = updates[k];
  }
  await prisma.settings.update({ where: { id: "default" }, data });
}

export async function addCashDrawerOpen(entry) {
  const s = await getSettings();
  const arr = Array.isArray(s.cash_drawer_opens) ? [...s.cash_drawer_opens] : [];
  arr.push(entry);
  await prisma.settings.update({ where: { id: "default" }, data: { cash_drawer_opens: arr } });
}

export async function appendBusinessOperationLog(entry) {
  const s = await getSettings();
  const arr = Array.isArray(s.business_operation_log) ? [...s.business_operation_log] : [];
  arr.push(entry);
  if (arr.length > 2000) arr.splice(0, arr.length - 2000);
  await prisma.settings.update({ where: { id: "default" }, data: { business_operation_log: arr } });
}

export async function appendEodLog(entry) {
  const s = await getSettings();
  const arr = Array.isArray(s.eod_logs) ? [...s.eod_logs] : [];
  arr.push(entry);
  await prisma.settings.update({ where: { id: "default" }, data: { eod_logs: arr } });
}

export async function appendDailyCashEntry(entry) {
  const s = await getSettings();
  const arr = Array.isArray(s.daily_cash_entries) ? [...s.daily_cash_entries] : [];
  arr.push(entry);
  await prisma.settings.update({ where: { id: "default" }, data: { daily_cash_entries: arr } });
}

// ============ Device ============
export async function upsertDevice(id, payload) {
  await prisma.device.upsert({
    where: { id },
    create: { id, payload: payload || {} },
    update: { payload: payload || {} },
  });
}

export async function updateDeviceClearRequested(id, value) {
  const d = await prisma.device.findUnique({ where: { id } });
  if (!d) return;
  const p = (d.payload && typeof d.payload === "object" ? { ...d.payload } : { id });
  p.clear_local_data_requested = value;
  await prisma.device.update({ where: { id }, data: { payload: p } });
}

export async function deleteDeviceClearRequested(id) {
  const d = await prisma.device.findUnique({ where: { id } });
  if (!d) return;
  const p = (d.payload && typeof d.payload === "object" ? { ...d.payload } : { id });
  delete p.clear_local_data_requested;
  await prisma.device.update({ where: { id }, data: { payload: p } });
}

// ============ User ============
export async function createUser(data) {
  return prisma.user.create({ data });
}

export async function updateUser(id, data) {
  return prisma.user.update({ where: { id }, data });
}

export async function deleteUser(id) {
  return prisma.user.update({ where: { id }, data: { active: 0 } });
}

// ============ Category ============
export async function createCategory(data) {
  return prisma.category.create({ data });
}

export async function updateCategory(id, data) {
  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(id) {
  return prisma.category.delete({ where: { id } });
}

// ============ Product ============
export async function createProduct(data) {
  return prisma.product.create({ data });
}

export async function updateProduct(id, data) {
  return prisma.product.update({ where: { id }, data });
}

export async function upsertProduct(id, data) {
  return prisma.product.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

export async function deleteProduct(id) {
  return prisma.product.delete({ where: { id } });
}

// ============ Printer ============
export async function createPrinter(data) {
  return prisma.printer.create({ data });
}

export async function updatePrinter(id, data) {
  return prisma.printer.update({ where: { id }, data });
}

export async function deletePrinter(id) {
  return prisma.printer.delete({ where: { id } });
}

// ============ PaymentMethod ============
export async function createPaymentMethod(data) {
  return prisma.paymentMethod.create({ data });
}

export async function updatePaymentMethod(id, data) {
  return prisma.paymentMethod.update({ where: { id }, data });
}

export async function deletePaymentMethod(id) {
  return prisma.paymentMethod.delete({ where: { id } });
}

// ============ ModifierGroup ============
export async function createModifierGroup(data) {
  return prisma.modifierGroup.create({ data });
}

export async function updateModifierGroup(id, data) {
  return prisma.modifierGroup.update({ where: { id }, data });
}

export async function deleteModifierGroup(id) {
  return prisma.modifierGroup.delete({ where: { id } });
}

// ============ Table ============
export async function createTable(data) {
  return prisma.table.create({ data });
}

export async function updateTable(id, data) {
  return prisma.table.update({ where: { id }, data });
}

export async function deleteTable(id) {
  return prisma.table.delete({ where: { id } });
}

export async function upsertTables(tables) {
  for (const t of tables) {
    await prisma.table.upsert({
      where: { id: t.id },
      create: t,
      update: t,
    });
  }
}

// ============ Order ============
export async function createOrder(data) {
  return prisma.order.create({ data });
}

export async function updateOrder(id, data) {
  return prisma.order.update({ where: { id }, data });
}

// ============ OrderItem ============
export async function createOrderItem(data) {
  return prisma.orderItem.create({ data });
}

export async function updateOrderItem(id, data) {
  return prisma.orderItem.update({ where: { id }, data });
}

export async function deleteOrderItem(id) {
  return prisma.orderItem.delete({ where: { id } });
}

// ============ Payment ============
export async function createPayment(data) {
  return prisma.payment.create({ data });
}

// ============ VoidLog ============
export async function createVoidLog(data) {
  return prisma.voidLog.create({ data });
}

export async function deleteManyOrders(ids) {
  if (ids.length === 0) return;
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
}

export async function deleteVoidLogsByOrderIdsOrDateRange(orderIds, startTs, endTs) {
  const startDate = new Date(startTs);
  const endDate = new Date(endTs);
  await prisma.voidLog.deleteMany({
    where: {
      OR: [
        { order_id: { in: orderIds } },
        { created_at: { gte: startDate, lt: endDate } },
      ],
    },
  });
}

// ============ Getters for Settings JSON (used by server) ============
export async function getEodLogs() {
  const s = await getSettings();
  return (s.eod_logs && Array.isArray(s.eod_logs) ? s.eod_logs : []);
}

export async function getDailyCashEntries() {
  const s = await getSettings();
  return (s.daily_cash_entries && Array.isArray(s.daily_cash_entries) ? s.daily_cash_entries : []);
}

export async function getFloorPlanSections() {
  const s = await getSettings();
  return (s.floor_plan_sections && typeof s.floor_plan_sections === "object" ? s.floor_plan_sections : {});
}

export async function getReconciliationInboxConfig() {
  const s = await getSettings();
  return s.reconciliation_inbox_config;
}

export async function getReconciliationBankSettings() {
  const s = await getSettings();
  return s.reconciliation_bank_settings;
}

export async function getReconciliationBankAccounts() {
  const s = await getSettings();
  return s.reconciliation_bank_accounts || { card_account: "", cash_account: "" };
}

export async function getReconciliationWarnings() {
  const s = await getSettings();
  return (s.reconciliation_warnings && Array.isArray(s.reconciliation_warnings) ? s.reconciliation_warnings : []);
}

export async function getReconciliationImports() {
  const s = await getSettings();
  return (s.reconciliation_imports && Array.isArray(s.reconciliation_imports) ? s.reconciliation_imports : []);
}

export async function getPhysicalCashCountByDate() {
  const s = await getSettings();
  return (s.physical_cash_count_by_date && typeof s.physical_cash_count_by_date === "object" ? s.physical_cash_count_by_date : {});
}

// ============ Request tables (VoidRequest, ClosedBillAccessRequest, DiscountRequest, TableReservation) ============
// Use custom id (e.g. vr_xxx) as Prisma id so we can update by it.
export async function getVoidRequests() {
  const list = await prisma.voidRequest.findMany({ orderBy: { createdAt: "desc" } });
  return list.map((r) => (r.payload && typeof r.payload === "object" ? { ...r.payload, id: r.id } : { id: r.id }));
}

export async function createVoidRequest(payload) {
  const id = (payload && payload.id) || `vr_${crypto.randomUUID().slice(0, 8)}`;
  const r = await prisma.voidRequest.create({ data: { id, payload: payload || {} } });
  return { ...(r.payload && typeof r.payload === "object" ? r.payload : {}), id: r.id };
}

export async function updateVoidRequest(id, payload) {
  const r = await prisma.voidRequest.update({ where: { id }, data: { payload } });
  return { ...(r.payload && typeof r.payload === "object" ? r.payload : {}), id: r.id };
}

export async function getClosedBillAccessRequests() {
  const list = await prisma.closedBillAccessRequest.findMany({ orderBy: { createdAt: "desc" } });
  return list.map((r) => (r.payload && typeof r.payload === "object" ? { ...r.payload, id: r.id } : { id: r.id }));
}

export async function createClosedBillAccessRequest(payload) {
  const id = (payload && payload.id) || `cbar_${crypto.randomUUID().slice(0, 8)}`;
  const r = await prisma.closedBillAccessRequest.create({ data: { id, payload: payload || {} } });
  return { ...(r.payload && typeof r.payload === "object" ? r.payload : {}), id: r.id };
}

export async function updateClosedBillAccessRequest(id, payload) {
  const r = await prisma.closedBillAccessRequest.update({ where: { id }, data: { payload } });
  return { ...(r.payload && typeof r.payload === "object" ? r.payload : {}), id: r.id };
}

export async function getDiscountRequests() {
  const list = await prisma.discountRequest.findMany({ orderBy: { createdAt: "desc" } });
  return list.map((r) => (r.payload && typeof r.payload === "object" ? { ...r.payload, id: r.id } : { id: r.id }));
}

export async function createDiscountRequest(payload) {
  const id = (payload && payload.id) || `dr_${crypto.randomUUID().slice(0, 8)}`;
  const r = await prisma.discountRequest.create({ data: { id, payload: payload || {} } });
  return { ...(r.payload && typeof r.payload === "object" ? r.payload : {}), id: r.id };
}

export async function updateDiscountRequest(id, payload) {
  const r = await prisma.discountRequest.update({ where: { id }, data: { payload } });
  return { ...(r.payload && typeof r.payload === "object" ? r.payload : {}), id: r.id };
}

export async function deleteDiscountRequest(id) {
  await prisma.discountRequest.delete({ where: { id } });
}

export async function getTableReservations() {
  const list = await prisma.tableReservation.findMany({ orderBy: { createdAt: "desc" } });
  return list.map((r) => (r.payload && typeof r.payload === "object" ? { ...r.payload, id: r.id } : { id: r.id }));
}

export async function createTableReservation(payload) {
  const id = (payload && payload.id) || `res_${crypto.randomUUID().slice(0, 12)}`;
  const r = await prisma.tableReservation.create({ data: { id, payload: payload || {} } });
  return { ...(r.payload && typeof r.payload === "object" ? r.payload : {}), id: r.id };
}

export async function updateTableReservation(id, payload) {
  const r = await prisma.tableReservation.update({ where: { id }, data: { payload } });
  return { ...(r.payload && typeof r.payload === "object" ? r.payload : {}), id: r.id };
}

// ============ Helpers: offsetMin, getTodayRange, getDayBounds, getSalesSummaryForRange ============
export async function offsetMin() {
  const s = await getSettings();
  return (s?.timezone_offset_minutes ?? 0) | 0;
}

export async function getTodayRange() {
  const s = await getSettings();
  const opening = s.opening_time ?? "07:00";
  const closing = s.closing_time ?? "01:30";
  const off = (s.timezone_offset_minutes ?? 0) | 0;
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

export async function getDayBounds(dateStr) {
  const s = await getSettings();
  const opening = s.opening_time ?? "07:00";
  const closing = s.closing_time ?? "01:30";
  const off = (s.timezone_offset_minutes ?? 0) | 0;
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

export async function getSalesSummaryForRange(startTs, endTs) {
  const [orders, payments, paymentMethods, voidLogs] = await Promise.all([
    getOrders(), getPayments(), getPaymentMethods(), getVoidLogs(),
  ]);
  const rangeVoidsForExclusion = voidLogs.filter((v) => {
    const created = ts(v.created_at);
    return created >= startTs && created < endTs && (v.type === "refund_full" || v.type === "recalled_void");
  });
  const fullyVoidedOrderIds = new Set(rangeVoidsForExclusion.map((v) => v.order_id).filter(Boolean));
  const paidInRange = orders.filter((o) => {
    if (o.status !== "paid") return false;
    if (fullyVoidedOrderIds.has(o.id)) return false;
    const paidAt = ts(o.paid_at) ?? ts(o.updatedAt) ?? ts(o.createdAt) ?? 0;
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
  let totalSales = totalFromPayments > 0 ? totalFromPayments : totalFromOrders;
  if (totalFromPayments === 0 && totalFromOrders > 0) {
    totalCash = totalFromOrders;
    totalCard = 0;
  }
  const rangeVoids = voidLogs.filter((v) => {
    const created = ts(v.created_at);
    return created >= startTs && created < endTs;
  });
  const totalVoidAmount = rangeVoids.filter((v) => v.type !== "refund_full" && v.type !== "recalled_void").reduce((s, v) => s + (v.amount || 0), 0);
  const totalRefundAmount = rangeVoids.filter((v) => v.type === "refund_full" || v.type === "refund").reduce((s, v) => s + (v.amount || 0), 0);
  const netSales = totalSales - totalRefundAmount;
  return { startTs, endTs, paidOrderIds, totalCash, totalCard, totalSales, totalVoidAmount, totalRefundAmount, netSales, paidToday: paidInRange };
}

export async function getTodaySalesSummary() {
  const range = await getTodayRange();
  const summary = await getSalesSummaryForRange(range.startTs, range.endTs);
  return { ...summary, todayTs: range.startTs, todayEndTs: range.endTs };
}
