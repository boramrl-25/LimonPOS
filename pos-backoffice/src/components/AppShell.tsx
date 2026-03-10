"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import { useUser } from "@/context/UserContext";
import { getToken } from "@/lib/api";
import { Menu } from "lucide-react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { canAccessPage, loading } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hideSidebar = pathname === "/login" || pathname === "/setup";

  useEffect(() => {
    if (hideSidebar || loading) return;
    const token = getToken();
    if (!token) return;
    if (!canAccessPage(pathname)) {
      router.replace("/");
    }
  }, [pathname, hideSidebar, loading, canAccessPage, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (hideSidebar) {
    return <div className="flex-1 min-h-screen overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex min-h-screen">
      <div className="fixed top-4 left-4 z-50 md:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform md:relative md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>
      <div className="flex-1 min-h-0 overflow-y-auto pt-12 md:pt-0">{children}</div>
    </div>
  );
}
