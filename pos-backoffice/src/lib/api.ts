const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.the-limon.com/api";
const TOKEN_KEY = "limonpos_admin_token";
const USER_KEY = "limonpos_admin_user";
const FETCH_TIMEOUT_MS = 25000;
const FETCH_RETRY_COUNT = 2;

async function fetchWithTimeout(url: string, opts: RequestInit = {}, retriesLeft = FETCH_RETRY_COUNT): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } catch (e) {
    const isNetworkError = (e as Error).name === "AbortError" || (e as Error).message?.includes("fetch") || (e as Error).message?.includes("Failed to fetch");
    if (isNetworkError && retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return fetchWithTimeout(url, { ...opts, signal: undefined } as RequestInit, retriesLeft - 1);
    }
    if ((e as Error).name === "AbortError") {
      const isLocal = typeof API_URL === "string" && API_URL.includes("localhost");
      throw new Error(
        isLocal
          ? "Backend yanıt vermiyor. Lokal backend çalışıyor mu? (cd backend && npm run dev, port 3002)"
          : "API'ye ulaşılamıyor. İnternet bağlantısını ve api.the-limon.com erişimini kontrol edin."
      );
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
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, data.token);
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }
  return data;
}

export function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export type CurrentUser = { id: string; name: string; role: string; permissions: string[]; cash_drawer_permission?: boolean; can_access_settings?: boolean };

export function getStoredUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(USER_KEY);
    if (!s) return null;
    return JSON.parse(s) as CurrentUser;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetchWithTimeout(`${API_URL}/auth/me`, { headers: headers() });
    if (!res.ok) return getStoredUser();
    const user = await res.json();
    if (typeof window !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    return getStoredUser();
  }
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

/** Show in Till: Ürünün POS ekranında görünüp görünmeyeceğini günceller. */
export async function setProductShowInTill(id: string, show: boolean) {
  const res = await fetchWithTimeout(`${API_URL}/products/${id}/show-in-till`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ show }),
  });
  if (!res.ok) throw new Error("Failed to update show in till");
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

export const CURRENCY_OPTIONS = [
  { code: "AED", symbol: "AED", label: "AED (UAE Dirham)" },
  { code: "TRY", symbol: "₺", label: "₺ TRY (Turkish Lira)" },
  { code: "USD", symbol: "$", label: "$ USD (US Dollar)" },
  { code: "EUR", symbol: "€", label: "€ EUR (Euro)" },
  { code: "GBP", symbol: "£", label: "£ GBP (British Pound)" },
] as const;

export type Settings = {
  timezone_offset_minutes: number;
  overdue_undelivered_minutes?: number;
  company_name?: string;
  company_address?: string;
  receipt_header?: string;
  receipt_footer_message?: string;
  kitchen_header?: string;
  receipt_item_size?: number; // 0=normal, 1=large, 2=xlarge
  currency_code?: string;
  opening_time?: string;
  closing_time?: string;
  open_tables_warning_time?: string;
  auto_close_open_tables?: boolean;
  auto_close_payment_method?: string;
  grace_minutes?: number;
  warning_enabled?: boolean;
  vat_percent?: number;
};

export type BusinessDayStatus = {
  currentBusinessDayKey: string | null;
  isAfterWarningTime: boolean;
  openTablesCount: number;
  shouldShowWarning: boolean;
};

export type OpenTableNotClosed = {
  table_id: string;
  table_number: string;
  order_id: string;
  receipt_no: string;
  total: number;
  item_count: number;
  order_count: number;
  opened_at: number;
  duration_minutes: number;
  waiter_name: string;
  business_day_key: string | null;
};

