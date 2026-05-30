"use client";

import { startTransition, useEffect, useState } from "react";
import { LoaderCircle, MapPinned, PlusCircle, RefreshCw } from "lucide-react";

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
};

type PagedCenters = {
  items: CenterRecord[];
  page: number;
  pageSize: number;
  total: number;
};

const portalContent = {
  admin: {
    description:
      "Create new training centers and review the centers currently visible to the platform admin scope.",
    heading: "Training Centers",
  },
  training_partner: {
    description:
      "Create and review training centers within your visible scope using the same master-data API.",
    heading: "Scoped Training Centers",
  },
} as const;

export default function TrainingCentersManager({ portal }: TrainingCentersManagerProps) {
  const [centers, setCenters] = useState<CenterRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    centerCode: "",
    centerName: "",
    district: "",
    programIds: "",
    sidhTcId: "",
    state: "",
    status: "active" as "active" | "inactive",
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const content = portalContent[portal];

  async function fetchCenters(targetPage: number) {
    return apiFetch<PagedCenters>(`/api/v1/masters/training-centers?page=${targetPage}&pageSize=${pageSize}`);
  }

  async function loadCenters(targetPage = page) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await fetchCenters(targetPage);
      setCenters(data.items);
      setTotal(data.total);
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load training centers");
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
        const data = await apiFetch<PagedCenters>(`/api/v1/masters/training-centers?page=${page}&pageSize=${pageSize}`);

        if (!isMounted) {
          return;
        }

        setCenters(data.items);
        setTotal(data.total);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load training centers");
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
  }, [page, pageSize]);

  async function handleCreateCenter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch<CenterRecord>("/api/v1/masters/training-centers", {
        method: "POST",
        body: JSON.stringify({
          centerName: form.centerName,
          centerCode: form.centerCode,
          sidhTcId: form.sidhTcId || undefined,
          district: form.district,
          state: form.state,
          status: form.status,
          programIds: form.programIds
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });

      setForm({
        centerCode: "",
        centerName: "",
        district: "",
        programIds: "",
        sidhTcId: "",
        state: "",
        status: "active",
      });
      setSuccessMessage("Training center created successfully");
      await loadCenters(page);
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to create training center");
    } finally {
      setIsSaving(false);
    }
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
            onClick={() => startTransition(() => void loadCenters(page))}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </section>

      {errorMessage ? <MessageCard tone="error" message={errorMessage} /> : null}
      {successMessage ? <MessageCard tone="success" message={successMessage} /> : null}

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-sky-50 p-2 text-sky-600">
              <PlusCircle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Create Training Center</h2>
              <p className="text-sm text-slate-500">Backed by POST /api/v1/masters/training-centers.</p>
            </div>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleCreateCenter}>
            <Field label="Center Name">
              <input
                value={form.centerName}
                onChange={(event) => setForm((current) => ({ ...current, centerName: event.target.value }))}
                className={inputClassName}
                placeholder="Gram Tarang Skill Training Center Jharsuguda"
                required
              />
            </Field>
            <Field label="Center Code">
              <input
                value={form.centerCode}
                onChange={(event) => setForm((current) => ({ ...current, centerCode: event.target.value }))}
                className={inputClassName}
                placeholder="GTET-JSG-001"
                required
              />
            </Field>
            <Field label="SIDH TC ID">
              <input
                value={form.sidhTcId}
                onChange={(event) => setForm((current) => ({ ...current, sidhTcId: event.target.value }))}
                className={inputClassName}
                placeholder="TC164648"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="District">
                <input
                  value={form.district}
                  onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))}
                  className={inputClassName}
                  placeholder="Jharsuguda"
                  required
                />
              </Field>
              <Field label="State">
                <input
                  value={form.state}
                  onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
                  className={inputClassName}
                  placeholder="Odisha"
                  required
                />
              </Field>
            </div>
            <Field label="Program IDs (comma separated)">
              <input
                value={form.programIds}
                onChange={(event) => setForm((current) => ({ ...current, programIds: event.target.value }))}
                className={inputClassName}
                placeholder="prg_001, prg_002"
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
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
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              Create Center
            </button>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-emerald-50 p-2 text-emerald-600">
              <MapPinned className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Visible Centers</h2>
              <p className="text-sm text-slate-500">Backed by GET /api/v1/masters/training-centers.</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                Loading training centers...
              </div>
            ) : centers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No training centers found in the current scope.
              </div>
            ) : (
              centers.map((center) => (
                <div key={center.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{center.centerName}</div>
                      <div className="mt-1 text-sm text-slate-600">{center.centerCode}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClassName[center.status]}`}>
                      {center.status}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-3">
                    <CenterMeta label="District" value={center.district} />
                    <CenterMeta label="State" value={center.state} />
                    <CenterMeta label="SIDH TC ID" value={center.sidhTcId ?? "Not set"} />
                    <CenterMeta label="Programs" value={center.programIds.length ? center.programIds.join(", ") : "None"} />
                    <CenterMeta label="Created" value={center.createdAt ? new Date(center.createdAt).toLocaleString() : "Unknown"} />
                    <CenterMeta label="Updated" value={center.updatedAt ? new Date(center.updatedAt).toLocaleString() : "Unknown"} />
                  </div>
                </div>
              ))
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

function CenterMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white px-3 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-700">{value}</div>
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

const badgeClassName = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-200 text-slate-700",
} as const;

const inputClassName =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300";