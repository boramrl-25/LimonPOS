"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSettings, updateSettings } from "@/lib/api";

const TIMEZONE_OPTIONS = [
  { label: "UTC", value: 0 },
  { label: "GMT+1 (Örn. Berlin)", value: 60 },
  { label: "GMT+2 (Örn. İstanbul kış)", value: 120 },
  { label: "GMT+3 (Türkiye)", value: 180 },
  { label: "GMT+4", value: 240 },
  { label: "GMT-1", value: -60 },
  { label: "GMT-2", value: -120 },
  { label: "GMT-3", value: -180 },
  { label: "GMT-4", value: -240 },
  { label: "GMT-5", value: -300 },
];

export default function GeneralSettingsPage() {
  const [timezoneOffsetMinutes, setTimezoneOffsetMinutes] = useState(180);
  const [manualOffset, setManualOffset] = useState("");
  const [overdueUndeliveredMinutes, setOverdueUndeliveredMinutes] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const s = await getSettings();
      setTimezoneOffsetMinutes(s.timezone_offset_minutes ?? 0);
      setOverdueUndeliveredMinutes(Math.min(1440, Math.max(1, s.overdue_undelivered_minutes ?? 10)));
      setManualOffset("");
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  async function save(e?: React.MouseEvent) {
    e?.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const offset = manualOffset !== "" ? parseInt(manualOffset, 10) : timezoneOffsetMinutes;
      if (isNaN(offset) || offset < -720 || offset > 840) {
        alert("Saat dilimi -720 ile 840 dakika arasında olmalı (GMT-12 ile GMT+14).");
        return;
      }
      const overdue = Math.min(1440, Math.max(1, overdueUndeliveredMinutes));
      await updateSettings({ timezone_offset_minutes: offset, overdue_undelivered_minutes: overdue });
      setTimezoneOffsetMinutes(offset);
      setOverdueUndeliveredMinutes(overdue);
      setManualOffset("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4">
        <Link href="/settings" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-sky-400">Genel & Saat Dilimi</h1>
          <p className="text-slate-400 text-sm">Günlük satış ve iş günü hesaplamaları bu saate göre yapılır</p>
        </div>
      </header>

      <main className="p-6 max-w-xl">
        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Saat dilimi (Timezone)</h2>
          <p className="text-slate-400 text-sm mb-4">
            Dashboard ve günlük satışlarda &quot;bugün&quot; bu saate göre hesaplanır. Türkiye için GMT+3 (180 dakika) seçin.
          </p>

          <label className="block text-sm text-slate-300 mb-2">Hazır seçenekler</label>
          <select
            value={manualOffset !== "" ? "" : timezoneOffsetMinutes}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") return;
              setTimezoneOffsetMinutes(Number(v));
              setManualOffset("");
            }}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4"
          >
            {TIMEZONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.value >= 0 ? "+" : ""}{opt.value} dk)
              </option>
            ))}
          </select>

          <label className="block text-sm text-slate-300 mb-2">Manuel giriş (dakika)</label>
          <input
            type="number"
            placeholder="Örn. 180 (GMT+3)"
            min={-720}
            max={840}
            value={manualOffset}
            onChange={(e) => setManualOffset(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4"
          />
          <p className="text-slate-500 text-xs mb-6">
            UTC&apos;den fark: dakika cinsinden (örn. 180 = GMT+3, -300 = GMT-5). Boş bırakırsanız yukarıdaki seçenek kullanılır.
          </p>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-white font-medium"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
          {saved && <span className="ml-3 text-green-400">Kaydedildi.</span>}
        </div>

        <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6 mt-6">
          <h2 className="text-lg font-semibold text-white mb-2">Masaya gitmeyen ürün uyarısı (varsayılan süre)</h2>
          <p className="text-slate-400 text-sm mb-4">
            Mutfağa gidip belirtilen süre (dakika) içinde masaya ulaşmayan ürünler için uygulama uyarı verir. Ürün veya kategoride ayrı süre tanımlıysa o kullanılır; yoksa bu varsayılan süre geçerli olur.
          </p>
          <label className="block text-sm text-slate-300 mb-2">Varsayılan süre (dakika)</label>
          <input
            type="number"
            min={1}
            max={1440}
            value={overdueUndeliveredMinutes}
            onChange={(e) => setOverdueUndeliveredMinutes(Math.min(1440, Math.max(1, parseInt(e.target.value, 10) || 10)))}
            className="w-full max-w-[120px] bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4"
          />
          <p className="text-slate-500 text-xs mb-4">1–1440 dakika (örn. 10 = 10 dakika sonra uyarı)</p>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-white font-medium"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
          {saved && <span className="ml-3 text-green-400">Kaydedildi.</span>}
        </div>
      </main>
    </div>
  );
}
