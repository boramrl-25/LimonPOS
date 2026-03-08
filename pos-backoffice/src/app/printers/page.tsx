"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2, FileSpreadsheet, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import { getPrinters, createPrinter, updatePrinter, deletePrinter } from "@/lib/api";

type Printer = { id: string; name: string; printer_type: string; ip_address: string; port: number; status: string; kds_enabled?: boolean; enabled?: boolean };

export default function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Printer | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", printer_type: "kitchen", ip_address: "", port: 9100, kds_enabled: true, enabled: true });
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setForm({ name: p.name, printer_type: p.printer_type, ip_address: p.ip_address, port: p.port, kds_enabled: Boolean(p.kds_enabled), enabled: p.enabled !== false });
    } else {
      setEditing(null);
      setForm({ name: "", printer_type: "kitchen", ip_address: "", port: 9100, kds_enabled: true, enabled: true });
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

  async function toggleEnabled(p: Printer) {
    try {
      const nextEnabled = p.enabled === false;
      await updatePrinter(p.id, { name: p.name, printer_type: p.printer_type, ip_address: p.ip_address, port: p.port, kds_enabled: p.kds_enabled, enabled: nextEnabled });
      await load();
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

  function downloadPrintersTemplate() {
    const rows = [
      { Name: "Bar", Type: "kitchen", IP: "192.168.1.100", Port: 9100, Enabled: "On", KDSEnabled: "On" },
      { Name: "Receipt", Type: "receipt", IP: "192.168.1.101", Port: 9100, Enabled: "On", KDSEnabled: "Off" },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Printers");
    XLSX.writeFile(wb, "printers_import_template.xlsx");
  }

  function exportPrintersToExcel() {
    if (!printers.length) {
      alert("No printers to export");
      return;
    }
    const rows = printers.map((p) => ({
      Name: p.name,
      Type: p.printer_type,
      IP: p.ip_address,
      Port: p.port,
      Enabled: p.enabled !== false ? "On" : "Off",
      KDSEnabled: p.printer_type === "kitchen" && Boolean(p.kds_enabled) ? "On" : "Off",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Printers");
    XLSX.writeFile(wb, "printers.xlsx");
  }

  async function handlePrinterImport(e: React.ChangeEvent<HTMLInputElement>) {
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

      for (const row of rows) {
        const name = String(row.Name ?? row.name ?? "").trim();
        if (!name) continue;
        const typeRaw = String(row.Type ?? row.printer_type ?? "kitchen").toLowerCase();
        const ip_address = String(row.IP ?? row.ip_address ?? "");
        const portRaw = row.Port ?? row.port ?? 9100;
        const kdsRaw = String(row.KDSEnabled ?? row.kds_enabled ?? "").toLowerCase();

        const printer_type = typeRaw === "receipt" ? "receipt" : "kitchen";
        const port = Number(portRaw) || 9100;
        const enabledRaw = String(row.Enabled ?? row.enabled ?? "on").toLowerCase();
        const enabled = enabledRaw === "on" || enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes";
        const kds_enabled = printer_type === "kitchen" && (kdsRaw === "on" || kdsRaw === "1" || kdsRaw === "true" || kdsRaw === "yes");

        const existing = printers.find((p) => p.name.toLowerCase() === name.toLowerCase());

        const payload = { name, printer_type, ip_address, port, enabled, kds_enabled };

        if (existing) {
          await updatePrinter(existing.id, payload);
        } else {
          await createPrinter(payload);
        }
      }

      await load();
      alert(`Imported ${rows.length} printer row(s).`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImporting(false);
      e.target.value = "";
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
          <p className="text-slate-400">Customer bill (Receipt) and kitchen order (Kitchen) printers. Synced to POS app.</p>
          <p className="text-slate-500 text-sm mt-1">Excel or CSV: Download sample, fill, upload.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handlePrinterImport}
          />
          <button
            onClick={downloadPrintersTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium"
            title="Download Excel template for import"
          >
            <FileDown className="w-4 h-4" /> Download template
          </button>
          <button
            onClick={exportPrintersToExcel}
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
            <Plus className="w-4 h-4" /> New Printer
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
              <th className="text-left p-4 font-medium">Name</th>
              <th className="text-left p-4 font-medium">Type</th>
              <th className="text-left p-4 font-medium">On/Off</th>
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
                <td className="p-4">
                  <span className={p.printer_type === "kitchen" ? "text-emerald-400" : "text-amber-400"}>
                    {p.printer_type === "kitchen" ? "Kitchen" : "Receipt"}
                  </span>
                </td>
                <td className="p-4">
                  <button
                    onClick={() => toggleEnabled(p)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${p.enabled !== false ? "bg-emerald-600/30 text-emerald-400 hover:bg-emerald-600/50" : "bg-slate-600/30 text-slate-500 hover:bg-slate-600/50"}`}
                    title={p.enabled !== false ? "On — Click to turn off (exclude from print jobs)" : "Off — Click to turn on"}
                  >
                    {p.enabled !== false ? "On" : "Off"}
                  </button>
                </td>
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
                  <option value="kitchen">Kitchen — Orders go to kitchen</option>
                  <option value="receipt">Receipt (cashier) — Customer bill</option>
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
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <span className="text-sm text-slate-300">On — Include in print jobs (receipt, kitchen, void)</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                  className={`w-12 h-6 rounded-full transition-colors ${form.enabled ? "bg-emerald-600" : "bg-slate-600"}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${form.enabled ? "translate-x-6" : "translate-x-1"}`} style={{ marginTop: 2 }} />
                </button>
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
