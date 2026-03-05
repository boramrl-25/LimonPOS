"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Settings, Package, Users, Printer, FolderOpen, BarChart3, SlidersHorizontal, Map, RefreshCw, LogOut, Wallet, CreditCard, Banknote, UtensilsCrossed } from "lucide-react";
import { getToken, getSetupStatus, getTables, getProducts, getCategories, getModifierGroups, getPrinters, getUsers, getDashboardStats, logout } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<{
    todaySales: number;
    totalCash: number;
    totalCard: number;
    openTables: number;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    getSetupStatus()
      .then(({ setupComplete }) => {
        if (!setupComplete) router.replace("/setup");
        else setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await getDashboardStats();
      const pb = res.paymentBreakdown || {};
      setStats({
        todaySales: res.todaySales ?? 0,
        totalCash: pb.cash ?? 0,
        totalCard: pb.card ?? 0,
        openTables: res.openTables ?? 0,
      });
    } catch (e) {
      setSummaryError((e as Error).message || "Veri yüklenemedi");
      setStats(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadSummary();
    const id = setInterval(loadSummary, 15_000);
    return () => clearInterval(id);
  }, [ready, loadSummary]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">Yükleniyor...</div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <header className="border-b border-slate-800 bg-black px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-sky-400">Limon POS Back-Office</h1>
          <p className="text-slate-400 text-sm mt-1">Dashboard & Settings</p>
        </div>
        <button
          type="button"
          onClick={() => { logout(); router.replace("/login"); router.refresh(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        {summaryError && (
          <p className="text-amber-400 text-sm mb-3">{summaryError}</p>
        )}
        {/* Total Sales, Card, Cash, Open Tables — küçük ikonlar, okunaklı yazı (mobil) */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-slate-400">Bugün</h2>
            <button
              type="button"
              onClick={loadSummary}
              disabled={summaryLoading}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-50"
              aria-label="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${summaryLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                <span className="text-[11px] sm:text-xs text-slate-400 truncate">Total Sales</span>
              </div>
              <p className="text-sm font-semibold text-white leading-tight truncate" title={stats ? `${fmt(stats.todaySales)} AED` : ""}>
                {summaryLoading && !stats ? "…" : stats ? `${fmt(stats.todaySales)}` : "0.00"} <span className="text-[10px] font-normal text-slate-500">AED</span>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-sky-400 shrink-0" aria-hidden />
                <span className="text-[11px] sm:text-xs text-slate-400 truncate">Card</span>
              </div>
              <p className="text-sm font-semibold text-white leading-tight truncate">
                {summaryLoading && !stats ? "…" : stats ? `${fmt(stats.totalCard)}` : "0.00"} <span className="text-[10px] font-normal text-slate-500">AED</span>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden />
                <span className="text-[11px] sm:text-xs text-slate-400 truncate">Cash</span>
              </div>
              <p className="text-sm font-semibold text-white leading-tight truncate">
                {summaryLoading && !stats ? "…" : stats ? `${fmt(stats.totalCash)}` : "0.00"} <span className="text-[10px] font-normal text-slate-500">AED</span>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <UtensilsCrossed className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
                <span className="text-[11px] sm:text-xs text-slate-400 truncate">Open</span>
              </div>
              <p className="text-sm font-semibold text-white leading-tight">
                {summaryLoading && !stats ? "…" : stats ? stats.openTables : 0}
              </p>
            </div>
          </div>
        </section>

        <h2 className="text-sm font-semibold text-slate-200 mb-3">Menü</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <LayoutDashboard className="w-10 h-10 text-sky-400" />
            <div>
              <h2 className="font-semibold">Dashboard</h2>
              <p className="text-slate-400 text-sm">Analytics & Overview</p>
            </div>
          </Link>

          <Link
            href="/floorplan"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <Map className="w-10 h-10 text-amber-400" />
            <div>
              <h2 className="font-semibold">Floor Plan</h2>
              <p className="text-slate-400 text-sm">Tables, sections, filters</p>
            </div>
          </Link>

          <Link
            href="/dailysales"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <BarChart3 className="w-10 h-10 text-sky-400" />
            <div>
              <h2 className="font-semibold">Daily Sales</h2>
              <p className="text-slate-400 text-sm">Daily sales report from all apps</p>
            </div>
          </Link>

          <Link
            href="/settings"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-10 h-10 text-sky-400" />
            <div>
              <h2 className="font-semibold">Settings</h2>
              <p className="text-slate-400 text-sm">Payment, Zoho, Email, Users</p>
            </div>
          </Link>

          <Link
            href="/products"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <Package className="w-10 h-10 text-sky-400" />
            <div>
              <h2 className="font-semibold">Products</h2>
              <p className="text-slate-400 text-sm">Add, edit products</p>
            </div>
          </Link>

          <Link
            href="/categories"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <FolderOpen className="w-10 h-10 text-sky-400" />
            <div>
              <h2 className="font-semibold">Categories</h2>
              <p className="text-slate-400 text-sm">Category management</p>
            </div>
          </Link>

          <Link
            href="/modifiers"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <SlidersHorizontal className="w-10 h-10 text-amber-400" />
            <div>
              <h2 className="font-semibold">Modifiers</h2>
              <p className="text-slate-400 text-sm">Modifier groups for products</p>
            </div>
          </Link>

          <Link
            href="/printers"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <Printer className="w-10 h-10 text-sky-400" />
            <div>
              <h2 className="font-semibold">Printers</h2>
              <p className="text-slate-400 text-sm">Kitchen and receipt printers</p>
            </div>
          </Link>

          <Link
            href="/settings/users"
            className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-colors"
          >
            <Users className="w-10 h-10 text-sky-400" />
            <div>
              <h2 className="font-semibold">Users</h2>
              <p className="text-slate-400 text-sm">Staff management</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
