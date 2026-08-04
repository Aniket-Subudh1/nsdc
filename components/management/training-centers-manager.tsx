"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import {
  IconBuildingCommunity,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconLoader2,
  IconMapPin,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError } from "@/lib/client/api";
import { swrKey, useApiSWR, usePortalMutate } from "@/lib/client/use-api-swr";
import { PORTAL_OPTIONS_KEY, usePortalOptions } from "@/lib/client/use-portal-options";
import { cn } from "@/lib/utils";

type TrainingCentersManagerProps = {
  portal: "admin" | "training_partner";
};

type CenterRecord = {
  centerCode: string;
  centerId: string;
  centerName: string;
  createdAt: string | null;
  district: string;
  id: string;
  programIds: string[];
  sidhTcId: string | null;
  state: string;
  status: "active" | "inactive";
  updatedAt: string | null;
  verifiedAt: string | null;
  verifiedForSidh: boolean;
};

type CenterWorkflowState = "draft" | "ready" | "verified";

function resolveCenterWorkflowState(center: Pick<CenterRecord, "sidhTcId" | "verifiedForSidh">): CenterWorkflowState {
  if (center.verifiedForSidh && center.sidhTcId) {
    return "ready";
  }

  if (center.verifiedForSidh) {
    return "verified";
  }

  return "draft";
}

type ProgramRecord = {
  name: string;
  programId: string;
  status: "active" | "inactive";
};

