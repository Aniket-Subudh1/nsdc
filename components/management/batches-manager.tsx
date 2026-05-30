"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rows4,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError, type ApiEnvelope } from "@/lib/client/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BatchesManagerProps = {
  portal: "admin" | "training_partner";
};

type ReferenceOption = {
  code?: string;
  courseName?: string;
  centerCode?: string;
  centerId?: string;
  centerName?: string;
  id?: string;
  name?: string;
  schemeId?: string;
  courseId?: string;
};

type CandidateRecord = {
  candidateId: string;
  centerId: string;
  contactDetails: {
    mobileNumber: string;
  };
  personalDetails: {
    fullName: string;
  };
  programId: string;
  sidhCandidateId: string | null;
  syncState: {
    status?: string | null;
  } | null;
};

type PagedCandidates = {
  items: CandidateRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type ReferenceData = {
  courses: Array<{ courseId: string; courseName: string }>;
  schemes: Array<{ schemeId: string; name: string }>;
  trainingCenters: Array<{ centerCode: string; centerId: string; centerName: string }>;
};

type BatchListItem = {
  assessmentEligibilityThreshold: number;
  batchCode: string;
  batchId: string;
  batchName: string | null;
  candidateCount: number;
  centerId: string;
  courseId: string;
  endDate: string | null;
  schemeId: string;
  sidhBatchId: string | null;
  startDate: string | null;
  status: string;
  syncEnabled: boolean;
  syncState: {
    batchSync: { status: string };
    enrollmentSync: { status: string };
  };
};

type PagedBatches = {
  items: BatchListItem[];
  page: number;
  pageSize: number;
  total: number;
};

type BatchDetail = BatchListItem & {
  allowAssessmentBeforeBatchEnd: boolean;
  allowCandidateOverlap: boolean;
  assessmentDate: string | null;
  candidates: Array<{
    batchCandidateId: string;
    candidateId: string;
    candidateMobileNumber: string | null;
    candidateName: string | null;
    enrollmentStatus: string;
    sidhCandidateId: string | null;
    trainingStatus: string | null;
  }>;
  syncState: {
    batchSync: {
      lastFailureMessage: string | null;
      lastSuccessAt: string | null;
      status: string;
    };
    enrollmentSync: {
      lastFailureMessage: string | null;
      lastSuccessAt: string | null;
      status: string;
    };
  };
};

type BatchStatus = {
  batchCode: string;
  batchId: string;
  batchSync: {
    lastFailureMessage: string | null;
    lastSuccessAt: string | null;
    status: string;
  };
  candidateCount: number;
  enrollmentCounts: Record<string, number>;
  enrollmentSync: {
    lastFailureMessage: string | null;
    lastSuccessAt: string | null;
    status: string;
  };
  sidhBatchId: string | null;
};

type AttendanceImport = {
  attendanceUploadId: string;
  committedRows: number;
  fileName: string;
  invalidRows: number;
  rows: Array<{
    attendanceDate: string | null;
    attendanceStatus: string | null;
    candidateId: string | null;
    errors: Array<{ field?: string; message: string }>;
    rowId: string;
    rowNumber: number;
    status: string;
    trainingStatus: string | null;
  }>;
  status: string;
  totalRows: number;
  validRows: number;
};

type AttendanceSummary = {
  assessmentEligibilityThreshold: number;
  batchId: string;
  candidates: Array<{
    attendancePercentage: number;
    candidateId: string;
    candidateName: string | null;
    eligibleForAssessment: boolean;
    enrollmentStatus: string;
    presentDays: number;
    totalSessions: number;
    trainingStatus: string | null;
  }>;
  dailySessions: Array<{
    absentCount: number;
    attendanceDate: string | null;
    expectedCandidateCount: number;
    presentCount: number;
  }>;
  totalSessions: number;
};

type BatchFormState = {
  assessmentDate: string;
  assessmentEligibilityThreshold: string;
  batchCode: string;
  batchName: string;
  centerId: string;
  courseId: string;
  endDate: string;
  schemeId: string;
  startDate: string;
};

const portalContent = {
  admin: {
    description:
      "Create compliant batches, align candidates, queue SIDH sync, and stage attendance imports from one operational surface.",
    heading: "Batch And Attendance Operations",
  },
  training_partner: {
    description:
      "Operate only inside your scoped centers while managing compliant batches, enrollment readiness, and attendance commit workflows.",
    heading: "Scoped Batch Operations",
  },
} as const;

const emptyBatchForm: BatchFormState = {
  assessmentDate: "",
  assessmentEligibilityThreshold: "70",
  batchCode: "",
  batchName: "",
  centerId: "",
  courseId: "",
  endDate: "",
  schemeId: "",
  startDate: "",
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return value.replace(/_/g, " ");
}

function StatusBadge({ tone = "slate", value }: { tone?: "emerald" | "slate" | "amber" | "rose" | "sky"; value: string }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;

  return <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-semibold capitalize", tones[tone])}>{formatStatusLabel(value)}</span>;
}

async function fetchFormData<T>(url: string, formData: FormData) {
  const response = await fetch(url, {
    body: formData,
    credentials: "include",
    method: "POST",
  });
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    throw new ClientApiError(payload.message ?? "Request failed", response.status);
  }

  return payload.data;
}

