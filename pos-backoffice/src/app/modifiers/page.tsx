"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { getModifierGroups, createModifierGroup, updateModifierGroup, deleteModifierGroup } from "@/lib/api";

type ModifierOption = { id: string; name: string; price: number };
type ModifierGroup = { id: string; name: string; min_select?: number; max_select?: number; required?: boolean; options: ModifierOption[] };

export default function ModifiersPage() {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ModifierGroup | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", min_select: 0, max_select: 1, required: false, options: [] as ModifierOption[] });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setGroups(await getModifierGroups());
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  function openEdit(g?: ModifierGroup) {
    if (g) {
      setEditing(g);
      setForm({
        name: g.name,
        min_select: g.min_select ?? 0,
        max_select: g.max_select ?? 1,
        required: g.required ?? false,
        options: [...(g.options || [])],
      });
    } else {
      setEditing(null);
      setForm({ name: "", min_select: 0, max_select: 1, required: false, options: [] });
    }
  }

  function addOption() {
    setForm((f) => ({
      ...f,
      options: [...f.options, { id: "", name: "", price: 0 }],
    }));
  }

  function updateOption(idx: number, field: "name" | "price", val: string | number) {
    setForm((f) => {
      const opts = [...f.options];
      if (field === "name") opts[idx] = { ...opts[idx], name: String(val) };
      else opts[idx] = { ...opts[idx], price: Number(val) || 0 };
      return { ...f, options: opts };
    });
  }

  function removeOption(idx: number) {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
  }

  async function save() {
    const trimmed = form.name.trim();
    if (!trimmed) {
      alert("Modifier group name is required");
      return;
    }
    try {
      const opts = form.options.filter((o) => o.name.trim()).map((o, i) => ({ id: o.id || `mo_${i}`, name: o.name.trim(), price: o.price }));
      const payload = { name: trimmed, min_select: form.min_select, max_select: form.max_select, required: form.required, options: opts };
      if (editing) {
        await updateModifierGroup(editing.id, payload);
      } else {
        await createModifierGroup(payload);
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
      await deleteModifierGroup(id);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-sky-400">Modifier Groups</h1>
          <p className="text-slate-400">Modifier groups to attach to products (e.g. Size, Extras)</p>
        </div>
        <button onClick={() => openEdit()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">
          <Plus className="w-4 h-4" /> New Modifier Group
        </button>
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
              <th className="text-left p-4 font-medium">Name</th>
              <th className="text-left p-4 font-medium">Options</th>
              <th className="text-left p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-b border-slate-700/50">
                <td className="p-4 font-medium">{g.name}</td>
                <td className="p-4 text-slate-400 text-sm">
                  {(g.options || []).map((o) => `${o.name} (${o.price.toFixed(2)})`).join(", ") || "-"}
                </td>
                <td className="p-4 flex gap-2">
                  <button onClick={() => openEdit(g)} className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(g.id)} className="p-1.5 rounded bg-slate-700 hover:bg-red-600/30 text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== undefined && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-sky-400 mb-4">{editing ? "Edit Modifier Group" : "New Modifier Group"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name (e.g. Size, Extras)</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
                  placeholder="Modifier group name"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Min select</label>
                  <input type="number" min={0} value={form.min_select} onChange={(e) => setForm((f) => ({ ...f, min_select: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Max select</label>
                  <input type="number" min={0} value={form.max_select} onChange={(e) => setForm((f) => ({ ...f, max_select: parseInt(e.target.value) || 1 }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-slate-400">
                    <input type="checkbox" checked={form.required} onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))} className="rounded" />
                    Required
                  </label>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm text-slate-400">Options</label>
                  <button type="button" onClick={addOption} className="text-sm text-sky-400 hover:underline">+ Add option</button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {form.options.map((opt, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        value={opt.name}
                        onChange={(e) => updateOption(i, "name", e.target.value)}
                        placeholder="Option name"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={opt.price}
                        onChange={(e) => updateOption(i, "price", e.target.value)}
                        placeholder="Price"
                        className="w-20 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm"
                      />
                      <button type="button" onClick={() => removeOption(i)} className="p-1.5 rounded bg-red-600/30 text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={save} className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">Save</button>
              <button onClick={() => setEditing(undefined)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
