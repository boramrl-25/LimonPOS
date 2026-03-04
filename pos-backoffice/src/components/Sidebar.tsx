"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  CreditCard,
  BookOpen,
  Users,
  Package,
  Printer,
  FolderOpen,
  BarChart3,
  Banknote,
  Map,
  LogOut,
} from "lucide-react";
import { logout } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/floorplan", label: "Floor Plan", icon: Map },
  { href: "/dailysales", label: "Daily Sales", icon: BarChart3 },
  { href: "/dashboard/logs/cash-drawer", label: "Kasa / Cash Drawer", icon: Banknote },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/payment", label: "Payment Methods", icon: CreditCard },
  { href: "/settings/zoho", label: "Zoho Books", icon: BookOpen },
  { href: "/settings/users", label: "Users", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/categories", label: "Categories", icon: FolderOpen },
  { href: "/printers", label: "Printers", icon: Printer },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  function handleLogout() {
    logout();
    router.replace("/login");
    router.refresh();
  }
  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/50 min-h-screen p-4 flex flex-col">
      <Link href="/" className="block mb-6">
        <h1 className="text-lg font-bold text-sky-400">Limon POS</h1>
        <p className="text-xs text-slate-400">Back-Office</p>
      </Link>
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors mt-4 border-t border-slate-800 pt-4"
      >
        <LogOut className="w-4 h-4 flex-shrink-0" />
        Logout
      </button>
    </aside>
  );
}