export default function BatchesManager({ portal }: BatchesManagerProps) {
  const content = portalContent[portal];
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [lastImport, setLastImport] = useState<AttendanceImport | null>(null);
  const [batchForm, setBatchForm] = useState<BatchFormState>(emptyBatchForm);
  const [candidateSelection, setCandidateSelection] = useState<string[]>([]);
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const centerMap = useMemo(() => new Map((referenceData?.trainingCenters ?? []).map((center) => [center.centerId, center])), [referenceData]);
  const courseMap = useMemo(() => new Map((referenceData?.courses ?? []).map((course) => [course.courseId, course])), [referenceData]);
  const schemeMap = useMemo(() => new Map((referenceData?.schemes ?? []).map((scheme) => [scheme.schemeId, scheme])), [referenceData]);

  const availableCandidates = useMemo(() => {
    const centerId = selectedBatch?.centerId ?? batchForm.centerId;
    const assignedIds = new Set(selectedBatch?.candidates.map((candidate) => candidate.candidateId) ?? []);

    return candidates.filter((candidate) => candidate.centerId === centerId && !assignedIds.has(candidate.candidateId));
  }, [batchForm.centerId, candidates, selectedBatch]);

  function hydrateBatchForm(batch: BatchDetail | null) {
    if (!batch) {
      setBatchForm(emptyBatchForm);
      return;
    }

    setBatchForm({
      assessmentDate: batch.assessmentDate ?? "",
      assessmentEligibilityThreshold: String(batch.assessmentEligibilityThreshold ?? 70),
      batchCode: batch.batchCode,
      batchName: batch.batchName ?? "",
      centerId: batch.centerId,
      courseId: batch.courseId,
      endDate: batch.endDate ?? "",
      schemeId: batch.schemeId,
      startDate: batch.startDate ?? "",
    });
  }

  async function loadBatchWorkspace(batchId: string | null) {
    if (!batchId) {
      setSelectedBatch(null);
      setBatchStatus(null);
      setAttendanceSummary(null);
      hydrateBatchForm(null);
      return;
    }

    const [detail, status, summary] = await Promise.all([
      apiFetch<BatchDetail>(`/api/v1/batches/${batchId}`),
      apiFetch<BatchStatus>(`/api/v1/batches/${batchId}/status`),
      apiFetch<AttendanceSummary>(`/api/v1/batches/${batchId}/attendance-summary`).catch(() => null),
    ]);

    setSelectedBatch(detail);
    setBatchStatus(status);
    setAttendanceSummary(summary);
    hydrateBatchForm(detail);
  }

  async function loadData(preferredBatchId?: string | null) {
    setIsLoading(true);

    try {
      const [refs, candidatePage, batchPage] = await Promise.all([
        apiFetch<ReferenceData>("/api/v1/reference-data/candidate"),
        apiFetch<PagedCandidates>("/api/v1/candidates?page=1&pageSize=100"),
        apiFetch<PagedBatches>("/api/v1/batches?page=1&pageSize=100"),
      ]);

      setReferenceData(refs);
      setCandidates(candidatePage.items);
      setBatches(batchPage.items);

      const nextBatchId = preferredBatchId ?? selectedBatchId ?? batchPage.items[0]?.batchId ?? null;
      setSelectedBatchId(nextBatchId);
      await loadBatchWorkspace(nextBatchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load batch operations");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleSaveBatch() {
    setIsSaving(true);

    try {
      const payload = {
        assessmentDate: batchForm.assessmentDate || undefined,
        assessmentEligibilityThreshold: Number(batchForm.assessmentEligibilityThreshold || 70),
        batchCode: batchForm.batchCode,
        batchName: batchForm.batchName,
        centerId: batchForm.centerId,
        courseId: batchForm.courseId,
        endDate: batchForm.endDate,
        schemeId: batchForm.schemeId,
        startDate: batchForm.startDate,
      };

      const data = selectedBatch
        ? await apiFetch<BatchDetail>(`/api/v1/batches/${selectedBatch.batchId}`, {
            body: JSON.stringify(payload),
            method: "PATCH",
          })
        : await apiFetch<BatchDetail>("/api/v1/batches", {
            body: JSON.stringify(payload),
            method: "POST",
          });

      toast.success(selectedBatch ? "Batch updated" : "Batch created");
      await loadData(data.batchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to save batch");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddCandidates() {
    if (!selectedBatch || candidateSelection.length === 0) {
      toast.error("Select at least one candidate to add to the batch");
      return;
    }

    setIsSaving(true);
    try {
      await apiFetch<BatchDetail>(`/api/v1/batches/${selectedBatch.batchId}/candidates`, {
        body: JSON.stringify({ candidateIds: candidateSelection }),
        method: "POST",
      });
      setCandidateSelection([]);
      toast.success("Candidates added to batch");
      await loadData(selectedBatch.batchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to add candidates");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveCandidate(candidateId: string) {
    if (!selectedBatch) {
      return;
    }

    setIsSaving(true);
    try {
      await apiFetch<BatchDetail>(`/api/v1/batches/${selectedBatch.batchId}/candidates/${candidateId}`, {
        method: "DELETE",
      });
      toast.success("Candidate removed from batch");
      await loadData(selectedBatch.batchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to remove candidate");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQueueBatchSync() {
    if (!selectedBatch) {
      return;
    }

    setIsSaving(true);
    try {
      const status = await apiFetch<BatchStatus>(`/api/v1/batches/${selectedBatch.batchId}/sync`, {
        body: JSON.stringify({ forceResync: false }),
        method: "POST",
      });
      setBatchStatus(status);
      toast.success("Batch sync queued");
      await loadBatchWorkspace(selectedBatch.batchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to queue batch sync");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQueueEnrollmentSync() {
    if (!selectedBatch) {
      return;
    }

    setIsSaving(true);
    try {
      const status = await apiFetch<BatchStatus>(`/api/v1/batches/${selectedBatch.batchId}/enrollment-sync`, {
        body: JSON.stringify({ forceResync: false }),
        method: "POST",
      });
      setBatchStatus(status);
      toast.success("Enrollment sync queued");
      await loadBatchWorkspace(selectedBatch.batchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to queue enrollment sync");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAttendanceUpload() {
    if (!selectedBatch || !attendanceFile) {
      toast.error("Select a batch and an Excel file before uploading attendance");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("batchId", selectedBatch.batchId);
      formData.set("file", attendanceFile);
      const upload = await fetchFormData<AttendanceImport>("/api/v1/attendance/imports", formData);
      setLastImport(upload);
      toast.success("Attendance file staged");
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to upload attendance");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCommitAttendance() {
    if (!lastImport) {
      return;
    }

    setIsSaving(true);
    try {
      const upload = await apiFetch<AttendanceImport>(`/api/v1/attendance/imports/${lastImport.attendanceUploadId}/commit`, {
        body: JSON.stringify({ overwriteExisting: true }),
        method: "POST",
      });
      setLastImport(upload);
      toast.success("Attendance import committed");
      await loadBatchWorkspace(selectedBatchId);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to commit attendance");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCreateNew() {
    setSelectedBatchId(null);
    setSelectedBatch(null);
    setBatchStatus(null);
    setAttendanceSummary(null);
    setLastImport(null);
    setCandidateSelection([]);
    setAttendanceFile(null);
    hydrateBatchForm(null);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#eff6ff,_#f8fafc_55%,_#ffffff)] px-6 py-10 text-slate-700">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-medium shadow-sm backdrop-blur">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Loading batch operations
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(253,230,138,0.22),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)] px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-[28px] border border-slate-200/70 bg-white/85 p-6 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Batch Operations
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">{content.heading}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">{content.description}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:text-sky-700"
                onClick={() => startTransition(() => void loadData(selectedBatchId))}
                type="button"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh data
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                onClick={handleCreateNew}
                type="button"
              >
                <Plus className="h-4 w-4" />
                New batch
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-[26px] border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Batch registry</h2>
                <p className="text-xs text-slate-500">Select a batch to manage roster, sync, and attendance.</p>
              </div>
              <StatusBadge tone="sky" value={`${batches.length} loaded`} />
            </div>

            <div className="space-y-3">
              {batches.map((batch) => (
                <button
                  key={batch.batchId}
                  className={classNames(
                    "w-full rounded-2xl border px-4 py-4 text-left transition",
                    selectedBatchId === batch.batchId
                      ? "border-sky-300 bg-sky-50 shadow-sm"
                      : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white",
                  )}
                  onClick={() => startTransition(() => {
                    setSelectedBatchId(batch.batchId);
                    void loadBatchWorkspace(batch.batchId);
                  })}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{batch.batchCode}</p>
                      <p className="mt-1 text-xs text-slate-500">{batch.batchName || "Unnamed batch"}</p>
                    </div>
                    <StatusBadge tone={batch.syncState.batchSync.status === "synced" ? "emerald" : "slate"} value={batch.syncState.batchSync.status} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-2.5 py-1">{centerMap.get(batch.centerId)?.centerCode ?? batch.centerId}</span>
                    <span className="rounded-full bg-white px-2.5 py-1">{batch.candidateCount} candidates</span>
                  </div>
                </button>
              ))}

              {batches.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No batches created yet.</div> : null}
            </div>
          </section>

          <section className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <article className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Batch definition</h2>
                    <p className="text-sm text-slate-500">Create or revise the core batch metadata and compliance window.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="batchCode">Batch code</Label>
                    <Input id="batchCode" value={batchForm.batchCode} onChange={(event) => setBatchForm((current) => ({ ...current, batchCode: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="batchName">Batch name</Label>
                    <Input id="batchName" value={batchForm.batchName} onChange={(event) => setBatchForm((current) => ({ ...current, batchName: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="centerId">Training center</Label>
                    <select id="centerId" className="h-10 w-full rounded-md bg-slate-50 px-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-sky-300" value={batchForm.centerId} onChange={(event) => setBatchForm((current) => ({ ...current, centerId: event.target.value }))}>
                      <option value="">Select a center</option>
                      {(referenceData?.trainingCenters ?? []).map((center) => <option key={center.centerId} value={center.centerId}>{center.centerName} ({center.centerCode})</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="courseId">Course</Label>
                    <select id="courseId" className="h-10 w-full rounded-md bg-slate-50 px-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-sky-300" value={batchForm.courseId} onChange={(event) => setBatchForm((current) => ({ ...current, courseId: event.target.value }))}>
                      <option value="">Select a course</option>
                      {(referenceData?.courses ?? []).map((course) => <option key={course.courseId} value={course.courseId}>{course.courseName}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="schemeId">Scheme</Label>
                    <select id="schemeId" className="h-10 w-full rounded-md bg-slate-50 px-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-sky-300" value={batchForm.schemeId} onChange={(event) => setBatchForm((current) => ({ ...current, schemeId: event.target.value }))}>
                      <option value="">Select a scheme</option>
                      {(referenceData?.schemes ?? []).map((scheme) => <option key={scheme.schemeId} value={scheme.schemeId}>{scheme.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="threshold">Eligibility threshold (%)</Label>
                    <Input id="threshold" type="number" min={0} max={100} value={batchForm.assessmentEligibilityThreshold} onChange={(event) => setBatchForm((current) => ({ ...current, assessmentEligibilityThreshold: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start date</Label>
                    <Input id="startDate" type="date" value={batchForm.startDate} onChange={(event) => setBatchForm((current) => ({ ...current, startDate: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End date</Label>
                    <Input id="endDate" type="date" value={batchForm.endDate} onChange={(event) => setBatchForm((current) => ({ ...current, endDate: event.target.value }))} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="assessmentDate">Assessment date</Label>
                    <Input id="assessmentDate" type="date" value={batchForm.assessmentDate} onChange={(event) => setBatchForm((current) => ({ ...current, assessmentDate: event.target.value }))} />
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60" disabled={isSaving} onClick={() => void handleSaveBatch()} type="button">
                    {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {selectedBatch ? "Update batch" : "Create batch"}
                  </button>
                  {selectedBatch ? <StatusBadge tone={selectedBatch.sidhBatchId ? "emerald" : "slate"} value={selectedBatch.sidhBatchId ? "SIDH linked" : "Internal only"} /> : null}
                </div>
              </article>

              <article className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                    <Send className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Sync controls</h2>
                    <p className="text-sm text-slate-500">Queue batch creation and enrollment sync when the batch is ready.</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Batch sync</p>
                    <div className="mt-3 flex items-center gap-2">
                      <StatusBadge tone={batchStatus?.batchSync.status === "synced" ? "emerald" : batchStatus?.batchSync.status === "queued" ? "sky" : batchStatus?.batchSync.status === "manual_review" ? "amber" : "slate"} value={batchStatus?.batchSync.status ?? "not_synced"} />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">{batchStatus?.batchSync.lastFailureMessage ?? "No failure recorded for batch sync."}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Enrollment sync</p>
                    <div className="mt-3 flex items-center gap-2">
                      <StatusBadge tone={batchStatus?.enrollmentSync.status === "synced" ? "emerald" : batchStatus?.enrollmentSync.status === "queued" ? "sky" : batchStatus?.enrollmentSync.status === "manual_review" ? "amber" : batchStatus?.enrollmentSync.status === "cancelled" ? "rose" : "slate"} value={batchStatus?.enrollmentSync.status ?? "not_synced"} />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">{batchStatus?.enrollmentSync.lastFailureMessage ?? "No failure recorded for enrollment sync."}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60" disabled={!selectedBatch || isSaving} onClick={() => void handleQueueBatchSync()} type="button">
                    <ShieldCheck className="h-4 w-4" />
                    Queue batch sync
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-100 disabled:opacity-60" disabled={!selectedBatch || isSaving} onClick={() => void handleQueueEnrollmentSync()} type="button">
                    <Send className="h-4 w-4" />
                    Queue enrollment sync
                  </button>
                </div>

                {batchStatus ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Enrollment breakdown</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      {Object.entries(batchStatus.enrollmentCounts).length > 0 ? Object.entries(batchStatus.enrollmentCounts).map(([status, count]) => (
                        <span key={status} className="rounded-full bg-slate-100 px-3 py-1">{formatStatusLabel(status)}: {count}</span>
                      )) : <span className="rounded-full bg-slate-100 px-3 py-1">No enrollment activity yet</span>}
                    </div>
                  </div>
                ) : null}
              </article>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <article className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Batch roster</h2>
                    <p className="text-sm text-slate-500">Assign eligible candidates and review current enrollment state.</p>
                  </div>
                </div>

                {selectedBatch ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="candidateSelection">Available candidates</Label>
                      <select
                        id="candidateSelection"
                        className="min-h-40 w-full rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-amber-300"
                        multiple
                        value={candidateSelection}
                        onChange={(event) => setCandidateSelection(Array.from(event.target.selectedOptions).map((option) => option.value))}
                      >
                        {availableCandidates.map((candidate) => (
                          <option key={candidate.candidateId} value={candidate.candidateId}>
                            {candidate.personalDetails.fullName} ({candidate.candidateId})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60" disabled={isSaving || candidateSelection.length === 0} onClick={() => void handleAddCandidates()} type="button">
                        <Plus className="h-4 w-4" />
                        Add selected candidates
                      </button>
                    </div>

                    <div className="mt-5 space-y-3">
                      {selectedBatch.candidates.length > 0 ? selectedBatch.candidates.map((candidate) => (
                        <div key={candidate.batchCandidateId} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{candidate.candidateName ?? candidate.candidateId}</p>
                              <p className="mt-1 text-xs text-slate-500">{candidate.candidateId} · {candidate.candidateMobileNumber ?? "No mobile"}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <StatusBadge tone={candidate.enrollmentStatus === "synced" ? "emerald" : candidate.enrollmentStatus === "manual_review" ? "amber" : candidate.enrollmentStatus === "cancelled" ? "rose" : "slate"} value={candidate.enrollmentStatus} />
                                {candidate.sidhCandidateId ? <StatusBadge tone="sky" value="SIDH linked" /> : <StatusBadge value="Awaiting candidate sync" />}
                              </div>
                            </div>

                            <button className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100" onClick={() => void handleRemoveCandidate(candidate.candidateId)} type="button">
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove
                            </button>
                          </div>
                        </div>
                      )) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No candidates aligned to this batch yet.</div>}
                    </div>
                  </>
                ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Create or select a batch to manage the roster.</div>}
              </article>

              <article className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Attendance staging</h2>
                    <p className="text-sm text-slate-500">Upload an Excel file, inspect row validation, then commit into attendance records.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                  <input accept=".xlsx,.xls" onChange={(event) => setAttendanceFile(event.target.files?.[0] ?? null)} type="file" />
                  <div className="flex flex-wrap gap-3">
                    <button className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-100 disabled:opacity-60" disabled={!selectedBatch || !attendanceFile || isUploading} onClick={() => void handleAttendanceUpload()} type="button">
                      {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Stage attendance file
                    </button>
                    <button className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60" disabled={!lastImport || lastImport.validRows === 0 || lastImport.invalidRows > 0 || isSaving} onClick={() => void handleCommitAttendance()} type="button">
                      <ClipboardCheck className="h-4 w-4" />
                      Commit validated rows
                    </button>
                  </div>
                </div>

                {lastImport ? (
                  <div className="mt-5 space-y-4">
                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <StatusBadge tone={lastImport.invalidRows === 0 ? "emerald" : "amber"} value={lastImport.status} />
                      <span className="rounded-full bg-slate-100 px-3 py-1">{lastImport.validRows} valid</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">{lastImport.invalidRows} invalid</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">{lastImport.committedRows} committed</span>
                    </div>

                    <div className="max-h-72 space-y-3 overflow-auto pr-1">
                      {lastImport.rows.slice(0, 12).map((row) => (
                        <div key={row.rowId} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-900">Row {row.rowNumber} · {row.candidateId ?? "Unknown candidate"}</p>
                            <StatusBadge tone={row.status === "valid" ? "emerald" : row.status === "duplicate" ? "amber" : "rose"} value={row.status} />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{row.attendanceDate ?? "No date"} · {row.attendanceStatus ?? "No status"} · {row.trainingStatus ?? "No training update"}</p>
                          {row.errors.length > 0 ? <ul className="mt-3 space-y-1 text-xs text-rose-700">{row.errors.map((error, index) => <li key={`${row.rowId}-${index}`}>{error.field ? `${error.field}: ` : ""}{error.message}</li>)}</ul> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            </div>

            <article className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
                  <Rows4 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Attendance and eligibility summary</h2>
                  <p className="text-sm text-slate-500">Review per-candidate attendance percentage and assessment readiness.</p>
                </div>
              </div>

              {attendanceSummary ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1">{attendanceSummary.totalSessions} session days</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">Threshold {attendanceSummary.assessmentEligibilityThreshold}%</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                          <th className="px-3 py-3">Candidate</th>
                          <th className="px-3 py-3">Attendance</th>
                          <th className="px-3 py-3">Training status</th>
                          <th className="px-3 py-3">Assessment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {attendanceSummary.candidates.map((candidate) => (
                          <tr key={candidate.candidateId}>
                            <td className="px-3 py-3">
                              <p className="font-medium text-slate-900">{candidate.candidateName ?? candidate.candidateId}</p>
                              <p className="text-xs text-slate-500">{candidate.candidateId}</p>
                            </td>
                            <td className="px-3 py-3 text-slate-700">{candidate.attendancePercentage}% ({candidate.presentDays}/{candidate.totalSessions})</td>
                            <td className="px-3 py-3"><StatusBadge tone={candidate.trainingStatus === "completed" ? "emerald" : candidate.trainingStatus === "dropout" ? "rose" : "slate"} value={candidate.trainingStatus ?? "ongoing"} /></td>
                            <td className="px-3 py-3">
                              <StatusBadge tone={candidate.eligibleForAssessment ? "emerald" : "amber"} value={candidate.eligibleForAssessment ? "eligible" : "not eligible"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {attendanceSummary.dailySessions.map((session) => (
                      <div key={session.attendanceDate ?? Math.random()} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        <p className="font-semibold text-slate-950">{session.attendanceDate ?? "Unknown date"}</p>
                        <p className="mt-2">Present: {session.presentCount}</p>
                        <p>Absent: {session.absentCount}</p>
                        <p>Expected: {session.expectedCandidateCount}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Attendance summary will appear once sessions are committed for the selected batch.</div>}
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}