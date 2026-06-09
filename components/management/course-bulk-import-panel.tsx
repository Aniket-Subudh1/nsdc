"use client";

import { useEffect, useState } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconDownload,
  IconEye,
  IconLoader2,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError, type ApiEnvelope } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type CourseBulkImportPanelProps = {
  onImportCommitted?: () => void;
};

type CourseImportJobRecord = {
  committedRows: number;
  duplicateRows: number;
  fileName: string;
  importJobId: string;
  invalidRows: number;
  status: string;
  totalRows: number;
  validRows: number;
};

type CourseImportRowRecord = {
  courseId: string | null;
  duplicateOfCourseId: string | null;
  errors: Array<{ field?: string; message: string }>;
  normalized: Record<string, unknown>;
  rowId: string;
  rowNumber: number;
  status: string;
};

type PagedImportRows = {
  items: CourseImportRowRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type ImportRowStatusFilter = "" | "duplicate" | "invalid" | "valid";

const pageSizeOptions = [10, 25, 50, 100];
const inputClassName =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-300";

const IMPORT_FIELD_LABELS: Record<string, string> = {
  approvalDate: "Approval date",
  approvalStatus: "Approval status",
  courseName: "Course name",
  jobRole: "Job role",
  nsqfLevel: "NSQF level",
  programIds: "Linked program",
  schemeIds: "Linked scheme",
  sectorId: "Sector name",
  shortForm: "Short form",
  sidhCourseId: "SIDH course ID",
  totalHours: "Total hours",
  trainingPerDayHours: "Training per day (hours)",
  validityEndDate: "Valid until",
};

function formatImportError(error: { field?: string; message: string }) {
  const fieldLabel = error.field ? IMPORT_FIELD_LABELS[error.field] ?? error.field.replace(/\./g, " → ") : null;
  const message = error.message
    .replace(/Matches existing course (\S+)/, "Already saved as course $1")
    .replace(/Matches another row in this import/, "Same course mapping appears again in this file")
    .replace(/was not found in master data/, "was not found — use a value from the template dropdown");

  return fieldLabel ? `${fieldLabel}: ${message}` : message;
}

function formatImportStatusLabel(status: string) {
  const labels: Record<string, string> = {
    duplicate: "Duplicate",
    invalid: "Has errors",
    valid: "Ready to save",
  };

  return labels[status] ?? status.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatImportDisplayRowNumber(rowNumber: number) {
  return Math.max(1, rowNumber - 1);
}

function extractCourseImportPreview(normalized: Record<string, unknown>) {
  return {
    approvalDate: String(normalized.approvalDate ?? "Not provided"),
    approvalStatus: String(normalized.approvalStatus ?? "Not provided"),
    courseName: String(normalized.courseName ?? "Not provided"),
    jobRole: String(normalized.jobRole ?? "Not provided"),
    nsqfLevel: String(normalized.nsqfLevel ?? "Not provided"),
    shortForm: String(normalized.shortForm ?? "Not provided"),
    sidhCourseId: String(normalized.sidhCourseId ?? "Not provided"),
    totalHours: String(normalized.totalHours ?? "Not provided"),
    trainingPerDayHours: String(normalized.trainingPerDayHours ?? "Not provided"),
    validityEndDate: String(normalized.validityEndDate ?? "Not provided"),
  };
}

async function downloadCourseImportTemplate() {
  const response = await fetch("/api/v1/masters/courses/imports/template", {
    credentials: "include",
  });

  if (!response.ok) {
    let message = "Unable to load the sample import workbook";
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep default message when the response is not JSON.
    }

    throw new ClientApiError(message, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "course_import_template.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function uploadCourseImport(file: File) {
  const body = new FormData();
  body.set("file", file);

  const response = await fetch("/api/v1/masters/courses/imports", {
    body,
    credentials: "include",
    method: "POST",
  });
  const payload = (await response.json()) as ApiEnvelope<CourseImportJobRecord>;

  if (!response.ok || !payload.success) {
    throw new ClientApiError(payload.message ?? "Import upload failed", response.status);
  }

  return payload.data;
}

function buildQueryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }

    const normalized = String(value).trim();
    if (!normalized) {
      continue;
    }

    params.set(key, normalized);
  }

  return params.toString();
}

async function fetchCourseImportRows(jobId: string, page: number, pageSize: number, status?: ImportRowStatusFilter) {
  return apiFetch<PagedImportRows>(
    `/api/v1/masters/courses/imports/${jobId}/rows?${buildQueryString({ page, pageSize, status: status || undefined })}`,
  );
}

