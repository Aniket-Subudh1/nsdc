"use client";

import { startTransition, useEffect, useState } from "react";
import { Building2, LoaderCircle, RefreshCw, Save, ShieldCheck, UserPlus, Users } from "lucide-react";

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

const ROLE_OPTIONS: Array<{ description: string; label: string; value: RoleKey }> = [
  {
    label: "Platform Admin",
    value: "platform_admin",
    description: "Full platform-wide access",
  },
  {
    label: "Training Partner Admin",
    value: "training_partner_admin",
    description: "Scoped management access",
  },
  {
    label: "Center Manager",
    value: "center_manager",
    description: "Operates assigned centers",
  },
  {
    label: "Trainer Data Entry",
    value: "trainer_data_entry",
    description: "Operational data entry only",
  },
  {
    label: "Auditor Viewer",
    value: "auditor_viewer",
    description: "Read-only audit visibility",
  },
];

const portalContent = {
  admin: {
    description:
      "Create internal users, update their profile details, then assign roles and training-center scope using the Sprint 01 admin APIs.",
    heading: "User Management",
  },
  training_partner: {
    description:
      "Manage only the users visible inside your current training-partner scope and keep assignments aligned with your centers.",
    heading: "Scoped User Management",
  },
} as const;

export default function UsersManager({ portal }: UsersManagerProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [centers, setCenters] = useState<CenterRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    centerIds: [] as string[],
    email: "",
    mobileNumber: "",
    name: "",
    temporaryPassword: "",
    roles: [portal === "admin" ? "training_partner_admin" : "center_manager"] as RoleKey[],
  });
  const [editForm, setEditForm] = useState({
    centerIds: [] as string[],
    email: "",
    mobileNumber: "",
    mustChangePassword: false,
    name: "",
    roles: [] as RoleKey[],
    status: "active" as "active" | "inactive",
  });

  const content = portalContent[portal];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  function applyUserToEditForm(user: UserRecord | null) {
    if (!user) {
      setEditForm({
        centerIds: [],
        email: "",
        mobileNumber: "",
        mustChangePassword: false,
        name: "",
        roles: [],
        status: "active",
      });
      return;
    }

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

  function syncUsersState(usersData: PagedUsers, centerData: PagedCenters) {
    setUsers(usersData.items);
    setTotal(usersData.total);
    setCenters(centerData.items);

    const nextSelectedUser =
      usersData.items.find((user) => user.id === selectedUserId) ?? usersData.items[0] ?? null;

    setSelectedUserId(nextSelectedUser?.id ?? null);
    applyUserToEditForm(nextSelectedUser);
  }

  async function fetchUsersAndCenters(targetPage: number) {
    return Promise.all([
      apiFetch<PagedUsers>(`/api/v1/admin/users?page=${targetPage}&pageSize=${pageSize}`),
      apiFetch<PagedCenters>("/api/v1/masters/training-centers?page=1&pageSize=100"),
    ]);
  }

  async function loadData(targetPage = page) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [usersData, centerData] = await fetchUsersAndCenters(targetPage);
      syncUsersState(usersData, centerData);
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load users");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function syncPageData() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [usersData, centerData] = await Promise.all([
          apiFetch<PagedUsers>(`/api/v1/admin/users?page=${page}&pageSize=${pageSize}`),
          apiFetch<PagedCenters>("/api/v1/masters/training-centers?page=1&pageSize=100"),
        ]);

        if (!isMounted) {
          return;
        }

        setUsers(usersData.items);
        setTotal(usersData.total);
        setCenters(centerData.items);

        const nextSelectedUser =
          usersData.items.find((user) => user.id === selectedUserId) ?? usersData.items[0] ?? null;

        setSelectedUserId(nextSelectedUser?.id ?? null);
        applyUserToEditForm(nextSelectedUser);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load users");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void syncPageData();

    return () => {
      isMounted = false;
    };
  }, [page, pageSize, selectedUserId]);

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

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

      setCreateForm({
        centerIds: [],
        email: "",
        mobileNumber: "",
        name: "",
        temporaryPassword: "",
        roles: [portal === "admin" ? "training_partner_admin" : "center_manager"],
      });
      setSuccessMessage("User created successfully");
      await loadData(page);
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to create user");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDetails() {
    if (!selectedUser) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

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

      setSuccessMessage("User details updated");
      await loadData(page);
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to update user");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleCreateRole(role: RoleKey) {
    setCreateForm((current) => {
      const roles = current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role];

      return {
        ...current,
        roles,
      };
    });
  }

  function toggleEditRole(role: RoleKey) {
    setEditForm((current) => {
      const roles = current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role];

      return {
        ...current,
        roles,
      };
    });
  }

  function toggleCreateCenter(centerId: string) {
    setCreateForm((current) => ({
      ...current,
      centerIds: current.centerIds.includes(centerId)
        ? current.centerIds.filter((item) => item !== centerId)
        : [...current.centerIds, centerId],
    }));
  }

  function toggleEditCenter(centerId: string) {
    setEditForm((current) => ({
      ...current,
      centerIds: current.centerIds.includes(centerId)
        ? current.centerIds.filter((item) => item !== centerId)
        : [...current.centerIds, centerId],
    }));
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Sprint 01</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{content.heading}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{content.description}</p>
          </div>
          <button
            type="button"
            onClick={() => startTransition(() => void loadData(page))}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </section>

      {errorMessage ? <MessageCard tone="error" message={errorMessage} /> : null}
      {successMessage ? <MessageCard tone="success" message={successMessage} /> : null}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-sky-50 p-2 text-sky-600">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Create User</h2>
              <p className="text-sm text-slate-500">Use the admin create-user API from the panel.</p>
            </div>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleCreateUser}>
            <Field label="Full Name">
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                className={inputClassName}
                placeholder="Center Operator"
                required
              />
            </Field>
            <Field label="Email Address">
              <input
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                className={inputClassName}
                placeholder="operator@example.com"
                required
              />
            </Field>
            <Field label="Mobile Number">
              <input
                value={createForm.mobileNumber}
                onChange={(event) => setCreateForm((current) => ({ ...current, mobileNumber: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                className={inputClassName}
                placeholder="9876543210"
              />
            </Field>
            <Field label="Temporary Password">
              <input
                type="password"
                value={createForm.temporaryPassword}
                onChange={(event) => setCreateForm((current) => ({ ...current, temporaryPassword: event.target.value }))}
                className={inputClassName}
                placeholder="TempPass@123"
                required
              />
            </Field>

            <RoleSelector title="Roles" roles={createForm.roles} onToggle={toggleCreateRole} />
            <CenterSelector
              centers={centers}
              selectedCenterIds={createForm.centerIds}
              title="Center Scope"
              onToggle={toggleCreateCenter}
            />

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create User
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-emerald-50 p-2 text-emerald-600">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Visible Users</h2>
              <p className="text-sm text-slate-500">Select a user to update details, roles, and centers.</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                Loading users...
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No users found in the current scope.
              </div>
            ) : (
              users.map((user) => {
                const isSelected = user.id === selectedUserId;

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(user.id);
                      applyUserToEditForm(user);
                    }}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                      isSelected
                        ? "border-sky-300 bg-sky-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{user.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{user.email}</div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {user.roles.map((role) => (
                            <span key={role} className="rounded-full bg-white px-2.5 py-1 text-slate-600 shadow-sm">
                              {formatRole(role)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClassName[user.status]}`}>
                        {user.status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-xl border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="rounded-xl border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-violet-50 p-2 text-violet-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Selected User</h2>
              <p className="text-sm text-slate-500">PATCH details, then submit role and center assignment APIs.</p>
            </div>
          </div>

          {!selectedUser ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              Select a user from the list to manage assignments.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <Field label="Full Name">
                <input
                  value={editForm.name}
                  onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Email Address">
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Mobile Number">
                <input
                  value={editForm.mobileNumber}
                  onChange={(event) => setEditForm((current) => ({ ...current, mobileNumber: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                  className={inputClassName}
                />
              </Field>
              <Field label="Status">
                <select
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value as "active" | "inactive",
                    }))
                  }
                  className={inputClassName}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editForm.mustChangePassword}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      mustChangePassword: event.target.checked,
                    }))
                  }
                />
                Force password change on next sign-in
              </label>

              <RoleSelector title="Roles" roles={editForm.roles} onToggle={toggleEditRole} />
              <CenterSelector
                centers={centers}
                selectedCenterIds={editForm.centerIds}
                title="Center Scope"
                onToggle={toggleEditCenter}
              />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Last login: {selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : "Never"}
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveDetails()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save User Changes
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function RoleSelector({
  onToggle,
  roles,
  title,
}: {
  onToggle: (role: RoleKey) => void;
  roles: RoleKey[];
  title: string;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="space-y-2">
        {ROLE_OPTIONS.map((role) => (
          <label key={role.value} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-transparent bg-white px-3 py-3 text-sm text-slate-700 shadow-sm">
            <input
              type="checkbox"
              checked={roles.includes(role.value)}
              onChange={() => onToggle(role.value)}
              className="mt-1"
            />
            <div>
              <div className="font-medium text-slate-900">{role.label}</div>
              <div className="text-xs text-slate-500">{role.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function CenterSelector({
  centers,
  onToggle,
  selectedCenterIds,
  title,
}: {
  centers: CenterRecord[];
  onToggle: (centerId: string) => void;
  selectedCenterIds: string[];
  title: string;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        <Building2 className="h-4 w-4" /> {title}
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {centers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
            No training centers available yet.
          </div>
        ) : (
          centers.map((center) => (
            <label key={center.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-transparent bg-white px-3 py-3 text-sm text-slate-700 shadow-sm">
              <input
                type="checkbox"
                checked={selectedCenterIds.includes(center.centerId)}
                onChange={() => onToggle(center.centerId)}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-slate-900">{center.centerName}</div>
                <div className="text-xs text-slate-500">{center.centerCode}</div>
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function MessageCard({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {message}
    </div>
  );
}

function formatRole(role: RoleKey) {
  return role.replaceAll("_", " ");
}

const badgeClassName = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-200 text-slate-700",
} as const;

const inputClassName =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300";