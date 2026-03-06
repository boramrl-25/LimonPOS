const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.the-limon.com/api";
const TOKEN_KEY = "limonpos_admin_token";
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("Backend yanıt vermiyor. Backend çalışıyor mu? (port 3002)");
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

export async function login(pin: string) {
  const res = await fetchWithTimeout(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) throw new Error("Invalid PIN");
  const data = await res.json();
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, data.token);
  return data;
}

export function logout() {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export async function getSetupStatus(): Promise<{ setupComplete: boolean }> {
  const res = await fetchWithTimeout(`${API_URL}/setup/status`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch setup status");
  return res.json();
}

export async function completeSetup(): Promise<{ setupComplete: boolean }> {
  const res = await fetchWithTimeout(`${API_URL}/setup/complete`, {
    method: "POST",
    headers: headers(),
  });
  if (!res.ok) throw new Error("Failed to complete setup");
  return res.json();
}

export type RoleOption = { id: string; label: string; labelTr: string; isCustom?: boolean };
export type PermissionOption = { id: string; scope: string; label: string; labelTr: string };

export async function getPermissions(): Promise<{ roles: RoleOption[]; permissions: PermissionOption[] }> {
  const res = await fetchWithTimeout(`${API_URL}/permissions`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch permissions");
  return res.json();
}

export async function createRole(body: { id?: string; label: string; labelTr?: string }): Promise<{ id: string; label: string; labelTr: string }> {
  const res = await fetchWithTimeout(`${API_URL}/roles`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to create role");
  }
  return res.json();
}

export async function deleteRole(id: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_URL}/roles/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to delete role");
  }
}

export async function getUsers() {
  const res = await fetchWithTimeout(`${API_URL}/users`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function createUser(user: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(user),
  });
  if (!res.ok) throw new Error("Failed to create user");
  return res.json();
}

export async function updateUser(id: string, user: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API_URL}/users/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(user),
  });
  if (!res.ok) throw new Error("Failed to update user");
  return res.json();
}

export async function deleteUser(id: string) {
  const res = await fetchWithTimeout(`${API_URL}/users/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error("Failed to delete user");
}

export async function importUsers(users: Array<{ User?: string; name?: string; role?: string; "Phone Number"?: string; phone?: string }>) {
  const res = await fetchWithTimeout(`${API_URL}/users/import`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ users }),
  });
  if (!res.ok) throw new Error("Failed to import users");
  return res.json();
}

export async function getCategories() {
  const res = await fetchWithTimeout(`${API_URL}/categories`, { headers: headers() });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Session expired. Please log in again.");
    throw new Error("Failed to fetch categories");
  }
  return res.json();
}

export async function createCategory(cat: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API_URL}/categories`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(cat),
  });
  if (!res.ok) throw new Error("Failed to create category");
  return res.json();
}

export async function updateCategory(id: string, cat: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API_URL}/categories/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(cat),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Session expired. Please log in again.");
    const err = await res.text();
    throw new Error(err || "Failed to update category");
  }
  return res.json();
}

export async function deleteCategory(id: string) {
  const res = await fetchWithTimeout(`${API_URL}/categories/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error("Failed to delete category");
}

export async function getProducts() {
  const res = await fetchWithTimeout(`${API_URL}/products`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    const data = JSON.parse(text || "{}") as { error?: string };
    if (data?.error) return data.error;
    if (res.status === 401) return "Session expired. Please sign in again.";
    if (res.status === 403) return "Access denied.";
    return fallback;
  } catch {
    return fallback;
  }
}

export async function createProduct(prod: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API_URL}/products`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(prod),
  });
  if (!res.ok) throw new Error(await getErrorMessage(res, `Failed to create product (${res.status})`));
  return res.json();
}

export async function updateProduct(id: string, prod: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API_URL}/products/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(prod),
  });
  if (!res.ok) throw new Error("Failed to update product");
  return res.json();
}

