"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { getPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod } from "@/lib/api";

type PaymentMethod = { id: string; name: string; code: string; active: number };

export default function PaymentSettingsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PaymentMethod | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", code: "" });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const all = await getPaymentMethods();
      setMethods(all);
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  function openEdit(m?: PaymentMethod) {
    if (m) {
      setEditing(m);
      setForm({ name: m.name, code: m.code });
    } else {
      setEditing(null);
      setForm({ name: "", code: "" });
    }
  }

  async function save() {
    try {
      if (editing) {
        await updatePaymentMethod(editing.id, form);
      } else {
        await createPaymentMethod(form);
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
      await deletePaymentMethod(id);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/settings" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>

      <h1 className="text-2xl font-bold text-sky-400 mb-2">Payment Methods</h1>
      <p className="text-slate-400 mb-8">Cash, card and other payment types. code: cash, card or custom.</p>

      <div className="flex justify-between items-center mb-6">
        <span className="text-slate-400">Current methods</span>
        <button onClick={() => openEdit()} className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">
          <Plus className="w-4 h-4" /> New Method
        </button>
      </div>

      <div className="relative min-h-[80px] mb-8">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10 rounded-lg">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <ul className="space-y-2">
        {methods.map((m) => (
          <li key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <div>
              <span className="font-medium text-slate-200">{m.name}</span>
              <span className="ml-2 text-slate-500 text-sm">({m.code})</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(m)} className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => remove(m.id)} className="p-1.5 rounded bg-slate-700 hover:bg-red-600/30 text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          </li>
        ))}
        </ul>
      </div>

      {editing !== undefined && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-sky-400 mb-4">{editing ? "Edit Method" : "New Payment Method"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" placeholder="e.g. Cash, Card" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Code (cash, card or custom)</label>
                <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" placeholder="cash, card, sodexo..." />
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
