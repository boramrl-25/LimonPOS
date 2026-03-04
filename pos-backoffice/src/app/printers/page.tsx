"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { getPrinters, createPrinter, updatePrinter, deletePrinter } from "@/lib/api";

type Printer = { id: string; name: string; printer_type: string; ip_address: string; port: number; status: string; kds_enabled?: boolean };

export default function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Printer | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", printer_type: "kitchen", ip_address: "", port: 9100, kds_enabled: true });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setPrinters(await getPrinters());
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  function openEdit(p?: Printer) {
    if (p) {
      setEditing(p);
      setForm({ name: p.name, printer_type: p.printer_type, ip_address: p.ip_address, port: p.port, kds_enabled: Boolean(p.kds_enabled) });
    } else {
      setEditing(null);
      setForm({ name: "", printer_type: "kitchen", ip_address: "", port: 9100, kds_enabled: true });
    }
  }

  async function save() {
    try {
      if (editing) {
        await updatePrinter(editing.id, form);
      } else {
        await createPrinter(form);
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
      await deletePrinter(id);
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
          <h1 className="text-2xl font-bold text-sky-400">Printers</h1>
          <p className="text-slate-400">Kitchen and receipt printers</p>
        </div>
        <button onClick={() => openEdit()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">
          <Plus className="w-4 h-4" /> New Printer
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
              <th className="text-left p-4 font-medium">Type</th>
              <th className="text-left p-4 font-medium">KDS</th>
              <th className="text-left p-4 font-medium">IP</th>
              <th className="text-left p-4 font-medium">Port</th>
              <th className="text-left p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {printers.map((p) => (
              <tr key={p.id} className="border-b border-slate-700/50">
                <td className="p-4">{p.name}</td>
                <td className="p-4">{p.printer_type === "kitchen" ? "Kitchen" : "Receipt"}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded text-xs ${(Boolean(p.kds_enabled) && p.printer_type === "kitchen") ? "bg-emerald-600/30 text-emerald-400" : p.printer_type === "kitchen" ? "bg-slate-600/30 text-slate-500" : "bg-slate-700/50 text-slate-500"}`}>
                    {p.printer_type === "kitchen" ? (Boolean(p.kds_enabled) ? "On" : "Off") : "-"}
                  </span>
                </td>
                <td className="p-4">{p.ip_address || "-"}</td>
                <td className="p-4">{p.port}</td>
                <td className="p-4 flex gap-2">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(p.id)} className="p-1.5 rounded bg-slate-700 hover:bg-red-600/30 text-red-400"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== undefined && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-sky-400 mb-4">{editing ? "Edit Printer" : "New Printer"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" placeholder="Printer name" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Type</label>
                <select value={form.printer_type} onChange={(e) => setForm((f) => ({ ...f, printer_type: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white">
                  <option value="kitchen">Kitchen</option>
                  <option value="receipt">Receipt (cashier)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">IP Address</label>
                <input value={form.ip_address} onChange={(e) => setForm((f) => ({ ...f, ip_address: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" placeholder="192.168.1.100" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Port</label>
                <input type="number" value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: parseInt(e.target.value) || 9100 }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" />
              </div>
              {form.printer_type === "kitchen" && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <span className="text-sm text-slate-300">KDS Enable</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, kds_enabled: !f.kds_enabled }))}
                    className={`w-12 h-6 rounded-full transition-colors ${form.kds_enabled ? "bg-emerald-600" : "bg-slate-600"}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.kds_enabled ? "translate-x-6" : "translate-x-1"}`} style={{ marginTop: 2 }} />
                  </button>
                </div>
              )}
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
