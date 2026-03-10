"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { ArrowLeft, Search, RefreshCw, Settings2, X, Calendar, Upload, Download, Trash2, Plus } from "lucide-react";
import { getTables, getFloorPlanSections, updateFloorPlanSections, getOrder, getOverdueTableIds, reserveTable, cancelTableReservation, deleteTable, importTables, createTable, importFloorPlanSections, type FloorPlanSections, type Order, type TableReservation } from "@/lib/api";
import {
  FLOOR_LEGEND,
  DELAYED_ITEMS_TITLE,
  getItemStatusText,
  getItemStatusKind,
  isItemDelayed,
  getDelayLabel,
  TOAST_TABLE_DELAYED,
} from "@/lib/floorStatusStrings";

type Table = {
  id: string;
  number: string | number;
  name: string;
  floor: string;
  status: string;
  waiter_name?: string;
  current_order_id?: string | null;
  reservation?: TableReservation;
};

const SECTIONS = ["A", "B", "C", "D", "E"] as const;

export default function FloorPlanPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [sections, setSections] = useState<FloorPlanSections>({ A: [], B: [], C: [], D: [], E: [] });
  const [selectedSection, setSelectedSection] = useState<string>("Main");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [editSection, setEditSection] = useState<string | null>(null);
  const [addNum, setAddNum] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedTableOrder, setSelectedTableOrder] = useState<{ table: Table; order: Order } | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [reserveTableModal, setReserveTableModal] = useState<Table | null>(null);
  const [reservationInfoModal, setReservationInfoModal] = useState<Table | null>(null);
  const [reserveLoading, setReserveLoading] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [tableIdsWithOverdue, setTableIdsWithOverdue] = useState<string[]>([]);
  const [overdueMinutes, setOverdueMinutes] = useState(10);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Table | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [addTableNum, setAddTableNum] = useState("");
  const [addTableName, setAddTableName] = useState("");
  const [addTableSection, setAddTableSection] = useState("A");
  const [addTableCapacity, setAddTableCapacity] = useState("4");
  const [addingTable, setAddingTable] = useState(false);
  const [importingFilters, setImportingFilters] = useState(false);
  const overdueCooldownMs = 2 * 60 * 1000; // 2 min same table
  const lastOverdueWarningAt = useRef<Record<string, number>>({});
  const prevOverdueTableIds = useRef<string[]>([]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = setInterval(load, 10000); // her 10 sn'de bir güncelle
    return () => clearInterval(t);
  }, []);

  // Sound + toast when a table first has delayed items; cooldown per table to avoid spam
  useEffect(() => {
    const prev = prevOverdueTableIds.current;
    const now = Date.now();
    const added = tableIdsWithOverdue.filter((id) => !prev.includes(id));
    for (const tableId of added) {
      const last = lastOverdueWarningAt.current[tableId] ?? 0;
      if (now - last >= overdueCooldownMs) {
        lastOverdueWarningAt.current[tableId] = now;
        const table = tables.find((t) => t.id === tableId);
        const tableNum = table?.number ?? tableId;
        setToastMessage(TOAST_TABLE_DELAYED(tableNum));
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          osc.type = "sine";
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.15);
        } catch {
          // ignore if AudioContext not allowed (e.g. autoplay policy)
        }
      }
    }
    prevOverdueTableIds.current = tableIdsWithOverdue;
  }, [tableIdsWithOverdue, tables, overdueCooldownMs]);

  async function load() {
    try {
      const [tbls, secs, overdue] = await Promise.all([getTables(), getFloorPlanSections(), getOverdueTableIds()]);
      setTables(tbls);
      setSections(secs);
      setTableIdsWithOverdue(overdue.tableIds);
      setOverdueMinutes(overdue.overdueMinutes);
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  const onMain = tables.filter((t) => (t.floor || "Main") === "Main");
  const filtered = onMain
    .filter((t) => {
      const num = parseInt(String(t.number), 10);
      if (selectedSection !== "Main") {
        const secNums = sections[selectedSection as keyof FloorPlanSections] || [];
        if (!secNums.includes(num)) return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!String(t.number).toLowerCase().includes(q) && !String(t.name || "").toLowerCase().includes(q))
          return false;
      }
      return true;
    })
    .sort((a, b) => parseInt(String(a.number), 10) - parseInt(String(b.number), 10));

  function downloadSectionFiltersTemplate() {
    const rows = [
      { Section: "A", TableNumbers: "1,2,3,4,5,6,7,8,9" },
      { Section: "B", TableNumbers: "10,11,12,13,14,15,16,17,18" },
      { Section: "C", TableNumbers: "19,20,21,22,23,24,25,26,27" },
      { Section: "D", TableNumbers: "28,29,30,31,32,33,34,35,36" },
      { Section: "E", TableNumbers: "37,38,39,40,41,42,43" },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SectionFilters");
    XLSX.writeFile(wb, "bolum_filtre_sablonu.xlsx");
  }

  async function handleSectionFiltersImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingFilters(true);
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
      await importFloorPlanSections(rows);
      await load();
      setToastMessage("Bölüm filtreleri içe aktarıldı.");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImportingFilters(false);
      e.target.value = "";
    }
  }

  function downloadTablesTemplate() {
    const rows = [
      { Number: 1, Name: "Table 1", Section: "A", Capacity: 4, X: 80, Y: 50, Width: 80, Height: 80 },
      { Number: 2, Name: "Table 2", Section: "A", Capacity: 4, X: 170, Y: 50, Width: 80, Height: 80 },
      { Number: 10, Name: "Table 10", Section: "B", Capacity: 6, X: 80, Y: 150, Width: 80, Height: 80 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tables");
    XLSX.writeFile(wb, "masa_floor_plan_sablonu.xlsx");
  }

  async function handleTablesImport(e: React.ChangeEvent<HTMLInputElement>) {
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
      const result = await importTables(rows);
      await load();
      setToastMessage(`İçe aktarma tamamlandı: ${result.created} oluşturuldu, ${result.updated} güncellendi.`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function submitAddTable() {
    const num = parseInt(addTableNum, 10);
    if (isNaN(num) || num < 1) {
      alert("Geçerli bir masa numarası girin (1 veya üzeri)");
      return;
    }
    setAddingTable(true);
    try {
      await createTable({
        number: num,
        name: addTableName.trim() || `Masa ${num}`,
        floor: "Main",
        capacity: parseInt(addTableCapacity, 10) || 4,
      });
      const newSections = { ...sections };
      const arr = newSections[addTableSection as keyof FloorPlanSections] || [];
      if (!arr.includes(num)) {
        newSections[addTableSection as keyof FloorPlanSections] = [...arr, num].sort((a, b) => a - b);
        setSections(newSections);
        await updateFloorPlanSections(newSections);
      }
      setAddTableOpen(false);
      setAddTableNum("");
      setAddTableName("");
      setAddTableCapacity("4");
      await load();
      setToastMessage(`Masa ${num} eklendi.`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setAddingTable(false);
    }
  }

  function requestDeleteTable(t: Table) {
    setDeleteConfirm(t);
  }

  async function confirmDeleteTable() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteTable(deleteConfirm.id);
      setDeleteConfirm(null);
      setDeleteMode(false);
      await load();
      setToastMessage(`Masa ${deleteConfirm.number} silindi.`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  function addToSection(key: string) {
    const n = parseInt(addNum, 10);
    if (isNaN(n) || n < 1 || n > 43) return;
    const k = key as keyof FloorPlanSections;
    const arr = [...(sections[k] || [])];
    if (arr.includes(n)) return;
    arr.push(n);
    arr.sort((a, b) => a - b);
    setSections((s) => ({ ...s, [k]: arr }));
    setAddNum("");
  }

  function removeFromSection(key: string, n: number) {
    const k = key as keyof FloorPlanSections;
    setSections((s) => ({
      ...s,
      [k]: (s[k] || []).filter((x) => x !== n),
    }));
  }

  async function saveSections() {
    setSaving(true);
    try {
      await updateFloorPlanSections(sections);
      setManageOpen(false);
      setEditSection(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const statusColors: Record<string, string> = {
    free: "bg-emerald-900/60 border-emerald-500",
    occupied: "bg-amber-900/40 border-amber-500",
    bill: "bg-sky-900/40 border-sky-500",
    reserved: "bg-blue-600/50 border-blue-400",
  };

  async function openTableOrder(t: Table) {
    if (!t.current_order_id) return;
    setOrderLoading(true);
    try {
      const order = await getOrder(t.current_order_id);
      setSelectedTableOrder({ table: t, order });
    } catch {
      setSelectedTableOrder(null);
    } finally {
      setOrderLoading(false);
    }
  }

  function onTableClick(t: Table) {
    if (deleteMode) {
      requestDeleteTable(t);
      return;
    }
    if (t.status === "free") {
      setReserveTableModal(t);
      setReserveError(null);
    } else if (t.status === "reserved") {
      setReservationInfoModal(t);
      setReserveError(null);
    } else if (t.current_order_id) {
      openTableOrder(t);
    }
  }

  async function submitReserve(guestName: string, guestPhone: string, fromTime: number, toTime: number) {
    if (!reserveTableModal) return;
    setReserveLoading(true);
    setReserveError(null);
    try {
      await reserveTable(reserveTableModal.id, { guest_name: guestName, guest_phone: guestPhone || undefined, from_time: fromTime, to_time: toTime });
      setReserveTableModal(null);
      load();
    } catch (e) {
      setReserveError(e instanceof Error ? e.message : "Failed to reserve");
    } finally {
      setReserveLoading(false);
    }
  }

  async function onCancelReservation() {
    if (!reservationInfoModal) return;
    setReserveLoading(true);
    setReserveError(null);
    try {
      await cancelTableReservation(reservationInfoModal.id);
      setReservationInfoModal(null);
      load();
    } catch (e) {
      setReserveError(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setReserveLoading(false);
    }
  }

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {toastMessage && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-lg bg-amber-600 text-white font-medium shadow-lg flex items-center gap-3 max-w-md"
        >
          <span className="flex-1">{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="p-1 rounded hover:bg-amber-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard" className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
      </div>
      <p className="text-slate-400 text-sm mb-4">
        Tables sync to the app. Sections A–E act as filters. Edit section table numbers below.
        {deleteMode && <span className="block mt-2 text-amber-400">Masa silmek için silmek istediğiniz masaya tıklayın.</span>}
      </p>

      {/* Masa Ekleme - Toplu Import */}
      <div className="mb-6 p-4 rounded-xl bg-slate-800/80 border border-slate-600">
        <h3 className="text-lg font-semibold text-white mb-3">Masa Ekleme</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setAddTableOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium"
          >
            <Plus className="w-4 h-4" />
            Masa Ekle
          </button>
          <button onClick={downloadTablesTemplate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium">
            <Download className="w-4 h-4" />
            Template İndir
          </button>
          <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>{importing ? "İçe aktarılıyor..." : "Toplu İçe Aktar (CSV/Excel)"}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleTablesImport} disabled={importing} />
          </label>
        </div>
        <p className="text-slate-400 text-xs mt-2">Template indir → Excel/CSV doldur → Toplu İçe Aktar ile yükle</p>
        <div className="mt-4 pt-4 border-t border-slate-600">
          <h4 className="text-sm font-medium text-slate-300 mb-2">Bölüm Filtreleri (A, B, C, D, E)</h4>
          <div className="flex flex-wrap gap-3">
            <button onClick={downloadSectionFiltersTemplate} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">
              <Download className="w-4 h-4" />
              Filtre Template İndir
            </button>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{importingFilters ? "..." : "Filtre İçe Aktar (CSV/Excel)"}</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleSectionFiltersImport} disabled={importingFilters} />
            </label>
          </div>
          <p className="text-slate-500 text-xs mt-1">Section, TableNumbers kolonları. Örn: A | 1,2,3,4,5</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["Main", ...SECTIONS].map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSection(s)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedSection === s
                  ? "bg-sky-500 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setManageOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
        >
          <Settings2 className="w-4 h-4" />
          Manage Sections
        </button>
        <button
          onClick={() => { setDeleteMode(!deleteMode); setDeleteConfirm(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg ${deleteMode ? "bg-red-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
        >
          <Trash2 className="w-4 h-4" />
          {deleteMode ? "İptal" : "Masa Sil"}
        </button>
        <button onClick={() => load()} disabled={loading} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-4 mb-4 text-sm text-slate-400 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Free</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Occupied</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" /> Reserved</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Bill</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Delayed items (pulsing)</span>
      </div>

      {loading ? (
        <div className="text-slate-400 py-12 text-center">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
          {filtered.map((t) => {
            const hasOverdue = tableIdsWithOverdue.includes(t.id);
            return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTableClick(t)}
              className={`aspect-[0.9] rounded-xl border-2 flex flex-col items-center justify-center p-3 text-left ${statusColors[t.status] || "bg-slate-800 border-slate-600"} hover:ring-2 hover:ring-sky-400 transition-all ${hasOverdue ? "ring-2 ring-red-500 animate-pulse" : ""}`}
            >
              <span className="font-bold text-white text-lg">{t.number}</span>
              {t.status === "reserved" ? (
                <>
                  <span className="text-xs mt-1 font-medium text-blue-200">Reserved</span>
                  {t.reservation?.guest_name && (
                    <span className="text-xs mt-0.5 text-white font-medium truncate max-w-full px-1">{t.reservation.guest_name}</span>
                  )}
                  {t.reservation?.guest_phone && (
                    <span className="text-xs text-slate-300 block mt-0.5">{t.reservation.guest_phone}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xs mt-1 font-medium">
                    {t.status === "free" && "Free"}
                    {t.status === "occupied" && "Occupied"}
                    {t.status === "bill" && "Bill"}
                    {t.waiter_name && ` — ${t.waiter_name}`}
                  </span>
                </>
              )}
            </button>
          );
          })}
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <p className="text-slate-400 py-8 text-center">No tables match filter</p>
      )}

      {orderLoading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 px-6 py-4 rounded-lg text-white">Loading order...</div>
        </div>
      )}

      {selectedTableOrder && !orderLoading && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTableOrder(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">
                Table {selectedTableOrder.table.number} — Cart
                {selectedTableOrder.order.waiter_name && <span className="text-slate-400 font-normal text-sm ml-2">({selectedTableOrder.order.waiter_name})</span>}
              </h2>
              <button type="button" onClick={() => setSelectedTableOrder(null)} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {(() => {
                const items = selectedTableOrder.order.items || [];
                const delayedItems = items.filter((i) => isItemDelayed(i, overdueMinutes));
                return (
                  <>
                    {delayedItems.length > 0 && (
                      <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-500/60">
                        <p className="font-medium text-red-200 text-sm mb-2">{DELAYED_ITEMS_TITLE}</p>
                        <ul className="space-y-1 text-sm">
                          {delayedItems.map((item) => (
                            <li key={item.id} className="text-red-100">
                              {item.product_name}
                              {item.quantity > 1 && ` ×${item.quantity}`}
                              <span className="text-red-300 ml-1">— {getDelayLabel(item, overdueMinutes)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-slate-400 text-sm mb-3">{FLOOR_LEGEND}</p>
                    <ul className="space-y-3">
                      {items.map((item) => {
                        const kind = getItemStatusKind(item, overdueMinutes);
                        const statusText = getItemStatusText(item, overdueMinutes);
                        const rowClass =
                          kind === "delivered"
                            ? "text-emerald-200"
                            : kind === "in_kitchen_delayed"
                              ? "text-red-200"
                              : kind === "in_kitchen"
                                ? "text-slate-200"
                                : "text-amber-200";
                        const badgeClass =
                          kind === "delivered"
                            ? "text-emerald-400 font-medium"
                            : kind === "in_kitchen_delayed"
                              ? "text-red-400 font-medium"
                              : kind === "in_kitchen"
                                ? "text-sky-400"
                                : "text-amber-400";
                        return (
                          <li key={item.id} className={`flex justify-between items-start py-2 border-b border-slate-700/50 ${rowClass}`}>
                            <div>
                              <span className="font-medium">{item.product_name}</span>
                              {item.quantity > 1 && <span className="text-slate-400 ml-1">×{item.quantity}</span>}
                              {item.notes && <span className="text-slate-500 text-sm block">{item.notes}</span>}
                            </div>
                            <div className="text-right text-sm">
                              <span className={badgeClass}>{statusText}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {items.length === 0 && (
                      <p className="text-slate-500 text-center py-4">No items in this order yet.</p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {manageOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => !saving && setManageOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-2">Section Management</h2>
            <p className="text-slate-400 text-sm mb-4">Edit table numbers per section. Tables 1–43 only. App syncs from backend.</p>
            {editSection ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="number"
                    min={1}
                    max={43}
                    placeholder="Table # (1–43)"
                    value={addNum}
                    onChange={(e) => setAddNum(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addToSection(editSection)}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                  />
                  <button onClick={() => addToSection(editSection)} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium">
                    Add
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
                  {(sections[editSection as keyof FloorPlanSections] || []).sort((a,b)=>a-b).map((n) => (
                    <div key={n} className="flex justify-between items-center py-2 border-b border-slate-700">
                      <span className="text-slate-200">Table {n}</span>
                      <button onClick={() => removeFromSection(editSection, n)} className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditSection(null)} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200">Back</button>
                  <button onClick={saveSections} disabled={saving} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium">
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {SECTIONS.map((k) => (
                  <div key={k} className="flex justify-between items-center py-2 px-3 rounded-lg bg-slate-800">
                    <span className="font-medium text-sky-400">Section {k}</span>
                    <span className="text-slate-400 text-sm">
                      {(sections[k] || []).length ? (sections[k] || []).sort((a,b)=>a-b).join(", ") : "—"}
                    </span>
                    <button onClick={() => setEditSection(k)} className="px-3 py-1 rounded bg-slate-700 text-slate-200 text-sm">Edit</button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setManageOpen(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200">Close</button>
                  <button onClick={saveSections} disabled={saving} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium">
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {reserveTableModal && (
        <ReserveTableModal
          table={reserveTableModal}
          loading={reserveLoading}
          error={reserveError}
          onClose={() => { setReserveTableModal(null); setReserveError(null); }}
          onSubmit={submitReserve}
        />
      )}

      {reservationInfoModal && (
        <ReservationInfoModal
          table={reservationInfoModal}
          loading={reserveLoading}
          error={reserveError}
          onClose={() => { setReservationInfoModal(null); setReserveError(null); }}
          onCancelReservation={onCancelReservation}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-2">Masa Sil</h2>
            <p className="text-slate-300 text-sm mb-4">
              Masa <strong>{deleteConfirm.number}</strong> silinecek. Açık sipariş varsa o da silinecek. Emin misiniz?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-200">Hayır</button>
              <button onClick={confirmDeleteTable} disabled={deleting} className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-medium">
                {deleting ? "..." : "Evet, Sil"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addTableOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => !addingTable && setAddTableOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Masa Ekle</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Masa No</label>
                <input
                  type="number"
                  min={1}
                  value={addTableNum}
                  onChange={(e) => setAddTableNum(e.target.value)}
                  placeholder="1"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Masa Adı</label>
                <input
                  type="text"
                  value={addTableName}
                  onChange={(e) => setAddTableName(e.target.value)}
                  placeholder="Masa 1"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Bölüm</label>
                <select
                  value={addTableSection}
                  onChange={(e) => setAddTableSection(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                >
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>Bölüm {s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Kapasite</label>
                <input
                  type="number"
                  min={1}
                  value={addTableCapacity}
                  onChange={(e) => setAddTableCapacity(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setAddTableOpen(false)} disabled={addingTable} className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-200">İptal</button>
              <button onClick={submitAddTable} disabled={addingTable} className="flex-1 px-4 py-2 rounded-lg bg-sky-600 text-white font-medium">
                {addingTable ? "..." : "Ekle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReserveTableModal({
  table,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  table: Table;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (guestName: string, guestPhone: string, fromTime: number, toTime: number) => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
  const defaultTo = new Date(defaultFrom.getTime() + 2 * 60 * 60 * 1000);
  const [fromStr, setFromStr] = useState(() => defaultFrom.toISOString().slice(0, 16));
  const [toStr, setToStr] = useState(() => defaultTo.toISOString().slice(0, 16));
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const from = new Date(fromStr).getTime();
    const to = new Date(toStr).getTime();
    if (!guestName.trim() || isNaN(from) || isNaN(to) || to <= from) return;
    onSubmit(guestName.trim(), guestPhone.trim(), from, to);
  };
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-sky-400" />
            Reserve Table {table.number}
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-4">Reservation is automatically cancelled 10 minutes after the end time.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Guest name</label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest name"
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:border-sky-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
            <input
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="Phone"
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">From (date & time)</label>
            <input
              type="datetime-local"
              value={fromStr}
              onChange={(e) => setFromStr(e.target.value)}
              min={defaultFrom.toISOString().slice(0, 16)}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white focus:border-sky-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">To (date & time)</label>
            <input
              type="datetime-local"
              value={toStr}
              onChange={(e) => setToStr(e.target.value)}
              min={fromStr}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white focus:border-sky-500"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {loading && <p className="text-slate-400 text-sm">Saving...</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium">Reserve</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReservationInfoModal({
  table,
  loading,
  error,
  onClose,
  onCancelReservation,
}: {
  table: Table;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onCancelReservation: () => void;
}) {
  const res = table.reservation;
  const fromStr = res?.from_time ? new Date(res.from_time).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "";
  const toStr = res?.to_time ? new Date(res.to_time).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "";
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Table {table.number} — Reserved</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2 text-slate-300 text-sm mb-4">
          {res?.guest_name && <p><span className="text-slate-400">Guest:</span> {res.guest_name}</p>}
          {res?.guest_phone && <p><span className="text-slate-400">Phone:</span> {res.guest_phone}</p>}
          {fromStr && <p><span className="text-slate-400">From:</span> {fromStr}</p>}
          {toStr && <p><span className="text-slate-400">To:</span> {toStr}</p>}
          <p className="text-slate-500 text-xs mt-2">Reservation is cancelled automatically 10 min after end time.</p>
        </div>
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        {loading && <p className="text-slate-400 text-sm mb-2">Processing...</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200">Close</button>
          <button type="button" onClick={onCancelReservation} disabled={loading} className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600">Cancel reservation</button>
        </div>
      </div>
    </div>
  );
}
