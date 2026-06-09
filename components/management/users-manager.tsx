"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  IconBuildingCommunity,
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconShield,
  IconUserCheck,
  IconUserMinus,
  IconUserPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import {
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

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

type AdminUserType = "admin" | "training_partner";

const ADMIN_USER_TYPE_OPTIONS: Array<{
  description: string;
  label: string;
  role: RoleKey;
  value: AdminUserType;
}> = [
  {
    label: "Admin",
    value: "admin",
    role: "platform_admin",
    description: "Full access to all training centers and platform management",
  },
  {
    label: "Training Partner",
    value: "training_partner",
    role: "center_manager",
    description: "Creates and monitors candidates and batches for an assigned training center",
  },
];

const TRAINING_PARTNER_ROLES: RoleKey[] = [
  "training_partner_admin",
  "center_manager",
  "trainer_data_entry",
  "auditor_viewer",
];

const ROLE_OPTIONS: Array<{ description: string; label: string; value: RoleKey }> = [
  { label: "Platform Admin", value: "platform_admin", description: "Full platform-wide access" },
  { label: "Training Partner Admin", value: "training_partner_admin", description: "Scoped management access" },
  { label: "Center Manager", value: "center_manager", description: "Operates assigned centers" },
  { label: "Trainer Data Entry", value: "trainer_data_entry", description: "Operational data entry only" },
  { label: "Auditor Viewer", value: "auditor_viewer", description: "Read-only audit visibility" },
];

function getAdminUserType(roles: RoleKey[]): AdminUserType {
  return roles.includes("platform_admin") ? "admin" : "training_partner";
}

function adminUserTypeToRoles(userType: AdminUserType): RoleKey[] {
  const option = ADMIN_USER_TYPE_OPTIONS.find((entry) => entry.value === userType);
  return option ? [option.role] : ["center_manager"];
}

function isAdminRole(roles: RoleKey[]) {
  return roles.includes("platform_admin");
}

function isTrainingPartnerUser(roles: RoleKey[]) {
  return !isAdminRole(roles) && roles.some((role) => TRAINING_PARTNER_ROLES.includes(role));
}

function requiresTrainingCenter(roles: RoleKey[]) {
  return !isAdminRole(roles);
}

const ROLE_COLORS: Record<RoleKey, string> = {
  platform_admin: "bg-violet-100 text-violet-700",
  training_partner_admin: "bg-sky-100 text-sky-700",
  center_manager: "bg-emerald-100 text-emerald-700",
  trainer_data_entry: "bg-amber-100 text-amber-700",
  auditor_viewer: "bg-slate-100 text-slate-600",
};

const ROLE_CHART_COLORS: Record<RoleKey, string> = {
  platform_admin: "bg-violet-500",
  training_partner_admin: "bg-sky-500",
  center_manager: "bg-emerald-500",
  trainer_data_entry: "bg-amber-400",
  auditor_viewer: "bg-neutral-400",
};

const portalContent = {
  admin: {
    description: "Create admins with platform-wide access or training partners scoped to a single training center.",
    heading: "Team & Users",
  },
  training_partner: {
    description: "Manage people in your organization and keep their center access up to date.",
    heading: "Your Team",
  },
} as const;

const makeCreateForm = (portal: "admin" | "training_partner") => ({
  centerIds: [] as string[],
  email: "",
  mobileNumber: "",
  name: "",
  temporaryPassword: "",
  roles: adminUserTypeToRoles(portal === "admin" ? "admin" : "training_partner"),
  userType: (portal === "admin" ? "admin" : "training_partner") as AdminUserType,
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
  const [editUserType, setEditUserType] = useState<AdminUserType>("admin");

  const content = portalContent[portal];
  const isAdminPortal = portal === "admin";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q || user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      const matchesRole =
        roleFilter === "all" ||
        (isAdminPortal && roleFilter === "center_manager"
          ? isTrainingPartnerUser(user.roles)
          : user.roles.includes(roleFilter));
      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [users, searchQuery, statusFilter, roleFilter, isAdminPortal]);

  const stats = useMemo(
    () => ({
      total,
      active: users.filter((u) => u.status === "active").length,
      inactive: users.filter((u) => u.status === "inactive").length,
      admins: users.filter((u) => u.roles.includes("platform_admin")).length,
      trainingPartners: users.filter((u) => isTrainingPartnerUser(u.roles)).length,
    }),
    [users, total],
  );

  function applyUserToEditForm(user: UserRecord | null) {
    if (!user) {
      setEditForm(EMPTY_EDIT_FORM);
      setEditUserType("admin");
      return;
    }
    const userType = getAdminUserType(user.roles);
    setEditUserType(userType);
    const centerIds =
      isAdminPortal && userType === "training_partner"
        ? user.centerIds.slice(0, 1)
        : user.centerIds;
    setEditForm({
      centerIds,
      email: user.email,
      mobileNumber: user.mobileNumber ?? "",
      mustChangePassword: user.mustChangePassword,
      name: user.name,
      roles: isAdminPortal ? adminUserTypeToRoles(userType) : user.roles,
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

    const roles = isAdminPortal ? adminUserTypeToRoles(createForm.userType) : createForm.roles;
    const centerIds = isAdminRole(roles) ? [] : createForm.centerIds;

    if (requiresTrainingCenter(roles) && centerIds.length === 0) {
      toast.error("Training partners must be assigned to a training center");
      return;
    }

    if (isAdminPortal && roles.length === 1 && roles[0] === "center_manager" && centerIds.length !== 1) {
      toast.error("Training partners must be assigned to exactly one training center");
      return;
    }

    setIsSaving(true);
    try {
      await apiFetch<UserRecord>("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          mobileNumber: createForm.mobileNumber || undefined,
          roles,
          centerIds,
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

    const roles = isAdminPortal ? adminUserTypeToRoles(editUserType) : editForm.roles;
    const centerIds = isAdminRole(roles) ? [] : editForm.centerIds;

    if (requiresTrainingCenter(roles) && centerIds.length === 0) {
      toast.error("Training partners must be assigned to a training center");
      return;
    }

    if (isAdminPortal && roles.length === 1 && roles[0] === "center_manager" && centerIds.length !== 1) {
      toast.error("Training partners must be assigned to exactly one training center");
      return;
    }

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
      if (!isAdminRole(roles)) {
        await apiFetch<UserRecord>(`/api/v1/admin/users/${selectedUser.id}/centers`, {
          method: "POST",
          body: JSON.stringify({ centerIds }),
        });
      }
      await apiFetch<UserRecord>(`/api/v1/admin/users/${selectedUser.id}/roles`, {
        method: "POST",
        body: JSON.stringify({ roles }),
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

  const roleChartItems = isAdminPortal
    ? ADMIN_USER_TYPE_OPTIONS.map((role) => ({
        label: role.label,
        value:
          role.value === "admin"
            ? users.filter((user) => user.roles.includes("platform_admin")).length
            : users.filter((user) => isTrainingPartnerUser(user.roles)).length,
        colorClass: role.value === "admin" ? "bg-violet-500" : "bg-sky-500",
      }))
    : ROLE_OPTIONS.map((role) => ({
        label: role.label,
        value: users.filter((user) => user.roles.includes(role.value)).length,
        colorClass: ROLE_CHART_COLORS[role.value],
      }));

  const roleFilterOptions = isAdminPortal
    ? ADMIN_USER_TYPE_OPTIONS.map((role) => ({ label: role.label, value: role.role }))
    : ROLE_OPTIONS.map((role) => ({ label: role.label, value: role.value }));

  return (
    <div className="flex flex-1 flex-col gap-6 bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{content.heading}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{content.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => startTransition(() => void loadData(page))}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <IconRefresh className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            <IconPlus className="h-4 w-4" />
            Add user
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total team members"
          value={isLoading ? null : stats.total}
          icon={<IconUsers className="h-5 w-5" />}
          onClick={() => setStatusFilter("all")}
          active={statusFilter === "all"}
        />
        <StatCard
          label="Active accounts"
          value={isLoading ? null : stats.active}
          icon={<IconUserCheck className="h-5 w-5" />}
          onClick={() => setStatusFilter("active")}
          active={statusFilter === "active"}
        />
        <StatCard
          label="Inactive accounts"
          value={isLoading ? null : stats.inactive}
          icon={<IconUserMinus className="h-5 w-5" />}
          onClick={() => setStatusFilter("inactive")}
          active={statusFilter === "inactive"}
        />
        <StatCard
          label={isAdminPortal ? "Admins" : "Administrators"}
          value={isLoading ? null : isAdminPortal ? stats.admins : stats.admins + stats.trainingPartners}
          icon={<IconShield className="h-5 w-5" />}
          onClick={() =>
            setRoleFilter((current) =>
              current === "platform_admin" ? "all" : "platform_admin",
            )
          }
          active={roleFilter === "platform_admin"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <ChartPanel title="People by role">
          <BarChart
            items={roleChartItems}
            loading={isLoading}
            emptyMessage="Role breakdown will appear once users are added."
          />
        </ChartPanel>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral-800">Quick tips</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-neutral-600">
            {isAdminPortal ? (
              <>
                <li>Admins get full platform access across all training centers.</li>
                <li>Training partners must be linked to a training center for candidates and batches.</li>
                <li>Training partners sign in via the Training Partner login page.</li>
                <li>Use inactive status instead of deleting accounts you may need again.</li>
              </>
            ) : (
              <>
                <li>Tap a stat card above to filter the list instantly.</li>
                <li>Assign training centers so each person only sees their scope.</li>
                <li>Use inactive status instead of deleting accounts you may need again.</li>
                <li>Force a password change when handing out temporary credentials.</li>
              </>
            )}
          </ul>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1">
            {(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition",
                  statusFilter === s
                    ? "bg-sky-100 text-sky-700"
                    : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                )}
              >
                {s === "all" ? "Everyone" : s}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    statusFilter === s ? "bg-sky-200/70 text-sky-800" : "bg-neutral-100 text-neutral-500"
                  )}
                >
                  {countByStatus(s)}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:w-56">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or email"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <IconX className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="relative">
              <IconFilter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleKey | "all")}
                className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white sm:w-44"
              >
                <option value="all">All roles</option>
                {roleFilterOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                {["Person", "Mobile", "Roles", "Centers", "Status", "Last sign-in", ""].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">
                    <IconLoader2 className="mx-auto h-6 w-6 animate-spin" />
                    <p className="mt-2">Loading team members…</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <IconUsers className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-500">No users found</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {searchQuery || statusFilter !== "all" || roleFilter !== "all"
                        ? "Try adjusting your filters"
                        : "Add your first team member to get started"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <UserTableRow
                    key={user.id}
                    user={user}
                    portal={portal}
                    onEdit={() => openEditModal(user)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 md:hidden">
          {isLoading ? (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              <IconLoader2 className="mx-auto h-6 w-6 animate-spin" />
              <p className="mt-2">Loading team members…</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <IconUsers className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-500">No users found</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <UserMobileCard
                key={user.id}
                user={user}
                portal={portal}
                onEdit={() => openEditModal(user)}
              />
            ))
          )}
        </div>

        {!isLoading && totalPages > 1 ? (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-slate-500">
              Page <span className="font-semibold text-slate-700">{page}</span> of{" "}
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
                <IconChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={pg}
                    type="button"
                    onClick={() => setPage(pg)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition",
                      pg === page
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
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
                <IconChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Create User Modal ────────────────────────────────────────── */}
      {showCreateModal && (
        <Modal
          title="Create New User"
          subtitle="Fill in the details below to add a new user to the platform."
          icon={<IconUserPlus className="h-5 w-5" />}
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

            {isAdminPortal ? (
              <>
                <ModalAdminUserTypeSelector
                  userType={createForm.userType}
                  onChange={(userType) =>
                    setCreateForm((f) => ({
                      ...f,
                      userType,
                      roles: adminUserTypeToRoles(userType),
                      centerIds: userType === "admin" ? [] : f.centerIds,
                    }))
                  }
                />
                {createForm.userType === "training_partner" ? (
                  <ModalCenterSelector
                    centers={centers}
                    selectedIds={createForm.centerIds}
                    multiple={false}
                    required
                    onToggle={(id) =>
                      setCreateForm((f) => ({
                        ...f,
                        centerIds: f.centerIds.includes(id) ? [] : [id],
                      }))
                    }
                  />
                ) : null}
              </>
            ) : (
              <>
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
              </>
            )}

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
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconUserPlus className="h-4 w-4" />
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
          icon={<IconShield className="h-5 w-5" />}
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

            {isAdminPortal ? (
              <>
                <ModalAdminUserTypeSelector
                  userType={editUserType}
                  onChange={(userType) => {
                    setEditUserType(userType);
                    setEditForm((f) => ({
                      ...f,
                      roles: adminUserTypeToRoles(userType),
                      centerIds: userType === "admin" ? [] : f.centerIds,
                    }));
                  }}
                />
                {editUserType === "training_partner" ? (
                  <ModalCenterSelector
                    centers={centers}
                    selectedIds={editForm.centerIds}
                    multiple={false}
                    required
                    onToggle={(id) =>
                      setEditForm((f) => ({
                        ...f,
                        centerIds: f.centerIds.includes(id) ? [] : [id],
                      }))
                    }
                  />
                ) : null}
              </>
            ) : (
              <>
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
              </>
            )}

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
                  <IconLoader2 className="h-4 w-4 animate-spin" />
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
  active = false,
  icon,
  label,
  onClick,
  value,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  value: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-3xl border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md sm:p-5",
        active ? "border-sky-300 ring-1 ring-sky-200" : "border-slate-200"
      )}
    >
      <span className="text-neutral-400">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-neutral-900">
          {value === null ? (
            <span className="inline-block h-7 w-10 animate-pulse rounded bg-neutral-200" />
          ) : (
            value.toLocaleString()
          )}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">{label}</p>
      </div>
    </button>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-4 text-sm font-semibold text-neutral-800">{title}</h3>
      {children}
    </div>
  );
}

function BarChart({
  emptyMessage,
  items,
  loading,
}: {
  emptyMessage: string;
  items: Array<{ colorClass: string; label: string; value: number }>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="h-3 w-24 animate-pulse rounded bg-neutral-200" />
            <div className="h-4 flex-1 animate-pulse rounded-full bg-neutral-100" />
            <div className="h-3 w-6 animate-pulse rounded bg-neutral-200" />
          </div>
        ))}
      </div>
    );
  }

  const nonZeroItems = items.filter((item) => item.value > 0);
  if (nonZeroItems.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-500">{emptyMessage}</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-neutral-600 sm:w-36">{item.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn("h-full rounded-full transition-all duration-500", item.colorClass)}
              style={{ width: `${Math.max(Math.round((item.value / max) * 100), item.value > 0 ? 8 : 0)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-neutral-700">
            {item.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function UserTableRow({
  onEdit,
  portal,
  user,
}: {
  onEdit: () => void;
  portal: "admin" | "training_partner";
  user: UserRecord;
}) {
  return (
    <tr
      className="group cursor-pointer transition-colors hover:bg-slate-50/80"
      onClick={onEdit}
    >
      <td className="px-5 py-4">
        <UserIdentity user={user} />
      </td>
      <td className="px-4 py-4 text-slate-600">
        {user.mobileNumber ?? <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-4">
        <RoleBadges roles={user.roles} portal={portal} />
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-1.5 text-slate-600">
          <IconBuildingCommunity className="h-4 w-4 text-slate-400" />
          {isAdminRole(user.roles) ? (
            <span className="text-xs text-slate-500">All centers</span>
          ) : (
            user.centerIds.length
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <StatusBadge status={user.status} />
      </td>
      <td className="px-4 py-4 text-xs text-slate-500">
        {user.lastLoginAt ? (
          new Date(user.lastLoginAt).toLocaleDateString(undefined, {
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
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 opacity-100 shadow-sm transition group-hover:opacity-100 hover:border-sky-300 hover:text-sky-700 md:opacity-0"
        >
          <IconPencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </td>
    </tr>
  );
}

function UserMobileCard({
  onEdit,
  portal,
  user,
}: {
  onEdit: () => void;
  portal: "admin" | "training_partner";
  user: UserRecord;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full px-4 py-4 text-left transition hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <UserIdentity user={user} />
        <StatusBadge status={user.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        <RoleBadges roles={user.roles} portal={portal} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <IconBuildingCommunity className="h-3.5 w-3.5" />
          {isAdminRole(user.roles)
            ? "All centers"
            : `${user.centerIds.length} center${user.centerIds.length === 1 ? "" : "s"}`}
        </span>
        <span>
          {user.lastLoginAt
            ? `Last sign-in ${new Date(user.lastLoginAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
            : "Never signed in"}
        </span>
      </div>
    </button>
  );
}

function UserIdentity({ user }: { user: UserRecord }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
        {user.name.trim().charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{user.name}</div>
        <div className="truncate text-xs text-slate-500">{user.email}</div>
      </div>
    </div>
  );
}

function RoleBadges({
  portal,
  roles,
}: {
  portal: "admin" | "training_partner";
  roles: RoleKey[];
}) {
  const displayRoles =
    portal === "admin"
      ? [getAdminUserType(roles) === "admin" ? "platform_admin" : "center_manager"]
      : roles;

  return (
    <div className="flex flex-wrap gap-1">
      {displayRoles.map((role) => (
        <span
          key={role}
          className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", ROLE_COLORS[role])}
        >
          {formatRole(role, portal)}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "active" ? "bg-emerald-500" : "bg-slate-400")} />
      {status === "active" ? "Active" : "Inactive"}
    </span>
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
            <IconX className="h-4 w-4" />
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

function ModalAdminUserTypeSelector({
  onChange,
  userType,
}: {
  onChange: (userType: AdminUserType) => void;
  userType: AdminUserType;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">User type</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ADMIN_USER_TYPE_OPTIONS.map((option) => {
          const isSelected = userType === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                isSelected
                  ? "border-sky-200 bg-sky-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="admin-user-type"
                checked={isSelected}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-4 w-4 border-slate-300 accent-slate-900"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{option.label}</p>
                <p className="text-xs text-slate-500">{option.description}</p>
              </div>
            </label>
          );
        })}
      </div>
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
  multiple = true,
  onToggle,
  required = false,
  selectedIds,
}: {
  centers: CenterRecord[];
  multiple?: boolean;
  onToggle: (id: string) => void;
  required?: boolean;
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);

  if (centers.length === 0) return null;

  const selectedCenters = centers.filter((c) => selectedIds.includes(c.centerId));

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {multiple ? "Center Scope" : "Training Center"}
        {required ? <span className="ml-1 text-rose-500">*</span> : null}
        {multiple && selectedIds.length > 0 && (
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
            ? multiple
              ? "Select training centers…"
              : "Select a training center…"
            : selectedCenters.map((c) => c.centerName).join(", ")}
        </span>
        <IconChevronRight
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {/* Selected pills */}
      {multiple && selectedCenters.length > 0 && (
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
                <IconX className="h-3 w-3" />
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
                  type={multiple ? "checkbox" : "radio"}
                  name={multiple ? undefined : "training-center"}
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

function formatRole(role: RoleKey, portal: "admin" | "training_partner" = "training_partner") {
  if (portal === "admin") {
    if (role === "platform_admin") return "Admin";
    if (TRAINING_PARTNER_ROLES.includes(role) || role === "center_manager") return "Training Partner";
  }

  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const inputCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100";