export default function CourseBulkImportPanel({ onImportCommitted }: CourseBulkImportPanelProps) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [currentImportJob, setCurrentImportJob] = useState<CourseImportJobRecord | null>(null);
  const [importRows, setImportRows] = useState<CourseImportRowRecord[]>([]);
  const [importRowStatusFilter, setImportRowStatusFilter] = useState<ImportRowStatusFilter>("");
  const [importPagination, setImportPagination] = useState({ page: 1, pageSize: 25, total: 0 });
  const [selectedImportRow, setSelectedImportRow] = useState<CourseImportRowRecord | null>(null);
  const [isUploadingImport, setIsUploadingImport] = useState(false);
  const [isCommittingImport, setIsCommittingImport] = useState(false);
  const [isLoadingImportRows, setIsLoadingImportRows] = useState(false);

  useEffect(() => {
    const importJob = currentImportJob;

    if (!importJob) {
      setImportRows([]);
      setImportPagination((current) => ({ ...current, total: 0 }));
      return;
    }

    let isMounted = true;

    async function refreshImportRows() {
      setIsLoadingImportRows(true);

      try {
        const rowData = await fetchCourseImportRows(
          importJob.importJobId,
          importPagination.page,
          importPagination.pageSize,
          importRowStatusFilter,
        );

        if (!isMounted) {
          return;
        }

        setImportRows(rowData.items);
        setImportPagination({ page: rowData.page, pageSize: rowData.pageSize, total: rowData.total });
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof ClientApiError ? error.message : "Unable to load import row review");
        }
      } finally {
        if (isMounted) {
          setIsLoadingImportRows(false);
        }
      }
    }

    void refreshImportRows();

    return () => {
      isMounted = false;
    };
  }, [currentImportJob, importPagination.page, importPagination.pageSize, importRowStatusFilter]);

  async function handleDownloadImportTemplate() {
    try {
      await downloadCourseImportTemplate();
      toast.success("Sample upload sheet downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download sample import workbook");
    }
  }

  async function handleImportUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!importFile) {
      toast.error("Choose an Excel workbook before staging the import");
      return;
    }

    setIsUploadingImport(true);

    try {
      const importJob = await uploadCourseImport(importFile);
      setCurrentImportJob(importJob);
      setImportPagination((current) => ({ ...current, page: 1 }));
      setImportRowStatusFilter("");
      toast.success("File checked successfully");
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to stage course import");
    } finally {
      setIsUploadingImport(false);
    }
  }

  async function handleCommitImport() {
    if (!currentImportJob) {
      return;
    }

    setIsCommittingImport(true);

    try {
      const committedJob = await apiFetch<CourseImportJobRecord>(
        `/api/v1/masters/courses/imports/${currentImportJob.importJobId}/commit`,
        { method: "POST" },
      );
      setCurrentImportJob(committedJob);
      toast.success("Valid courses saved to the catalog");
      onImportCommitted?.();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to commit course import");
    } finally {
      setIsCommittingImport(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">How bulk import works</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-slate-600">
          <li>Download the template and fill in course details</li>
          <li>
            Use the dropdowns for <strong>Sector</strong>, <strong>Program</strong>, <strong>Scheme</strong>, and{" "}
            <strong>Approval status</strong>
          </li>
          <li>Upload the file — we check every row and show errors in plain language</li>
          <li>Save valid rows to add them to the course catalog</li>
        </ol>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900">Bulk import from Excel</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Upload a spreadsheet, review validation results, then save valid rows as courses.
        </p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-end"
        onSubmit={(event) => void handleImportUpload(event)}
      >
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700">
          Excel file
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
            className={cn(
              inputClassName,
              "py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-sky-700",
            )}
            required
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadImportTemplate()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-sky-300"
          >
            <IconDownload className="h-4 w-4" />
            Template
          </button>
          <button
            type="submit"
            disabled={isUploadingImport || !importFile}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isUploadingImport ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconUpload className="h-4 w-4" />}
            Validate file
          </button>
          {currentImportJob ? (
            <button
              type="button"
              disabled={isCommittingImport || currentImportJob.status === "committed"}
              onClick={() => void handleCommitImport()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60"
            >
              {isCommittingImport ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconCircleCheck className="h-4 w-4" />
              )}
              Save valid rows
            </button>
          ) : null}
        </div>
      </form>

      {currentImportJob ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{currentImportJob.fileName}</p>
              <p className="text-xs text-slate-500">
                {currentImportJob.status === "committed"
                  ? `${currentImportJob.committedRows} course${currentImportJob.committedRows === 1 ? "" : "s"} saved to the catalog`
                  : `${currentImportJob.validRows} of ${currentImportJob.totalRows} rows are ready to save`}
              </p>
            </div>
            {currentImportJob.status === "committed" ? (
              <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Import complete
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ImportStat label="Total in file" value={currentImportJob.totalRows} />
            <ImportStat label="Ready to save" value={currentImportJob.validRows} tone="success" />
            <ImportStat label="Need fixes" value={currentImportJob.invalidRows} tone="danger" />
            <ImportStat label="Duplicates" value={currentImportJob.duplicateRows} tone="warning" />
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Imported courses list</h3>
            <p className="text-xs text-slate-500">One row per spreadsheet line — click a row to see full details.</p>
          </div>
          {currentImportJob ? (
            <select
              value={importPagination.pageSize}
              onChange={(event) =>
                setImportPagination((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))
              }
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {currentImportJob ? (
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { count: currentImportJob.totalRows, label: "All rows", value: "" },
                { count: currentImportJob.validRows, label: "Ready to save", value: "valid" },
                { count: currentImportJob.invalidRows, label: "Need fixes", value: "invalid" },
                { count: currentImportJob.duplicateRows, label: "Duplicates", value: "duplicate" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.value || "all"}
                type="button"
                onClick={() => {
                  setImportRowStatusFilter(pill.value);
                  setImportPagination((current) => ({ ...current, page: 1 }));
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition",
                  importRowStatusFilter === pill.value
                    ? "bg-sky-100 text-sky-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {pill.label}
                <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold">{pill.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!currentImportJob ? (
          <EmptyState message="Upload your Excel file to see a list of courses with any errors highlighted." />
        ) : importRows.length === 0 ? (
          <EmptyState
            message={
              importRowStatusFilter
                ? "No rows match this filter. Try another filter or upload a new file."
                : "This file has no rows to review."
            }
          />
        ) : isLoadingImportRows ? (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-400">
            <IconLoader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {importRows.map((row) => {
              const preview = extractCourseImportPreview(row.normalized);

              return (
                <button
                  key={row.rowId}
                  type="button"
                  onClick={() => setSelectedImportRow(row)}
                  className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-200 hover:bg-sky-50/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        Row {formatImportDisplayRowNumber(row.rowNumber)} · {preview.courseName}
                      </span>
                      <ImportStatusPill status={row.status} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>{preview.sidhCourseId}</span>
                      <span>{preview.jobRole}</span>
                    </div>
                  </div>
                  {row.errors.length > 0 ? (
                    <p className="text-xs text-rose-600">{formatImportError(row.errors[0])}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {currentImportJob && importPagination.total > 0 ? (
          <PaginationControls
            page={importPagination.page}
            pageSize={importPagination.pageSize}
            total={importPagination.total}
            onPageChange={(page) => setImportPagination((current) => ({ ...current, page }))}
          />
        ) : null}
      </div>

      {selectedImportRow ? (
        <CourseImportRowModal onClose={() => setSelectedImportRow(null)} row={selectedImportRow} />
      ) : null}
    </div>
  );
}

function ImportStat({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "danger" | "success" | "warning";
  value: React.ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-200 bg-rose-50"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-slate-50";

  return (
    <div className={cn("rounded-xl border px-3 py-2.5", toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function ImportStatusPill({ status }: { status: string }) {
  const toneClass =
    status === "valid"
      ? "bg-emerald-100 text-emerald-700"
      : status === "duplicate"
        ? "bg-amber-100 text-amber-700"
        : status === "invalid"
          ? "bg-rose-100 text-rose-700"
          : "bg-slate-100 text-slate-700";

  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", toneClass)}>
      {formatImportStatusLabel(status)}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function PaginationControls({
  onPageChange,
  page,
  pageSize,
  total,
}: {
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-600">
        Page {page} of {totalPages} · {total} records
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <IconChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          Next
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CourseImportRowModal({ onClose, row }: { onClose: () => void; row: CourseImportRowRecord }) {
  const details = extractCourseImportPreview(row.normalized);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-sky-50 p-2.5 text-sky-600">
              <IconEye className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Row {formatImportDisplayRowNumber(row.rowNumber)} · {details.courseName}
              </h2>
              <p className="text-xs text-slate-500">Full course details from your spreadsheet</p>
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
        <div className="overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ImportStatusPill status={row.status} />
              {row.courseId ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Saved as {row.courseId}
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Course name" value={details.courseName} />
              <DetailField label="SIDH course ID" value={details.sidhCourseId} />
              <DetailField label="Job role" value={details.jobRole} />
              <DetailField label="NSQF level" value={details.nsqfLevel} />
              <DetailField label="Training per day (hours)" value={details.trainingPerDayHours} />
              <DetailField label="Total hours" value={details.totalHours} />
              <DetailField label="Approval status" value={details.approvalStatus} />
              <DetailField label="Approval date" value={details.approvalDate} />
              <DetailField label="Valid until" value={details.validityEndDate} />
              <DetailField label="Short form" value={details.shortForm} />
            </div>

            {row.errors.length > 0 ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-800">Issues to fix</p>
                <ul className="mt-2 space-y-1.5 text-sm text-rose-700">
                  {row.errors.map((error, index) => (
                    <li key={`${row.rowId}-modal-issue-${index}`}>{formatImportError(error)}</li>
                  ))}
                </ul>
              </div>
            ) : row.status === "duplicate" && row.duplicateOfCourseId ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                Matches existing course <strong>{row.duplicateOfCourseId}</strong>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                No issues found — this row is ready to save.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  const isEmpty = value === "Not provided";

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cn("mt-0.5 text-sm", isEmpty ? "italic text-slate-400" : "text-slate-700")}>{value}</div>
    </div>
  );
}
