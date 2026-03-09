"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getReconciliationSummary, getReconciliationCardDetail, getReconciliationWarnings, clearReconciliationWarnings } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toYYYYMMDD(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function ReconciliationPage() {
  const [date, setDate] = useState(toYYYYMMDD(new Date()));
  const [data, setData] = useState<{
    date: string;
    cash: {
      systemCash: number;
      physicalCash: number | null;
      bankDeposit: number;
      difference: number | null;
      dailyCashEntries?: Array<{ id: string; physical_cash: number; user_name: string; created_at: number }>;
    };
    card: {
      systemCard: number;
      utapTotal: number;
      bankDeposit: number;
      difference: number | null;
      deduction?: { bankPercentage: number; expectedFromPOS: number; actualFromCSV: number; difference: number | null };
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cardDetailModal, setCardDetailModal] = useState(false);
  const [cardDetail, setCardDetail] = useState<{
    posTransactions: Array<{ id: string; amount: number; order_id: string; table_number: string; receipt_no: string; status: string }>;
    utapTransactions: Array<{ id: string; amount: number; deduction?: number | null; net_amount?: number | null; description: string; status: string }>;
    matchedCount: number;
    posUnmatchedCount: number;
    utapUnmatchedCount: number;
    deduction?: { bankPercentage: number; expectedFromPOS: number; actualFromCSV: number; difference: number | null };
  } | null>(null);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [warnings, setWarnings] = useState<Array<{ id: string; type: string; expected?: string; actual?: string; amount?: number; date?: string }>>([]);
  const [physicalCashModalOpen, setPhysicalCashModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getReconciliationSummary(date)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => {
    getReconciliationWarnings()
      .then((r) => setWarnings(r.warnings || []))
      .catch(() => setWarnings([]));
  }, [date, data]);

  const todayStr = toYYYYMMDD(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toYYYYMMDD(yesterday);

  async function openCardDetail() {
    setCardDetailModal(true);
    setCardDetailLoading(true);
    setCardDetail(null);
    try {
      const d = await getReconciliationCardDetail(date);
      setCardDetail(d);
    } catch {
      setCardDetail(null);
    } finally {
      setCardDetailLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Cash & Card Reconciliation</h1>
            <p className="text-slate-400 text-sm">System vs Physical/UTAP vs Bank</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayStr}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 border border-slate-600 text-sm"
          />
          <button
            onClick={() => setDate(todayStr)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${date === todayStr ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          >
            Today
          </button>
          <button
            onClick={() => setDate(yesterdayStr)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${date === yesterdayStr ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
          >
            Yesterday
          </button>
        </div>
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        {warnings.length > 0 && (
          <div className="mb-4 p-4 rounded-xl bg-amber-900/50 border border-amber-600/50">
            <div className="flex justify-between items-start gap-4">
              <div>
                <p className="font-semibold text-amber-200 mb-2">Account mismatch warnings</p>
                <ul className="space-y-1 text-sm text-amber-100">
                  {warnings.map((w) => (
                    <li key={w.id}>
                      {w.type === "account_mismatch" && (
                        <>Expected {w.expected || "—"}, got {w.actual || "—"} · {w.amount != null ? `${w.amount.toFixed(2)} AED` : ""} · {w.date || ""}</>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => clearReconciliationWarnings().then(() => setWarnings([]))}
                className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-amber-100 text-sm shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 py-8">Loading...</p>
        ) : data ? (
          <div className="space-y-6">
            {/* Cash */}
            <section className="rounded-xl bg-amber-950/40 border border-amber-700/50 p-5">
              <h2 className="text-lg font-semibold text-amber-200 mb-4">Cash</h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-slate-900/60 border border-amber-700/30">
                  <p className="text-amber-200/80 text-sm mb-1">System Cash</p>
                  <p className="text-xl font-bold text-amber-100">{fmt(data.cash.systemCash)} AED</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPhysicalCashModalOpen(true)}
                  className="p-4 rounded-lg bg-slate-900/60 border border-slate-600 text-left hover:border-amber-500/50 transition-colors cursor-pointer"
                >
                  <p className="text-slate-400 text-sm mb-1">Physical Cash (app)</p>
                  <p className="text-xl font-bold text-white">{data.cash.physicalCash != null ? `${fmt(data.cash.physicalCash)} AED` : "—"}</p>
                  {(data.cash.dailyCashEntries?.length ?? 0) > 0 && (
                    <p className="text-sky-400 text-xs mt-1">Click to view deposits ({data.cash.dailyCashEntries?.length ?? 0})</p>
                  )}
                </button>
                <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-600">
                  <p className="text-slate-400 text-sm mb-1">Bank Deposit</p>
                  <p className="text-xl font-bold text-white">{data.cash.bankDeposit > 0 ? `${fmt(data.cash.bankDeposit)} AED` : "—"}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-600">
                  <p className="text-slate-400 text-sm mb-1">Difference</p>
                  <p className={`text-xl font-bold ${data.cash.difference != null ? (data.cash.difference >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500"}`}>
                    {data.cash.difference != null ? `${data.cash.difference >= 0 ? "+" : ""}${fmt(data.cash.difference)} AED` : "—"}
                  </p>
                </div>
              </div>
            </section>

            {/* Card */}
            <section className="rounded-xl bg-sky-950/40 border border-sky-700/50 p-5">
              <h2 className="text-lg font-semibold text-sky-200 mb-4">Card</h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-slate-900/60 border border-sky-700/30">
                  <p className="text-sky-200/80 text-sm mb-1">System Card</p>
                  <p className="text-xl font-bold text-sky-100">{fmt(data.card.systemCard)} AED</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-600">
                  <p className="text-slate-400 text-sm mb-1">UTAP Total</p>
                  <p className="text-xl font-bold text-white">{data.card.utapTotal > 0 ? `${fmt(data.card.utapTotal)} AED` : "—"}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-600">
                  <p className="text-slate-400 text-sm mb-1">Bank Deposit</p>
                  <p className="text-xl font-bold text-white">{data.card.bankDeposit > 0 ? `${fmt(data.card.bankDeposit)} AED` : "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={openCardDetail}
                  className="p-4 rounded-lg bg-slate-900/60 border border-slate-600 text-left hover:border-sky-500/50 transition-colors cursor-pointer"
                >
                  <p className="text-slate-400 text-sm mb-1">Difference</p>
                  <p className={`text-xl font-bold ${data.card.difference != null ? (data.card.difference >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500"}`}>
                    {data.card.difference != null ? `${data.card.difference >= 0 ? "+" : ""}${fmt(data.card.difference)} AED` : "—"}
                  </p>
                  <p className="text-sky-400 text-xs mt-1 flex items-center gap-1">Click to view transactions <ChevronRight className="w-3 h-3" /></p>
                </button>
              </div>
              {data.card.deduction && data.card.deduction.actualFromCSV > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-slate-900/60 border border-violet-700/50">
                  <p className="text-violet-200/80 text-sm mb-1">Deduction comparison ({data.card.deduction.bankPercentage}% from bank settings)</p>
                  <div className="flex flex-wrap gap-4 items-center">
                    <span className="text-slate-300">Expected (POS × %): {fmt(data.card.deduction.expectedFromPOS)} AED</span>
                    <span className="text-slate-300">Actual (CSV): {fmt(data.card.deduction.actualFromCSV)} AED</span>
                    <span className={`font-bold ${data.card.deduction.difference != null && Math.abs(data.card.deduction.difference) > 0.01 ? "text-amber-400" : "text-emerald-400"}`}>
                      Diff: {data.card.deduction.difference != null ? `${data.card.deduction.difference >= 0 ? "+" : ""}${fmt(data.card.deduction.difference)} AED` : "—"}
                    </span>
                  </div>
                </div>
              )}
            </section>

            <p className="text-slate-500 text-sm">
              Data from emails is fetched every 5 minutes. Configure inbox in{" "}
              <Link href="/settings/reconciliation" className="text-sky-400 hover:underline">Settings → Reconciliation</Link>.
            </p>
          </div>
        ) : (
          <p className="text-slate-500 py-8">No data.</p>
        )}
      </main>

      {/* Physical Cash deposits modal */}
      {physicalCashModalOpen && data && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setPhysicalCashModalOpen(false)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-amber-200">Physical Cash Deposits — {date}</h3>
              <button type="button" onClick={() => setPhysicalCashModalOpen(false)} className="text-slate-400 hover:text-white">Close</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {(data.cash.dailyCashEntries?.length ?? 0) > 0 ? (
                <ul className="space-y-2">
                  {data.cash.dailyCashEntries?.map((e) => (
                    <li key={e.id} className="flex justify-between items-center p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                      <div>
                        <p className="font-medium text-white">{e.user_name || "—"}</p>
                        <p className="text-slate-500 text-sm">{new Date(e.created_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" })}</p>
                      </div>
                      <p className="text-xl font-bold text-amber-200">{fmt(e.physical_cash)} AED</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 py-8 text-center">No cash deposits for this date. Use the app to add daily cash entry.</p>
              )}
              <p className="text-slate-500 text-xs mt-4">You can deposit cash multiple times per day from the app.</p>
            </div>
          </div>
        </div>
      )}

      {/* Card Detail Modal */}
      {cardDetailModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setCardDetailModal(false)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-200">Card Transactions — {date}</h3>
              <button type="button" onClick={() => setCardDetailModal(false)} className="text-slate-400 hover:text-white">Close</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {cardDetailLoading ? (
                <p className="text-slate-400 py-8">Loading...</p>
              ) : cardDetail ? (
                <div className="space-y-6">
                  {cardDetail.deduction && cardDetail.deduction.actualFromCSV > 0 && (
                    <div className="p-4 rounded-lg bg-violet-900/30 border border-violet-700/50">
                      <p className="text-violet-200 font-medium mb-2">Deduction comparison</p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span>Bank %: {cardDetail.deduction.bankPercentage}%</span>
                        <span>Expected (POS): {fmt(cardDetail.deduction.expectedFromPOS)} AED</span>
                        <span>Actual (CSV): {fmt(cardDetail.deduction.actualFromCSV)} AED</span>
                        <span className={cardDetail.deduction.difference != null && Math.abs(cardDetail.deduction.difference) > 0.01 ? "text-amber-400 font-bold" : "text-emerald-400"}>
                          Diff: {cardDetail.deduction.difference != null ? `${cardDetail.deduction.difference >= 0 ? "+" : ""}${fmt(cardDetail.deduction.difference)} AED` : "—"}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-4 text-sm">
                    <span className="text-emerald-400">✓ Matched: {cardDetail.matchedCount}</span>
                    <span className="text-amber-400">POS only (no UTAP): {cardDetail.posUnmatchedCount}</span>
                    <span className="text-rose-400">UTAP only (no POS): {cardDetail.utapUnmatchedCount}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-sky-200 mb-2">POS (System)</h4>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {cardDetail.posTransactions.map((t) => (
                          <div
                            key={t.id}
                            className={`flex justify-between items-center p-2 rounded text-sm ${t.status === "matched" ? "bg-emerald-900/30 text-emerald-200" : "bg-amber-900/30 text-amber-200"}`}
                          >
                            <span>{t.receipt_no} · T{t.table_number}</span>
                            <span>{fmt(t.amount)} AED</span>
                          </div>
                        ))}
                        {cardDetail.posTransactions.length === 0 && <p className="text-slate-500 text-sm">No card transactions</p>}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-200 mb-2">UTAP (from email)</h4>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {cardDetail.utapTransactions.map((t) => (
                          <div
                            key={t.id}
                            className={`flex justify-between items-center p-2 rounded text-sm ${t.status === "matched" ? "bg-emerald-900/30 text-emerald-200" : "bg-rose-900/30 text-rose-200"}`}
                          >
                            <span className="truncate max-w-[120px]" title={t.description}>{t.description || "—"}</span>
                            <span>{fmt(t.amount)} AED</span>
                            {t.deduction != null && t.deduction > 0 && <span className="text-slate-400 text-xs">−{fmt(t.deduction)}</span>}
                          </div>
                        ))}
                        {cardDetail.utapTransactions.length === 0 && <p className="text-slate-500 text-sm">No UTAP data (check email config)</p>}
                      </div>
                    </div>
                  </div>
                  <p className="text-slate-500 text-xs">
                    Green = matched (same amount). Amber = in POS but not in UTAP. Rose = in UTAP but not in POS.
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 py-4">Could not load detail.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
