"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, Wifi, WifiOff } from "lucide-react";
import { getDevices, requestClearLocalData, type DeviceInfo } from "@/lib/api";

export default function ClearLocalDataPage() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadDevices() {
    try {
      const list = await getDevices();
      setDevices(list);
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, []);

  async function handleClear(device: DeviceInfo) {
    setClearingId(device.id);
    setMessage(null);
    try {
      await requestClearLocalData(device.id);
      setMessage({ type: "success", text: `${device.name || device.id} için temizleme talebi gönderildi. Uygulama sonraki senkronizasyonda veriyi silecek.` });
      await loadDevices();
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setClearingId(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4">
        <Link href="/settings" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-sky-400">Clear local sales data on apps</h1>
          <p className="text-slate-400 text-sm">Bağlı cihazlardan yerel satış verilerini temizle</p>
        </div>
      </header>

      <main className="p-6 max-w-2xl">
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
          <p className="text-slate-300 text-sm mb-4">
            Aşağıdaki listede kayıtlı cihazlar görünür. Bir cihaza <strong>Sil</strong> ile tıkladığınızda, o cihaza temizleme talebi gönderilir. Cihaz sonraki senkronizasyonda (sync) yerel sipariş, ödeme ve masa verilerini siler.
          </p>

          {message && (
            <div
              className={`mb-4 px-4 py-3 rounded-lg text-sm ${message.type === "success" ? "bg-emerald-900/50 text-emerald-200 border border-emerald-700" : "bg-red-900/50 text-red-200 border border-red-700"}`}
            >
              {message.text}
            </div>
          )}

          {loading ? (
            <p className="text-slate-400">Cihazlar yükleniyor…</p>
          ) : devices.length === 0 ? (
            <p className="text-slate-400">Kayıtlı cihaz bulunamadı. POS uygulaması en az bir kez senkronize olduğunda burada görünür.</p>
          ) : (
            <ul className="space-y-3">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-4 p-4 rounded-lg bg-slate-900 border border-slate-600 hover:border-slate-500"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${d.online ? "bg-emerald-900/50" : "bg-slate-700"}`}
                      title={d.online ? "Çevrimiçi" : "Çevrimdışı"}
                    >
                      {d.online ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">{d.name || d.id}</div>
                      <div className="text-slate-400 text-sm truncate">
                        {d.app_version ? `v${d.app_version} • ` : ""}
                        Son: {d.last_seen ? new Date(d.last_seen).toLocaleString("tr-TR") : "-"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClear(d)}
                    disabled={!!clearingId}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-medium shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    {clearingId === d.id ? "Gönderiliyor…" : "Sil"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
