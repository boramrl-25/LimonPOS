"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Settings, Package, Users, Printer, FolderOpen, BarChart3, SlidersHorizontal, Map, RefreshCw, LogOut } from "lucide-react";
import { getToken, getSetupStatus, getTables, getProducts, getCategories, getModifierGroups, getPrinters, getUsers, getDashboardStats, logout } from "@/lib/api";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<{
    tablesTotal: number;
    tablesFree: number;
    tablesOccupied: number;
    products: number;
    categories: number;
    modifiers: number;
    printers: number;
    users: number;
    todaySales: number;
    openTables: number;
    openChecks: number;
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
      const [tables, products, categories, modifiers, printers, users, stats] = await Promise.all([
        getTables(),
        getProducts(),
        getCategories(),
        getModifierGroups(),
        getPrinters(),
        getUsers(),
        getDashboardStats(),
      ]);
      const tablesFree = tables.filter((t: { status: string }) => t.status === "free").length;
      const tablesOccupied = tables.filter((t: { status: string }) => t.status === "occupied" || t.status === "bill").length;
      setSummary({
        tablesTotal: tables.length,
        tablesFree,
        tablesOccupied,
        products: products.length,
        categories: categories.length,
        modifiers: modifiers.length,
        printers: printers.length,
        users: users.length,
        todaySales: stats.todaySales ?? 0,
        openTables: stats.openTables ?? 0,
        openChecks: stats.openChecks ?? 0,
      });
    } catch (e) {
      setSummaryError((e as Error).message || "Veri yüklenemedi");
      setSummary(null);
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

      <main className="flex-1 p-6">
        {/* Bütün bilgiler özeti */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-200">Bütün bilgiler (özet)</h2>
            <button
              type="button"
              onClick={loadSummary}
              disabled={summaryLoading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${summaryLoading ? "animate-spin" : ""}`} />
              Yenile
            </button>
          </div>
          {summaryError && (
            <p className="text-amber-400 text-sm mb-3">{summaryError}</p>
          )}
          {summaryLoading && !summary ? (
            <p className="text-slate-500 py-4">Yükleniyor...</p>
          ) : summary ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Masalar</p>
                <p className="text-lg font-bold text-white">{summary.tablesTotal} <span className="text-slate-500 font-normal text-sm">(Boş: {summary.tablesFree}, Dolu: {summary.tablesOccupied})</span></p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Ürünler</p>
                <p className="text-lg font-bold text-white">{summary.products}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Kategoriler</p>
                <p className="text-lg font-bold text-white">{summary.categories}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Modifier grupları</p>
                <p className="text-lg font-bold text-white">{summary.modifiers}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Yazıcılar</p>
                <p className="text-lg font-bold text-white">{summary.printers}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Kullanıcılar</p>
                <p className="text-lg font-bold text-white">{summary.users}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Bugünkü satış</p>
                <p className="text-lg font-bold text-emerald-400">{fmt(summary.todaySales)} AED</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Açık masa</p>
                <p className="text-lg font-bold text-amber-400">{summary.openTables}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                <p className="text-slate-400 text-xs">Açık hesap</p>
                <p className="text-lg font-bold text-sky-400">{summary.openChecks}</p>
              </div>
            </div>
          ) : null}
        </section>

        <h2 className="text-lg font-semibold text-slate-200 mb-4">Menü</h2>
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