export async function getSettings(): Promise<Settings> {
  const res = await fetchWithTimeout(`${API_URL}/settings`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

/** Masalarda gecikmiş (masaya gitmeyen) ürünü olan masa id'leri. Web floor'da yanıp sönsün. */
export async function getOverdueTableIds(): Promise<{ tableIds: string[]; overdueMinutes: number }> {
  const res = await fetchWithTimeout(`${API_URL}/dashboard/overdue-table-ids`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch overdue table ids");
  return res.json();
}

export async function updateSettings(settings: Partial<Settings>) {
  const res = await fetchWithTimeout(`${API_URL}/settings`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}

export async function getDashboardStats(dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = params.toString();
  const url = qs ? `${API_URL}/dashboard/stats?${qs}` : `${API_URL}/dashboard/stats`;
  const res = await fetchWithTimeout(url, { headers: headers() });
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

export async function getBusinessDayStatus(): Promise<BusinessDayStatus> {
  const res = await fetchWithTimeout(`${API_URL}/dashboard/business-day-status`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch business day status");
  return res.json();
}

/** Reconciliation: Cash & Card from UTAP/Bank emails (auto-forward) */
export async function getReconciliationInboxConfig(): Promise<{ configured: boolean; host: string | null; user: string | null }> {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/inbox-config`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch reconciliation inbox config");
  return res.json();
}

export type SecuritySettings = {
  require_device_approval: boolean;
  alert_sequence_drop: boolean;
  webhook_url: string;
};

export type SecurityDevice = {
  id: string;
  name: string;
  app_version: string | null;
  last_seen: number;
  user_id: string | null;
  status: string;
  last_sequence: number;
  online: boolean;
};

export type SecurityEvent = {
  id: string;
  ts: number;
  type: string;
  severity: string;
  device_id?: string;
  user_id?: string;
  details?: Record<string, unknown>;
};

export type ActivationCode = {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  deviceId: string | null;
  createdByUserId: string | null;
};

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const res = await fetchWithTimeout(`${API_URL}/security/settings`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch security settings");
  return res.json();
}

export async function updateSecuritySettings(body: Partial<SecuritySettings>): Promise<SecuritySettings> {
  const res = await fetchWithTimeout(`${API_URL}/security/settings`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update security settings");
  return res.json();
}

export async function getSecurityDevices(): Promise<SecurityDevice[]> {
  const res = await fetchWithTimeout(`${API_URL}/devices`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

export async function updateSecurityDevice(id: string, body: { name?: string; status?: string }): Promise<SecurityDevice> {
  const res = await fetchWithTimeout(`${API_URL}/devices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update device");
  return res.json();
}

export async function getSecurityEvents(limit = 200): Promise<SecurityEvent[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  const res = await fetchWithTimeout(`${API_URL}/security/events?${params.toString()}`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch security events");
  return res.json();
}

export type UserShiftEvent = {
  ts: number;
  action: "user_sign_in" | "user_sign_out";
  user_id?: string;
  user_name?: string;
  business_day_key?: string | null;
  open_tables_count?: number;
};

export async function getUserShiftEvents(dateFrom?: string, dateTo?: string): Promise<{ count: number; events: UserShiftEvent[] }> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = params.toString();
  const url = qs ? `${API_URL}/security/user-shifts?${qs}` : `${API_URL}/security/user-shifts`;
  const res = await fetchWithTimeout(url, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch user shift events");
  return res.json();
}

export async function getActivationCodes(): Promise<ActivationCode[]> {
  const res = await fetchWithTimeout(`${API_URL}/security/activation-codes`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch activation codes");
  return res.json();
}

export async function createActivationCode(expiresInMinutes: number): Promise<ActivationCode> {
  const res = await fetchWithTimeout(`${API_URL}/security/activation-codes`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ expires_in_minutes: expiresInMinutes }),
  });
  if (!res.ok) throw new Error("Failed to create activation code");
  return res.json();
}

export async function updateReconciliationInboxConfig(config: { host: string; port?: number; user: string; password: string; secure?: boolean }) {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/inbox-config`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to update reconciliation inbox config");
  return res.json();
}

export async function fetchReconciliationNow(): Promise<{ ok: boolean; imported?: number; error?: string }> {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/fetch-now`, { method: "POST", headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch reconciliation");
  return res.json();
}

export async function getReconciliationSummary(date: string) {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/summary?date=${encodeURIComponent(date)}`, { headers: headers() });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message || body?.error || "";
    } catch {
      detail = await res.text().catch(() => "") || res.statusText;
    }
    throw new Error(
      res.status === 401
        ? "Session expired. Please log in again."
        : detail || `Failed to fetch reconciliation summary (${res.status})`
    );
  }
  return res.json();
}

export async function getReconciliationCardDetail(date: string) {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/card-detail?date=${encodeURIComponent(date)}`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch card detail");
  return res.json();
}

export async function getReconciliationBankSettings() {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/bank-settings`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch bank settings");
  return res.json();
}

export async function updateReconciliationBankSettings(settings: { default_percentage: number; card_types: Array<{ name: string; percentage: number }> }) {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/bank-settings`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Failed to update bank settings");
  return res.json();
}

export async function getReconciliationBankAccounts() {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/bank-accounts`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch bank accounts");
  return res.json();
}

export async function updateReconciliationBankAccounts(accounts: { card_account: string; cash_account: string }) {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/bank-accounts`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(accounts),
  });
  if (!res.ok) throw new Error("Failed to update bank accounts");
  return res.json();
}

export async function getReconciliationWarnings() {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/warnings`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch warnings");
  return res.json();
}

export async function setReconciliationPhysicalCount(date: string, amount: number) {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/physical-count`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ date, amount }),
  });
  if (!res.ok) throw new Error("Failed to set physical count");
  return res.json();
}

