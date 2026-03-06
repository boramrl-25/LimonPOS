"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Percent, Check } from "lucide-react";
import { getDiscountRequestsPending, approveDiscountRequest } from "@/lib/api";
import type { DiscountRequestRow } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DiscountRequestsPage() {
  const [requests, setRequests] = useState<DiscountRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState<{ requestId: string; orderId: string; percent: string; amount: string; note: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await getDiscountRequestsPending();
      setRequests(res.requests || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);

  async function submitApprove() {
    if (!approveForm) return;
    const { orderId, requestId, percent, amount, note } = approveForm;
    const discountPercent = percent.trim() ? parseFloat(percent) : undefined;
    const discountAmount = amount.trim() ? parseFloat(amount) : undefined;
    if ((discountPercent == null || isNaN(discountPercent)) && (discountAmount == null || isNaN(discountAmount))) {
      alert("Yüzde veya tutar girin.");
      return;
    }
    setActing(requestId);
    try {
      await approveDiscountRequest(orderId, requestId, {
        discount_percent: discountPercent != null && !isNaN(discountPercent) ? discountPercent : 0,
        discount_amount: discountAmount != null && !isNaN(discountAmount) ? discountAmount : 0,
        note: note.trim() || undefined,
      });
      setApproveForm(null);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-sky-400 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2 mb-4">
          <Percent className="w-6 h-6 text-violet-400" />
          İndirim talepleri (onay bekleyen)
        </h1>
        <p className="text-slate-500 text-sm mb-6">
          Uygulamadan gelen indirim taleplerini buradan onaylayın. Yüzde veya tutar girin; %100 indirim hesabı 0 kapatır.
        </p>

        {loading ? (
          <p className="text-slate-500 py-8">Yükleniyor...</p>
        ) : requests.length === 0 ? (
          <p className="text-slate-500 py-8">Bekleyen indirim talebi yok.</p>
        ) : (
          <ul className="space-y-4">
            {requests.map((r) => (
              <li key={r.id} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <p className="font-medium text-white">Masa {r.table_number} · Sipariş {r.order_id.slice(-8)}</p>
                    <p className="text-slate-500 text-sm mt-1">
                      Talep: {r.requested_by_user_name} · {new Date(r.requested_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" })}
                    </p>
                    {(r.requested_percent != null && r.requested_percent > 0) && (
                      <p className="text-slate-400 text-sm">İstenen: %{r.requested_percent}</p>
                    )}
                    {(r.requested_amount != null && r.requested_amount > 0) && (
                      <p className="text-slate-400 text-sm">İstenen tutar: {fmt(r.requested_amount)} AED</p>
                    )}
                    {r.note && <p className="text-slate-400 text-sm mt-1">Not: {r.note}</p>}
                    {r.order_total_before_discount != null && (
                      <p className="text-slate-500 text-xs mt-1">Hesap (indirim öncesi): {fmt(r.order_total_before_discount)} AED</p>
                    )}
                  </div>
                  {approveForm?.requestId === r.id ? (
                    <div className="flex-shrink-0 w-64 space-y-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="İndirim %"
                        value={approveForm.percent}
                        onChange={(e) => setApproveForm((f) => f ? { ...f, percent: e.target.value } : null)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="İndirim tutarı AED"
                        value={approveForm.amount}
                        onChange={(e) => setApproveForm((f) => f ? { ...f, amount: e.target.value } : null)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Açıklama (opsiyonel)"
                        value={approveForm.note}
                        onChange={(e) => setApproveForm((f) => f ? { ...f, note: e.target.value } : null)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={submitApprove}
                          disabled={acting === r.id}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                          Onayla
                        </button>
                        <button
                          type="button"
                          onClick={() => setApproveForm(null)}
                          className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setApproveForm({ requestId: r.id, orderId: r.order_id, percent: "", amount: "", note: "" })}
                      className="flex-shrink-0 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium"
                    >
                      Onayla
                    </button>
                  )}
                </div>
                <Link
                  href={`/orders/${r.order_id}`}
                  className="inline-block mt-2 text-sky-400 hover:text-sky-300 text-sm"
                >
                  Fise git →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