export async function deleteProduct(id: string) {
  const res = await fetchWithTimeout(`${API_URL}/products/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error("Failed to delete product");
}

/** Zoho'da artık olmayan (silinecek önerisi) ürünler; onay verilene kadar satışta kalır */
export async function getPendingZohoRemovalProducts(): Promise<Array<Record<string, unknown>>> {
  const res = await fetchWithTimeout(`${API_URL}/products/pending-zoho-removal`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch pending removal list");
  return res.json();
}

/** Seçilen ürünleri kalıcı sil (onay sonrası) */
export async function confirmProductRemoval(productIds: string[]): Promise<{ removed: number; productIds: string[] }> {
  const res = await fetchWithTimeout(`${API_URL}/products/confirm-removal`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ productIds }),
  });
  if (!res.ok) throw new Error("Failed to confirm removal");
  return res.json();
}

export async function getModifierGroups(): Promise<Array<{ id: string; name: string; min_select?: number; max_select?: number; required?: boolean; options: Array<{ id: string; name: string; price: number }> }>> {
  const res = await fetchWithTimeout(`${API_URL}/modifier-groups`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch modifier groups");
  return res.json();
}

export async function createModifierGroup(mg: { name: string; min_select?: number; max_select?: number; required?: boolean; options?: Array<{ id?: string; name: string; price?: number }> }) {
  const res = await fetchWithTimeout(`${API_URL}/modifier-groups`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(mg),
  });
  if (!res.ok) throw new Error("Failed to create modifier group");
  return res.json();
}

export async function updateModifierGroup(id: string, mg: { name?: string; min_select?: number; max_select?: number; required?: boolean; options?: Array<{ id?: string; name: string; price?: number }> }) {
  const res = await fetchWithTimeout(`${API_URL}/modifier-groups/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(mg),
  });
  if (!res.ok) throw new Error("Failed to update modifier group");
  return res.json();
}

export async function deleteModifierGroup(id: string) {
  const res = await fetchWithTimeout(`${API_URL}/modifier-groups/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error("Failed to delete modifier group");
}

export async function getPrinters() {
  const res = await fetch(`${API_URL}/printers`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch printers");
  return res.json();
}

export async function createPrinter(printer: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API_URL}/printers`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(printer),
  });
  if (!res.ok) throw new Error("Failed to create printer");
  return res.json();
}

export async function updatePrinter(id: string, printer: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/printers/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(printer),
  });
  if (!res.ok) throw new Error("Failed to update printer");
  return res.json();
}

export async function deletePrinter(id: string) {
  const res = await fetchWithTimeout(`${API_URL}/printers/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error("Failed to delete printer");
}

export async function getPaymentMethods() {
  const res = await fetchWithTimeout(`${API_URL}/payment-methods`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch payment methods");
  return res.json();
}

export async function createPaymentMethod(pm: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API_URL}/payment-methods`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(pm),
  });
  if (!res.ok) throw new Error("Failed to create payment method");
  return res.json();
}

export async function updatePaymentMethod(id: string, pm: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API_URL}/payment-methods/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(pm),
  });
  if (!res.ok) throw new Error("Failed to update payment method");
  return res.json();
}

