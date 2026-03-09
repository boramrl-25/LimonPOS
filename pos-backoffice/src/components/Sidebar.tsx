"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  CreditCard,
  Banknote,
  BookOpen,
  Users,
  Package,
  Printer,
  FolderOpen,
  Map,
  LogOut,
  FileText,
  Receipt,
  TrendingUp,
  XCircle,
  RotateCcw,
  BarChart2,
  ShoppingBag,
  SlidersHorizontal,
} from "lucide-react";
import { logout } from "@/lib/api";
import { useUser } from "@/context/UserContext";

const navItems: { href: string; label: string; icon: typeof LayoutDashboard; permission: string }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "web_dashboard" },
  { href: "/dashboard/cash-card", label: "Cash & Card", icon: Banknote, permission: "web_dashboard" },
  { href: "/floorplan", label: "Floor Plan", icon: Map, permission: "web_floorplan" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "web_settings" },
  { href: "/settings/payment", label: "Payment Methods", icon: CreditCard, permission: "web_settings" },
  { href: "/settings/zoho", label: "Zoho Books", icon: BookOpen, permission: "web_settings" },
  { href: "/settings/users", label: "Users", icon: Users, permission: "web_users" },
  { href: "/products", label: "Products", icon: Package, permission: "web_products" },
  { href: "/modifiers", label: "Modifiers", icon: SlidersHorizontal, permission: "web_modifiers" },
  { href: "/categories", label: "Categories", icon: FolderOpen, permission: "web_categories" },
  { href: "/printers", label: "Printers", icon: Printer, permission: "web_printers" },
];

const reportItems = [
  { href: "/reports/daily-summary", label: "Daily Sales", icon: Receipt },
  { href: "/reports/sales", label: "Sales Report", icon: TrendingUp },
  { href: "/reports/voids", label: "Void Report", icon: XCircle },
  { href: "/reports/refunds", label: "Refund Report", icon: RotateCcw },
  { href: "/reports/category-sales", label: "Category Sales", icon: BarChart2 },
  { href: "/reports/product-sales", label: "Product Sales", icon: ShoppingBag },
];

export default function Sidebar() {
  const { hasPermission } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  function handleLogout() {
    logout();
    router.replace("/login");
    router.refresh();
  }
  return (
    <aside className="w-64 border-r border-slate-800 bg-black min-h-screen p-4 flex flex-col">
      <Link href="/" className="block mb-6">
        <h1 className="text-lg font-bold text-sky-400">Limon POS</h1>
        <p className="text-xs text-slate-400">Back-Office</p>
      </Link>
      <nav className="space-y-1 flex-1">
        {navItems.filter((item) => hasPermission(item.permission)).map((item) => {
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
        {hasPermission("web_reports") && (
        <div className="pt-4 mt-2 border-t border-slate-800">
          <p className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reports</p>
          {reportItems.map((item) => {
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
        </div>
        )}
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