type PagedCenters = {
  items: CenterRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type PagedPrograms = {
  items: ProgramRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type StatusFilter = "all" | "active" | "inactive";
type WorkflowFilter = "all" | CenterWorkflowState;

const portalContent = {
  admin: {
    description:
      "Add and manage your training locations, link programs, and keep NSDC_SIDH portal IDs ready for batch sync.",
    heading: "Training Centers",
  },
  training_partner: {
    description:
      "Manage the centers in your scope, keep program links accurate, and store approved NSDC_SIDH portal IDs.",
    heading: "Your Training Centers",
  },
} as const;

const makeEmptyForm = () => ({
  centerCode: "",
  centerName: "",
  district: "",
  programIds: [] as string[],
  sidhTcId: "",
  state: "",
  status: "active" as "active" | "inactive",
});

export default function TrainingCentersManager({ portal }: TrainingCentersManagerProps) {
  const { programs: portalPrograms, mutate: mutatePortalOptions } = usePortalOptions();
  const { revalidateKeys } = usePortalMutate();
  const programs = useMemo(
    () =>
      portalPrograms.map((program) => ({
        name: program.name,
        programId: program.programId,
        status: (program.status === "inactive" ? "inactive" : "active") as "active" | "inactive",
      })),
    [portalPrograms],
  );
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const centersKey = useMemo(
    () => swrKey("/api/v1/masters/training-centers", { page, pageSize }),
    [page, pageSize],
  );
  const {
    data: centersPage,
    error: centersSwrError,
    isLoading: centersLoading,
    isValidating: centersValidating,
    mutate: mutateCenters,
  } = useApiSWR<PagedCenters>(centersKey);
  const centers = centersPage?.items ?? [];
  const total = centersPage?.total ?? 0;
  const loadState = {
    isInitialLoading: centersLoading && !centersPage,
    isRefreshing: centersValidating && Boolean(centersPage),
  };
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("all");
  const [form, setForm] = useState(makeEmptyForm());

  const content = portalContent[portal];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedCenter = centers.find((c) => c.centerId === selectedCenterId) ?? null;
  const hasPrograms = programs.length > 0;
  const masterDataPath =
    portal === "admin" ? "/admin/master-data" : "/training-partner/master-data";

  const filteredCenters = useMemo(() => {
    return centers.filter((center) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        center.centerName.toLowerCase().includes(q) ||
        center.centerCode.toLowerCase().includes(q) ||
        center.district.toLowerCase().includes(q) ||
        center.state.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || center.status === statusFilter;
      const matchesWorkflow =
        workflowFilter === "all" || resolveCenterWorkflowState(center) === workflowFilter;
      return matchesSearch && matchesStatus && matchesWorkflow;
    });
  }, [centers, searchQuery, statusFilter, workflowFilter]);

  const stats = useMemo(
    () => ({
      total,
      active: centers.filter((c) => c.status === "active").length,
      verified: centers.filter((c) => c.verifiedForSidh).length,
      sidhReady: centers.filter((c) => c.verifiedForSidh && Boolean(c.sidhTcId)).length,
    }),
    [centers, total],
  );

  function getProgramLabel(programId: string) {
    const program = programs.find((p) => p.programId === programId);
    if (!program) return programId;
    return program.status === "inactive" ? `${program.name} (inactive)` : program.name;
  }

  function applyCenter(center: CenterRecord | null) {
    if (!center) {
      setSelectedCenterId(null);
      setForm(makeEmptyForm());
      return;
    }
    setSelectedCenterId(center.centerId);
    setForm({
      centerCode: center.centerCode,
      centerName: center.centerName,
      district: center.district,
      programIds: center.programIds,
      sidhTcId: center.sidhTcId ?? "",
      state: center.state,
      status: center.status,
    });
  }

  async function loadCenters(targetPage = page) {
    if (targetPage !== page) {
      setPage(targetPage);
      return;
    }

    try {
      await Promise.all([
        mutateCenters(),
        mutatePortalOptions(),
        revalidateKeys(PORTAL_OPTIONS_KEY, "/api/v1/dashboard/summary"),
      ]);
    } catch (error) {
      toast.error(
        error instanceof ClientApiError ? error.message : "Unable to load training centers",
      );
    }
  }

  useEffect(() => {
    if (!centersSwrError) {
      return;
    }

    toast.error(
      centersSwrError instanceof ClientApiError ? centersSwrError.message : "Unable to load training centers",
    );
  }, [centersSwrError]);

  async function handleSaveCenter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (form.programIds.length === 0) {
      toast.error("Select at least one active program before saving the training center");
      return;
    }

    setIsSaving(true);
    const payload = {
      centerName: form.centerName,
      centerCode: form.centerCode,
      sidhTcId: form.sidhTcId || undefined,
      district: form.district,
      state: form.state,
      status: form.status,
      programIds: form.programIds,
    };
    try {
      if (selectedCenter) {
        await apiFetch<CenterRecord>(
          `/api/v1/masters/training-centers/${selectedCenter.centerId}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        toast.success("Training center updated successfully");
        setShowEditModal(false);
      } else {
        await apiFetch<CenterRecord>("/api/v1/masters/training-centers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Training center created successfully");
        setShowCreateModal(false);
      }
      applyCenter(null);
      await loadCenters(page);
    } catch (error) {
      toast.error(
        error instanceof ClientApiError ? error.message : "Unable to save training center",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleVerifyCenter(center: CenterRecord) {
    try {
      await apiFetch(`/api/v1/masters/training-centers/${center.centerId}/verify`, { method: "POST" });
      toast.success(`${center.centerName} verified locally`);
      await loadCenters(page);
    } catch (error) {
      toast.error(
        error instanceof ClientApiError ? error.message : "Unable to verify training center",
      );
    }
  }

  async function handleDeleteCenter(center: CenterRecord) {
    if (!window.confirm(`Delete ${center.centerName}? This cannot be undone.`)) {
      return;
    }

    try {
      await apiFetch(`/api/v1/masters/training-centers/${center.centerId}`, { method: "DELETE" });
      if (selectedCenterId === center.centerId) {
        setShowEditModal(false);
        applyCenter(null);
      }
      toast.success("Training center deleted successfully");
      await loadCenters(page);
    } catch (error) {
      toast.error(
        error instanceof ClientApiError ? error.message : "Unable to delete training center",
      );
    }
  }

  function openEditModal(center: CenterRecord) {
    applyCenter(center);
    setShowEditModal(true);
  }

  const countByStatus = (s: StatusFilter) =>
    s === "all" ? centers.length : centers.filter((c) => c.status === s).length;

  function clearFilters() {
    setStatusFilter("all");
    setWorkflowFilter("all");
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-6 overflow-hidden bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <div className="shrink-0 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{content.heading}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{content.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => startTransition(() => void loadCenters(page))}
            disabled={loadState.isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <IconRefresh className={cn("h-4 w-4", loadState.isRefreshing && "animate-spin")} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              applyCenter(null);
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            <IconPlus className="h-4 w-4" />
            Add center
          </button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total centers"
          value={loadState.isInitialLoading ? null : stats.total}
          icon={<IconBuildingCommunity className="h-5 w-5" />}
          onClick={clearFilters}
          active={statusFilter === "all" && workflowFilter === "all"}
        />
        <StatCard
          label="Active centers"
          value={loadState.isInitialLoading ? null : stats.active}
          icon={<IconMapPin className="h-5 w-5" />}
          onClick={() => {
            setStatusFilter("active");
            setWorkflowFilter("all");
          }}
          active={statusFilter === "active" && workflowFilter === "all"}
        />
        <StatCard
          label="Verified locally"
          value={loadState.isInitialLoading ? null : stats.verified}
          icon={<IconCircleCheck className="h-5 w-5" />}
          onClick={() => {
            setStatusFilter("all");
            setWorkflowFilter("verified");
          }}
          active={workflowFilter === "verified"}
        />
        <StatCard
          label="Ready for NSDC_SIDH sync"
          value={loadState.isInitialLoading ? null : stats.sidhReady}
          icon={<IconCircleCheck className="h-5 w-5" />}
          onClick={() => {
            setStatusFilter("all");
            setWorkflowFilter("ready");
          }}
          active={workflowFilter === "ready"}
        />
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-opacity",
          loadState.isRefreshing && "opacity-70",
        )}
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 md:flex-row md:items-center md:justify-between">
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
                {s === "all" ? "All centers" : s}
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

          <div className="relative min-w-0 flex-1 sm:max-w-xs md:max-w-sm">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, code, or location"
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                {["Center", "Code", "Location", "Programs", "NSDC_SIDH ID", "Setup status", "Status", "Updated", ""].map(
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
              {loadState.isInitialLoading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-sm text-slate-400">
                    <IconLoader2 className="mx-auto h-6 w-6 animate-spin" />
                    <p className="mt-2">Loading training centers…</p>
                  </td>
                </tr>
              ) : filteredCenters.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center">
                    <IconBuildingCommunity className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-500">No training centers found</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {searchQuery || statusFilter !== "all" || workflowFilter !== "all"
                        ? "Try adjusting your filters"
                        : "Add your first training center to get started"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCenters.map((center) => (
                  <CenterTableRow
                    key={center.id}
                    center={center}
                    getProgramLabel={getProgramLabel}
                    onDelete={() => void handleDeleteCenter(center)}
                    onEdit={() => openEditModal(center)}
                    onVerify={() => void handleVerifyCenter(center)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 lg:hidden">
          {loadState.isInitialLoading ? (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              <IconLoader2 className="mx-auto h-6 w-6 animate-spin" />
              <p className="mt-2">Loading training centers…</p>
            </div>
          ) : filteredCenters.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <IconBuildingCommunity className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-500">No training centers found</p>
            </div>
          ) : (
            filteredCenters.map((center) => (
              <CenterMobileCard
                key={center.id}
                center={center}
                getProgramLabel={getProgramLabel}
                onDelete={() => void handleDeleteCenter(center)}
                onEdit={() => openEditModal(center)}
                onVerify={() => void handleVerifyCenter(center)}
              />
            ))
          )}
        </div>
        </div>

        {!loadState.isInitialLoading && totalPages > 1 ? (
          <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
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

      {/* ── Create Center Modal ──────────────────────────────────────── */}
      {showCreateModal && (
        <CenterModal
          title="Create Training Center"
          subtitle="Add a new training center to the platform."
          form={form}
          setForm={setForm}
          programs={programs}
          hasPrograms={hasPrograms}
          masterDataPath={masterDataPath}
          isSaving={isSaving}
          isEdit={false}
          onClose={() => {
            setShowCreateModal(false);
            applyCenter(null);
          }}
          onSubmit={handleSaveCenter}
        />
      )}

      {/* ── Edit Center Modal ────────────────────────────────────────── */}
      {showEditModal && selectedCenter && (
        <CenterModal
          title="Edit Training Center"
          subtitle={`Updating ${selectedCenter.centerName}`}
          form={form}
          setForm={setForm}
          programs={programs}
          hasPrograms={hasPrograms}
          masterDataPath={masterDataPath}
          isSaving={isSaving}
          isEdit={true}
          onClose={() => {
            setShowEditModal(false);
            applyCenter(null);
          }}
          onSubmit={handleSaveCenter}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

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

function CenterIdentity({
  center,
  showCode = false,
}: {
  center: CenterRecord;
  showCode?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
        {center.centerName.trim().charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{center.centerName}</div>
        {showCode ? (
          <div className="truncate font-mono text-xs text-slate-500">{center.centerCode}</div>
        ) : null}
      </div>
    </div>
  );
}

function ProgramBadges({
  center,
  getProgramLabel,
}: {
  center: CenterRecord;
  getProgramLabel: (programId: string) => string;
}) {
  if (center.programIds.length === 0) {
    return <span className="text-slate-300">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {center.programIds.slice(0, 2).map((pid) => (
        <span
          key={pid}
          className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
        >
          {getProgramLabel(pid)}
        </span>
      ))}
      {center.programIds.length > 2 ? (
        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
          +{center.programIds.length - 2}
        </span>
      ) : null}
    </div>
  );
}

function CenterTableRow({
  center,
  getProgramLabel,
  onDelete,
  onEdit,
  onVerify,
}: {
  center: CenterRecord;
  getProgramLabel: (programId: string) => string;
  onDelete: () => void;
  onEdit: () => void;
  onVerify: () => void;
}) {
  const workflow = resolveCenterWorkflowState(center);

  return (
    <tr className="group cursor-pointer transition-colors hover:bg-slate-50/80" onClick={onEdit}>
      <td className="px-5 py-4">
        <CenterIdentity center={center} />
      </td>
      <td className="px-4 py-4 font-mono text-xs text-slate-600">{center.centerCode}</td>
      <td className="px-4 py-4 text-slate-600">
        <div className="flex items-center gap-1">
          <IconMapPin className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="max-w-36 truncate">
            {center.district}, {center.state}
          </span>
        </div>
      </td>
      <td className="px-4 py-4">
        <ProgramBadges center={center} getProgramLabel={getProgramLabel} />
      </td>
      <td className="px-4 py-4 text-xs text-slate-500">
        {center.sidhTcId ? (
          <span className="font-mono text-slate-600">{center.sidhTcId}</span>
        ) : (
          <span className="text-slate-300">Not added</span>
        )}
      </td>
      <td className="px-4 py-4">
        <CenterWorkflowBadge state={workflow} />
      </td>
      <td className="px-4 py-4">
        <StatusBadge status={center.status} />
      </td>
      <td className="px-4 py-4 text-xs text-slate-500">
        {center.updatedAt ? (
          new Date(center.updatedAt).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-4 text-right">
        <CenterRowActions
          workflow={workflow}
          onDelete={onDelete}
          onEdit={onEdit}
          onVerify={onVerify}
        />
      </td>
    </tr>
  );
}

function CenterMobileCard({
  center,
  getProgramLabel,
  onDelete,
  onEdit,
  onVerify,
}: {
  center: CenterRecord;
  getProgramLabel: (programId: string) => string;
  onDelete: () => void;
  onEdit: () => void;
  onVerify: () => void;
}) {
  const workflow = resolveCenterWorkflowState(center);

  return (
    <div className="px-4 py-4">
      <button type="button" onClick={onEdit} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <CenterIdentity center={center} showCode />
          <StatusBadge status={center.status} />
        </div>
        <div className="mt-3 flex items-center gap-1 text-xs text-slate-500">
          <IconMapPin className="h-3.5 w-3.5 shrink-0" />
          {center.district}, {center.state}
        </div>
        <div className="mt-3">
          <ProgramBadges center={center} getProgramLabel={getProgramLabel} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CenterWorkflowBadge state={workflow} />
          {center.sidhTcId ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
              {center.sidhTcId}
            </span>
          ) : null}
        </div>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        <CenterRowActions
          compact
          workflow={workflow}
          onDelete={onDelete}
          onEdit={onEdit}
          onVerify={onVerify}
        />
      </div>
    </div>
  );
}

function CenterRowActions({
  compact = false,
  onDelete,
  onEdit,
  onVerify,
  workflow,
}: {
  compact?: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onVerify: () => void;
  workflow: CenterWorkflowState;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap justify-end gap-2",
        !compact && "opacity-100 transition md:opacity-0 md:group-hover:opacity-100"
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <CenterActionButton
        label={workflow === "draft" ? "Verify" : workflow === "verified" ? "Verified" : "Ready"}
        onClick={onVerify}
        icon={<IconCircleCheck className="h-3.5 w-3.5" />}
        tone={workflow === "draft" ? "primary" : "neutral"}
        disabled={workflow !== "draft"}
      />
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
      >
        <IconPencil className="h-3.5 w-3.5" />
        Edit
      </button>
      <CenterActionButton
        label="Delete"
        onClick={onDelete}
        icon={<IconTrash className="h-3.5 w-3.5" />}
        tone="danger"
      />
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

function CenterWorkflowBadge({ state }: { state: CenterWorkflowState }) {
  const className =
    state === "ready"
      ? "bg-sky-50 text-sky-700"
      : state === "verified"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-500";

  const label =
    state === "ready" ? "Ready for sync" : state === "verified" ? "Verified" : "Needs setup";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function CenterActionButton({
  disabled = false,
  icon,
  label,
  onClick,
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "danger" | "neutral" | "primary";
}) {
  const toneClass =
    tone === "primary"
      ? "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {icon}
      {label}
    </button>
  );
}

type FormState = {
  centerCode: string;
  centerName: string;
  district: string;
  programIds: string[];
  sidhTcId: string;
  state: string;
  status: "active" | "inactive";
};

function CenterModal({
  form,
  hasPrograms,
  isEdit,
  isSaving,
  masterDataPath,
  onClose,
  onSubmit,
  programs,
  setForm,
  subtitle,
  title,
}: {
  form: FormState;
  hasPrograms: boolean;
  isEdit: boolean;
  isSaving: boolean;
  masterDataPath: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  programs: ProgramRecord[];
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  subtitle: string;
  title: string;
}) {
  const [programDropdownOpen, setProgramDropdownOpen] = useState(false);
  const selectedPrograms = programs.filter((p) => form.programIds.includes(p.programId));

  function toggleProgram(programId: string) {
    setForm((f) => ({
      ...f,
      programIds: f.programIds.includes(programId)
        ? f.programIds.filter((id) => id !== programId)
        : [...f.programIds, programId],
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-600">
              <IconBuildingCommunity className="h-5 w-5" />
            </span>
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

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Center Name">
                <input
                  value={form.centerName}
                  onChange={(e) => setForm((f) => ({ ...f, centerName: e.target.value }))}
                  className={inputCls}
                  placeholder="Gram Tarang Skill Training Center"
                  required
                />
              </FormField>
              <FormField label="Center Code">
                <input
                  value={form.centerCode}
                  onChange={(e) => setForm((f) => ({ ...f, centerCode: e.target.value }))}
                  className={inputCls}
                  placeholder="GTET-JSG-001"
                  required
                />
              </FormField>
              <FormField label="District">
                <input
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  className={inputCls}
                  placeholder="Jharsuguda"
                  required
                />
              </FormField>
              <FormField label="State">
                <input
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  className={inputCls}
                  placeholder="Odisha"
                  required
                />
              </FormField>
              <FormField label="Approved SIDH TC ID">
                <input
                  value={form.sidhTcId}
                  onChange={(e) => setForm((f) => ({ ...f, sidhTcId: e.target.value }))}
                  className={inputCls}
                  placeholder="TC164648"
                />
                <p className="text-xs text-slate-400">
                  Use the approved SIDH training-center ID from the portal. This app stores it locally and uses it later in batch sync.
                </p>
              </FormField>
              <FormField label="Status">
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
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

            {/* Programs dropdown */}
            <FormField label={`Programs${selectedPrograms.length > 0 ? ` · ${selectedPrograms.length} selected` : ""}`}>
              {!hasPrograms ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                  <p>No programs available yet.</p>
                  <a
                    href={masterDataPath}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:border-amber-400"
                  >
                    Create a program first
                  </a>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Trigger */}
                  <button
                    type="button"
                    onClick={() => setProgramDropdownOpen((v) => !v)}
                    className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:border-slate-300 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    <span className={selectedPrograms.length === 0 ? "text-slate-400" : "text-slate-800"}>
                      {selectedPrograms.length === 0
                        ? "Select programs…"
                        : selectedPrograms.map((p) => p.name).join(", ")}
                    </span>
                    <IconChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${programDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {/* Selected pills */}
                  {selectedPrograms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPrograms.map((p) => (
                        <span
                          key={p.programId}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                        >
                          {p.name}
                          <button
                            type="button"
                            onClick={() => toggleProgram(p.programId)}
                            className="ml-0.5 text-slate-400 hover:text-rose-500"
                          >
                            <IconX className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {selectedPrograms.length === 0 && (
                    <p className="text-xs text-amber-600">
                      Select at least one active program. Batch creation validates center-program alignment before SIDH sync.
                    </p>
                  )}

                  {/* Dropdown panel */}
                  {programDropdownOpen && (
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {programs.map((program) => {
                        const isChecked = form.programIds.includes(program.programId);
                        return (
                          <label
                            key={program.programId}
                            className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition ${
                              isChecked ? "bg-sky-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleProgram(program.programId)}
                              className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {program.name}
                              </p>
                              {program.status === "inactive" && (
                                <p className="text-xs text-amber-500">Inactive</p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </FormField>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !hasPrograms || form.programIds.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : isEdit ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <IconPlus className="h-4 w-4" />
                )}
                {isEdit ? "Save Changes" : "Create Center"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function FormField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100";
