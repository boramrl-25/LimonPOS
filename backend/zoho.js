import axios from "axios";

// EU hesabı için: ZOHO_DC=eu (veya ZOHO_ACCOUNTS_URL + ZOHO_APIS_URL ayrı ayrı)
const dc = (process.env.ZOHO_DC || "").toLowerCase();
const ZOHO_ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || (dc === "eu" ? "https://accounts.zoho.eu" : "https://accounts.zoho.com");
const ZOHO_BOOKS = process.env.ZOHO_APIS_URL || (dc === "eu" ? "https://www.zohoapis.eu/books/v3" : "https://www.zohoapis.com/books/v3");

let cachedToken = null;
let tokenExpiresAt = 0;

function parseZohoError(err) {
  const d = err.response?.data;
  if (!d) return err.message || "Zoho API hatası";
  const msg = d.message || d.error || d.error_description || (typeof d === "string" ? d : null);
  if (msg) return String(msg);
  const code = err.response?.status;
  if (code === 400) return "Zoho: Geçersiz Refresh Token veya Client ID/Secret. EU hesabı kullanıyorsanız backend .env dosyasına ZOHO_DC=eu ekleyin.";
  if (code === 401) return "Zoho: Token süresi doldu veya yetkisiz.";
  if (code === 403) return "Zoho: Erişim engellendi.";
  return err.message || "Zoho API hatası";
}

