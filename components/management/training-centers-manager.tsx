"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  LoaderCircle,
  MapPin,
  MapPinned,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError } from "@/lib/client/api";

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

const portalContent = {
  admin: {
    description:
      "Maintain local training-center records first, then store the approved SIDH TC ID used later during batch sync.",
    heading: "Training Centers",
  },
  training_partner: {
    description:
      "Manage local training centers in scope, keep program mappings accurate, and capture the approved SIDH TC ID before any batch sync.",
    heading: "Scoped Training Centers",
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
  const [centers, setCenters] = useState<CenterRecord[]>([]);
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
      return matchesSearch && matchesStatus;
    });
  }, [centers, searchQuery, statusFilter]);

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
    setIsLoading(true);
    try {
      const [centerData, programData] = await Promise.all([
        apiFetch<PagedCenters>(
          `/api/v1/masters/training-centers?page=${targetPage}&pageSize=${pageSize}`,
        ),
        apiFetch<PagedPrograms>("/api/v1/masters/programs?page=1&pageSize=100"),
      ]);
      setCenters(centerData.items);
      setPrograms(programData.items);
      setTotal(centerData.total);
    } catch (error) {
      toast.error(
        error instanceof ClientApiError ? error.message : "Unable to load training centers",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function init() {
      setIsLoading(true);
      try {
        const [centerData, programData] = await Promise.all([
          apiFetch<PagedCenters>(
            `/api/v1/masters/training-centers?page=${page}&pageSize=${pageSize}`,
          ),
          apiFetch<PagedPrograms>("/api/v1/masters/programs?page=1&pageSize=100"),
        ]);
        if (!mounted) return;
        setCenters(centerData.items);
        setPrograms(programData.items);
        setTotal(centerData.total);
      } catch (error) {
        if (!mounted) return;
        toast.error(
          error instanceof ClientApiError ? error.message : "Unable to load training centers",
        );
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void init();
    return () => {
      mounted = false;
    };
  }, [page, pageSize]);

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

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">
              Master Data
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">
              {content.heading}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{content.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startTransition(() => void loadCenters(page))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                applyCenter(null);
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <Plus className="h-4 w-4" />
              New Center
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Building2 className="h-5 w-5" />}
            iconBg="bg-slate-100 text-slate-600"
            label="Total Centers"
            value={stats.total}
          />
          <StatCard
            icon={<MapPinned className="h-5 w-5" />}
            iconBg="bg-emerald-100 text-emerald-600"
            label="Active"
            value={stats.active}
            accent="text-emerald-600"
          />
          <StatCard
            icon={<Filter className="h-5 w-5" />}
            iconBg="bg-sky-100 text-sky-600"
            label="Verified"
            value={stats.verified}
            accent="text-sky-600"
          />
          <StatCard
            icon={<MapPin className="h-5 w-5" />}
            iconBg="bg-amber-100 text-amber-600"
            label="SIDH Ready"
            value={stats.sidhReady}
            accent="text-amber-600"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, code, district…"
                className="h-9 w-64 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
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
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  {["Center", "Code", "Location", "Programs", "Approved SIDH TC ID", "Workflow", "Status", "Updated", ""].map(
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
                    <td colSpan={9} className="px-5 py-16 text-center text-sm text-slate-400">
                      <LoaderCircle className="mx-auto h-6 w-6 animate-spin" />
                      <p className="mt-2">Loading training centers…</p>
                    </td>
                  </tr>
                ) : filteredCenters.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center">
                      <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-sm font-medium text-slate-500">
                        No training centers found
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {searchQuery || statusFilter !== "all"
                          ? "Try adjusting your filters"
                          : "Create your first training center to get started"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredCenters.map((center) => (
                    (() => {
                      const workflow = resolveCenterWorkflowState(center);

                      return (
                    <tr
                      key={center.id}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                      onClick={() => openEditModal(center)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-emerald-50 to-sky-100 text-sm font-bold text-emerald-700">
                            {center.centerName.trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900 max-w-52">
                              {center.centerName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-slate-600">
                        {center.centerCode}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate max-w-36">
                            {center.district}, {center.state}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {center.programIds.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {center.programIds.slice(0, 2).map((pid) => (
                              <span
                                key={pid}
                                className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                              >
                                {getProgramLabel(pid)}
                              </span>
                            ))}
                            {center.programIds.length > 2 && (
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                +{center.programIds.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {center.sidhTcId ? (
                          <div className="space-y-1">
                            <div className="font-mono text-xs text-slate-600">{center.sidhTcId}</div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="text-slate-300">—</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <CenterWorkflowBadge state={workflow} />
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            center.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              center.status === "active" ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          {center.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {center.updatedAt ? (
                          new Date(center.updatedAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                          <CenterActionButton
                            label={workflow === "draft" ? "Verify" : workflow === "verified" ? "Verified" : "Ready"}
                            onClick={() => handleVerifyCenter(center)}
                            icon={<CheckCircle2 className="h-3 w-3" />}
                            tone={workflow === "draft" ? "primary" : "neutral"}
                            disabled={workflow !== "draft"}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(center);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <CenterActionButton
                            label="Delete"
                            onClick={() => handleDeleteCenter(center)}
                            icon={<Trash2 className="h-3 w-3" />}
                            tone="danger"
                          />
                        </div>
                      </td>
                    </tr>
                      );
                    })()
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

function CenterWorkflowBadge({ state }: { state: CenterWorkflowState }) {
  const className =
    state === "ready"
      ? "bg-sky-50 text-sky-700"
      : state === "verified"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-500";

  const label = state === "ready" ? "Ready for SIDH" : state === "verified" ? "Verified" : "Draft";

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
              <Building2 className="h-5 w-5" />
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
            <X className="h-4 w-4" />
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
                    <ChevronDown
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
                            <X className="h-3 w-3" />
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
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : isEdit ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
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
