"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUser, getStoredUser, type CurrentUser } from "@/lib/api";

type UserContextType = {
  user: CurrentUser | null;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  canAccessPage: (path: string) => boolean;
};

function getPermissionForPath(path: string): string | null {
  if (path.startsWith("/dashboard")) return "web_dashboard";
  if (path.startsWith("/floorplan")) return "web_floorplan";
  if (path.startsWith("/products")) return "web_products";
  if (path.startsWith("/modifiers")) return "web_modifiers";
  if (path.startsWith("/categories")) return "web_categories";
  if (path.startsWith("/printers")) return "web_printers";
  if (path.startsWith("/reports")) return "web_reports";
  if (path.startsWith("/settings/users")) return "web_users";
  if (path.startsWith("/settings")) return "web_settings";
  return null;
}

const FULL_ACCESS_ROLES = ["admin", "manager"];

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  hasPermission: () => false,
  canAccessPage: () => false,
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUser(u ?? getStoredUser()))
      .catch(() => setUser(getStoredUser()))
      .finally(() => setLoading(false));
  }, []);

  const hasPermission = (perm: string): boolean => {
    if (loading) return true;
    if (!user) return false;
    if (FULL_ACCESS_ROLES.includes(user.role)) return true;
    return Array.isArray(user.permissions) && user.permissions.includes(perm);
  };

  const canAccessPage = (path: string): boolean => {
    if (loading) return true;
    if (!user) return false;
    if (FULL_ACCESS_ROLES.includes(user.role)) return true;
    const perm = getPermissionForPath(path);
    return perm ? hasPermission(perm) : true;
  };

  return (
    <UserContext.Provider value={{ user, loading, hasPermission, canAccessPage }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
