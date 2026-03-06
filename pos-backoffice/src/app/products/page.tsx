"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, BookOpen, RefreshCw, Search, FileSpreadsheet, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { getProducts, getCategories, getPrinters, getModifierGroups, createProduct, updateProduct, deleteProduct, setProductShowInTill, getZohoItems, syncZohoBooks, checkZohoConnection, clearAndSyncProducts, getPendingZohoRemovalProducts, confirmProductRemoval } from "@/lib/api";

type Product = {
  id: string;
  name: string;
  name_arabic?: string;
  name_turkish?: string;
  sku?: string;
  category_id?: string;
  category?: string;
  price: number;
  tax_rate: number;
  image_url?: string;
  printers: string[];
  modifier_groups: string[];
  active: boolean;
  pos_enabled?: boolean;
  /** Masaya gitmeyen ürün uyarı süresi (dakika). Varsa kategorideki/ayarlardaki süre yok sayılır. */
  overdue_undelivered_minutes?: number | null;
  /** API'dan gelen Sellable kolonu (true/false/string vb.) */
  sellable_from_api?: unknown;
  /** Zoho'da artık yok – silinecek önerisi; onay verilene kadar satışta kalır */
  zoho_suggest_remove?: boolean;
};

type ZohoItem = { item_id: string; name: string; sku: string; rate: number };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [printers, setPrinters] = useState<{ id: string; name: string }[]>([]);
  const [modifierGroups, setModifierGroups] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"category" | "name" | "price">("category");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", name_arabic: "", name_turkish: "", sku: "", category_id: "", price: 0, tax_rate: 0, image_url: "", printers: [] as string[], modifier_groups: [] as string[], pos_enabled: true, overdue_undelivered_minutes: "" as string | number });
  const [showZohoPicker, setShowZohoPicker] = useState(false);
  const [zohoItems, setZohoItems] = useState<ZohoItem[]>([]);
  const [zohoLoading, setZohoLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [zohoCheckResult, setZohoCheckResult] = useState<{ ok: boolean; itemsCount: number; groupsCount: number; error?: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingModifierPrinter, setImportingModifierPrinter] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modifierPrinterFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Product[]>([]);
  const [selectedRemovalIds, setSelectedRemovalIds] = useState<Set<string>>(new Set());
  const [removalLoading, setRemovalLoading] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [importConflictModal, setImportConflictModal] = useState<{
    conflicts: { name: string; existing: Product; row: Record<string, unknown> }[];
    rows: Record<string, unknown>[];
    resolve: (applyUpdates: boolean) => void;
  } | null>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = setInterval(() => load(), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function runSync() {
      try {
        const r = await syncZohoBooks();
        if (mounted && !r.error) {
          setLastSync(new Date().toLocaleTimeString());
          load();
        }
      } catch {
        /* ignore */
      }
    }
    runSync();
    const t = setInterval(runSync, 60000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  async function load(silent = false) {
    if (!silent) {
      setLoadError(null);
      setLoading(true);
    }
    try {
      const [prods, cats, prts, mgs, pending] = await Promise.all([
        getProducts(),
        getCategories(),
        getPrinters(),
        getModifierGroups(),
        getPendingZohoRemovalProducts().catch(() => []),
      ]);
      const byId = new Map<string, Product>();
      for (const p of prods) {
        if (p?.id && !byId.has(p.id)) byId.set(p.id, p as Product);
      }
      setProducts(Array.from(byId.values()));
      const catsById = new Map<string, { id: string; name: string }>();
      for (const c of cats || []) {
        if (c?.id && !catsById.has(c.id)) catsById.set(c.id, { id: c.id, name: c.name || "" });
      }
      setCategories(Array.from(catsById.values()));
      setPrinters(prts);
      setModifierGroups(mgs.map((m) => ({ id: m.id, name: m.name })));
      setPendingRemoval((pending as Product[]) || []);
    } catch (e) {
      console.error(e);
      const msg = (e as Error).message || "Bağlantı hatası";
      if (msg.includes("401") || msg.includes("Unauthorized")) {
        window.location.href = "/login";
        return;
      }
      if (!silent) setLoadError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function toModifierIds(arr: unknown): string[] {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => (typeof x === "string" ? x : (x as { id?: string })?.id)?.trim())
      .filter((id): id is string => !!id);
  }

  function openEdit(p?: Product) {
    if (p) {
      setEditing(p);
      const od = p.overdue_undelivered_minutes != null ? String(p.overdue_undelivered_minutes) : "";
      setForm({
        name: p.name,
        name_arabic: p.name_arabic || "",
        name_turkish: p.name_turkish || "",
        sku: p.sku || "",
        category_id: p.category_id || "",
        price: p.price,
        tax_rate: (p.tax_rate ?? 0) * 100,
        image_url: p.image_url || "",
        printers: Array.isArray(p.printers) ? p.printers : [],
        modifier_groups: toModifierIds(p.modifier_groups),
        pos_enabled: Boolean(p.pos_enabled),
        overdue_undelivered_minutes: od,
      });
    } else {
      setEditing(null);
      setForm({ name: "", name_arabic: "", name_turkish: "", sku: "", category_id: "", price: 0, tax_rate: 0, image_url: "", printers: [] as string[], modifier_groups: [] as string[], pos_enabled: true, overdue_undelivered_minutes: "" });
    }
  }

  function togglePrinter(id: string) {
    setForm((f) => ({
      ...f,
      printers: f.printers.includes(id) ? f.printers.filter((x) => x !== id) : [...f.printers, id],
    }));
  }

  function toggleModifierGroup(id: string) {
    setForm((f) => ({
      ...f,
      modifier_groups: f.modifier_groups.includes(id) ? f.modifier_groups.filter((x) => x !== id) : [...f.modifier_groups, id],
    }));
  }

  async function save() {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      alert("Product name is required");
      return;
    }
    try {
      const payload = {
        name: trimmedName,
        name_arabic: form.name_arabic?.trim() || "",
        name_turkish: form.name_turkish?.trim() || "",
        sku: form.sku?.trim() || "",
        category_id: form.category_id || undefined,
        price: Number(form.price) || 0,
        tax_rate: (Number(form.tax_rate) || 0) / 100,
        image_url: form.image_url?.trim() || "",
        printers: form.printers,
        modifier_groups: form.modifier_groups,
        pos_enabled: form.pos_enabled,
        overdue_undelivered_minutes: form.overdue_undelivered_minutes === "" ? undefined : (Number(form.overdue_undelivered_minutes) || undefined),
      };
      if (editing) {
        await updateProduct(editing.id, payload);
      } else {
        await createProduct(payload);
      }
      await load(true);
      setEditing(undefined);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) return;
    try {
      await deleteProduct(id);
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await load(true);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function toggleProductSelection(id: string) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllProducts() {
    if (selectedProductIds.size === sortedProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(sortedProducts.map((p) => p.id)));
    }
  }

  async function bulkDeleteProducts() {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) {
      alert("Lütfen silmek istediğiniz ürünleri işaretleyin.");
      return;
    }
    if (!confirm(`${ids.length} ürünü kalıcı olarak silmek istediğinize emin misiniz?`)) return;
    setDeleteLoading(true);
    try {
      for (const id of ids) {
        await deleteProduct(id);
      }
      setSelectedProductIds(new Set());
      await load(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  }

  /** Show in Till: Ürünün POS ekranında görünüp görünmeyeceğini değiştirir. */
  async function toggleShowInTill(p: Product) {
    const nextShow = !Boolean(p.pos_enabled);
    try {
      await setProductShowInTill(p.id, nextShow);
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, pos_enabled: nextShow } : x)));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function loadZohoItems() {
    setZohoLoading(true);
    setShowZohoPicker(true);
    setZohoItems([]);
    try {
      const res = await getZohoItems();
      setZohoItems(res?.items ?? []);
    } catch {
      setZohoItems([]);
    } finally {
      setZohoLoading(false);
    }
  }

  function selectZohoItem(item: ZohoItem) {
    setForm((f) => ({
      ...f,
      name: item.name,
      sku: item.sku ?? "",
      price: item.rate ?? 0,
    }));
    setShowZohoPicker(false);
  }

  /** Zoho'dan sync (upsert). Zoho'da olmayan ürünler silinmez, "silinecek önerisi" olarak işaretlenir; onay verilene kadar satışta kalır. */
  async function syncFromZoho() {
    setSyncLoading(true);
    setZohoCheckResult(null);
    try {
      const r = await clearAndSyncProducts();
      setLastSync(new Date().toLocaleTimeString());
      if (r.error) {
        alert(r.error);
      } else {
        await load(true);
        const suggested = r.productsSuggestedForRemoval?.length ?? 0;
        if (suggested > 0) {
          alert(`${suggested} ürün Zoho'da artık yok. Silinecek önerisi olarak listelendi. Onay verene kadar satışta kalır; aşağıdaki "Zoho'da artık yok" listesinden seçip silebilirsiniz.`);
        }
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSyncLoading(false);
    }
  }

  function toggleRemovalSelection(id: string) {
    setSelectedRemovalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllRemoval() {
    if (selectedRemovalIds.size === pendingRemoval.length) setSelectedRemovalIds(new Set());
    else setSelectedRemovalIds(new Set(pendingRemoval.map((p) => p.id)));
  }

  async function confirmRemoval() {
    const ids = Array.from(selectedRemovalIds);
    if (ids.length === 0) {
      alert("Lütfen silmek istediğiniz ürünleri işaretleyin.");
      return;
    }
    if (!confirm(`${ids.length} ürünü kalıcı olarak silmek istediğinize emin misiniz?`)) return;
    setRemovalLoading(true);
    try {
      await confirmProductRemoval(ids);
      setSelectedRemovalIds(new Set());
      await load(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRemovalLoading(false);
    }
  }

  async function checkZoho() {
    setCheckLoading(true);
    setZohoCheckResult(null);
    try {
      const r = await checkZohoConnection();
      setZohoCheckResult({ ok: r.ok, itemsCount: r.itemsCount ?? 0, groupsCount: r.groupsCount ?? 0, error: r.error ?? undefined });
    } catch {
      setZohoCheckResult({ ok: false, itemsCount: 0, groupsCount: 0, error: "Bağlantı kontrol edilemedi" });
    } finally {
      setCheckLoading(false);
    }
  }

  const PRODUCT_EXPORT_COLUMNS = [
    "Name",
    "NameArabic",
    "NameTurkish",
    "SKU",
    "Category",
    "Price",
    "VATPercent",
    "Till",
    "Printers",
    "Modifiers",
    "OverdueMinutes",
    "ImageURL",
  ] as const;

  function downloadProductsTemplate() {
    const rows = [
      {
        Name: "Örnek Ürün",
        NameArabic: "",
        NameTurkish: "",
        SKU: "SKU001",
        Category: "Beverages",
        Price: 25.5,
        VATPercent: 5,
        Till: "On",
        Printers: "Kitchen, Bar",
        Modifiers: "Size, Breakfast extra",
        OverdueMinutes: 10,
        ImageURL: "",
      },
      {
        Name: "İkinci Ürün",
        NameArabic: "",
        NameTurkish: "",
        SKU: "SKU002",
        Category: "Food",
        Price: 15,
        VATPercent: 5,
        Till: "On",
        Printers: "Kitchen",
        Modifiers: "",
        OverdueMinutes: "",
        ImageURL: "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...PRODUCT_EXPORT_COLUMNS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products_import_template.xlsx");
  }

  function exportProductsToExcel() {
    if (!products.length) {
      alert("Export edilecek urun yok");
      return;
    }
    const printerById = new Map(
      (Array.isArray(printers) ? printers : []).map((pr: { id?: string; name?: string }) => [pr?.id ?? "", pr?.name ?? ""])
    );
    const modifierById = new Map(modifierGroups.map((mg) => [mg.id, mg.name]));
    const rows = products.map((p) => {
      const printerIds = Array.isArray(p.printers) ? p.printers : [];
      const modifierIds = toModifierIds(p.modifier_groups) || [];
      const printerNames = printerIds.map((id) => printerById.get(id)).filter(Boolean) as string[];
      const modifierNames = modifierIds.map((id) => modifierById.get(id)).filter(Boolean) as string[];
      return {
        Name: p.name ?? "",
        NameArabic: p.name_arabic ?? "",
        NameTurkish: p.name_turkish ?? "",
        SKU: p.sku ?? "",
        Category: p.category ?? "",
        Price: p.price ?? 0,
        VATPercent: (p.tax_rate ?? 0) * 100,
        Till: Boolean(p.pos_enabled) ? "On" : "Off",
        Printers: printerNames.join(", "),
        Modifiers: modifierNames.join(", "),
        OverdueMinutes: p.overdue_undelivered_minutes ?? "",
        ImageURL: p.image_url ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...PRODUCT_EXPORT_COLUMNS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products.xlsx");
  }

  function parseRowToPayload(row: Record<string, unknown>, existing?: Product) {
    const name = String(row.Name ?? row.name ?? "").trim();
    const nameArabic = String(row.NameArabic ?? row.name_arabic ?? "").trim();
    const nameTurkish = String(row.NameTurkish ?? row.name_turkish ?? "").trim();
    const sku = String(row.SKU ?? row.sku ?? "").trim();
    const priceRaw = row.Price ?? row.price ?? 0;
    const taxRaw = row.VATPercent ?? row.tax_rate ?? 0;
    const categoryName = String(row.Category ?? row.category ?? "").trim();
    const tillRaw = String(row.Till ?? row.pos_enabled ?? "").toLowerCase();
    const printerStr = String(row.Printers ?? row.printers ?? "").trim();
    const modifierStr = String(row.Modifiers ?? row.Modifierler ?? row.modifiers ?? row.modifier_groups ?? "").trim();
    const overdueRaw = row.OverdueMinutes ?? row.overdue_undelivered_minutes ?? row.dk ?? "";
    const imageUrl = String(row.ImageURL ?? row.image_url ?? "").trim();

    const price = Number(priceRaw) || 0;
    const tax_rate = (Number(taxRaw) || 0) / 100;
    const pos_enabled = tillRaw === "on" || tillRaw === "1" || tillRaw === "true" || tillRaw === "yes";
    const overdue_undelivered_minutes =
      overdueRaw === "" || overdueRaw === null || overdueRaw === undefined
        ? undefined
        : Math.min(1440, Math.max(1, Number(overdueRaw) || 0)) || undefined;

    let category_id: string | undefined = undefined;
    if (categoryName) {
      const cat = categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
      if (cat) category_id = cat.id;
    }

    const printerNames = printerStr ? printerStr.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
    const modifierNames = modifierStr ? modifierStr.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
    const printerIds = printerNames
      .map((n) => printers.find((pr) => (pr.name || "").trim().toLowerCase() === n.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));
    const modifierIds = modifierNames
      .map((n) => modifierGroups.find((mg) => (mg.name || "").trim().toLowerCase() === n.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));

    return {
      name,
      name_arabic: nameArabic || undefined,
      name_turkish: nameTurkish || undefined,
      sku,
      price,
      tax_rate,
      category_id: (category_id ?? existing?.category_id) ?? undefined,
      image_url: imageUrl || (existing?.image_url ?? ""),
      printers: printerIds.length > 0 ? printerIds : (existing?.printers ?? []),
      modifier_groups: modifierIds.length > 0 ? modifierIds : (existing?.modifier_groups ?? []),
      pos_enabled,
      overdue_undelivered_minutes,
    };
  }

  function payloadDiffersFromProduct(payload: ReturnType<typeof parseRowToPayload>, p: Product): boolean {
    const same = (a: unknown, b: unknown) =>
      String(a ?? "") === String(b ?? "") ||
      (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));
    return (
      payload.price !== (p.price ?? 0) ||
      Math.abs((payload.tax_rate ?? 0) - (p.tax_rate ?? 0)) > 0.001 ||
      payload.category_id !== (p.category_id ?? undefined) ||
      payload.pos_enabled !== Boolean(p.pos_enabled) ||
      payload.image_url !== (p.image_url ?? "") ||
      !same(payload.printers, p.printers ?? []) ||
      !same(payload.modifier_groups, toModifierIds(p.modifier_groups)) ||
      (payload.overdue_undelivered_minutes ?? null) !== (p.overdue_undelivered_minutes ?? null)
    );
  }

  async function processProductImport(rows: Record<string, unknown>[], applyUpdates: boolean) {
    setImportConflictModal(null);
    for (const row of rows) {
      const name = String(row.Name ?? row.name ?? "").trim();
      if (!name) continue;
      const existing =
        products.find((p) => p.name.trim().toLowerCase() === name.toLowerCase()) ||
        (() => {
          const sku = String(row.SKU ?? row.sku ?? "").trim();
          return sku ? products.find((p) => (p.sku || "").toLowerCase() === sku.toLowerCase()) : undefined;
        })();
      const fullPayload = parseRowToPayload(row, existing);
      if (existing && payloadDiffersFromProduct(fullPayload, existing) && !applyUpdates) continue;
      if (existing) {
        await updateProduct(existing.id, fullPayload);
      } else {
        await createProduct(fullPayload);
      }
    }
    await load(true);
    setImporting(false);
    alert(`Import tamamlandı.`);
  }

  async function handleProductImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      let wb: XLSX.WorkBook;
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        wb = XLSX.read(text, { type: "string", raw: true });
      } else {
        const data = await file.arrayBuffer();
        wb = XLSX.read(data, { type: "array" });
      }
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const conflicts: { name: string; existing: Product; row: Record<string, unknown> }[] = [];
      for (const row of rows) {
        const name = String(row.Name ?? row.name ?? "").trim();
        if (!name) continue;
        const existing =
          products.find((p) => p.name.trim().toLowerCase() === name.toLowerCase()) ||
          (() => {
            const sku = String(row.SKU ?? row.sku ?? "").trim();
            return sku ? products.find((p) => (p.sku || "").toLowerCase() === sku.toLowerCase()) : undefined;
          })();
        if (existing) {
          const fullPayload = parseRowToPayload(row, existing);
          if (payloadDiffersFromProduct(fullPayload, existing)) {
            conflicts.push({ name, existing, row });
          }
        }
      }

      if (conflicts.length > 0) {
        setImportConflictModal({
          conflicts,
          rows,
          resolve: (applyUpdates) => processProductImport(rows, applyUpdates),
        });
        return;
      }

      await processProductImport(rows, true);
    } catch (err) {
      alert((err as Error).message);
      setImporting(false);
    } finally {
      e.target.value = "";
    }
  }

  /** Modifier ve yazıcı atama şablonu indir (Excel). Kolonlar: Product (veya Ürün), Modifiers (veya Modifierler), Printers (veya Yazıcılar). */
  function downloadModifierPrinterTemplate() {
    const rows = [
      {
        Product: "Turkish Coffee",
        Modifiers: "Breakfast extra drink and breads, Size",
        Printers: "Kitchen, Bar",
      },
      {
        Product: "Croissant",
        Modifiers: "Breakfast extra drink and breads",
        Printers: "Kitchen",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ModifierPrinter");
    XLSX.writeFile(wb, "urun_modifier_yazici_sablonu.xlsx");
  }

  /** Excel/CSV ile ürünlere modifier ve yazıcı ataması. Product = ürün adı veya SKU; Modifiers/Printers = virgülle ayrılmış isimler. */
  async function handleModifierPrinterImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingModifierPrinter(true);
    try {
      let wb: XLSX.WorkBook;
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        wb = XLSX.read(text, { type: "string", raw: true });
      } else {
        const data = await file.arrayBuffer();
        wb = XLSX.read(data, { type: "array" });
      }
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      let updated = 0;
      let skipped = 0;
      for (const row of rows) {
        const productKey = String(row.Product ?? row.Ürün ?? row.product ?? row.name ?? "").trim();
        if (!productKey) {
          skipped += 1;
          continue;
        }
        const product =
          products.find((p) => (p.sku || "").trim().toLowerCase() === productKey.toLowerCase()) ??
          products.find((p) => (p.name || "").trim().toLowerCase() === productKey.toLowerCase());
        if (!product) {
          skipped += 1;
          continue;
        }
        const modStr = String(row.Modifiers ?? row.Modifierler ?? row.modifiers ?? "").trim();
        const printerStr = String(row.Printers ?? row.Yazıcılar ?? row.printers ?? "").trim();
        const modifierNames = modStr ? modStr.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
        const printerNames = printerStr ? printerStr.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : [];
        const modifierIds = modifierNames
          .map((name) => modifierGroups.find((mg) => (mg.name || "").trim().toLowerCase() === name.toLowerCase())?.id)
          .filter((id): id is string => Boolean(id));
        const printerIds = printerNames
          .map((name) => printers.find((pr) => (pr.name || "").trim().toLowerCase() === name.toLowerCase())?.id)
          .filter((id): id is string => Boolean(id));
        await updateProduct(product.id, {
          name: product.name,
          name_arabic: product.name_arabic ?? "",
          name_turkish: product.name_turkish ?? "",
          sku: product.sku ?? "",
          category_id: product.category_id ?? undefined,
          price: product.price ?? 0,
          tax_rate: product.tax_rate ?? 0,
          image_url: product.image_url ?? "",
          printers: printerIds.length > 0 ? printerIds : product.printers ?? [],
          modifier_groups: modifierIds.length > 0 ? modifierIds : product.modifier_groups ?? [],
          pos_enabled: Boolean(product.pos_enabled),
        });
        updated += 1;
      }
      await load(true);
      alert(`Modifier/yazıcı ataması: ${updated} ürün güncellendi.${skipped > 0 ? ` ${skipped} satır atlandı (ürün bulunamadı veya boş).` : ""}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImportingModifierPrinter(false);
      e.target.value = "";
    }
  }

  const filteredProducts = useMemo(() => {
    const q = (searchQuery || "").trim().toLowerCase();
    const catFilter = (categoryFilter || "").trim();
    let base = products;

    // Kategori filtresi: seçilen kategori adına göre filtrele (görünen category alanı ile tutarlı)
    if (catFilter && catFilter !== "all") {
      const cat = categories.find((c) => String(c.id) === String(catFilter) || (c.name || "").trim().toLowerCase() === catFilter.toLowerCase());
      const catNameLower = (cat?.name || "").trim().toLowerCase();
      if (catNameLower) {
        base = base.filter((p) => (p.category || "").trim().toLowerCase() === catNameLower);
      } else {
        // id ile dene
        base = base.filter((p) => p.category_id != null && String(p.category_id) === String(catFilter));
      }
    }

    // Arama: metin varsa ada, SKU, kategori, Arapça/Türkçe ada göre filtrele
    if (!q) return base;
    return base.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.name_arabic || "").toLowerCase().includes(q) ||
        (p.name_turkish || "").toLowerCase().includes(q)
    );
  }, [products, searchQuery, categoryFilter, categories]);

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    if (sortBy === "category") {
      list.sort((a, b) => {
        const hasCatA = !!(a.category_id || (a.category || "").trim());
        const hasCatB = !!(b.category_id || (b.category || "").trim());
        if (hasCatA !== hasCatB) return hasCatA ? -1 : 1;
        const catA = (a.category || "").trim();
        const catB = (b.category || "").trim();
        return catA.localeCompare(catB);
      });
    } else if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "price") list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    return list;
  }, [filteredProducts, sortBy]);

  if (loadError) {
    return (
      <div className="p-6">
        <p className="text-amber-400 mb-4">{loadError}</p>
        <p className="text-slate-400 text-sm mb-4">Backend çalışıyor mu? <code className="bg-slate-800 px-1 rounded">cd backend && npm run dev</code></p>
        <button onClick={() => load()} className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white">Tekrar Dene</button>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-[1920px] mx-auto">
      <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-sky-400">Products</h1>
          <p className="text-slate-400">Add, edit, delete products. Zoho sync ile ürünler güncellenir; Zoho'da kaldırılanlar &quot;silinecek önerisi&quot; olarak listelenir, onay verene kadar satışta kalır.</p>
          <p className="text-slate-500 text-sm mt-1">Excel veya CSV: Örnek dosyayı indir, doldur, yükle.</p>
          {lastSync && <p className="text-slate-500 text-sm mt-1">Last sync: {lastSync}</p>}
          {zohoCheckResult && (
            <p className={`text-sm mt-1 ${zohoCheckResult.ok ? "text-emerald-400" : "text-amber-400"}`}>
              {zohoCheckResult.ok
                ? `Zoho: ${zohoCheckResult.itemsCount} ürün, ${zohoCheckResult.groupsCount} grup bulundu.`
                : `Zoho: ${zohoCheckResult.error || "Bağlantı yok"}`}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleProductImport}
          />
          <button
            onClick={downloadProductsTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium"
            title="Import için Excel şablonu indir"
          >
            <FileDown className="w-4 h-4" /> Örnek dosya indir
          </button>
          <button
            onClick={exportProductsToExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium disabled:opacity-50"
          >
            {importing ? (
              <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            Yükle (Excel/CSV)
          </button>
          <button onClick={checkZoho} disabled={checkLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white font-medium" title="Zoho bağlantısını ve ürün sayısını kontrol et">
            {checkLoading ? "Kontrol..." : "Zoho Kontrol"}
          </button>
          <button onClick={syncFromZoho} disabled={syncLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium" title="Zoho'da yapılan değişiklikleri uygula (ürünler Zoho'dan senkronize edilir)">
            <RefreshCw className={`w-4 h-4 ${syncLoading ? "animate-spin" : ""}`} /> Zoho Sync
          </button>
          <button onClick={() => openEdit()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">
            <Plus className="w-4 h-4" /> New Product
          </button>
        </div>
      </div>

      <div className="mb-6 p-4 rounded-lg border border-amber-700/50 bg-amber-950/20">
        <h2 className="text-lg font-semibold text-amber-400 mb-2">Ürünlere modifier ve yazıcı atama (Excel/CSV)</h2>
        <p className="text-slate-400 text-sm mb-3">
          Şablonu indir, <strong>Product</strong> (ürün adı veya SKU), <strong>Modifiers</strong> (virgülle ayrılmış modifier grupları), <strong>Printers</strong> (virgülle ayrılmış yazıcılar) sütunlarını doldurup yükleyin. Sadece eşleşen ürünler güncellenir.
        </p>
        <input
          ref={modifierPrinterFileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleModifierPrinterImport}
        />
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={downloadModifierPrinterTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium"
            title="Modifier ve yazıcı atama şablonu"
          >
            <FileDown className="w-4 h-4" /> Örnek dosya indir
          </button>
          <button
            type="button"
            onClick={() => modifierPrinterFileInputRef.current?.click()}
            disabled={importingModifierPrinter}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-medium disabled:opacity-50"
          >
            {importingModifierPrinter ? (
              <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            Modifier &amp; yazıcı yükle (Excel/CSV)
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            autoComplete="off"
            role="searchbox"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ürün adı, SKU veya kategori ile ara..."
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Category:</label>
          <select
            value={categoryFilter === "" ? "all" : categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value || "all")}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
          >
            <option value="all">All</option>
            {categories.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "category" | "name" | "price")}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
          >
            <option value="category">Category</option>
            <option value="name">Name</option>
            <option value="price">Price</option>
          </select>
        </div>
      </div>

      {selectedProductIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
          <span className="text-slate-300 text-sm">{selectedProductIds.size} ürün seçili</span>
          <button
            type="button"
            onClick={bulkDeleteProducts}
            disabled={deleteLoading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium text-sm"
          >
            {deleteLoading ? "..." : "Seçilenleri sil"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedProductIds(new Set())}
            className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-sm"
          >
            Seçimi kaldır
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-700 mb-8 relative min-h-[120px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10 rounded-lg">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <table className="w-full min-w-[900px] table-fixed">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left p-3 font-medium w-10" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={sortedProducts.length > 0 && selectedProductIds.size === sortedProducts.length}
                  onChange={selectAllProducts}
                  className="rounded border-slate-500"
                  title="Tümünü seç / kaldır"
                />
              </th>
              <th className="text-left p-3 font-medium w-14">Görsel</th>
              <th className="text-left p-3 font-medium min-w-[140px]">Product</th>
              <th className="text-left p-3 font-medium min-w-[90px]">SKU</th>
              <th className="text-left p-3 font-medium min-w-[120px]">Category</th>
              <th className="text-left p-3 font-medium w-20">Price</th>
              <th className="text-left p-3 font-medium w-24">Sellable</th>
              <th className="text-left p-3 font-medium w-20">Till</th>
              <th className="text-left p-3 font-medium w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((p) => (
              <tr
                key={p.id}
                className="border-b border-slate-700/50 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => openEdit(p)}
              >
                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedProductIds.has(p.id)}
                    onChange={() => toggleProductSelection(p.id)}
                    className="rounded border-slate-500"
                  />
                </td>
                <td className="p-2">
                  <div className="relative w-12 h-12 rounded-lg bg-slate-700 overflow-hidden flex items-center justify-center">
                    <span className="text-slate-500 text-xs">—</span>
                    {p.image_url && (
                      <img src={p.image_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover z-10" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                  </div>
                </td>
                <td className="p-3 truncate" title={p.name}>{p.name}</td>
                <td className="p-3 text-slate-400">{p.sku || "—"}</td>
                <td className="p-3 truncate" title={p.category || ""}>{p.category || "—"}</td>
                <td className="p-3">{p.price?.toFixed(2)}</td>
                <td className="p-3 text-slate-400 font-mono text-sm" title={p.sellable_from_api === undefined || p.sellable_from_api === null ? "API yanıtında Sellable alanı yok" : ""}>
                  {p.sellable_from_api === undefined || p.sellable_from_api === null ? "—" : String(p.sellable_from_api)}
                </td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => toggleShowInTill(p)}
                    className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${Boolean(p.pos_enabled) ? "bg-emerald-600" : "bg-slate-600"}`}
                    title={Boolean(p.pos_enabled) ? "Till'de göster (Off yap)" : "Till'de gizle (On yap)"}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${Boolean(p.pos_enabled) ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <span className="ml-2 text-xs text-slate-500">{Boolean(p.pos_enabled) ? "On" : "Off"}</span>
                </td>
                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => remove(p.id)} className="p-1.5 rounded bg-slate-700 hover:bg-red-600/30 text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingRemoval.length > 0 && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-4 mb-8">
          <h2 className="text-lg font-semibold text-amber-400 mb-2">Zoho'da artık yok (silinecek önerisi)</h2>
          <p className="text-slate-400 text-sm mb-3">Bu ürünler Zoho Books’ta kaldırılmış. Onay verene kadar satışta kalır; silmek için işaretleyip &quot;Seçilenleri sil&quot; deyin.</p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={selectAllRemoval}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
            >
              {selectedRemovalIds.size === pendingRemoval.length ? "Seçimi kaldır" : "Tümünü seç"}
            </button>
            <button
              type="button"
              onClick={confirmRemoval}
              disabled={selectedRemovalIds.size === 0 || removalLoading}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-medium"
            >
              {removalLoading ? "..." : `Seçilenleri sil (${selectedRemovalIds.size})`}
            </button>
          </div>
          <div className="overflow-x-auto rounded border border-slate-700">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="text-left p-2 w-10">
                    <input
                      type="checkbox"
                      checked={pendingRemoval.length > 0 && selectedRemovalIds.size === pendingRemoval.length}
                      onChange={selectAllRemoval}
                      className="rounded border-slate-500"
                    />
                  </th>
                  <th className="text-left p-2 font-medium">Ürün</th>
                  <th className="text-left p-2 font-medium">SKU</th>
                  <th className="text-left p-2 font-medium">Kategori</th>
                  <th className="text-left p-2 font-medium">Fiyat</th>
                </tr>
              </thead>
              <tbody>
                {pendingRemoval.map((p) => (
                  <tr key={p.id} className="border-b border-slate-700/50 hover:bg-slate-800/30">
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedRemovalIds.has(p.id)}
                        onChange={() => toggleRemovalSelection(p.id)}
                        className="rounded border-slate-500"
                      />
                    </td>
                    <td className="p-2 truncate max-w-[200px]" title={p.name}>{p.name}</td>
                    <td className="p-2 text-slate-400">{p.sku || "—"}</td>
                    <td className="p-2 truncate max-w-[120px]" title={p.category || ""}>{p.category || "—"}</td>
                    <td className="p-2">{(p.price ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {importConflictModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold text-amber-400 mb-2">Upload çakışması</h2>
            <p className="text-slate-400 text-sm mb-4">
              {importConflictModal.conflicts.length} ürün zaten mevcut ve upload dosyasındaki bilgiler farklı. Upload verisiyle güncellemek istiyor musunuz?
            </p>
            <div className="flex-1 overflow-y-auto mb-4 max-h-[300px] rounded border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Ürün</th>
                    <th className="text-left p-2 font-medium text-slate-500">Mevcut ↔ Upload</th>
                  </tr>
                </thead>
                <tbody>
                  {importConflictModal.conflicts.map((c, i) => (
                    <tr key={i} className="border-b border-slate-700/50">
                      <td className="p-2 font-medium">{c.name}</td>
                      <td className="p-2 text-slate-400 text-xs">
                        Fiyat: {(c.existing.price ?? 0).toFixed(2)} ↔ {Number(c.row.Price ?? c.row.price ?? 0).toFixed(2)} · vb.
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => importConflictModal.resolve(true)}
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                Evet, upload ile güncelle
              </button>
              <button
                type="button"
                onClick={() => importConflictModal.resolve(false)}
                className="flex-1 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-medium"
              >
                Hayır, çakışanları atla
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportConflictModal(null);
                  setImporting(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {editing !== undefined && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-sky-400 mb-4">{editing ? "Edit Product" : "New Product"}</h2>
            <div className="space-y-4">
              {!editing && (
                <button
                  type="button"
                  onClick={loadZohoItems}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-400 border border-emerald-500/50"
                >
                  <BookOpen className="w-4 h-4" />
                  Select from Zoho Books
                </button>
              )}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Product name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                  placeholder="Product name"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">SKU (Zoho)</label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                  placeholder="SKU"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Görsel URL</label>
                <input
                  value={form.image_url}
                  onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                  placeholder="https://..."
                />
                {form.image_url && (
                  <img src={form.image_url} alt="Önizleme" className="mt-2 w-16 h-16 object-cover rounded border border-slate-600" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Category</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                >
                  <option value="">Select</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Price (AED)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">VAT (%)</label>
                <input
                  type="number"
                  value={form.tax_rate}
                  onChange={(e) => setForm((f) => ({ ...f, tax_rate: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Masaya gitmeyen ürün uyarı süresi (dakika)</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  placeholder="Boş = kategori / varsayılan"
                  value={form.overdue_undelivered_minutes === "" ? "" : form.overdue_undelivered_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, overdue_undelivered_minutes: e.target.value === "" ? "" : (parseInt(e.target.value, 10) || 0) }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                />
                <p className="text-slate-500 text-xs mt-1">Varsa kategorideki ve varsayılan süre yok sayılır; sadece bu ürün için bu dakika kullanılır. Boş = kategorideki süre, o da yoksa Ayarlar’daki varsayılan (10 dk).</p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Printers</label>
                <div className="flex flex-wrap gap-2">
                  {printers.map((pr) => (
                    <button
                      key={pr.id}
                      type="button"
                      onClick={() => togglePrinter(pr.id)}
                      className={`px-3 py-1 rounded-lg text-sm ${form.printers.includes(pr.id) ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-400"}`}
                    >
                      {pr.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Modifier Groups</label>
                <div className="flex flex-wrap gap-2">
                  {modifierGroups.length === 0 ? (
                    <p className="text-slate-500 text-sm">No modifiers. <Link href="/modifiers" className="text-sky-400 hover:underline">Add from Modifiers page</Link></p>
                  ) : (
                    modifierGroups.map((mg) => (
                      <button
                        key={mg.id}
                        type="button"
                        onClick={() => toggleModifierGroup(mg.id)}
                        className={`px-3 py-1 rounded-lg text-sm ${form.modifier_groups.includes(mg.id) ? "bg-amber-600 text-white" : "bg-slate-700 text-slate-400"}`}
                      >
                        {mg.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <span className="text-sm text-slate-300">Show in Till</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, pos_enabled: !f.pos_enabled }))}
                  className={`w-12 h-6 rounded-full transition-colors ${form.pos_enabled ? "bg-emerald-600" : "bg-slate-600"}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.pos_enabled ? "translate-x-6" : "translate-x-1"}`} style={{ marginTop: 2 }} />
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={save} className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">
                Save
              </button>
              <button onClick={() => setEditing(undefined)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showZohoPicker && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-2xl w-full max-h-[80vh] flex flex-col">
            <h2 className="text-xl font-bold text-sky-400 mb-4">Zoho Books Products</h2>
            {zohoLoading ? (
              <p className="text-slate-400 py-8 text-center">Loading...</p>
            ) : zohoItems.length === 0 ? (
              <p className="text-slate-400 py-8 text-center">No products found or Zoho connection not configured.</p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {zohoItems.map((item) => (
                  <button
                    key={item.item_id}
                    onClick={() => selectZohoItem(item)}
                    className="w-full flex justify-between items-center p-4 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left"
                  >
                    <div>
                      <p className="font-medium text-white">{item.name}</p>
                      {item.sku && <p className="text-slate-400 text-sm">SKU: {item.sku}</p>}
                    </div>
                    <p className="text-sky-400 font-medium">{item.rate?.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowZohoPicker(false)} className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
