import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Limon POS Back-Office & Dashboard",
  description: "POS Back-Office Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        <div className="flex">
          <div className="hidden md:block">
            <Sidebar />
          </div>
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
