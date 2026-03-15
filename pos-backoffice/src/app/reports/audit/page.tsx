"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileCheck } from "lucide-react";
import { getAuditReport } from "@/lib/api";

type AuditReport = {
  date: string;
  totalOrders: number;
  appCount: number;
  localBackendCount: number;
  byDevice: Record<string, number>;
  note: string;
};

export default function AuditReportPage() {
  const [data, setData] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuditReport()
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-black p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-sky-400">Gün Sonu Audit Raporu</h1>
            <p className="text-slate-400 text-sm">Hibrit mimari: App vs Local Backend sipariş dağılımı</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl">
        {loading && <p className="text-slate-400">Yükleniyor...</p>}
        {error && <p className="text-amber-400 mb-4">{error}</p>}
        {data && (
          <div className="space-y-6">
            <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">{data.date}</h2>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-slate-400">Toplam sipariş</dt>
                  <dd className="text-white font-medium">{data.totalOrders}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">App (direct Cloud fallback)</dt>
                  <dd className="text-amber-400">{data.appCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Local Backend</dt>
                  <dd className="text-emerald-400">{data.localBackendCount}</dd>
                </div>
              </dl>
              <p className="text-slate-500 text-sm mt-4">{data.note}</p>
            </div>

            {Object.keys(data.byDevice || {}).length > 0 && (
              <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Cihaz bazında</h2>
                <dl className="space-y-2">
                  {Object.entries(data.byDevice).map(([deviceId, count]) => (
                    <div key={deviceId} className="flex justify-between">
                      <dt className="text-slate-400 font-mono text-sm truncate max-w-[200px]" title={deviceId}>
                        {deviceId}
                      </dt>
                      <dd className="text-white">{count}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
