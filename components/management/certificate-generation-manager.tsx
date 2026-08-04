"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import { useRefreshableLoad } from "@/lib/client/use-refreshable-load";
import {
  IconAlertTriangle,
  IconCertificate,
  IconDownload,
  IconLoader2,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { apiFetch, ClientApiError } from "@/lib/client/api";
import { usePortalOptions } from "@/lib/client/use-portal-options";
import { cn } from "@/lib/utils";

type CertificateGenerationManagerProps = {
  portal: "admin" | "training_partner";
};

type BatchListItem = {
  batchCode: string;
  batchId: string;
  batchName: string | null;
  candidateCount: number;
  courseId: string;
  sidhBatchId: string | null;
  syncState: {
    batchSync: { status: string };
  };
};

type PagedBatches = {
  items: BatchListItem[];
};

type CourseOption = {
  courseId: string;
  courseName: string;
};

type PagedCourses = {
  items: CourseOption[];
};

type BatchDetail = BatchListItem & {
  candidates: Array<{
    candidateId: string;
    candidateName: string | null;
    enrollmentStatus: string;
    sidhCandidateId: string | null;
    trainingStatus: string | null;
  }>;
};

type CandidateCertificateRow = {
  candidateId: string;
  candidateName: string | null;
  enrollmentStatus: string;
  generated: boolean;
  selected: boolean;
  sidhCandidateId: string | null;
  trainingStatus: string | null;
};

const portalContent = {
  admin: {
    description:
      "Generate SIDH certificates for assessed learners and download issued mark sheets or external certificates.",
    heading: "Certificate Generation",
  },
  training_partner: {
    description:
      "Request certificates from SIDH for your batch learners and download the generated documents.",
    heading: "Certificate Generation",
  },
} as const;

const CERTIFICATE_TYPES = [
  { label: "External certificate", value: "externalcertificate" },
  { label: "Mark sheet", value: "marksheet" },
] as const;

function FieldSelect({
  children,
  id,
  onChange,
  value,
}: {
  children: React.ReactNode;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      id={id}
      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

function StatusBadge({ tone = "slate", value }: { tone?: "emerald" | "slate" | "amber" | "sky"; value: string }) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
        tones[tone],
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

function enrollmentTone(status: string): "emerald" | "slate" | "amber" | "sky" {
  if (status === "synced") return "emerald";
  if (status === "queued" || status === "processing") return "sky";
  if (status === "failed" || status === "manual_review") return "amber";
  return "slate";
}

async function downloadCertificateFile(batchId: string, candidateId: string, type: string) {
  const response = await fetch(
    `/api/v1/batches/${batchId}/certificates?candidateId=${encodeURIComponent(candidateId)}&type=${encodeURIComponent(type)}`,
    { credentials: "include" },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ClientApiError(payload?.message ?? "Unable to download certificate", response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  const fileName = disposition?.match(/filename="([^"]+)"/)?.[1] ?? "certificate.pdf";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function CertificateGenerationManager({ portal }: CertificateGenerationManagerProps) {
  const content = portalContent[portal];
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const { courses: portalCourses } = usePortalOptions();
  const courses = useMemo(
    () =>
      portalCourses.map((course) => ({
        courseId: course.courseId,
        courseName: course.courseName,
      })) as CourseOption[],
    [portalCourses],
  );
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [rows, setRows] = useState<CandidateCertificateRow[]>([]);
  const [certificateType, setCertificateType] = useState<(typeof CERTIFICATE_TYPES)[number]["value"]>("externalcertificate");
  const loadState = useRefreshableLoad();
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.batchId === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  const courseMap = useMemo(() => new Map(courses.map((course) => [course.courseId, course])), [courses]);
  const selectedRows = useMemo(() => rows.filter((row) => row.selected && row.sidhCandidateId), [rows]);

  async function loadBatches() {
    loadState.begin();

    try {
      const batchPage = await apiFetch<PagedBatches>("/api/v1/batches?page=1&pageSize=100");
      setBatches(batchPage.items);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load batches");
    } finally {
      loadState.end();
    }
  }

  async function loadBatchCandidates(batchId: string) {
    if (!batchId) {
      setRows([]);
      return;
    }

    setIsLoadingCandidates(true);

    try {
      const detail = await apiFetch<BatchDetail>(`/api/v1/batches/${batchId}`);
      setRows(
        detail.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          candidateName: candidate.candidateName,
          enrollmentStatus: candidate.enrollmentStatus,
          generated: false,
          selected: Boolean(candidate.sidhCandidateId) && candidate.enrollmentStatus === "synced",
          sidhCandidateId: candidate.sidhCandidateId,
          trainingStatus: candidate.trainingStatus,
        })),
      );
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load batch learners");
      setRows([]);
    } finally {
      setIsLoadingCandidates(false);
    }
  }

  useEffect(() => {
    void loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      void loadBatchCandidates(selectedBatchId);
    }
  }, [selectedBatchId]);

  function toggleAll(checked: boolean) {
    setRows((current) =>
      current.map((row) => (row.sidhCandidateId ? { ...row, selected: checked } : { ...row, selected: false })),
    );
  }

  async function handleGenerate(candidate: CandidateCertificateRow) {
    if (!selectedBatchId || !candidate.sidhCandidateId) {
      toast.error("This learner does not have a SIDH candidate ID");
      return;
    }

    if (!selectedBatch?.sidhBatchId) {
      toast.error("Push the batch to SIDH before generating certificates");
      return;
    }

    setGeneratingId(candidate.candidateId);

    try {
      await apiFetch(`/api/v1/batches/${selectedBatchId}/certificates`, {
        body: JSON.stringify({ candidateId: candidate.sidhCandidateId }),
        method: "POST",
      });
      setRows((current) =>
        current.map((row) => (row.candidateId === candidate.candidateId ? { ...row, generated: true } : row)),
      );
      toast.success(`Certificate generation requested for ${candidate.candidateName ?? candidate.sidhCandidateId}`);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to generate certificate");
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleDownload(candidate: CandidateCertificateRow) {
    if (!selectedBatchId || !candidate.sidhCandidateId) {
      toast.error("This learner does not have a SIDH candidate ID");
      return;
    }

    if (!selectedBatch?.sidhBatchId) {
      toast.error("Push the batch to SIDH before downloading certificates");
      return;
    }

    setDownloadingId(candidate.candidateId);

    try {
      await downloadCertificateFile(selectedBatchId, candidate.sidhCandidateId, certificateType);
      toast.success(`Download started for ${candidate.candidateName ?? candidate.sidhCandidateId}`);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to download certificate");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleBulkGenerate() {
    if (selectedRows.length === 0) {
      toast.error("Select at least one learner with a SIDH candidate ID");
      return;
    }

    setIsBulkGenerating(true);
    let successCount = 0;

    for (const candidate of selectedRows) {
      try {
        await apiFetch(`/api/v1/batches/${selectedBatchId}/certificates`, {
          body: JSON.stringify({ candidateId: candidate.sidhCandidateId }),
          method: "POST",
        });
        successCount += 1;
        setRows((current) =>
          current.map((row) => (row.candidateId === candidate.candidateId ? { ...row, generated: true } : row)),
        );
      } catch {
        // Continue with remaining learners; individual failures are summarized below.
      }
    }

    setIsBulkGenerating(false);

    if (successCount === selectedRows.length) {
      toast.success(`Certificate generation requested for ${successCount} learner(s)`);
    } else if (successCount > 0) {
      toast.warning(`Generated ${successCount} of ${selectedRows.length} certificates. Review failed learners and retry.`);
    } else {
      toast.error("Unable to generate certificates for the selected learners");
    }
  }

  if (loadState.isInitialLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-100 py-24 text-slate-400">
        <IconLoader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 bg-slate-100 px-4 py-4 md:gap-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{content.heading}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{content.description}</p>
        </div>
        <button
          type="button"
          disabled={loadState.isRefreshing}
          onClick={() => startTransition(() => void loadBatches())}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-sky-300 disabled:opacity-60 sm:w-auto sm:shrink-0"
        >
          <IconRefresh className={cn("h-4 w-4", loadState.isRefreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      <section className="rounded-3xl border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm text-sky-950 sm:px-5">
        <p className="font-medium">Recommended workflow</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs sm:text-sm">
          <li>Submit assessment data from the Assessment Update page.</li>
          <li>Generate certificates here once SIDH accepts the assessment records.</li>
          <li>Download the issued certificate or mark sheet for each learner.</li>
        </ol>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-2">
            <Label htmlFor="batchId">Training batch</Label>
            <FieldSelect id="batchId" value={selectedBatchId} onChange={setSelectedBatchId}>
              <option value="">Select a batch with enrolled learners</option>
              {batches.map((batch) => {
                const course = courseMap.get(batch.courseId);
                return (
                  <option key={batch.batchId} value={batch.batchId}>
                    {batch.batchName ?? batch.batchCode}
                    {course ? ` · ${course.courseName}` : ""} · {batch.candidateCount} learners
                    {batch.sidhBatchId ? ` · SIDH ${batch.sidhBatchId}` : " · not synced"}
                  </option>
                );
              })}
            </FieldSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="certificateType">Download document type</Label>
            <FieldSelect
              id="certificateType"
              value={certificateType}
              onChange={(value) => setCertificateType(value as (typeof CERTIFICATE_TYPES)[number]["value"])}
            >
              {CERTIFICATE_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FieldSelect>
          </div>
        </div>

        {selectedBatch && !selectedBatch.sidhBatchId ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>This batch is not synced to SIDH yet. Certificate generation works best after batch sync and assessment submission.</p>
          </div>
        ) : null}
      </section>

      {selectedBatchId ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Batch learners</h2>
              <p className="text-xs text-slate-500">
                Generate certificates individually or in bulk, then download the issued document.
              </p>
            </div>
            <button
              type="button"
              disabled={isBulkGenerating || selectedRows.length === 0}
              onClick={() => void handleBulkGenerate()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              {isBulkGenerating ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconSparkles className="h-4 w-4" />}
              Generate {selectedRows.length > 0 ? selectedRows.length : ""} certificate(s)
            </button>
          </div>

          {isLoadingCandidates ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <IconLoader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-slate-500 sm:px-5">No learners enrolled in this batch yet.</div>
          ) : (
            <>
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/90 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={rows.filter((row) => row.sidhCandidateId).every((row) => row.selected)}
                          onChange={(event) => toggleAll(event.target.checked)}
                          aria-label="Select all learners"
                        />
                      </th>
                      <th className="px-4 py-3">Learner</th>
                      <th className="px-4 py-3">SIDH ID</th>
                      <th className="px-4 py-3">Enrollment</th>
                      <th className="px-4 py-3">Training</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.candidateId} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            disabled={!row.sidhCandidateId}
                            onChange={(event) =>
                              setRows((current) =>
                                current.map((item) =>
                                  item.candidateId === row.candidateId ? { ...item, selected: event.target.checked } : item,
                                ),
                              )
                            }
                            aria-label={`Select ${row.candidateName ?? row.candidateId}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{row.candidateName ?? "Unnamed learner"}</p>
                          {row.generated ? (
                            <p className="text-xs font-medium text-emerald-700">Generation requested</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.sidhCandidateId ?? "—"}</td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={enrollmentTone(row.enrollmentStatus)} value={row.enrollmentStatus} />
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-600">{row.trainingStatus ?? "—"}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!row.sidhCandidateId || generatingId === row.candidateId}
                              onClick={() => void handleGenerate(row)}
                              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-sky-200 bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50 sm:px-3"
                            >
                              {generatingId === row.candidateId ? (
                                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <IconCertificate className="h-3.5 w-3.5" />
                              )}
                              Generate
                            </button>
                            <button
                              type="button"
                              disabled={!row.sidhCandidateId || downloadingId === row.candidateId}
                              onClick={() => void handleDownload(row)}
                              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:px-3"
                            >
                              {downloadingId === row.candidateId ? (
                                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <IconDownload className="h-3.5 w-3.5" />
                              )}
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2 p-3 xl:hidden">
                {rows.map((row) => (
                  <div key={row.candidateId} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{row.candidateName ?? "Unnamed learner"}</p>
                        <p className="text-xs text-slate-500">{row.sidhCandidateId ?? "No SIDH ID"}</p>
                      </div>
                      <StatusBadge tone={enrollmentTone(row.enrollmentStatus)} value={row.enrollmentStatus} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={!row.sidhCandidateId || generatingId === row.candidateId}
                        onClick={() => void handleGenerate(row)}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-sky-200 bg-sky-600 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Generate
                      </button>
                      <button
                        type="button"
                        disabled={!row.sidhCandidateId || downloadingId === row.candidateId}
                        onClick={() => void handleDownload(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
          <span className="mx-auto inline-flex rounded-2xl bg-sky-50 p-3 text-sky-600">
            <IconCertificate className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Choose a batch to begin</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Select a batch with enrolled learners to generate SIDH certificates and download issued documents.
          </p>
        </section>
      )}
    </div>
  );
}