export async function deletePaymentMethod(id: string) {
  const res = await fetchWithTimeout(`${API_URL}/payment-methods/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error("Failed to delete payment method");
}

export async function getSettings(): Promise<{ timezone_offset_minutes: number; overdue_undelivered_minutes: number }> {
  const res = await fetchWithTimeout(`${API_URL}/settings`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(settings: { timezone_offset_minutes?: number; overdue_undelivered_minutes?: number }) {
  const res = await fetchWithTimeout(`${API_URL}/settings`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}

export async function getDashboardStats() {
  const res = await fetchWithTimeout(`${API_URL}/dashboard/stats`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return res.json();
}

/** @param date YYYY-MM-DD single day; or use dateFrom+dateTo for range. Empty = today */
export async function getDailySales(date?: string, dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom && dateTo) {
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
  } else if (date) {
    params.set("date", date);
  }
  const qs = params.toString();
  const url = qs ? `${API_URL}/dashboard/daily-sales?${qs}` : `${API_URL}/dashboard/daily-sales`;
  const res = await fetchWithTimeout(url, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch daily sales");
  return res.json();
}

export async function getOpenOrders() {
  const res = await fetchWithTimeout(`${API_URL}/dashboard/open-orders`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch open orders");
  return res.json();
}

export async function getVoidRequests(status: string = "pending") {
  const res = await fetchWithTimeout(`${API_URL}/void-requests?status=${encodeURIComponent(status)}`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch void requests");
  return res.json();
}

export async function patchVoidRequest(id: string, body: { status?: string; approved_by_supervisor_user_id?: string; approved_by_supervisor_user_name?: string; approved_by_supervisor_at?: number; approved_by_kds_user_id?: string; approved_by_kds_user_name?: string; approved_by_kds_at?: number }) {
  const res = await fetchWithTimeout(`${API_URL}/void-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update void request");
  return res.json();
}

export async function getClosedBillAccessRequests(status: string = "pending") {
  const res = await fetchWithTimeout(`${API_URL}/closed-bill-access-requests?status=${encodeURIComponent(status)}`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch closed bill access requests");
  return res.json();
}

export async function patchClosedBillAccessRequest(id: string, body: { status?: string; approved_by_user_id?: string; approved_by_user_name?: string; approved_at?: number }) {
  const res = await fetchWithTimeout(`${API_URL}/closed-bill-access-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update closed bill access request");
  return res.json();
}

export async function getClosedBillChanges(date?: string, dateFrom?: string, dateTo?: string): Promise<{ count: number; summary: { fullRefunds: number; itemRefunds: number }; changes: Array<{ id: string; order_id: string; receipt_no: string | null; table_number: string; type: string; product_name: string | null; amount: number; user_name: string; created_at: number }> }> {
  const params = new URLSearchParams();
  if (dateFrom && dateTo) {
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
  } else if (date) {
    params.set("date", date);
  }
  const qs = params.toString();
  const url = qs ? `${API_URL}/dashboard/closed-bill-changes?${qs}` : `${API_URL}/dashboard/closed-bill-changes`;
  const res = await fetchWithTimeout(url, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch closed bill changes");
  return res.json();
}

export async function getCashDrawerOpens(date?: string, dateFrom?: string, dateTo?: string): Promise<{ count: number; opens: Array<{ id: string; user_id: string; user_name: string; opened_at: number }> }> {
  const params = new URLSearchParams();
  if (dateFrom && dateTo) {
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
  } else if (date) {
    params.set("date", date);
  }
  const qs = params.toString();
  const url = qs ? `${API_URL}/dashboard/cash-drawer-opens?${qs}` : `${API_URL}/dashboard/cash-drawer-opens`;
  const res = await fetchWithTimeout(url, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch cash drawer opens");
  return res.json();
}

export async function getOrder(orderId: string) {
  const res = await fetchWithTimeout(`${API_URL}/orders/${encodeURIComponent(orderId)}`, { headers: headers() });
  if (res.status === 404) throw new Error("Order not found (may have been deleted).");
  if (!res.ok) throw new Error("Failed to fetch order");
  return res.json();
}

export type DeviceInfo = {
  id: string;
  name: string;
  app_version: string | null;
  last_seen: number;
  user_id: string | null;
  online: boolean;
};

export async function getDevices(): Promise<DeviceInfo[]> {
  const res = await fetchWithTimeout(`${API_URL}/devices`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

export type EodStatus = {
  lastEod: { ran_at: number; user_name: string; tables_closed_count: number; orders_closed_count: number } | null;
  openTablesNow: Array<{ table_id: string; table_number: string | number; order_id: string; order_total: number }>;
  openTablesCount: number;
};

export async function getEodStatus(): Promise<EodStatus> {
  const res = await fetchWithTimeout(`${API_URL}/eod/status`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch EOD status");
  return res.json();
}

export async function runEod(closeOpenTables: boolean): Promise<{ success: boolean; tablesClosedCount: number; lastEod: EodStatus["lastEod"] }> {
  const res = await fetchWithTimeout(`${API_URL}/eod/run`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ closeOpenTables }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === "OPEN_TABLES") throw new Error(data.message || `${data.openTablesCount} masa açık.`);
    throw new Error(data.message || "EOD failed");
  }
  return data;
}

/** Delete orders (and related items, payments, void_logs) created between dateFrom and dateTo (YYYY-MM-DD). Frees tables. */
export async function clearSalesByDateRange(dateFrom: string, dateTo: string): Promise<{ deletedOrders: number; message: string }> {
  const res = await fetchWithTimeout(`${API_URL}/settings/clear-sales-by-date-range`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ dateFrom, dateTo }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Clear failed");
  return data;
}

export async function getTables() {
  const res = await fetchWithTimeout(`${API_URL}/tables`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch tables");
  return res.json();
}

export type OrderItem = { id: string; product_name: string; quantity: number; price: number; notes?: string; status: string; sent_at: number | null };
export type Order = { id: string; table_id: string; table_number: string; status: string; items: OrderItem[]; waiter_name?: string };

export async function createTable(table: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/tables`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(table),
  });
  if (!res.ok) throw new Error("Failed to create table");
  return res.json();
}

export type FloorPlanSections = { A: number[]; B: number[]; C: number[]; D: number[]; E: number[] };

export async function getFloorPlanSections(): Promise<FloorPlanSections> {
  const res = await fetchWithTimeout(`${API_URL}/floor-plan-sections`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch floor plan sections");
  return res.json();
}

export async function updateFloorPlanSections(sections: FloorPlanSections) {
  const res = await fetch(`${API_URL}/floor-plan-sections`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(sections),
  });
  if (!res.ok) throw new Error("Failed to update floor plan sections");
  return res.json();
}

export async function getZohoConfig() {
  const res = await fetchWithTimeout(`${API_URL}/zoho-config`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch Zoho config");
  return res.json();
}

export async function exchangeZohoCode(code: string, client_id: string, client_secret: string, redirect_uri?: string): Promise<{ refresh_token: string; success: boolean }> {
  const res = await fetchWithTimeout(`${API_URL}/zoho/exchange-code`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, client_id, client_secret, redirect_uri: redirect_uri || "https://www.zoho.com/books" }),
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.error || "Token alınamadı");
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error("Token alınamadı");
    }
  }
  return res.json();
}

