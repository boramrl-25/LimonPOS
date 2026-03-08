"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSettings, updateSettings } from "@/lib/api";

export default function ReceiptSettingsPage() {
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [receiptHeader, setReceiptHeader] = useState("BILL / RECEIPT");
  const [receiptFooterMessage, setReceiptFooterMessage] = useState("Thank you!");
  const [kitchenHeader, setKitchenHeader] = useState("KITCHEN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const s = await getSettings();
      setCompanyName(s.company_name ?? "");
      setCompanyAddress(s.company_address ?? "");
      setReceiptHeader(s.receipt_header ?? "BILL / RECEIPT");
      setReceiptFooterMessage(s.receipt_footer_message ?? "Thank you!");
      setKitchenHeader(s.kitchen_header ?? "KITCHEN");
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings({
        company_name: companyName,
        company_address: companyAddress,
        receipt_header: receiptHeader || "BILL / RECEIPT",
        receipt_footer_message: receiptFooterMessage || "Thank you!",
        kitchen_header: kitchenHeader || "KITCHEN",
      });
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
          <h1 className="text-xl font-bold text-sky-400">Müşteri Fişi & Mutfak Fişi</h1>
          <p className="text-slate-400 text-sm">Şirket bilgileri, fatura mesajı ve mutfak fişi başlığı</p>
        </div>
      </header>

      <main className="p-6 max-w-2xl">
        <form onSubmit={save} className="space-y-6">
          {/* Müşteri Fişi / Bill */}
          <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Müşteri Fişi (Bill / Receipt)</h2>

            <label className="block text-sm text-slate-300 mb-2">Şirket / İşletme adı</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Örn: Limon Restoran"
              maxLength={200}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4 placeholder-slate-500"
            />

            <label className="block text-sm text-slate-300 mb-2">Adres</label>
            <textarea
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder="Örn: Atatürk Cad. No:1, Kadıköy"
              maxLength={400}
              rows={3}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4 placeholder-slate-500 resize-none"
            />

            <label className="block text-sm text-slate-300 mb-2">Fiş başlığı</label>
            <input
              type="text"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              placeholder="BILL / RECEIPT"
              maxLength={100}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white mb-4 placeholder-slate-500"
            />

            <label className="block text-sm text-slate-300 mb-2">Fiş sonu mesajı</label>
            <textarea
              value={receiptFooterMessage}
              onChange={(e) => setReceiptFooterMessage(e.target.value)}
              placeholder="Thank you! / Teşekkür ederiz!"
              maxLength={300}
              rows={2}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 resize-none"
            />
          </div>

          {/* Mutfak Fişi */}
          <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Mutfak Fişi</h2>

            <label className="block text-sm text-slate-300 mb-2">Mutfak fişi başlığı</label>
            <input
              type="text"
              value={kitchenHeader}
              onChange={(e) => setKitchenHeader(e.target.value)}
              placeholder="KITCHEN / MUTFAK"
              maxLength={100}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500"
            />
            <p className="text-slate-500 text-xs mt-2">
              Mutfak yazıcısına giden fişin üst kısmında görünür.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-white font-medium"
            >
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            {saved && <span className="text-green-400">Kaydedildi.</span>}
          </div>
        </form>
      </main>
    </div>
  );
}
