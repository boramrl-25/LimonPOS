import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { UserProvider } from "@/context/UserContext";

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
      <body className="antialiased bg-black text-slate-100 min-h-screen">
        <UserProvider>
          <AppShell>{children}</AppShell>
        </UserProvider>
      </body>
    </html>
  );
}