export async function clearReconciliationWarnings() {
  const res = await fetchWithTimeout(`${API_URL}/reconciliation/warnings/clear`, { method: "POST", headers: headers() });
  if (!res.ok) throw new Error("Failed to clear warnings");
  return res.json();
}

export async function markWarningShown(): Promise<void> {
  const res = await fetchWithTimeout(`${API_URL}/dashboard/warning-shown`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Failed to mark warning shown");
}

export async function getOpenTablesNotClosed(): Promise<{ list: OpenTableNotClosed[]; count: number }> {
  const res = await fetchWithTimeout(`${API_URL}/dashboard/open-tables-not-closed`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch open tables not closed");
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

export type DiscountRequestRow = {
  id: string;
  order_id: string;
  table_number: string;
  requested_by_user_name: string;
  requested_at: number;
  requested_percent?: number | null;
  requested_amount?: number | null;
  note?: string;
  order_subtotal?: number;
  order_total_before_discount?: number;
};

export async function getDiscountRequestsPending(): Promise<{ requests: DiscountRequestRow[] }> {
  const res = await fetchWithTimeout(`${API_URL}/orders/discount-requests?status=pending`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch discount requests");
  return res.json();
}

export async function approveDiscountRequest(
  orderId: string,
  requestId: string,
  body: { discount_percent?: number; discount_amount?: number; note?: string }
) {
  const res = await fetchWithTimeout(
    `${API_URL}/orders/${encodeURIComponent(orderId)}/discount-request/${encodeURIComponent(requestId)}/approve`,
    { method: "POST", headers: headers(), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err?.error || "Failed to approve discount");
  }
  return res.json();
}

export async function cancelDiscountRequest(orderId: string, requestId: string, body?: { note?: string }) {
  const res = await fetchWithTimeout(
    `${API_URL}/orders/${encodeURIComponent(orderId)}/discount-request/${encodeURIComponent(requestId)}/cancel`,
    { method: "POST", headers: headers(), body: JSON.stringify(body || {}) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err?.error || "Failed to cancel discount request");
  }
  return res.json();
}

export type DiscountTodayRow = {
  id: string;
  order_id: string;
  table_number: string;
  discount_percent: number | null;
  discount_amount: number | null;
  approved_note: string | null;
  approved_by_user_name: string | null;
  approved_at: number;
  order_total: number;
  discount_applied: number;
};

export async function getDiscountsToday(date?: string): Promise<{ count: number; list: DiscountTodayRow[]; totalDiscountAmount: number }> {
  const params = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await fetchWithTimeout(`${API_URL}/dashboard/discounts-today${params}`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch today discounts");
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

/** Request a POS device to clear its local sales data. Device will perform clear on next sync. */
export async function requestClearLocalData(deviceId: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetchWithTimeout(`${API_URL}/devices/${encodeURIComponent(deviceId)}/request-clear-local-data`, {
    method: "POST",
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
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

/** Veri Denetim ve Kurtarma - Soft delete ile silinmiş kayıtlar */
export async function getDeletedRecords(): Promise<{ tables: Array<Record<string, unknown>>; orders: Array<Record<string, unknown>>; orderItems: Array<Record<string, unknown>> }> {
  const res = await fetchWithTimeout(`${API_URL}/recovery/deleted`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch deleted records");
  return res.json();
}

export async function restoreTable(id: string): Promise<{ ok: boolean; table: Record<string, unknown> }> {
  const res = await fetchWithTimeout(`${API_URL}/recovery/restore/table/${id}`, { method: "POST", headers: headers() });
  if (!res.ok) throw new Error("Failed to restore table");
  return res.json();
}

export async function restoreOrder(id: string): Promise<{ ok: boolean; order: Record<string, unknown> }> {
  const res = await fetchWithTimeout(`${API_URL}/recovery/restore/order/${id}`, { method: "POST", headers: headers() });
  if (!res.ok) throw new Error("Failed to restore order");
  return res.json();
}

export async function restoreOrderItem(id: string): Promise<{ ok: boolean; orderItem: Record<string, unknown> }> {
  const res = await fetchWithTimeout(`${API_URL}/recovery/restore/order-item/${id}`, { method: "POST", headers: headers() });
  if (!res.ok) throw new Error("Failed to restore order item");
  return res.json();
}

/** Hibrit mimari: Zorunlu Güncelle — Cihazlara katalog güncelleme sinyali gönderir */
export async function broadcastCatalogUpdate(): Promise<{ ok: boolean; message: string }> {
  const res = await fetchWithTimeout(`${API_URL}/admin/broadcast-catalog-update`, {
    method: "POST",
    headers: headers(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Broadcast failed");
  return data;
}

/** Hibrit mimari: Gün sonu audit raporu (source: app vs local_backend) */
export async function getAuditReport(): Promise<{
  date: string;
  totalOrders: number;
  appCount: number;
  localBackendCount: number;
  byDevice: Record<string, number>;
  note: string;
}> {
  const res = await fetchWithTimeout(`${API_URL}/admin/audit-report`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch audit report");
  return res.json();
}

export async function getSyncErrors(): Promise<Array<{ id: string; source: string; entity_type: string; entity_id: string | null; message: string | null; createdAt: string }>> {
  const res = await fetchWithTimeout(`${API_URL}/recovery/sync-errors`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch sync errors");
  return res.json();
}

export type TableReservation = { id: string; guest_name: string; guest_phone?: string; from_time: number; to_time: number };

export async function getTables(): Promise<Array<{
  id: string;
  number: string | number;
  name: string;
  floor: string;
  status: string;
  waiter_name?: string;
  current_order_id?: string | null;
  reservation?: TableReservation;
}>> {
  const res = await fetchWithTimeout(`${API_URL}/tables`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch tables");
  return res.json();
}

export async function reserveTable(tableId: string, body: { guest_name: string; guest_phone?: string; from_time: number; to_time: number }) {
  const res = await fetch(`${API_URL}/tables/${tableId}/reserve`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to reserve table");
  }
  return res.json();
}

export async function cancelTableReservation(tableId: string) {
  const res = await fetch(`${API_URL}/tables/${tableId}/reservation/cancel`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to cancel reservation");
  }
  return res.json();
}

export type OrderItem = { id: string; product_name: string; quantity: number; price: number; notes?: string; status: string; sent_at: number | null; delivered_at?: number | null; overdue_undelivered_minutes?: number | null };
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

export async function deleteTable(tableId: string) {
  const res = await fetch(`${API_URL}/tables/${tableId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to delete table");
  }
  return res.json();
}

export async function importTables(rows: Array<Record<string, unknown>>) {
  const res = await fetch(`${API_URL}/tables/import`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to import tables");
  }
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

export async function importFloorPlanSections(rows: Array<Record<string, unknown>>) {
  const res = await fetch(`${API_URL}/floor-plan-sections/import`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to import section filters");
  }
  return res.json();
}

export async function getZohoConfig() {
  const res = await fetchWithTimeout(`${API_URL}/zoho-config`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch Zoho config");
  return res.json();
}

const ZOHO_REDIRECT_BY_DC: Record<string, string> = {
  eu: "https://api-console.zoho.eu/oauth/redirect",
  in: "https://api-console.zoho.in/oauth/redirect",
  au: "https://api-console.zoho.com.au/oauth/redirect",
};
const ZOHO_REDIRECT_DEFAULT = "https://api-console.zoho.com/oauth/redirect";

export async function exchangeZohoCode(code: string, client_id: string, client_secret: string, redirect_uri?: string, dc?: string): Promise<{ refresh_token: string; success: boolean }> {
  const dcKey = (dc || "").trim().toLowerCase();
  const redirect = redirect_uri || ZOHO_REDIRECT_BY_DC[dcKey] || ZOHO_REDIRECT_DEFAULT;
  const res = await fetchWithTimeout(`${API_URL}/zoho/exchange-code`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, client_id, client_secret, redirect_uri: redirect, dc: dcKey || "" }),
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

export async function getZohoContacts(): Promise<{ contacts: { contact_id: string; contact_name: string }[] }> {
  const res = await fetchWithTimeout(`${API_URL}/zoho/contacts`, { headers: headers() });
  if (!res.ok) throw new Error("Zoho kişi listesi alınamadı");
  return res.json();
}

export async function checkZohoConnection(): Promise<{
  ok: boolean;
  salesPushReady?: boolean;
  hasToken: boolean;
  itemsCount: number;
  groupsCount: number;
  checks?: { enabled?: boolean; orgId?: boolean; customerId?: boolean; refreshToken?: boolean; clientId?: boolean; clientSecret?: boolean };
  error?: string | null;
}> {
  const res = await fetchWithTimeout(`${API_URL}/zoho/check`, { headers: headers() });
  const data = await res.json();
  return data;
}
