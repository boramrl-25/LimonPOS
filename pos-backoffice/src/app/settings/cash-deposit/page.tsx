"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCashDeposits, createCashDeposit, deleteCashDeposit } from "@/lib/api";

function toYYYYMMDD(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CashDepositSettingsPage() {
  const [deposits, setDeposits] = useState<Array<{ id: string; amount: number; date: string; note: string; user_name: string; created_at: number }>>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(toYYYYMMDD(new Date()));
  const [form, setForm] = useState({ amount: "", note: "" });

  useEffect(() => {
    load();
  }, [selectedDate]);

  async function load() {
    setLoading(true);
    try {
      const res = await getCashDeposits(selectedDate);
      setDeposits(res.deposits || []);
      setTotalAmount(res.totalAmount ?? 0);
    } catch {
      setDeposits([]);
      setTotalAmount(0);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount.replace(",", "."));
    if (isNaN(amt) || amt < 0) {
      alert("Enter a valid amount.");
      return;
    }
    setSaving(true);
    try {
      await createCashDeposit({ amount: amt, date: selectedDate, note: form.note.trim() });
      setForm({ amount: "", note: "" });
      await load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this cash entry?")) return;
    try {
      await deleteCashDeposit(id);
      await load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4">
        <Link href="/settings" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-300" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-sky-400">Cash Deposit</h1>
          <p className="text-slate-400 text-sm">
            Enter cash amounts counted during the day or at end of day. Compared with expected cash on dashboard (shortage/excess).
          </p>
        </div>
      </header>

      <main className="p-6 max-w-2xl">
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700">
            <label className="block text-slate-400 text-sm mb-2">Select date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white"
            />
          </div>

          <form onSubmit={handleSubmit} className="p-5 rounded-xl bg-slate-800/60 border border-slate-700 space-y-4">
            <h2 className="text-lg font-semibold text-white">New cash entry</h2>
            <div>
              <label className="block text-slate-400 text-sm mb-1">Amount</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">Note (optional)</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. End of day count"
                className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !form.amount.trim()}
              className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </form>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <div className="p-4 bg-slate-800/60 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Entry list — {selectedDate}</h2>
              <span className="text-sky-400 font-bold">{fmt(totalAmount)} AED</span>
            </div>
            <div className="p-4">
              {loading ? (
                <p className="text-slate-500 py-4">Loading…</p>
              ) : deposits.length === 0 ? (
                <p className="text-slate-500 py-4">No cash entries for this date.</p>
              ) : (
                <ul className="space-y-2">
                  {deposits.map((d) => (
                    <li
                      key={d.id}
                      className="flex justify-between items-center p-3 rounded-lg bg-slate-800/60 border border-slate-700"
                    >
                      <div>
                        <p className="font-medium text-white">{fmt(d.amount)} AED</p>
                        <p className="text-slate-500 text-sm">
                          {d.note || "—"} · {d.user_name} · {new Date(d.created_at).toLocaleString("tr-TR")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(d.id)}
                        className="px-2 py-1 rounded text-red-400 hover:bg-red-900/30 text-sm"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="text-slate-500 text-sm">
            Click the &quot;Cash Deposit&quot; block on the dashboard to see the comparison with expected cash sales and shortage/excess difference.
          </p>
        </div>
      </main>
    </div>
  );
}
