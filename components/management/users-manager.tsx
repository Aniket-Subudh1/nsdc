"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Filter,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError } from "@/lib/client/api";

type UsersManagerProps = {
  portal: "admin" | "training_partner";
};

type UserRecord = {
  centerIds: string[];
  email: string;
  id: string;
  lastLoginAt: string | null;
  mobileNumber: string | null;
  mustChangePassword: boolean;
  name: string;
  role: RoleKey;
  roles: RoleKey[];
  status: "active" | "inactive";
};

type CenterRecord = {
  centerCode: string;
  centerId: string;
  centerName: string;
  id: string;
  status: "active" | "inactive";
};

type PagedUsers = {
  items: UserRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type PagedCenters = {
  items: CenterRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type RoleKey =
  | "platform_admin"
  | "training_partner_admin"
  | "center_manager"
  | "trainer_data_entry"
  | "auditor_viewer";

type StatusFilter = "all" | "active" | "inactive";

const ROLE_OPTIONS: Array<{ description: string; label: string; value: RoleKey }> = [
  { label: "Platform Admin", value: "platform_admin", description: "Full platform-wide access" },
  { label: "Training Partner Admin", value: "training_partner_admin", description: "Scoped management access" },
  { label: "Center Manager", value: "center_manager", description: "Operates assigned centers" },
  { label: "Trainer Data Entry", value: "trainer_data_entry", description: "Operational data entry only" },
  { label: "Auditor Viewer", value: "auditor_viewer", description: "Read-only audit visibility" },
];

const ROLE_COLORS: Record<RoleKey, string> = {
  platform_admin: "bg-violet-100 text-violet-700",
  training_partner_admin: "bg-sky-100 text-sky-700",
  center_manager: "bg-emerald-100 text-emerald-700",
  trainer_data_entry: "bg-amber-100 text-amber-700",
  auditor_viewer: "bg-slate-100 text-slate-600",
};

const portalContent = {
  admin: {
    description: "Create and manage internal users, assign roles, and configure training-center scope.",
    heading: "User Management",
  },
  training_partner: {
    description: "Manage users within your training-partner scope and keep center assignments aligned.",
    heading: "Scoped User Management",
  },
} as const;

const makeCreateForm = (portal: "admin" | "training_partner") => ({
  centerIds: [] as string[],
  email: "",
  mobileNumber: "",
  name: "",
  temporaryPassword: "",
  roles: [portal === "admin" ? ("platform_admin" as RoleKey) : ("center_manager" as RoleKey)],
});

const EMPTY_EDIT_FORM = {
  centerIds: [] as string[],
  email: "",
  mobileNumber: "",
  mustChangePassword: false,
  name: "",
  roles: [] as RoleKey[],
  status: "active" as "active" | "inactive",
};

export default function UsersManager({ portal }: UsersManagerProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [centers, setCenters] = useState<CenterRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleKey | "all">("all");
  const [createForm, setCreateForm] = useState(makeCreateForm(portal));
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

  const content = portalContent[portal];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      const matchesRole = roleFilter === "all" || user.roles.includes(roleFilter);
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [users, searchQuery, statusFilter, roleFilter]);

  const stats = useMemo(
    () => ({
      total,
      active: users.filter((u) => u.status === "active").length,
      inactive: users.filter((u) => u.status === "inactive").length,
      admins: users.filter(
        (u) => u.roles.includes("platform_admin") || u.roles.includes("training_partner_admin"),
      ).length,
    }),
    [users, total],
  );

  function applyUserToEditForm(user: UserRecord | null) {
    if (!user) { setEditForm(EMPTY_EDIT_FORM); return; }
    setEditForm({
      centerIds: user.centerIds,
      email: user.email,
      mobileNumber: user.mobileNumber ?? "",
      mustChangePassword: user.mustChangePassword,
      name: user.name,
      roles: user.roles,
      status: user.status,
    });
  }

  async function loadData(targetPage = page) {
    setIsLoading(true);
    try {
      const [usersData, centerData] = await Promise.all([
        apiFetch<PagedUsers>(`/api/v1/admin/users?page=${targetPage}&pageSize=${pageSize}`),
        apiFetch<PagedCenters>("/api/v1/masters/training-centers?page=1&pageSize=100"),
      ]);
      setUsers(usersData.items);
      setTotal(usersData.total);
      setCenters(centerData.items);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load users");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function init() {
      setIsLoading(true);
      try {
        const [usersData, centerData] = await Promise.all([
          apiFetch<PagedUsers>(`/api/v1/admin/users?page=${page}&pageSize=${pageSize}`),
          apiFetch<PagedCenters>("/api/v1/masters/training-centers?page=1&pageSize=100"),
        ]);
        if (!mounted) return;
        setUsers(usersData.items);
        setTotal(usersData.total);
        setCenters(centerData.items);
      } catch (error) {
        if (!mounted) return;
        toast.error(error instanceof ClientApiError ? error.message : "Unable to load users");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void init();
    return () => { mounted = false; };
  }, [page, pageSize]);

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await apiFetch<UserRecord>("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          mobileNumber: createForm.mobileNumber || undefined,
          roles: createForm.roles,
          centerIds: createForm.centerIds,
          temporaryPassword: createForm.temporaryPassword,
        }),
      });
      setCreateForm(makeCreateForm(portal));
      setShowCreateModal(false);
      toast.success("User created successfully");
      await loadData(page);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to create user");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDetails() {
    if (!selectedUser) return;
    setIsSaving(true);
    try {
      await apiFetch<UserRecord>(`/api/v1/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          mobileNumber: editForm.mobileNumber || undefined,
          status: editForm.status,
          mustChangePassword: editForm.mustChangePassword,
        }),
      });
      await apiFetch<UserRecord>(`/api/v1/admin/users/${selectedUser.id}/roles`, {
        method: "POST",
        body: JSON.stringify({ roles: editForm.roles }),
      });
      await apiFetch<UserRecord>(`/api/v1/admin/users/${selectedUser.id}/centers`, {
        method: "POST",
        body: JSON.stringify({ centerIds: editForm.centerIds }),
      });
      setShowEditModal(false);
      toast.success("User updated successfully");
      await loadData(page);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to update user");
    } finally {
      setIsSaving(false);
    }
  }

  function openEditModal(user: UserRecord) {
    setSelectedUserId(user.id);
    applyUserToEditForm(user);
    setShowEditModal(true);
  }

  const countByStatus = (s: StatusFilter) =>
    s === "all" ? users.length : users.filter((u) => u.status === s).length;

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">
              Administration
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">
              {content.heading}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startTransition(() => void loadData(page))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <Plus className="h-4 w-4" />
              New User
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-6">
        {/* ── Stats row ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            iconBg="bg-slate-100 text-slate-600"
            label="Total Users"
            value={stats.total}
          />
          <StatCard
            icon={<UserCheck className="h-5 w-5" />}
            iconBg="bg-emerald-100 text-emerald-600"
            label="Active"
            value={stats.active}
            accent="text-emerald-600"
          />
          <StatCard
            icon={<UserMinus className="h-5 w-5" />}
            iconBg="bg-rose-100 text-rose-500"
            label="Inactive"
            value={stats.inactive}
            accent="text-rose-500"
          />
          <StatCard
            icon={<Shield className="h-5 w-5" />}
            iconBg="bg-violet-100 text-violet-600"
            label="Admins"
            value={stats.admins}
            accent="text-violet-600"
          />
        </div>

        {/* ── Table card ───────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Filter bar */}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1">
              {(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    statusFilter === s
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  }`}
                >
                  {s}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      statusFilter === s
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {countByStatus(s)}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or email…"
                  className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleKey | "all")}
                  className="h-9 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-6 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
                >
                  <option value="all">All Roles</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  {["User", "Mobile", "Roles", "Centers", "Status", "Last Login", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">
                      <LoaderCircle className="mx-auto h-6 w-6 animate-spin" />
                      <p className="mt-2">Loading users…</p>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <Users className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-sm font-medium text-slate-500">No users found</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {searchQuery || statusFilter !== "all" || roleFilter !== "all"
                          ? "Try adjusting your filters"
                          : "Create your first user to get started"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                      onClick={() => openEditModal(user)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-sky-100 to-indigo-100 text-sm font-bold text-sky-700">
                            {user.name.trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{user.name}</div>
                            <div className="truncate text-xs text-slate-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {user.mobileNumber ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <span
                              key={role}
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[role]}`}
                            >
                              {formatRole(role)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          {user.centerIds.length}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            user.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              user.status === "active" ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          {user.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {user.lastLoginAt ? (
                          new Date(user.lastLoginAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        ) : (
                          <span className="text-slate-300">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEditModal(user); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 opacity-0 shadow-sm transition group-hover:opacity-100 hover:border-sky-300 hover:text-sky-700"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <p className="text-xs text-slate-500">
                Page{" "}
                <span className="font-semibold text-slate-700">{page}</span> of{" "}
                <span className="font-semibold text-slate-700">{totalPages}</span>
                {" · "}
                <span className="font-semibold text-slate-700">{total}</span> total
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return (
                    <button
                      key={pg}
                      type="button"
                      onClick={() => setPage(pg)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition ${
                        pg === page
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {pg}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create User Modal ────────────────────────────────────────── */}
      {showCreateModal && (
        <Modal
          title="Create New User"
          subtitle="Fill in the details below to add a new user to the platform."
          icon={<UserPlus className="h-5 w-5" />}
          iconBg="bg-sky-100 text-sky-600"
          onClose={() => { setShowCreateModal(false); setCreateForm(makeCreateForm(portal)); }}
        >
          <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full Name">
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Rahul Sharma"
                  required
                />
              </FormField>
              <FormField label="Email Address">
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                  placeholder="rahul@example.com"
                  required
                />
              </FormField>
              <FormField label="Mobile Number">
                <input
                  value={createForm.mobileNumber}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10),
                    }))
                  }
                  className={inputCls}
                  placeholder="9876543210"
                />
              </FormField>
              <FormField label="Temporary Password">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={createForm.temporaryPassword}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, temporaryPassword: e.target.value }))
                    }
                    className={`${inputCls} pr-10`}
                    placeholder="TempPass@123"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormField>
            </div>

            <ModalRoleSelector
              roles={createForm.roles}
              onToggle={(role) =>
                setCreateForm((f) => ({
                  ...f,
                  roles: f.roles.includes(role)
                    ? f.roles.filter((r) => r !== role)
                    : [...f.roles, role],
                }))
              }
            />

            <ModalCenterSelector
              centers={centers}
              selectedIds={createForm.centerIds}
              onToggle={(id) =>
                setCreateForm((f) => ({
                  ...f,
                  centerIds: f.centerIds.includes(id)
                    ? f.centerIds.filter((c) => c !== id)
                    : [...f.centerIds, id],
                }))
              }
            />

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setCreateForm(makeCreateForm(portal)); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Create User
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit User Modal ──────────────────────────────────────────── */}
      {showEditModal && selectedUser && (
        <Modal
          title="Edit User"
          subtitle={`Updating details for ${selectedUser.name}`}
          icon={<ShieldCheck className="h-5 w-5" />}
          iconBg="bg-violet-100 text-violet-600"
          onClose={() => setShowEditModal(false)}
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Full Name">
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Email Address">
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                />
              </FormField>
              <FormField label="Mobile Number">
                <input
                  value={editForm.mobileNumber}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10),
                    }))
                  }
                  className={inputCls}
                />
              </FormField>
              <FormField label="Account Status">
                <select
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      status: e.target.value as "active" | "inactive",
                    }))
                  }
                  className={inputCls}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </FormField>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:border-slate-300">
              <input
                type="checkbox"
                checked={editForm.mustChangePassword}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, mustChangePassword: e.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-300 accent-slate-900"
              />
              <div>
                <p className="font-medium text-slate-800">Force password change</p>
                <p className="text-xs text-slate-500">
                  User must reset their password on next sign-in
                </p>
              </div>
            </label>

            <ModalRoleSelector
              roles={editForm.roles}
              onToggle={(role) =>
                setEditForm((f) => ({
                  ...f,
                  roles: f.roles.includes(role)
                    ? f.roles.filter((r) => r !== role)
                    : [...f.roles, role],
                }))
              }
            />

            <ModalCenterSelector
              centers={centers}
              selectedIds={editForm.centerIds}
              onToggle={(id) =>
                setEditForm((f) => ({
                  ...f,
                  centerIds: f.centerIds.includes(id)
                    ? f.centerIds.filter((c) => c !== id)
                    : [...f.centerIds, id],
                }))
              }
            />

            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Last login:{" "}
              <span className="font-medium text-slate-700">
                {selectedUser.lastLoginAt
                  ? new Date(selectedUser.lastLoginAt).toLocaleString("en-IN")
                  : "Never"}
              </span>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveDetails()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function StatCard({
  accent = "text-slate-900",
  icon,
  iconBg,
  label,
  value,
}: {
  accent?: string;
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`rounded-xl p-2 ${iconBg}`}>{icon}</span>
      </div>
      <p className={`mt-3 text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
    </div>
  );
}

function Modal({
  children,
  icon,
  iconBg,
  onClose,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  onClose: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className={`rounded-xl p-2.5 ${iconBg}`}>{icon}</span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function FormField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function ModalRoleSelector({
  onToggle,
  roles,
}: {
  onToggle: (role: RoleKey) => void;
  roles: RoleKey[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Roles</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROLE_OPTIONS.map((role) => {
          const isChecked = roles.includes(role.value);
          return (
            <label
              key={role.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                isChecked
                  ? "border-sky-200 bg-sky-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(role.value)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{role.label}</p>
                <p className="text-xs text-slate-500">{role.description}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ModalCenterSelector({
  centers,
  onToggle,
  selectedIds,
}: {
  centers: CenterRecord[];
  onToggle: (id: string) => void;
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);

  if (centers.length === 0) return null;

  const selectedCenters = centers.filter((c) => selectedIds.includes(c.centerId));

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        Center Scope{" "}
        {selectedIds.length > 0 && (
          <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-600">
            {selectedIds.length} selected
          </span>
        )}
      </p>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:border-slate-300 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
      >
        <span className={selectedCenters.length === 0 ? "text-slate-400" : "text-slate-800"}>
          {selectedCenters.length === 0
            ? "Select training centers…"
            : selectedCenters.map((c) => c.centerName).join(", ")}
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {/* Selected pills */}
      {selectedCenters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedCenters.map((center) => (
            <span
              key={center.id}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {center.centerName}
              <button
                type="button"
                onClick={() => onToggle(center.centerId)}
                className="ml-0.5 text-slate-400 hover:text-rose-500"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown panel */}
      {open && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {centers.map((center) => {
            const isChecked = selectedIds.includes(center.centerId);
            return (
              <label
                key={center.id}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition ${
                  isChecked ? "bg-sky-50" : "hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggle(center.centerId)}
                  className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{center.centerName}</p>
                  <p className="text-xs text-slate-500">{center.centerCode}</p>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatRole(role: RoleKey) {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const inputCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100";
