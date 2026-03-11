"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, ShieldCheck, Table, ShoppingBag, Package, AlertCircle } from "lucide-react";
import {
  getDeletedRecords,
  restoreTable,
  restoreOrder,
  restoreOrderItem,
  getSyncErrors,
} from "@/lib/api";

type DeletedRecord = Record<string, unknown> & { id: string; deletedAt?: string };
type SyncError = { id: string; source: string; entity_type: string; entity_id: string | null; message: string | null; createdAt: string };

export default function RecoveryPage() {
  const [deleted, setDeleted] = useState<{
    tables: DeletedRecord[];
    orders: DeletedRecord[];
    orderItems: DeletedRecord[];
  } | null>(null);
  const [syncErrors, setSyncErrors] = useState<SyncError[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const [del, errs] = await Promise.all([getDeletedRecords(), getSyncErrors()]);
      setDeleted({ tables: del.tables as DeletedRecord[], orders: del.orders as DeletedRecord[], orderItems: del.orderItems as DeletedRecord[] });
      setSyncErrors(errs);
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRestoreTable(id: string) {
    setRestoringId(id);
    setMessage(null);
    try {
      await restoreTable(id);
      setMessage({ type: "success", text: "Masa geri yüklendi." });
      await load();
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    } finally {
      setRestoringId(null);
    }
  }

  async function handleRestoreOrder(id: string) {
    setRestoringId(id);
    setMessage(null);
    try {
      await restoreOrder(id);
      setMessage({ type: "success", text: "Sipariş geri yüklendi." });
      await load();
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    } finally {
      setRestoringId(null);
    }
  }

  async function handleRestoreOrderItem(id: string) {
    setRestoringId(id);
    setMessage(null);
    try {
      await restoreOrderItem(id);
      setMessage({ type: "success", text: "Sipariş kalemi geri yüklendi." });
      await load();
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    } finally {
      setRestoringId(null);
    }
  }

  const totalDeleted = deleted
    ? deleted.tables.length + deleted.orders.length + deleted.orderItems.length
    : 0;
  const hasAny = totalDeleted > 0 || syncErrors.length > 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4">
        <Link href="/settings" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <ShieldCheck className="w-8 h-8 text-amber-500" />
        <div>
          <h1 className="text-xl font-bold text-sky-400">Veri Denetim ve Kurtarma</h1>
          <p className="text-slate-400 text-sm">
            Soft delete ile silinmiş kayıtlar ve senkronizasyon hataları
          </p>
        </div>
      </header>

      <main className="p-6 max-w-4xl">
        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-emerald-900/50 text-emerald-200 border border-emerald-700"
                : "bg-red-900/50 text-red-200 border border-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Yükleniyor…</p>
        ) : !hasAny ? (
          <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-8 text-center">
            <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-slate-300">Silinmiş kayıt veya senkronizasyon hatası bulunmuyor.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Silinmiş Masalar */}
            {deleted && deleted.tables.length > 0 && (
              <section className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
                  <Table className="w-5 h-5 text-slate-400" />
                  Silinmiş Masalar ({deleted.tables.length})
                </h2>
                <ul className="space-y-3">
                  {deleted.tables.map((t) => (
                    <li
                      key={String(t.id)}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-900 border border-slate-600"
                    >
                      <div>
                        <span className="font-medium text-white">
                          Masa {String(t.number ?? "")} – {String(t.name ?? "")}
                        </span>
                        <span className="text-slate-400 text-sm ml-2">
                          ({String(t.floor ?? "")})
                          {t.deletedAt != null && (
                            <> · {new Date(String(t.deletedAt)).toLocaleString("tr-TR")}</>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreTable(String(t.id))}
                        disabled={restoringId !== null}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {restoringId === t.id ? "Yükleniyor…" : "Geri Yükle"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Silinmiş Siparişler */}
            {deleted && deleted.orders.length > 0 && (
              <section className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
                  <ShoppingBag className="w-5 h-5 text-slate-400" />
                  Silinmiş Siparişler ({deleted.orders.length})
                </h2>
                <ul className="space-y-3">
                  {deleted.orders.map((o) => (
                    <li
                      key={String(o.id)}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-900 border border-slate-600"
                    >
                      <div>
                        <span className="font-medium text-white">
                          Sipariş {String(o.id).slice(0, 12)}…
                        </span>
                        <span className="text-slate-400 text-sm ml-2">
                          Masa {String(o.table_number ?? "")} · {String(o.total ?? 0)} {o.deletedAt != null && `· ${new Date(String(o.deletedAt)).toLocaleString("tr-TR")}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreOrder(String(o.id))}
                        disabled={restoringId !== null}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {restoringId === o.id ? "Yükleniyor…" : "Geri Yükle"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Silinmiş Sipariş Kalemleri */}
            {deleted && deleted.orderItems.length > 0 && (
              <section className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
                  <Package className="w-5 h-5 text-slate-400" />
                  Silinmiş Sipariş Kalemleri ({deleted.orderItems.length})
                </h2>
                <ul className="space-y-3">
                  {deleted.orderItems.map((i) => (
                    <li
                      key={String(i.id)}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-900 border border-slate-600"
                    >
                      <div>
                        <span className="font-medium text-white">{String(i.product_name ?? "")}</span>
                        <span className="text-slate-400 text-sm ml-2">
                          {Number(i.quantity ?? 0)}× {Number(i.price ?? 0)}
                          {i.deletedAt != null && ` · ${new Date(String(i.deletedAt)).toLocaleString("tr-TR")}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreOrderItem(String(i.id))}
                        disabled={restoringId !== null}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {restoringId === i.id ? "Yükleniyor…" : "Geri Yükle"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Senkronizasyon Hataları */}
            {syncErrors.length > 0 && (
              <section className="rounded-xl bg-slate-800/50 border border-amber-700/50 p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-400 mb-4">
                  <AlertCircle className="w-5 h-5" />
                  Senkronizasyon Hataları ({syncErrors.length})
                </h2>
                <p className="text-slate-400 text-sm mb-4">
                  Android cihazlardan veya web tarafından bildirilen hatalar.
                </p>
                <ul className="space-y-2">
                  {syncErrors.map((e) => (
                    <li
                      key={e.id}
                      className="p-3 rounded-lg bg-slate-900/80 border border-slate-600 text-sm"
                    >
                      <span className="text-amber-400 font-medium">{e.entity_type}</span>
                      {e.entity_id && <span className="text-slate-400"> ({e.entity_id})</span>}
                      {e.message && <p className="text-slate-300 mt-1">{e.message}</p>}
                      <p className="text-slate-500 text-xs mt-1">
                        {new Date(e.createdAt).toLocaleString("tr-TR")} · Kaynak: {e.source}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