/** Exchange authorization code for refresh token. Returns { refresh_token } or throws. */
export async function exchangeCodeForRefreshToken(code, client_id, client_secret, redirect_uri, forceDc) {
  // Self Client: use API Console redirect; server-based apps use custom URI
  const useEu = (forceDc || dc) === "eu";
  const accountsUrl = useEu ? "https://accounts.zoho.eu" : "https://accounts.zoho.com";
  const uri = redirect_uri || (useEu ? "https://api-console.zoho.eu/oauth/redirect" : "https://api-console.zoho.com/oauth/redirect");
  const res = await axios.post(
    `${accountsUrl}/oauth/v2/token`,
    new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri: uri,
      grant_type: "authorization_code",
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const rt = res.data?.refresh_token;
  if (!rt) {
    const err = res.data?.error_description || res.data?.error || "No refresh_token in Zoho response";
    throw new Error(String(err));
  }
  return { refresh_token: rt };
}

export async function getZohoAccessToken(db) {
  await db.read();
  const cfg = db.data?.zoho_config || {};
  const { refresh_token, client_id, client_secret } = cfg;
  if (!refresh_token || !client_id || !client_secret) return null;

  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

  try {
    const res = await axios.post(
      `${ZOHO_ACCOUNTS}/oauth/v2/token`,
      new URLSearchParams({
        refresh_token,
        client_id,
        client_secret,
        grant_type: "refresh_token",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    cachedToken = res.data.access_token;
    tokenExpiresAt = Date.now() + res.data.expires_in * 1000;
    return cachedToken;
  } catch (err) {
    console.error("Zoho token error:", err.response?.data || err.message);
    throw new Error(parseZohoError(err));
  }
}

export async function pushToZohoBooks(db, order, items, paymentMethod = "cash") {
  await db.read();
  const cfg = db.data?.zoho_config || {};
  const { organization_id, customer_id, enabled } = cfg;
  if (enabled !== "true" || !organization_id || !customer_id) return false;

  const token = await getZohoAccessToken(db);
  if (!token) return false;

  const zohoMode = paymentMethod === "card" ? "credit_card" : "cash";
  const paidAt = order.paid_at || order.created_at;
  const date = new Date(paidAt).toISOString().split("T")[0];

  const lineItems = items.map((i) => ({
    name: i.product_name,
    description: i.notes || "",
    quantity: i.quantity,
    rate: i.price,
  }));

  try {
    await axios.post(
      `${ZOHO_BOOKS}/salesreceipts?organization_id=${organization_id}`,
      {
        customer_id,
        date,
        payment_mode: zohoMode,
        reference_number: `LimonPOS-${order.id}`,
        line_items: lineItems,
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    const oidx = db.data.orders.findIndex((o) => o.id === order.id);
    if (oidx >= 0) db.data.orders[oidx].zoho_receipt_id = "sent";
    await db.write();
    return true;
  } catch (err) {
    console.error("Zoho Books error:", err.response?.data || err.message);
    return false;
  }
}

const zohoHeaders = (token) => ({
  Authorization: `Zoho-oauthtoken ${token}`,
  Accept: "application/json",
});

/** Fetch Categories from Zoho Books (item groups = categories). Returns { item_groups: [{ group_id, name }] }. Tries /itemgroups then /item_groups. */
async function fetchCategoriesFromEndpoint(token, organization_id, path) {
  const allGroups = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await axios.get(
      `${ZOHO_BOOKS}${path}?organization_id=${organization_id}&page=${page}&per_page=200`,
      { headers: zohoHeaders(token), validateStatus: () => true }
    );
    if (res.status === 404 || res.status >= 500) return null;
    if (res.status !== 200) throw new Error(res.data?.message || `HTTP ${res.status}`);
    const raw = res.data?.item_groups || res.data?.itemgroups || res.data?.categories || [];
    const groups = (Array.isArray(raw) ? raw : []).map((g) => ({
      group_id: String(g.group_id || g.item_group_id || g.category_id || g.id || ""),
      name: g.name || "",
    }));
    allGroups.push(...groups);
    const ctx = res.data?.page_context || {};
    hasMore = ctx.has_more_page === true || ctx.has_more === true;
    if (hasMore) page++;
    else break;
  }
  return allGroups;
}

/** Get Zoho Categories (item groups). Returns { item_groups: [...] } for compatibility. */
export async function getZohoItemGroups(db) {
  await db.read();
  const cfg = db.data?.zoho_config || {};
  const { organization_id, enabled } = cfg;
  if (enabled !== "true" || !organization_id) return { item_groups: [] };

  const token = await getZohoAccessToken(db);
  if (!token) return { item_groups: [] };

  try {
    let allGroups = await fetchCategoriesFromEndpoint(token, organization_id, "/itemgroups");
    if (!allGroups || allGroups.length === 0) {
      allGroups = await fetchCategoriesFromEndpoint(token, organization_id, "/item_groups") || [];
    }
    return { item_groups: allGroups };
  } catch (err) {
    console.error("Zoho Books getCategories error:", err.response?.data || err.message);
    return { item_groups: [] };
  }
}

/** Fetch items from Zoho Books - only SELLABLE items. Returns { items: [...] } or null on error. Supports pagination and alternate response shapes. */
export async function getZohoItems(db) {
  await db.read();
  const cfg = db.data?.zoho_config || {};
  const { organization_id, enabled } = cfg;
  if (enabled !== "true" || !organization_id) return null;

  const token = await getZohoAccessToken(db);
  if (!token) return null;

  const allRaw = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const res = await axios.get(
        `${ZOHO_BOOKS}/items?organization_id=${organization_id}&page=${page}&per_page=200`,
        { headers: zohoHeaders(token) }
      );
      if (res.data?.code !== undefined && res.data.code !== 0 && res.data.code !== 200) {
        console.error("Zoho Books getItems API error:", res.data);
        return page === 1 ? null : { items: normalizeZohoItems(allRaw) };
      }
      const raw = res.data?.items ?? res.data?.item ?? res.data?.data ?? [];
      let list = Array.isArray(raw) ? raw : [];
      if (!list.length && raw && typeof raw === "object") list = raw.item ?? raw.items ?? [];
      if (!list.length && Array.isArray(res.data)) list = res.data;
      for (const el of list) {
        const item = el && typeof el === "object" && el.item ? el.item : el;
        if (item && typeof item === "object") allRaw.push(item);
      }
      const ctx = res.data?.page_context || {};
      hasMore = ctx.has_more_page === true || ctx.has_more === true;
      if (hasMore) page++;
      else break;
    }
    return { items: normalizeZohoItems(allRaw) };
  } catch (err) {
    console.error("Zoho Books getItems error:", err.response?.data || err.message);
    throw new Error(parseZohoError(err));
  }
}

/** CSV: Sellable. Sadece açıkça false/"false"/"0" ise ele; true/"true" veya alan yoksa al (API bazen Sellable göndermiyor). */
function isSellableOk(item) {
  const v = item.sellable ?? item.Sellable ?? item["Sellable"];
  if (v === undefined || v === null) return true;
  if (v === false) return false;
  const s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0") return false;
  return true;
}

/** Kategori: category id değil, Category Name (Excel’deki gibi) kullan. */
function getCategoryName(item) {
  const n = item["Category Name"] ?? item.category_name ?? item.category_name_from_zoho ?? item.item_group_name;
  if (n != null && String(n).trim()) return String(n).trim();
  const g = item.item_group ?? item.group ?? item.category;
  if (g && typeof g === "object" && g.name) return String(g.name).trim();
  return "";
}

/** API'dan gelen ham itemda Sellable değerini bul (hangi key ile gelirse gelsin). */
function getSellableFromRawItem(item) {
  if (!item || typeof item !== "object") return undefined;
  const keys = ["sellable", "Sellable", "sellable_from_api", "is_sellable", "sellable_flag", "item_sellable"];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(item, k)) return item[k];
  }
  for (const key of Object.keys(item)) {
    if (/sellable/i.test(key)) return item[key];
  }
  return undefined;
}

/** CSV ile aynı alanlar: Item ID, Item Name, SKU, Rate, Category Name, Sellable. Sellable=false olanları alma. */
function parseRate(val) {
  if (val === undefined || val === null) return 0;
  const s = String(val).trim().replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeZohoItems(rawList) {
  return rawList
    .filter((i) => {
      if (!i || typeof i !== "object") return false;
      if (!isSellableOk(i)) return false;
      const id = i.item_id ?? i.id ?? i["Item ID"];
      if (id === undefined || id === null || id === "") return false;
      return true;
    })
    .map((i) => {
      const gid = i.item_group_id ?? i.group_id ?? i.category_id ?? null;
      const gName = getCategoryName(i);
      const rawSku = String(i.sku ?? i.SKU ?? i["SKU"] ?? i.item_code ?? "").trim();
      const skuDigits = rawSku.replace(/\D/g, "");
      const itemId = i.item_id ?? i.id ?? i["Item ID"];
      const sku = skuDigits || String(itemId ?? "");
      const rate = parseRate(i.rate ?? i.Rate ?? i["Rate"] ?? i.price ?? i.selling_rate);
      const name = String(i.name ?? i["Item Name"] ?? "").trim() || "Unnamed";
      const sellableFromApi = getSellableFromRawItem(i);
      return {
        item_id: itemId,
        name,
        sku,
        rate,
        item_group_id: gid ? String(gid) : null,
        item_group_name: gName || null,
        image_url: i.image_url ?? i.image ?? "",
        sellable_from_api: sellableFromApi,
      };
    });
}

/** Normalize edilmiş itemlardan kategori listesi (item_group_name = Category Name). */
function extractCategoriesFromItems(items) {
  const seen = new Map();
  for (const it of items) {
    const name = (it.item_group_name || getCategoryName(it) || "Other").toString().trim() || "Other";
    const key = `n:${name}`;
    if (!seen.has(key)) {
      const groupId = `zoho_cat_${name.replace(/\W+/g, "_").slice(0, 50)}`;
      seen.set(key, { group_id: groupId, name });
    }
  }
  return Array.from(seen.values());
}

/** Sync: Clear entire product list, pull Categories from Category Name and all non-sellable-false items. Each product: name, SKU (digits only), category, sale price (rate). */
export async function syncFromZoho(db, options = {}) {
  await db.read();
  const groupsRes = await getZohoItemGroups(db);
  const itemsRes = await getZohoItems(db);
  const itemsFetched = itemsRes?.items?.length ?? 0;
  if (!itemsRes) {
    const cfg = db.data?.zoho_config || {};
    const hasConfig = !!(cfg.organization_id && cfg.enabled === "true" && cfg.refresh_token && cfg.client_id && cfg.client_secret);
    let tokenOk = false;
    try {
      tokenOk = !!(await getZohoAccessToken(db));
    } catch (_) {}
    return {
      categoriesAdded: 0,
      productsAdded: 0,
      productsUpdated: 0,
      productsRemoved: 0,
      itemsFetched: 0,
      error: !hasConfig ? "Zoho ayarları eksik (Organization ID, Enabled, Refresh Token, Client ID/Secret)" : !tokenOk ? "Zoho token alınamadı (Refresh Token veya Client bilgilerini kontrol edin)" : "Zoho Books ürün listesi alınamadı (API hatası veya yetki)",
    };
  }

  // Categories are derived from Category Name in items (Excel/Zoho UI), not item groups
  let groups = extractCategoriesFromItems(itemsRes.items || []);
  const items = itemsRes.items || [];
  const existingCatIds = new Set((db.data.categories || []).map((c) => c.id));
  const zohoCatIdToLocal = {};
  const zohoCatNameToLocal = {};
  let categoriesAdded = 0;

  for (const g of groups) {
    const zid = String(g.group_id || g.item_group_id || "").trim();
    const gName = (g.name || "").trim();
    if (!zid || !gName) continue;
    const localId = zid.startsWith("zoho_cat_") ? zid : `zoho_cat_${zid}`;
    zohoCatIdToLocal[zid] = localId;
    zohoCatNameToLocal[gName.toLowerCase()] = localId;
    if (!existingCatIds.has(localId)) {
      db.data.categories = db.data.categories || [];
      db.data.categories.push({
        id: localId,
        name: g.name,
        color: "#84CC16",
        sort_order: db.data.categories.length,
        active: 1,
        modifier_groups: "[]",
        printers: "[]",
      });
      existingCatIds.add(localId);
      categoriesAdded++;
    }
  }

  const clearFirst = options.clearZohoProductsFirst === true;
  const existingProducts = db.data.products || [];
  let productsRemoved = 0;
  let productsAdded = 0;
  let productsUpdated = 0;

  if (clearFirst) {
    // Tam senkron: tüm ürünleri sil, sadece Zoho'dan gelenleri yükle
    productsRemoved = existingProducts.length;
    db.data.products = [];
  } else {
    // Artımlı senkron: Web'de eklenen ürünleri koru, Zoho'dakileri güncelle/ekle
    const webOnlyProducts = existingProducts.filter((p) => !p.zoho_item_id);
    const byZohoId = new Map(existingProducts.filter((p) => p.zoho_item_id).map((p) => [String(p.zoho_item_id), p]));
    const merged = [...webOnlyProducts];
    for (const it of items) {
      const zohoId = String(it.item_id);
      const existing = byZohoId.get(zohoId);
      const sku = (it.sku || "").trim() || String(it.item_id);
      const catName = (it.item_group_name || "").toString().trim().toLowerCase();
      const localCatId = (catName && zohoCatNameToLocal[catName]) || (it.item_group_id && zohoCatIdToLocal[String(it.item_group_id)]) || null;
      const id = `p_zoho_${it.item_id}`;
      const row = {
        id,
        name: it.name || "Unnamed",
        name_arabic: (existing && existing.name_arabic) || "",
        name_turkish: (existing && existing.name_turkish) || "",
        sku,
        category_id: localCatId || null,
        price: Number(it.rate) || 0,
        tax_rate: (existing && existing.tax_rate) != null ? existing.tax_rate : 0,
        image_url: it.image_url || (existing && existing.image_url) || "",
        printers: (existing && existing.printers) || "[]",
        modifier_groups: (existing && existing.modifier_groups) || "[]",
        active: (existing && existing.active) != null ? existing.active : 1,
        pos_enabled: (existing && existing.pos_enabled) != null ? existing.pos_enabled : (localCatId ? 1 : 0),
        zoho_item_id: it.item_id,
        sellable: true,
        sellable_from_api: it.sellable_from_api,
      };
      if (existing) {
        merged.push({ ...existing, ...row });
        productsUpdated++;
      } else {
        merged.push(row);
        productsAdded++;
      }
    }
    db.data.products = merged;
    await db.write();
    return { categoriesAdded, productsAdded, productsUpdated, productsRemoved, itemsFetched };
  }

  for (const it of items) {
    const zohoId = String(it.item_id);
    const sku = (it.sku || "").trim() || String(it.item_id);
    const catName = (it.item_group_name || "").toString().trim().toLowerCase();
    const localCatId = (catName && zohoCatNameToLocal[catName]) || (it.item_group_id && zohoCatIdToLocal[String(it.item_group_id)]) || null;
    const id = `p_zoho_${it.item_id}`;
    db.data.products.push({
      id,
      name: it.name || "Unnamed",
      name_arabic: "",
      name_turkish: "",
      sku,
      category_id: localCatId || null,
      price: Number(it.rate) || 0,
      tax_rate: 0,
      image_url: it.image_url || "",
      printers: "[]",
      modifier_groups: "[]",
      active: 1,
      pos_enabled: localCatId ? 1 : 0,
      zoho_item_id: it.item_id,
      sellable: true,
      sellable_from_api: it.sellable_from_api,
    });
    productsAdded++;
  }

  await db.write();
  return {
    categoriesAdded,
    productsAdded,
    productsUpdated: 0,
    productsRemoved,
    itemsFetched,
  };
}
