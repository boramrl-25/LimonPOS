"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Search, RefreshCw, Settings2, X } from "lucide-react";
import { getTables, getFloorPlanSections, updateFloorPlanSections, getOrder, type FloorPlanSections, type Order } from "@/lib/api";

type Table = {
  id: string;
  number: string;
  name: string;
  floor: string;
  status: string;
  waiter_name?: string;
  current_order_id?: string | null;
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

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const t = setInterval(load, 5000); // her 5 sn'de bir güncelle (orijinal, stabil ayar)
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      const [tbls, secs] = await Promise.all([getTables(), getFloorPlanSections()]);
      setTables(tbls);
      setSections(secs);
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  const onMain = tables.filter((t) => (t.floor || "Main") === "Main");
  const filtered = onMain.filter((t) => {
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
  });

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
    bill: "bg-blue-900/40 border-blue-500",
    reserved: "bg-slate-700/60 border-slate-500",
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

  function minsAgo(sentAt: number | null): string {
    if (sentAt == null) return "";
    const mins = Math.floor((Date.now() - sentAt) / 60000);
    if (mins < 1) return "Just now";
    if (mins === 1) return "1 min ago";
    return `${mins} min ago`;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard" className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-white">Floor Plan</h1>
      </div>
      <p className="text-slate-400 text-sm mb-4">
        Tables sync to the app. Sections A–E act as filters. Edit section table numbers below.
      </p>

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
        <button onClick={() => load()} disabled={loading} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex gap-4 mb-4 text-sm text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Free</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Occupied</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Bill</span>
      </div>

      {loading ? (
        <div className="text-slate-400 py-12 text-center">Loading...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openTableOrder(t)}
              className={`aspect-[0.9] rounded-xl border-2 flex flex-col items-center justify-center p-3 text-left ${statusColors[t.status] || "bg-slate-800 border-slate-600"} hover:ring-2 hover:ring-sky-400 transition-all`}
            >
              <span className="font-bold text-white text-lg">{t.number}</span>
              <span className="text-xs mt-1 font-medium">
                {t.status === "free" && "Free"}
                {t.status === "occupied" && "Occupied"}
                {t.status === "bill" && "Bill"}
                {t.status === "reserved" && "Reserved"}
                {t.waiter_name && ` — ${t.waiter_name}`}
              </span>
            </button>
          ))}
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
              <p className="text-slate-400 text-sm mb-3">Sent to kitchen = mutfakta; Not sent = henüz gönderilmedi</p>
              <ul className="space-y-3">
                {(selectedTableOrder.order.items || []).map((item) => {
                  const sent = item.status === "sent" && item.sent_at != null;
                  const ago = minsAgo(item.sent_at ?? null);
                  return (
                    <li key={item.id} className={`flex justify-between items-start py-2 border-b border-slate-700/50 ${sent ? "text-slate-200" : "text-amber-200"}`}>
                      <div>
                        <span className="font-medium">{item.product_name}</span>
                        {item.quantity > 1 && <span className="text-slate-400 ml-1">×{item.quantity}</span>}
                        {item.notes && <span className="text-slate-500 text-sm block">{item.notes}</span>}
                      </div>
                      <div className="text-right text-sm">
                        {sent ? (
                          <span className="text-emerald-400">Sent to kitchen — {ago}</span>
                        ) : (
                          <span className="text-amber-400">Not sent to kitchen</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {(selectedTableOrder.order.items || []).length === 0 && (
                <p className="text-slate-500 text-center py-4">No items in this order yet.</p>
              )}
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
    </div>
  );
}
