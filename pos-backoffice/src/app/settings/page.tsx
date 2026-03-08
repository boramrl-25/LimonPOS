"use client";

import Link from "next/link";
import { CreditCard, BookOpen, Mail, Users, ArrowLeft, SlidersHorizontal, Globe, Trash2, Printer, Receipt, Clock } from "lucide-react";

const settingsSections = [
  { href: "/printers", label: "Printers (Receipt & Kitchen)", icon: Printer, description: "Customer bill → Receipt. Kitchen orders → Kitchen." },
  { href: "/settings/receipt", label: "Customer Receipt & Kitchen Receipt", icon: Receipt, description: "Company name, address, receipt message, kitchen header" },
  { href: "/settings/general", label: "General, Timezone & Currency", icon: Globe, description: "Timezone, currency (para birimi) for amounts and cash drawer symbol" },
  { href: "/settings/business-hours", label: "Business Hours & End of Day", icon: Clock, description: "Opening, closing, warning time, auto-close open tables" },
  { href: "/settings/payment", label: "Payment Methods & Integrations", icon: CreditCard, description: "Cash, Card, Custom payment methods" },
  { href: "/settings/zoho", label: "Zoho Books Integration", icon: BookOpen, description: "Sync sales and products" },
  { href: "/settings/email", label: "Email & SMTP Settings", icon: Mail, description: "Z-Report recipients, SMTP config" },
  { href: "/modifiers", label: "Modifier Groups", icon: SlidersHorizontal, description: "Size, extras, options for products" },
  { href: "/settings/users", label: "Users & Permissions", icon: Users, description: "Staff management, roles, permissions matrix" },
  { href: "/settings/clear-test-data", label: "Clear test data (date range)", icon: Trash2, description: "Delete orders and sales data between two dates" },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-sky-400">Settings</h1>
          <p className="text-slate-400 text-sm">POS Back-office & Dashboard configuration</p>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-center gap-4 p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-sky-500/50 hover:bg-slate-800 transition-all"
            >
              <div className="p-3 rounded-lg bg-sky-500/20">
                <section.icon className="w-6 h-6 text-sky-400" />
              </div>
              <div>
                <h2 className="font-semibold text-white">{section.label}</h2>
                <p className="text-slate-400 text-sm mt-1">{section.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