export async function updateZohoConfig(config: Record<string, string>) {
  const res = await fetchWithTimeout(`${API_URL}/zoho-config`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const msg = await getErrorMessage(res, "Failed to update Zoho config");
    throw new Error(msg);
  }
  return res.json();
}

export async function getZohoItems(): Promise<{ items: Array<{ item_id: string; name: string; sku: string; rate: number; item_group_id?: string }> }> {
  const res = await fetchWithTimeout(`${API_URL}/zoho/items`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.error || "Zoho Books connection not configured");
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error("Failed to fetch Zoho Books products");
    }
  }
  return res.json();
}

export async function syncZohoBooks(options?: { clearZohoProductsFirst?: boolean }): Promise<{
  categoriesAdded: number;
  productsAdded: number;
  productsUpdated?: number;
  productsRemoved?: number;
  itemsFetched?: number;
  error?: string;
}> {
  const res = await fetchWithTimeout(`${API_URL}/zoho/sync`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(options || {}),
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.error || "Zoho sync failed");
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error("Zoho sync failed");
    }
  }
  return res.json();
}

/** Zoho'dan sync (upsert). Zoho'da olmayan ürünler silinmez, silinecek önerisi olarak işaretlenir; onay verilene kadar satışta kalır */
export async function clearAndSyncProducts(): Promise<{
  products: Array<Record<string, unknown>>;
  categoriesAdded: number;
  productsAdded: number;
  productsUpdated?: number;
  productsRemoved: number;
  productsSuggestedForRemoval?: Array<{ id: string; name: string; sku?: string }>;
  itemsFetched?: number;
  error?: string;
}> {
  const res = await fetchWithTimeout(`${API_URL}/products/clear-and-sync`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      throw new Error(data.error || "Clear and sync failed");
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error("Clear and sync failed");
    }
  }
  return res.json();
}

export async function checkZohoConnection(): Promise<{ ok: boolean; hasToken: boolean; itemsCount: number; groupsCount: number; error?: string }> {
  const res = await fetchWithTimeout(`${API_URL}/zoho/check`, { headers: headers() });
  const data = await res.json();
  return data;
}
