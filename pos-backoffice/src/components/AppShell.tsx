"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideSidebar = pathname === "/login" || pathname === "/setup";

  if (hideSidebar) {
    return <div className="flex-1 min-h-screen">{children}</div>;
  }

  return (
    <div className="flex">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
