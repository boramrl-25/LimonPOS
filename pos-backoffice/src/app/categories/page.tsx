"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, GripVertical, FileSpreadsheet, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { getCategories, getModifierGroups, getPrinters, createCategory, updateCategory, deleteCategory } from "@/lib/api";

type Category = { id: string; name: string; color: string; sort_order: number; show_till?: boolean | number; modifier_groups?: string[]; printers?: string[] };

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [modifierGroups, setModifierGroups] = useState<{ id: string; name: string }[]>([]);
  const [printers, setPrinters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", color: "#84CC16", sort_order: 0, show_till: false, modifier_groups: [] as string[], printers: [] as string[] });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [cats, mgs, prts] = await Promise.all([getCategories(), getModifierGroups(), getPrinters()]);
      setCategories(cats);
      setModifierGroups(mgs.map((m) => ({ id: m.id, name: m.name })));
      setPrinters(prts);
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  function openEdit(c?: Category) {
    if (c) {
      setEditing(c);
      const mg = Array.isArray(c.modifier_groups) ? c.modifier_groups : (typeof c.modifier_groups === "string" ? (() => { try { return JSON.parse(c.modifier_groups as string); } catch { return []; } })() : []);
      const pr = Array.isArray(c.printers) ? c.printers : (typeof c.printers === "string" ? (() => { try { return JSON.parse(c.printers as string); } catch { return []; } })() : []);
      setForm({ name: c.name, color: c.color || "#84CC16", sort_order: c.sort_order ?? 0, show_till: !!(c.show_till ?? 0), modifier_groups: mg, printers: pr });
    } else {
      setEditing(null);
      setForm({ name: "", color: "#84CC16", sort_order: 0, show_till: false, modifier_groups: [], printers: [] });
    }
  }

  async function toggleShowTill(c: Category, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const next = !(c.show_till ?? 0);
    const payload = {
      name: c.name,
      color: c.color || "#84CC16",
      sort_order: c.sort_order ?? 0,
      show_till: next,
      active: true,
      modifier_groups: Array.isArray(c.modifier_groups) ? c.modifier_groups : [],
      printers: Array.isArray(c.printers) ? c.printers : [],
    };
    try {
      await updateCategory(c.id, payload);
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function togglePrinter(id: string) {
    setForm((f) => {
      const next = f.printers.includes(id)
        ? f.printers.filter((x) => x !== id)
        : [...f.printers.filter((x) => x !== id), id];
      next.sort((a, b) => {
        const ia = printers.findIndex((pr) => pr.id === a);
        const ib = printers.findIndex((pr) => pr.id === b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      return { ...f, printers: next };
    });
  }

  function toggleModifierGroup(id: string) {
    setForm((f) => ({
      ...f,
      modifier_groups: f.modifier_groups.includes(id) ? f.modifier_groups.filter((x) => x !== id) : [...f.modifier_groups, id],
    }));
  }

  async function save() {
    try {
      const payload = {
        name: form.name.trim() || "Category",
        color: form.color || "#84CC16",
        sort_order: Number(form.sort_order) || 0,
        show_till: !!form.show_till,
        active: true,
        modifier_groups: Array.isArray(form.modifier_groups) ? form.modifier_groups : [],
        printers: Array.isArray(form.printers) ? form.printers : [],
      };
      if (editing) {
        await updateCategory(editing.id, payload);
      } else {
        await createCategory(payload);
      }
      await load();
      setEditing(undefined);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Are you sure you want to delete?")) return;
    try {
      await deleteCategory(id);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function moveCategory(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= categories.length) return;
    const sorted = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const cat = sorted[index];
    const swapCat = sorted[newIndex];
    const catOrder = cat.sort_order ?? index;
    const swapOrder = swapCat.sort_order ?? newIndex;
    try {
      await updateCategory(cat.id, { ...cat, sort_order: swapOrder });
      await updateCategory(swapCat.id, { ...swapCat, sort_order: catOrder });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggedId && draggedId !== targetId) setDragOverId(targetId);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  async function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) return;
    const sorted = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const fromIndex = sorted.findIndex((c) => c.id === draggedId);
    const toIndex = sorted.findIndex((c) => c.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const reordered = [...sorted];
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);
    try {
      for (let i = 0; i < reordered.length; i++) {
        const cat = reordered[i];
        const newOrder = i;
        if ((cat.sort_order ?? 0) !== newOrder) {
          await updateCategory(cat.id, { ...cat, sort_order: newOrder });
        }
      }
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDraggedId(null);
    }
  }

  function downloadCategoriesTemplate() {
    const rows = [
      { Name: "Beverages", Color: "#84CC16", SortOrder: 0, ShowTill: "On" },
      { Name: "Food", Color: "#F59E0B", SortOrder: 1, ShowTill: "Off" },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Categories");
    XLSX.writeFile(wb, "categories_import_template.xlsx");
  }

  function exportCategoriesToExcel() {
    if (!categories.length) {
      alert("No categories to export");
      return;
    }
    const rows = sortedCategories.map((c, idx) => ({
      Name: c.name,
      Color: c.color,
      SortOrder: c.sort_order ?? idx,
      ShowTill: (c.show_till ?? 0) ? "On" : "Off",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Categories");
    XLSX.writeFile(wb, "categories.xlsx");
  }

  async function handleCategoryImport(e: React.ChangeEvent<HTMLInputElement>) {
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

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const name = String(row.Name ?? row.name ?? "").trim();
        if (!name) continue;
        const color = String(row.Color ?? row.color ?? "#84CC16");
        const sortRaw = row.SortOrder ?? row.sort_order ?? index;
        const showRaw = String(row.ShowTill ?? row.show_till ?? "").toLowerCase();

        const sort_order = Number(sortRaw) || index;
        const show_till = showRaw === "on" || showRaw === "1" || showRaw === "true" || showRaw === "yes";

        const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());

        const payload = {
          name,
          color,
          sort_order,
          show_till,
          active: true,
          modifier_groups: existing?.modifier_groups ?? [],
          printers: existing?.printers ?? [],
        };

        if (existing) {
          await updateCategory(existing.id, payload);
        } else {
          await createCategory(payload);
        }
      }

      await load();
      alert(`Imported ${rows.length} category row(s).`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  const sortedCategories = [...categories].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-sky-400">Categories</h1>
          <p className="text-slate-400">Product categories. Order determines display order in app. Drag and drop or use arrows to sort.</p>
          <p className="text-slate-500 text-sm mt-1">Excel or CSV: Download sample, fill, upload.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleCategoryImport}
          />
          <button
            onClick={downloadCategoriesTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium"
            title="Download Excel template for import"
          >
            <FileDown className="w-4 h-4" /> Download template
          </button>
          <button
            onClick={exportCategoriesToExcel}
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
            Upload (Excel/CSV)
          </button>
          <button onClick={() => openEdit()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">
            <Plus className="w-4 h-4" /> New Category
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700 mb-8 relative min-h-[120px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10 rounded-lg">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left p-4 font-medium w-12" title="Drag" />
              <th className="text-left p-4 font-medium w-20">Order</th>
              <th className="text-left p-4 font-medium">Name</th>
              <th className="text-left p-4 font-medium">Color</th>
              <th className="text-left p-4 font-medium w-24">Show till</th>
              <th className="text-left p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCategories.map((c, index) => (
              <tr
                key={c.id}
                className={`border-b border-slate-700/50 transition-colors cursor-pointer hover:bg-slate-800/50 ${
                  dragOverId === c.id ? "bg-sky-500/10 border-l-2 border-l-sky-500" : ""
                } ${draggedId === c.id ? "opacity-50" : ""}`}
                onDragOver={(e) => handleDragOver(e, c.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, c.id)}
                onClick={(e) => { if (!(e.target as HTMLElement).closest("button") && !(e.target as HTMLElement).closest("[draggable]")) openEdit(c); }}
              >
                <td className="p-2 w-12" onClick={(e) => e.stopPropagation()}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggedId(c.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
                    }}
                    onDragEnd={handleDragEnd}
                    className="cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 touch-none"
                    title="Drag to sort"
                  >
                    <GripVertical className="w-5 h-5" />
                  </div>
                </td>
                <td className="p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 tabular-nums w-6">{c.sort_order ?? index}</span>
                    <div className="flex flex-col">
                      <button type="button" onClick={() => moveCategory(index, "up")} disabled={index === 0} className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-400"><ChevronUp className="w-4 h-4" /></button>
                      <button type="button" onClick={() => moveCategory(index, "down")} disabled={index === sortedCategories.length - 1} className="p-0.5 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-400"><ChevronDown className="w-4 h-4" /></button>
                    </div>
                  </div>
                </td>
                <td className="p-4">{c.name}</td>
                <td className="p-4">
                  <span className="inline-block w-6 h-6 rounded border border-slate-600" style={{ backgroundColor: c.color }} />
                </td>
                <td className="p-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => toggleShowTill(c, e)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${(c.show_till ?? 0) ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}
                  >
                    {(c.show_till ?? 0) ? "On" : "Off"}
                  </button>
                </td>
                <td className="p-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300" title="Edit"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(c.id)} className="p-1.5 rounded bg-slate-700 hover:bg-red-600/30 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== undefined && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setEditing(undefined)}
          role="presentation"
        >
          <div
            className="bg-slate-900 rounded-xl border border-slate-700 max-w-md w-full max-h-[90vh] flex flex-col my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-sky-400 mb-4 p-6 pb-0 shrink-0">{editing ? "Edit Category" : "New Category"}</h2>
            <div className="space-y-4 p-6 flex-1 overflow-y-auto min-h-0">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" placeholder="Category name" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Color</label>
                <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="w-full h-10 rounded-lg border border-slate-600 cursor-pointer" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Sıra (App’te üstteki kategorilerde görünme sırası)</label>
                <input type="number" min={0} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" />
              </div>
              <div className="flex items-center gap-3">
                <label className="block text-sm text-slate-400">Show till</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, show_till: !f.show_till }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${form.show_till ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-400"}`}
                >
                  {form.show_till ? "On" : "Off"}
                </button>
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
                  {printers.length === 0 && <p className="text-slate-500 text-sm">No printers. Add from Printers page.</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Modifier Groups (default modifiers for this category)</label>
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
            </div>
            <div className="flex gap-2 p-6 pt-4 shrink-0 border-t border-slate-700">
              <button onClick={save} className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">Save</button>
              <button onClick={() => setEditing(undefined)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white">Cancel</button>
            </div>
          </div>
        </div>
        )}
      <div className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Category list</h2>
      </div>
    </div>
  );
}
