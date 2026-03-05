"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, FileSpreadsheet, FileDown, Search } from "lucide-react";
import { getUsers, createUser, updateUser, deleteUser, importUsers, getPermissions, type RoleOption, type PermissionOption } from "@/lib/api";
import * as XLSX from "xlsx";

type User = { id: string; name: string; pin: string; role: string; active: number; permissions?: string[]; cash_drawer_permission?: boolean };

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [form, setForm] = useState({ name: "", pin: "", role: "waiter", active: true, permissions: [] as string[], cashDrawerPermission: false });
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredUsers = users
    .filter((u) => {
      const matchSearch = !searchQuery.trim() || u.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchRole = !roleFilter || u.role === roleFilter;
      return matchSearch && matchRole;
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [usersList, permsData] = await Promise.all([getUsers(), getPermissions()]);
      setUsers(usersList);
      setRoles(permsData.roles);
      setPermissions(permsData.permissions);
    } catch {
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  function openEdit(u?: User) {
    if (u) {
      setEditing(u);
      setForm({
        name: u.name,
        pin: u.pin,
        role: u.role,
        active: (u.active ?? 1) === 1,
        permissions: Array.isArray(u.permissions) ? u.permissions : [],
        cashDrawerPermission: !!u.cash_drawer_permission,
      });
    } else {
      setEditing(null);
      setForm({ name: "", pin: "", role: "waiter", active: true, permissions: [], cashDrawerPermission: false });
    }
  }

  function togglePermission(permId: string) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(permId) ? f.permissions.filter((p) => p !== permId) : [...f.permissions, permId],
    }));
  }

  async function save() {
    try {
      const payload = {
        name: form.name,
        pin: form.pin,
        role: form.role,
        active: form.active,
        permissions: form.permissions,
        cash_drawer_permission: form.cashDrawerPermission,
      };
      if (editing) {
        await updateUser(editing.id, payload);
      } else {
        await createUser(payload);
      }
      await load();
      setEditing(undefined);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function toggleActive(u: User, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const next = (u.active ?? 1) === 1 ? 0 : 1;
      await updateUser(u.id, {
        name: u.name,
        pin: u.pin,
        role: u.role,
        active: next === 1,
        permissions: u.permissions ?? [],
        cash_drawer_permission: !!u.cash_drawer_permission,
      });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete?")) return;
    try {
      await deleteUser(id);
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      let wb: XLSX.WorkBook;
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        wb = XLSX.read(text, { type: "string", raw: true });
      } else {
        const data = await file.arrayBuffer();
        wb = XLSX.read(data, { type: "array" });
      }
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("sheet")) || wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet) as Array<Record<string, unknown>>;
      const users = rows.map((r) => ({
        User: (r.User ?? r.name) as string | undefined,
        role: (r.role ?? r.Role) as string | undefined,
        "Phone Number": (r["Phone Number"] ?? r.phone) as string | undefined,
      }));
      await importUsers(users);
      await load();
      alert(`${users.length} user(s) imported`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  function downloadUsersTemplate() {
    const rows = [
      { User: "Ahmet Yılmaz", Role: "waiter", "Phone Number": "5551234567" },
      { User: "Ayşe Kaya", Role: "cashier", "Phone Number": "5559876543" },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, "users_import_template.xlsx");
  }

  function exportUsersToExcel() {
    if (!users.length) {
      alert("No users to export");
      return;
    }
    const rows = users.map((u) => ({
      Name: u.name,
      Role: u.role,
      PIN: u.pin,
      Active: (u.active ?? 1) === 1 ? "On" : "Off",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, "users.xlsx");
  }

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/settings" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>

      <h1 className="text-2xl font-bold text-sky-400 mb-2">Users</h1>
      <p className="text-slate-400 mb-8">Staff management. Tap row to edit. Default admin PIN: 1234</p>
      <p className="text-slate-500 text-sm mb-4">Excel veya CSV: Örnek dosyayı indir, doldur, yükle.</p>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm min-w-[120px]"
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.label} / {r.labelTr}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
        <span className="text-slate-400">Staff list (A–Z)</span>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileImport} />
          <button
            onClick={downloadUsersTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium"
            title="Import için örnek Excel/CSV indir"
          >
            <FileDown className="w-4 h-4" /> Örnek dosya indir
          </button>
          <button
            onClick={exportUsersToExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium disabled:opacity-50"
          >
            {importing ? <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Yükle (Excel/CSV)
          </button>
          <button onClick={() => openEdit()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">
            <Plus className="w-4 h-4" /> New User
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700 mb-8 relative min-h-[120px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 z-10 rounded-lg">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="text-left p-4 font-medium">Name</th>
              <th className="text-left p-4 font-medium">Role</th>
              <th className="text-left p-4 font-medium">PIN</th>
              <th className="text-left p-4 font-medium w-28">User</th>
              <th className="text-left p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr
                key={u.id}
                onClick={() => openEdit(u)}
                className="border-b border-slate-700/50 hover:bg-slate-800/50 cursor-pointer transition-colors"
              >
                <td className="p-4">{u.name}</td>
                <td className="p-4 capitalize">{u.role}</td>
                <td className="p-4">{u.pin}</td>
                <td className="p-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(ev) => toggleActive(u, ev)}
                    className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${(u.active ?? 1) === 1 ? "bg-emerald-600" : "bg-slate-600"}`}
                    title={(u.active ?? 1) === 1 ? "User active (Off to disable)" : "User inactive (On to enable)"}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${(u.active ?? 1) === 1 ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <span className="ml-2 text-xs text-slate-500">{(u.active ?? 1) === 1 ? "On" : "Off"}</span>
                </td>
                <td className="p-4" onClick={(e) => e.stopPropagation()}>
                  <button onClick={(ev) => remove(u.id, ev)} className="p-1.5 rounded bg-slate-700 hover:bg-red-600/30 text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing !== undefined && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 max-w-lg w-full my-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-sky-400 mb-4">{editing ? "Edit User" : "New User"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">PIN (4-6 digits)</label>
                <input type="password" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white" placeholder="1234" maxLength={6} />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Role</label>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white">
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.label} / {r.labelTr}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${form.active ? "bg-emerald-600" : "bg-slate-600"}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.active ? "translate-x-4" : "translate-x-0.5"}`} style={{ marginTop: 2 }} />
                </button>
                <span className="text-sm text-slate-400">Active (User On/Off)</span>
              </div>

              <div className="border-t border-slate-700 pt-4 mt-4">
                <p className="text-sm font-medium text-slate-300 mb-2">Permissions (App + Web)</p>
                <div className="flex items-center gap-3 mb-3">
                  <input type="checkbox" id="cash_drawer" checked={form.cashDrawerPermission} onChange={() => setForm((f) => ({ ...f, cashDrawerPermission: !f.cashDrawerPermission }))} className="rounded bg-slate-800 border-slate-600" />
                  <label htmlFor="cash_drawer" className="text-sm text-slate-300">Cash drawer (App)</label>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {permissions.filter((p) => p.scope === "app").map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <input type="checkbox" id={p.id} checked={form.permissions.includes(p.id)} onChange={() => togglePermission(p.id)} className="rounded bg-slate-800 border-slate-600" />
                      <label htmlFor={p.id} className="text-sm text-slate-300">{p.labelTr || p.label}</label>
                    </div>
                  ))}
                  {permissions.filter((p) => p.scope === "web").length > 0 && (
                    <>
                      <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700">Web</p>
                      {permissions.filter((p) => p.scope === "web").map((p) => (
                        <div key={p.id} className="flex items-center gap-3">
                          <input type="checkbox" id={p.id} checked={form.permissions.includes(p.id)} onChange={() => togglePermission(p.id)} className="rounded bg-slate-800 border-slate-600" />
                          <label htmlFor={p.id} className="text-sm text-slate-300">{p.labelTr || p.label}</label>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={save} className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium">Save</button>
              <button onClick={() => setEditing(undefined)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
