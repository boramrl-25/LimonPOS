"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Settings, Package, Users, Printer, FolderOpen, BarChart3, SlidersHorizontal, Map } from "lucide-react";
import { getToken, getSetupStatus } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
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

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">Yükleniyor...</div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <h1 className="text-xl font-bold text-sky-400">Limon POS Back-Office</h1>
        <p className="text-slate-400 text-sm mt-1">Dashboard & Settings</p>
      </header>

      <main className="flex-1 p-6">
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
