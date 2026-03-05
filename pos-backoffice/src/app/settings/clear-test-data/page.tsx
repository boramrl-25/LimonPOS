"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { clearSalesByDateRange } from "@/lib/api";

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function ClearTestDataPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ deletedOrders: number; message: string } | null>(null);

  const canSubmit = dateFrom.trim() !== "" && dateTo.trim() !== "";

  async function handleClear() {
    if (!canSubmit) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await clearSalesByDateRange(dateFrom.trim(), dateTo.trim());
      setResult(res);
      setConfirmOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4">
        <Link href="/settings" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-sky-400">Clear test data (date range)</h1>
          <p className="text-slate-400 text-sm">Delete orders and related data created between two dates</p>
        </div>
      </header>

      <main className="p-6 max-w-lg">
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
          <p className="text-slate-300 text-sm mb-4">
            Select a date range. All orders created between <strong>From</strong> and <strong>To</strong> (inclusive) will be permanently deleted from the server, including order items, payments, and void logs. Tables linked to those orders will be freed.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-slate-400 text-sm mb-1">From (YYYY-MM-DD)</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-sm mb-1">To (YYYY-MM-DD)</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => canSubmit && setConfirmOpen(true)}
            disabled={!canSubmit || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:pointer-events-none text-white font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Clear sales in date range
          </button>
        </div>

        {result && (
          <div className="mt-4 p-4 rounded-lg bg-slate-800 border border-slate-600 text-slate-200">
            <p className="font-medium text-green-400">{result.message}</p>
          </div>
        )}
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Clear test data?</h3>
            <p className="text-slate-400 text-sm mb-4">
              Delete all orders created from <strong className="text-white">{dateFrom}</strong> to <strong className="text-white">{dateTo}</strong>. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium"
              >
                {loading ? "Deleting…" : "Clear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
