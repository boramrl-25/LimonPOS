"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getReconciliationSummary, getReconciliationCardDetail, getReconciliationWarnings, clearReconciliationWarnings, setReconciliationPhysicalCount } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toYYYYMMDD(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function CashCardPage() {
  const [date, setDate] = useState(toYYYYMMDD(new Date()));
  const [data, setData] = useState<{
    date: string;
    cash: {
      systemCash: number;
      physicalCash: number | null;
      bankDeposit: number;
      difference: number | null;
      dailyCashEntries?: Array<{ id: string; physical_cash: number; user_name: string; created_at: number }>;
      bankCashDepositsNearby?: Array<{ date: string; amount: number; description: string }>;
      manualPhysicalCount?: { amount: number; user_name: string; created_at: number } | null;
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
  const [bankDepositModalOpen, setBankDepositModalOpen] = useState(false);
  const [differenceDetailModalOpen, setDifferenceDetailModalOpen] = useState(false);
  const [manualCountInput, setManualCountInput] = useState("");
  const [manualCountSaving, setManualCountSaving] = useState(false);

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

  useEffect(() => {
    if (data?.cash?.manualPhysicalCount != null) setManualCountInput(String(data.cash.manualPhysicalCount.amount));
    else setManualCountInput("");
  }, [data?.date, data?.cash?.manualPhysicalCount?.amount]);

  const todayStr = toYYYYMMDD(new Date());

  async function handleSaveManualCount() {
    const val = parseFloat(manualCountInput.replace(/,/g, "."));
    if (isNaN(val) || val < 0) return;
    setManualCountSaving(true);
    setError(null);
    try {
      await setReconciliationPhysicalCount(date, val);
      const fresh = await getReconciliationSummary(date);
      setData(fresh);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setManualCountSaving(false);
    }
  }
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
            <h1 className="text-xl font-bold text-sky-400">Cash & Card</h1>
            <p className="text-slate-400 text-sm">Cash Reconciliation · Card Reconciliation</p>
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
          <div className="space-y-8">
            {/* Cash Reconciliation */}
            <section className="rounded-xl bg-amber-950/40 border border-amber-700/50 p-5">
              <h2 className="text-lg font-semibold text-amber-200 mb-4">Cash Reconciliation</h2>
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
                  <p className="text-xs text-slate-500 mb-0.5">Sum of deposits in working hours</p>
                  <p className="text-xl font-bold text-white">{data.cash.physicalCash != null ? `${fmt(data.cash.physicalCash)} AED` : "—"}</p>
                  {(data.cash.dailyCashEntries?.length ?? 0) > 0 && (
                    <p className="text-sky-400 text-xs mt-1">Click to view deposits ({data.cash.dailyCashEntries?.length ?? 0})</p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setBankDepositModalOpen(true)}
                  className="p-4 rounded-lg bg-slate-900/60 border border-slate-600 text-left hover:border-amber-500/50 transition-colors cursor-pointer"
                >
                  <p className="text-slate-400 text-sm mb-1">Bank Deposit (exact date)</p>
                  <p className="text-xs text-slate-500 mb-0.5">From bank emails</p>
                  <p className="text-xl font-bold text-white">{data.cash.bankDeposit > 0 ? `${fmt(data.cash.bankDeposit)} AED` : "—"}</p>
                  {((data.cash.bankCashDepositsNearby?.length ?? 0) > 0) && (
                    <p className="text-sky-400 text-xs mt-1">Click for ±2 days</p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDifferenceDetailModalOpen(true)}
                  className="p-4 rounded-lg bg-slate-900/60 border border-slate-600 text-left hover:border-amber-500/50 transition-colors cursor-pointer"
                >
                  <p className="text-slate-400 text-sm mb-1">Difference</p>
                  <p className="text-xs text-slate-500 mb-0.5">Physical − System · Click for detail</p>
                  <p className={`text-xl font-bold ${data.cash.difference != null ? (data.cash.difference >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500"}`}>
                    {data.cash.difference != null ? `${data.cash.difference >= 0 ? "+" : ""}${fmt(data.cash.difference)} AED` : "—"}
                  </p>
                </button>
              </div>
              {/* Manual physical count (next day) - verification */}
              <div className="mt-4 p-4 rounded-lg bg-slate-900/60 border border-amber-700/30">
                <p className="text-amber-200/80 text-sm mb-2">Fiziksel para sayımı (ertesi gün)</p>
                <p className="text-xs text-slate-500 mb-2">Ertesi gün saydığınız parayı girin. App depozitleri ile karşılaştırılır.</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualCountInput}
                    onChange={(e) => setManualCountInput(e.target.value)}
                    placeholder="0.00"
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white w-36"
                  />
                  <button
                    onClick={handleSaveManualCount}
                    disabled={manualCountSaving || manualCountInput === ""}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
                  >
                    {manualCountSaving ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                  {data.cash.manualPhysicalCount != null && (data.cash.physicalCash ?? 0) > 0 && (
                    <span className={`text-sm font-medium ${
                      Math.abs((data.cash.manualPhysicalCount?.amount ?? 0) - (data.cash.physicalCash ?? 0)) < 0.01
                        ? "text-emerald-400"
                        : (data.cash.manualPhysicalCount?.amount ?? 0) < (data.cash.physicalCash ?? 0)
                          ? "text-red-400"
                          : "text-amber-400"
                    }`}>
                      {Math.abs((data.cash.manualPhysicalCount?.amount ?? 0) - (data.cash.physicalCash ?? 0)) < 0.01
                        ? "✓ Sorun yok"
                        : (data.cash.manualPhysicalCount?.amount ?? 0) < (data.cash.physicalCash ?? 0)
                          ? `Eksik ${fmt((data.cash.physicalCash ?? 0) - (data.cash.manualPhysicalCount?.amount ?? 0))} AED`
                          : `Fazla ${fmt((data.cash.manualPhysicalCount?.amount ?? 0) - (data.cash.physicalCash ?? 0))} AED`}
                    </span>
                  )}
                  {data.cash.manualPhysicalCount != null && (
                    <span className="text-slate-500 text-xs">Kaydeden: {data.cash.manualPhysicalCount.user_name || "—"}</span>
                  )}
                </div>
              </div>
            </section>

            {/* Card Reconciliation */}
            <section className="rounded-xl bg-sky-950/40 border border-sky-700/50 p-5">
              <h2 className="text-lg font-semibold text-sky-200 mb-4">Card Reconciliation</h2>
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
                  <p className="text-sky-400 text-xs mt-1 flex items-center gap-1">View transactions <ChevronRight className="w-3 h-3" /></p>
                </button>
              </div>
              {data.card.deduction && data.card.deduction.actualFromCSV > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-slate-900/60 border border-violet-700/50">
                  <p className="text-violet-200/80 text-sm mb-1">Deduction ({data.card.deduction.bankPercentage}%)</p>
                  <div className="flex flex-wrap gap-4 items-center">
                    <span className="text-slate-300">Expected: {fmt(data.card.deduction.expectedFromPOS)} AED</span>
                    <span className="text-slate-300">Actual: {fmt(data.card.deduction.actualFromCSV)} AED</span>
                    <span className={`font-bold ${data.card.deduction.difference != null && Math.abs(data.card.deduction.difference) > 0.01 ? "text-amber-400" : "text-emerald-400"}`}>
                      Diff: {data.card.deduction.difference != null ? `${data.card.deduction.difference >= 0 ? "+" : ""}${fmt(data.card.deduction.difference)} AED` : "—"}
                    </span>
                  </div>
                </div>
              )}
            </section>

            <p className="text-slate-500 text-sm">
              <Link href="/settings/reconciliation" className="text-sky-400 hover:underline">Settings → Reconciliation</Link> for email inbox config.
            </p>
          </div>
        ) : (
          <p className="text-slate-500 py-8">No data.</p>
        )}
      </main>

      {/* Difference Detail modal */}
      {differenceDetailModalOpen && data && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setDifferenceDetailModalOpen(false)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-amber-200">Fark Detayı — {date}</h3>
              <button type="button" onClick={() => setDifferenceDetailModalOpen(false)} className="text-slate-400 hover:text-white">Kapat</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-sm">System Cash (POS satışlarından nakit)</p>
                <p className="text-xl font-bold text-amber-100">{fmt(data.cash.systemCash)} AED</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-sm">Physical Cash (uygulamadaki depozit toplamı)</p>
                <p className="text-xl font-bold text-white">{fmt(data.cash.physicalCash ?? 0)} AED</p>
                <p className="text-xs text-slate-500 mt-1">Çalışma saatleri içinde yapılan {data.cash.dailyCashEntries?.length ?? 0} depozit</p>
              </div>
              {(data.cash.dailyCashEntries?.length ?? 0) > 0 && (
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm mb-2">Depozit listesi</p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {data.cash.dailyCashEntries?.map((e) => (
                      <li key={e.id} className="flex justify-between text-sm">
                        <span>{e.user_name || "—"} · {new Date(e.created_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span>
                        <span className="font-medium text-amber-200">{fmt(e.physical_cash)} AED</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-600/50">
                <p className="text-amber-200 text-sm font-medium">Fark hesabı</p>
                <p className="text-slate-300 text-sm mt-1">
                  Physical Cash − System Cash = {fmt(data.cash.physicalCash ?? 0)} − {fmt(data.cash.systemCash)} = {data.cash.difference != null ? `${data.cash.difference >= 0 ? "+" : ""}${fmt(data.cash.difference)} AED` : "—"}
                </p>
                <p className={`text-lg font-bold mt-2 ${data.cash.difference != null ? (data.cash.difference >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500"}`}>
                  {data.cash.difference != null ? `${data.cash.difference >= 0 ? "+" : ""}${fmt(data.cash.difference)} AED` : "—"}
                  {data.cash.difference != null && data.cash.difference >= 0 && " (Fazla)"}
                  {data.cash.difference != null && data.cash.difference < 0 && " (Eksik)"}
                </p>
              </div>
              {data.cash.manualPhysicalCount != null && (data.cash.physicalCash ?? 0) > 0 && (
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700">
                  <p className="text-slate-400 text-sm">Manuel sayım (ertesi gün)</p>
                  <p className="text-lg font-bold text-white">{fmt(data.cash.manualPhysicalCount.amount)} AED</p>
                  <p className={`text-sm font-medium mt-1 ${
                    Math.abs(data.cash.manualPhysicalCount.amount - (data.cash.physicalCash ?? 0)) < 0.01
                      ? "text-emerald-400"
                      : data.cash.manualPhysicalCount.amount < (data.cash.physicalCash ?? 0)
                        ? "text-red-400"
                        : "text-amber-400"
                  }`}>
                    {Math.abs(data.cash.manualPhysicalCount.amount - (data.cash.physicalCash ?? 0)) < 0.01
                      ? "✓ Doğrulama OK"
                      : data.cash.manualPhysicalCount.amount < (data.cash.physicalCash ?? 0)
                        ? `Eksik ${fmt((data.cash.physicalCash ?? 0) - data.cash.manualPhysicalCount.amount)} AED`
                        : `Fazla ${fmt(data.cash.manualPhysicalCount.amount - (data.cash.physicalCash ?? 0))} AED`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                <>
                  <div className="p-4 rounded-lg bg-amber-900/30 border border-amber-600/50 mb-4">
                    <p className="text-slate-400 text-sm">Total (sum of deposits)</p>
                    <p className="text-2xl font-bold text-amber-200">{fmt(data.cash.physicalCash ?? 0)} AED</p>
                  </div>
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
                </>
              ) : (
                <p className="text-slate-500 py-8 text-center">No cash deposits. Use the app to add daily cash entry.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bank Deposit (nearby dates) Modal */}
      {bankDepositModalOpen && data && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setBankDepositModalOpen(false)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-amber-200">Bank Cash Deposits — {date} (±2 days)</h3>
              <button type="button" onClick={() => setBankDepositModalOpen(false)} className="text-slate-400 hover:text-white">Close</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <p className="text-slate-400 text-sm mb-4">Bank may process 1–2 days later or aggregate several days.</p>
              {(data.cash.bankCashDepositsNearby?.length ?? 0) > 0 ? (
                <ul className="space-y-2">
                  {data.cash.bankCashDepositsNearby?.map((e, idx) => (
                    <li
                      key={idx}
                      className={`flex justify-between items-center p-3 rounded-lg border ${e.date === date ? "bg-amber-900/30 border-amber-600/50" : "bg-slate-800/60 border-slate-700"}`}
                    >
                      <div>
                        <p className="font-medium text-white">{e.date} {e.date === date && <span className="text-amber-300 text-xs">(selected)</span>}</p>
                        <p className="text-slate-500 text-sm">{e.description}</p>
                      </div>
                      <p className="text-xl font-bold text-amber-200">{fmt(e.amount)} AED</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500 py-8 text-center">No bank cash deposits nearby.</p>
              )}
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
                    <span className="text-amber-400">POS only: {cardDetail.posUnmatchedCount}</span>
                    <span className="text-rose-400">UTAP only: {cardDetail.utapUnmatchedCount}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-sky-200 mb-2">POS (System)</h4>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {cardDetail.posTransactions.map((t) => (
                          <div key={t.id} className={`flex justify-between items-center p-2 rounded text-sm ${t.status === "matched" ? "bg-emerald-900/30 text-emerald-200" : "bg-amber-900/30 text-amber-200"}`}>
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
                          <div key={t.id} className={`flex justify-between items-center p-2 rounded text-sm ${t.status === "matched" ? "bg-emerald-900/30 text-emerald-200" : "bg-rose-900/30 text-rose-200"}`}>
                            <span className="truncate max-w-[120px]" title={t.description}>{t.description || "—"}</span>
                            <span>{fmt(t.amount)} AED</span>
                          </div>
                        ))}
                        {cardDetail.utapTransactions.length === 0 && <p className="text-slate-500 text-sm">No UTAP data</p>}
                      </div>
                    </div>
                  </div>
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
