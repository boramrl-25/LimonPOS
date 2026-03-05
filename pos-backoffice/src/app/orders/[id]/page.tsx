"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOrder } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type OrderDetail = {
  id: string;
  table_number?: string;
  status: string;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  total?: number;
  paid_at?: number | null;
  created_at?: number;
  waiter_name?: string;
  items: Array<{ id: string; product_name: string; quantity: number; price: number; notes?: string; status?: string }>;
  payments: Array<{ id: string; method: string; amount: number; created_at?: number }>;
  voids: Array<{ id: string; type: string; product_name?: string; quantity?: number; amount?: number; user_name?: string; created_at?: number }>;
};

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getOrder(id)
      .then(setOrder)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 p-6">
        <Link href="/dailysales" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <p className="text-red-400">{error || "Order not found"}</p>
      </div>
    );
  }

  const totalItems = order.items.reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <Link href="/dailysales" className="inline-flex items-center gap-2 text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Back to Daily Sales
          </Link>
          <div className="text-right">
            <h1 className="text-xl font-bold text-sky-400">Ticket #{order.table_number || order.id.slice(-6)}</h1>
            <p className="text-slate-400 text-sm">
              {order.paid_at
                ? new Date(order.paid_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
                : order.created_at
                  ? new Date(order.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
                  : ""}
              {order.waiter_name ? ` · ${order.waiter_name}` : ""}
            </p>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-2xl mx-auto space-y-6">
        <section className="rounded-xl bg-slate-800/60 border border-slate-700 p-5">
          <h2 className="text-lg font-semibold text-slate-200 mb-3">Items</h2>
          <ul className="space-y-2">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between items-start text-sm">
                <span className="text-slate-200">
                  {item.product_name} × {item.quantity}
                  {item.notes ? <span className="text-slate-500 ml-1">({item.notes})</span> : null}
                </span>
                <span className="text-sky-400">{fmt((item.quantity || 0) * (item.price || 0))} AED</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-slate-600 flex justify-between text-slate-300">
            <span>Subtotal</span>
            <span>{fmt(totalItems)} AED</span>
          </div>
          {(order.discount_amount ?? 0) > 0 && (
            <div className="flex justify-between text-amber-400">
              <span>Discount</span>
              <span>−{fmt(order.discount_amount!)} AED</span>
            </div>
          )}
          {(order.tax_amount ?? 0) > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Tax</span>
              <span>{fmt(order.tax_amount!)} AED</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-white mt-2">
            <span>Total</span>
            <span>{fmt(Number(order.total) || 0)} AED</span>
          </div>
        </section>

        {order.payments && order.payments.length > 0 && (
          <section className="rounded-xl bg-slate-800/60 border border-slate-700 p-5">
            <h2 className="text-lg font-semibold text-slate-200 mb-3">Payments</h2>
            <ul className="space-y-2">
              {order.payments.map((p) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span className="text-slate-400 capitalize">{p.method}</span>
                  <span className="text-emerald-400">{fmt(p.amount || 0)} AED</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {order.voids && order.voids.length > 0 && (
          <section className="rounded-xl bg-slate-800/60 border border-slate-700 p-5">
            <h2 className="text-lg font-semibold text-amber-400 mb-3">Voids / Refunds</h2>
            <ul className="space-y-2">
              {order.voids.map((v) => (
                <li key={v.id} className="text-sm text-slate-300">
                  <span className="text-amber-400">{v.type}</span>
                  {v.product_name && ` · ${v.product_name}${v.quantity ? ` × ${v.quantity}` : ""}`}
                  {(v.amount ?? 0) > 0 && <span className="text-red-400 ml-2">{fmt(v.amount!)} AED</span>}
                  {v.user_name && <span className="text-slate-500 ml-2">by {v.user_name}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-slate-500 text-sm">Status: <span className="capitalize">{order.status}</span></p>
      </main>
    </div>
  );
}
