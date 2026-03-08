"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "./Sidebar";
import { useUser } from "@/context/UserContext";
import { getToken } from "@/lib/api";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { canAccessPage, loading } = useUser();
  const hideSidebar = pathname === "/login" || pathname === "/setup";

  useEffect(() => {
    if (hideSidebar || loading) return;
    const token = getToken();
    if (!token) return;
    if (!canAccessPage(pathname)) {
      router.replace("/");
    }
  }, [pathname, hideSidebar, loading, canAccessPage, router]);

  if (hideSidebar) {
    return <div className="flex-1 min-h-screen overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}
