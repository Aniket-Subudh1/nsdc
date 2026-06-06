"use client";

import { memo, startTransition, useEffect, useState } from "react";
import {
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconDownload,
  IconEye,
  IconFileSpreadsheet,
  IconLink,
  IconListCheck,
  IconLoader2,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRotateClockwise,
  IconSearch,
  IconSend,
  IconUpload,
  IconUserPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError, type ApiEnvelope } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type CandidatesManagerProps = {
  portal: "admin" | "training_partner";
};

type AddressFormState = {
  address: string;
  city: string;
  constituency: string;
  district: string;
  pinCode: string;
  state: string;
  tehsil: string;
};

type CandidateRecord = {
  candidateId: string;
  centerId: string;
  contactDetails: {
    email: string | null;
    mobileNumber: string;
  };
  experience: {
    employmentDetails: string | null;
    employmentStatus: string | null;
    employed: string | null;
    heardAboutUs: string | null;
    monthsOfPreviousExperience: number | null;
    previousExperienceSector: string | null;
    trainingStatus: string | null;
  };
  identity: {
    idNumber: string | null;
    idType: string;
    typeOfAlternateId: string | null;
  };
  personalDetails: {
    category: string | null;
    dateOfBirth: string | null;
    disability: boolean;
    fathersName: string | null;
    fullName: string;
    gender: string | null;
    guardiansName: string | null;
    maritalStatus: string | null;
    mothersName: string | null;
    religion: string | null;
    salutation: string | null;
    typeOfDisability: string | null;
    educationLevel: string | null;
  };
  permanentAddress: AddressFormState;
  communicationAddress: AddressFormState & { sameAsPermanent: boolean };
  domicile: {
    district: string | null;
    state: string | null;
  };
  programId: string;
  registrationMode: "internal_registration" | "existing_sidh_link";
  sidhCandidateId: string | null;
  syncState: {
    lastAttemptAt?: string | null;
    lastFailureCode?: string | null;
    lastFailureMessage?: string | null;
    lastJobId?: string | null;
    lastSuccessAt?: string | null;
    retryCount?: number;
    status?: string | null;
  } | null;
};

type PagedCandidates = {
  items: CandidateRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type SyncAttempt = {
  attemptId?: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  finishedAt?: string | null;
  remoteCandidateId?: string | null;
  responseCode?: number | null;
  retryable?: boolean;
  startedAt?: string | null;
  status?: string;
};

type SyncTransaction = {
  createdAt: string | null;
  endpoint: string;
  operation: string;
  responseStatus: number | null;
  success: boolean;
  transactionId: string;
};

type SyncJobRecord = {
  attempts: SyncAttempt[];
  candidateId: string;
  createdAt?: string | null;
  entityId: string;
  entityType: string;
  latestRemoteCandidateId: string | null;
  nextRunAt?: string | null;
  payloadSnapshot: Record<string, unknown>;
  retryCount: number;
  status: string;
  syncJobId: string;
  transactions?: SyncTransaction[];
  updatedAt?: string | null;
};

type PagedSyncJobs = {
  items: SyncJobRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type ImportJobRecord = {
  centerId: string;
  committedRows: number;
  duplicateRows: number;
  fileName: string;
  importJobId: string;
  invalidRows: number;
  programId: string;
  status: string;
  totalRows: number;
  validRows: number;
};

type ImportRowRecord = {
  candidateId: string | null;
  duplicateOfCandidateId: string | null;
  errors: Array<{ field?: string; message: string }>;
  normalized: Record<string, unknown>;
  rowId: string;
  rowNumber: number;
  status: string;
};

type PagedImportRows = {
  items: ImportRowRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type ImportRowStatusFilter = "" | "duplicate" | "invalid" | "valid";

type ImportRowPreview = {
  centerName: string;
  city: string;
  countryCode: string;
  dob: string;
  email: string;
  fatherName: string;
  firstName: string;
  fullName: string;
  gender: string;
  guardianName: string;
  mobile: string;
  namePrefix: string;
  state: string;
};

const EMPTY_FIELD = "Not provided";

function displayImportValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : EMPTY_FIELD;
}

function extractImportRowPreview(normalized: Record<string, unknown>): ImportRowPreview {
  const personal = (normalized.personalDetails ?? {}) as Record<string, unknown>;
  const contact = (normalized.contactDetails ?? {}) as Record<string, unknown>;
  const location = (normalized.locationDetails ?? {}) as Record<string, unknown>;
  const namePrefix = String(personal.namePrefix ?? personal.salutation ?? "").trim();
  const firstName = String(personal.firstName ?? "").trim();

  return {
    centerName: displayImportValue(String(location.centerName ?? "")),
    city: displayImportValue(String(location.city ?? "")),
    countryCode: displayImportValue(String(contact.countryCode ?? "91")),
    dob: displayImportValue(String(personal.dob ?? personal.dateOfBirth ?? "")),
    email: displayImportValue(String(contact.email ?? "")),
    fatherName: displayImportValue(String(personal.fatherName ?? personal.fathersName ?? "")),
    firstName: displayImportValue(firstName),
    fullName: [namePrefix, firstName].filter(Boolean).join(" ") || EMPTY_FIELD,
    gender: displayImportValue(String(personal.gender ?? "")),
    guardianName: displayImportValue(String(personal.guardianName ?? personal.guardiansName ?? "")),
    mobile: displayImportValue(String(contact.phone ?? contact.mobileNumber ?? "")),
    namePrefix: displayImportValue(namePrefix),
    state: displayImportValue(String(location.state ?? "")),
  };
}

const IMPORT_FIELD_LABELS: Record<string, string> = {
  duplicateHash: "Duplicate check",
  "contactDetails.email": "Email",
  "contactDetails.phone": "Phone",
  "locationDetails.centerName": "Training center",
  "locationDetails.city": "City",
  "locationDetails.state": "State",
  "personalDetails.dob": "Date of birth",
  "personalDetails.fatherName": "Father name",
  "personalDetails.firstName": "First name",
  "personalDetails.gender": "Gender",
  "personalDetails.guardianName": "Guardian name",
  "personalDetails.namePrefix": "Name prefix",
};

function formatImportError(error: { field?: string; message: string }) {
  const fieldLabel = error.field
    ? IMPORT_FIELD_LABELS[error.field] ?? error.field.replace(/\./g, " → ")
    : null;
  const message = error.message
    .replace(/Matches existing candidate (\S+)/, "Already saved as learner $1")
    .replace(/Matches another row in this import/, "Same person appears again in this file");

  return fieldLabel ? `${fieldLabel}: ${message}` : message;
}

function formatImportDisplayRowNumber(rowNumber: number) {
  // Spreadsheet row numbers include the header row; list numbering starts at 1 for the first learner.
  return Math.max(1, rowNumber - 1);
}

function formatImportStatusLabel(status: string) {
  const labels: Record<string, string> = {
    duplicate: "Duplicate",
    invalid: "Has errors",
    valid: "Ready to save",
  };

  return labels[status] ?? formatStatusLabel(status);
}

function extractSyncPayloadSummary(payload: Record<string, unknown>) {
  const personal = (payload.personalDetails ?? {}) as Record<string, unknown>;
  const contact = (payload.contactDetails ?? {}) as Record<string, unknown>;
  const location = (payload.locationDetails ?? {}) as Record<string, unknown>;

  return {
    centerName: String(location.centerName ?? "").trim() || "—",
    city: String(location.city ?? "").trim() || "—",
    dob: String(personal.dateOfBirth ?? "").trim() || "—",
    email: String(contact.email ?? "").trim() || "—",
    fullName: String(personal.fullName ?? "").trim() || "—",
    gender: String(personal.gender ?? "").trim() || "—",
    mobile: String(contact.mobileNumber ?? "").trim() || "—",
    state: String(location.state ?? "").trim() || "—",
  };
}

type ImportFormState = {
  file: File | null;
};

const emptyImportForm: ImportFormState = {
  file: null,
};

type CandidateFilters = {
  page: number;
  pageSize: number;
  search: string;
  syncStatus: string;
};

type IndividualCandidateFormState = {
  centerName: string;
  countryCode: string;
  city: string;
  dob: string;
  email: string;
  fatherName: string;
  firstName: string;
  gender: string;
  guardianName: string;
  namePrefix: string;
  phone: string;
  state: string;
};

type SyncFilters = {
  page: number;
  pageSize: number;
  status: string;
};

type ProcessSyncJobsResult = {
  deadLetterCount: number;
  jobs: Array<{
    candidateId: string;
    message: string;
    remoteCandidateId: string | null;
    status: string;
    syncJobId: string;
  }>;
  manualReviewCount: number;
  processedCount: number;
  retryScheduledCount: number;
  succeededCount: number;
};

type BulkQueueResult = {
  items: Array<{
    candidateId: string;
    message: string;
    status: "queued" | "skipped";
  }>;
  queuedCount: number;
  requestedCount: number;
  skippedCount: number;
};

type CandidateWorkspaceTab = "all_candidates" | "bulk_upload" | "skill_india_queue";

const portalContent = {
  admin: {
    description:
      "Register learners one at a time or in bulk, then send them to the government portal when ready.",
    heading: "Learners",
  },
  training_partner: {
    description:
      "Manage learners at your centers — register, import from Excel, and track government portal sync.",
    heading: "Learners",
  },
} as const;

const candidateSyncStatusOptions = ["not_queued", "queued", "processing", "synced", "failed", "manual_review", "linked"];
const syncJobStatusOptions = ["queued", "processing", "succeeded", "failed", "manual_review", "dead_letter"];
const pageSizeOptions = [25, 50, 100];
const candidateWorkspaceTabs: Array<{ icon: React.ReactNode; id: CandidateWorkspaceTab; label: string }> = [
  { icon: <IconUsers className="h-4 w-4" />, id: "all_candidates", label: "All learners" },
  { icon: <IconFileSpreadsheet className="h-4 w-4" />, id: "bulk_upload", label: "Bulk import" },
  { icon: <IconSend className="h-4 w-4" />, id: "skill_india_queue", label: "Sync queue" },
];

type CenterOption = {
  centerId: string;
  centerName: string;
};

type ProgramOption = {
  name: string;
  programId: string;
};

const emptyLinkForm = {
  centerId: "",
  dateOfBirth: "",
  fullName: "",
  mobileNumber: "",
  programId: "",
  sidhCandidateId: "",
};

const initialCandidateFilters: CandidateFilters = {
  page: 1,
  pageSize: 12,
  search: "",
  syncStatus: "",
};

const emptyIndividualCandidateForm: IndividualCandidateFormState = {
  centerName: "",
  countryCode: "91",
  city: "",
  dob: "",
  email: "",
  fatherName: "",
  firstName: "",
  gender: "",
  guardianName: "",
  namePrefix: "",
  phone: "",
  state: "",
};

const initialSyncFilters: SyncFilters = {
  page: 1,
  pageSize: 12,
  status: "",
};

function buildIndividualCandidatePayload(form: IndividualCandidateFormState) {
  return {
    personalDetails: {
      namePrefix: form.namePrefix,
      firstName: form.firstName,
      gender: form.gender,
      dob: form.dob,
      fatherName: form.fatherName,
      guardianName: form.guardianName,
    },
    contactDetails: {
      email: form.email,
      phone: form.phone,
      countryCode: form.countryCode,
    },
    locationDetails: {
      state: form.state,
      city: form.city,
      centerName: form.centerName,
    },
  };
}

async function downloadStaticWorkbook(fileName: string, sourcePath: string) {
  const response = await fetch(sourcePath);

  if (!response.ok) {
    throw createApiError("Unable to load the sample import workbook", response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createApiError(message: string, status = 400) {
  return new ClientApiError(message, status);
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

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatStatusLabel(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  const labels: Record<string, string> = {
    dead_letter: "Permanently failed",
    failed: "Send failed",
    linked: "Linked",
    manual_review: "Needs review",
    not_queued: "Not sent",
    processing: "Sending now",
    queued: "In queue",
    succeeded: "Completed",
    synced: "Registered",
  };

  return labels[value] ?? value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

type LearnerActionState = {
  canQueue: boolean;
  canSelect: boolean;
  canViewQueue: boolean;
  disableReason?: string;
  nextStep: string;
  status: string;
  statusLabel: string;
};

function getLearnerActionState(candidate: CandidateRecord): LearnerActionState {
  const status = candidate.syncState?.status ?? (candidate.sidhCandidateId ? "linked" : "not_queued");

  if (candidate.registrationMode === "existing_sidh_link") {
    return {
      canQueue: false,
      canSelect: false,
      canViewQueue: false,
      disableReason: "This learner was linked from the government portal",
      nextStep: "No sync needed — enroll in a batch when ready",
      status,
      statusLabel: "Linked externally",
    };
  }

  if (candidate.sidhCandidateId) {
    return {
      canQueue: false,
      canSelect: false,
      canViewQueue: false,
      disableReason: "Already registered on the government portal",
      nextStep: "Enroll this learner in a training batch",
      status,
      statusLabel: "Registered",
    };
  }

  if (status === "queued" || status === "processing") {
    return {
      canQueue: false,
      canSelect: false,
      canViewQueue: true,
      disableReason: "Already waiting in the sync queue",
      nextStep: "Open Sync queue and run sync to submit",
      status,
      statusLabel: status === "processing" ? "Sending now" : "In queue",
    };
  }

  if (status === "failed" || status === "manual_review") {
    return {
      canQueue: true,
      canSelect: true,
      canViewQueue: Boolean(candidate.syncState?.lastJobId),
      nextStep: "Add to queue again, then run sync",
      status,
      statusLabel: status === "failed" ? "Send failed" : "Needs review",
    };
  }

  return {
    canQueue: true,
    canSelect: true,
    canViewQueue: false,
    nextStep: "Select and add to government queue",
    status,
    statusLabel: "Ready to send",
  };
}

function getStatusPillClass(status?: string | null) {
  if (!status) {
    return "bg-slate-100 text-slate-700";
  }

  if (["synced", "succeeded", "linked", "valid"].includes(status)) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (["failed", "manual_review", "dead_letter", "invalid"].includes(status)) {
    return "bg-rose-100 text-rose-700";
  }

  if (["duplicate"].includes(status)) {
    return "bg-amber-100 text-amber-700";
  }

  if (["processing"].includes(status)) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-sky-100 text-sky-700";
}

async function uploadCandidateImport(form: ImportFormState) {
  if (!form.file) {
    throw createApiError("Choose an Excel file before uploading");
  }

  const body = new FormData();
  body.set("file", form.file);

  const response = await fetch("/api/v1/candidates/imports", {
    body,
    credentials: "include",
    method: "POST",
  });
  const payload = (await response.json()) as ApiEnvelope<ImportJobRecord>;

  if (!response.ok || !payload.success) {
    throw new ClientApiError(payload.message ?? "Import upload failed", response.status);
  }

  return payload.data;
}

async function fetchCandidates(filters: CandidateFilters) {
  const query = buildQueryString({
    page: filters.page,
    pageSize: filters.pageSize,
    search: filters.search || undefined,
    syncStatus: filters.syncStatus || undefined,
  });

  return apiFetch<PagedCandidates>(`/api/v1/candidates?${query}`);
}

async function fetchSyncJobs(filters: SyncFilters) {
  const query = buildQueryString({
    page: filters.page,
    pageSize: filters.pageSize,
    status: filters.status || undefined,
  });

  return apiFetch<PagedSyncJobs>(`/api/v1/sync/jobs?${query}`);
}

async function fetchImportRows(jobId: string, page: number, pageSize: number, status?: ImportRowStatusFilter) {
  return apiFetch<PagedImportRows>(
    `/api/v1/candidates/imports/${jobId}/rows?${buildQueryString({ page, pageSize, status: status || undefined })}`,
  );
}

async function queueCandidateSyncBulk(candidateIds: string[]) {
  return apiFetch<BulkQueueResult>("/api/v1/candidates/sync/bulk", {
    body: JSON.stringify({ candidateIds }),
    method: "POST",
  });
}

export default function CandidatesManager({ portal }: CandidatesManagerProps) {
  const [activeTab, setActiveTab] = useState<CandidateWorkspaceTab>("all_candidates");
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [candidateFilters, setCandidateFilters] = useState(initialCandidateFilters);
  const [candidatePagination, setCandidatePagination] = useState({ page: 1, pageSize: 12, total: 0 });
  const [syncJobs, setSyncJobs] = useState<SyncJobRecord[]>([]);
  const [syncFilters, setSyncFilters] = useState(initialSyncFilters);
  const [syncPagination, setSyncPagination] = useState({ page: 1, pageSize: 12, total: 0 });
  const [importForm, setImportForm] = useState(emptyImportForm);
  const [individualCandidateForm, setIndividualCandidateForm] = useState(emptyIndividualCandidateForm);
  const [currentImportJob, setCurrentImportJob] = useState<ImportJobRecord | null>(null);
  const [importRows, setImportRows] = useState<ImportRowRecord[]>([]);
  const [importPagination, setImportPagination] = useState({ page: 1, pageSize: 50, total: 0 });
  const [importRowStatusFilter, setImportRowStatusFilter] = useState<ImportRowStatusFilter>("");
  const [isLoadingImportRows, setIsLoadingImportRows] = useState(false);
  const [selectedImportRow, setSelectedImportRow] = useState<ImportRowRecord | null>(null);
  const [showImportRowModal, setShowImportRowModal] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [selectedSyncJobId, setSelectedSyncJobId] = useState<string | null>(null);
  const [selectedSyncJob, setSelectedSyncJob] = useState<SyncJobRecord | null>(null);
  const [processLimit, setProcessLimit] = useState("5");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSyncDetail, setIsLoadingSyncDetail] = useState(false);
  const [isUploadingImport, setIsUploadingImport] = useState(false);
  const [isCreatingCandidate, setIsCreatingCandidate] = useState(false);
  const [isCommittingImport, setIsCommittingImport] = useState(false);
  const [isProcessingSyncJobs, setIsProcessingSyncJobs] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSyncDetailModal, setShowSyncDetailModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [detailCandidate, setDetailCandidate] = useState<CandidateRecord | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isQueueingSelected, setIsQueueingSelected] = useState(false);
  const [isLinkingCandidate, setIsLinkingCandidate] = useState(false);
  const [linkForm, setLinkForm] = useState(emptyLinkForm);
  const [centers, setCenters] = useState<CenterOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const content = portalContent[portal];
  const selectableCandidateIds = candidates
    .filter((candidate) => getLearnerActionState(candidate).canSelect)
    .map((candidate) => candidate.candidateId);
  const queueableOnPageCount = selectableCandidateIds.length;
  const activeSelectedCandidateIds = selectedCandidateIds.filter((candidateId) => selectableCandidateIds.includes(candidateId));
  const allVisibleSelected = selectableCandidateIds.length > 0 && selectableCandidateIds.every((candidateId) => activeSelectedCandidateIds.includes(candidateId));
  const queuedJobs = syncJobs.filter((job) => job.status === "queued" || job.status === "processing").length;
  const flaggedJobs = syncJobs.filter((job) => job.status === "failed" || job.status === "manual_review" || job.status === "dead_letter").length;
  const isImportReady = Boolean(importForm.file);
  const isIndividualCandidateReady = Boolean(
    individualCandidateForm.firstName &&
      individualCandidateForm.gender &&
      individualCandidateForm.dob &&
      individualCandidateForm.phone &&
      (individualCandidateForm.fatherName || individualCandidateForm.guardianName),
  );
  const tabCounts: Record<CandidateWorkspaceTab, number | string> = {
    all_candidates: candidatePagination.total,
    bulk_upload: currentImportJob?.totalRows ?? 0,
    skill_india_queue: syncPagination.total,
  };

  const readyToSyncCount = candidates.filter((c) => getLearnerActionState(c).canSelect).length;
  const needsAttentionCount = candidates.filter((c) =>
    ["failed", "manual_review"].includes(c.syncState?.status ?? ""),
  ).length;

  function applySyncFilter(status: string) {
    setActiveTab("all_candidates");
    setCandidateFilters((current) => ({ ...current, page: 1, syncStatus: status }));
  }

  function clearLearnerFilters() {
    setActiveTab("all_candidates");
    setCandidateFilters((current) => ({ ...current, page: 1, search: "", syncStatus: "" }));
  }

  function switchTab(tab: CandidateWorkspaceTab) {
    setActiveTab(tab);
  }

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage);
    }
  }, [successMessage]);

  async function loadImportRows(
    jobId: string,
    page = importPagination.page,
    pageSize = importPagination.pageSize,
    status = importRowStatusFilter,
  ) {
    setIsLoadingImportRows(true);

    try {
      const rowData = await fetchImportRows(jobId, page, pageSize, status);
      setImportRows(rowData.items);
      setImportPagination({ page: rowData.page, pageSize: rowData.pageSize, total: rowData.total });
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load import rows");
    } finally {
      setIsLoadingImportRows(false);
    }
  }

  function openImportRowModal(row: ImportRowRecord) {
    setSelectedImportRow(row);
    setShowImportRowModal(true);
  }

  async function loadSyncJobDetails(syncJobId: string) {
    setIsLoadingSyncDetail(true);

    try {
      const syncJob = await apiFetch<SyncJobRecord>(`/api/v1/sync/jobs/${syncJobId}`);
      setSelectedSyncJobId(syncJobId);
      setSelectedSyncJob(syncJob);
      setShowSyncDetailModal(true);
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load sync job details");
    } finally {
      setIsLoadingSyncDetail(false);
    }
  }

  async function refreshVisibleData() {
    setIsLoading(true);

    try {
      const [candidateData, syncJobData] = await Promise.all([fetchCandidates(candidateFilters), fetchSyncJobs(syncFilters)]);
      setCandidates(candidateData.items);
      setCandidatePagination({ page: candidateData.page, pageSize: candidateData.pageSize, total: candidateData.total });
      setSyncJobs(syncJobData.items);
      setSyncPagination({ page: syncJobData.page, pageSize: syncJobData.pageSize, total: syncJobData.total });

      if (currentImportJob) {
        await loadImportRows(
          currentImportJob.importJobId,
          importPagination.page,
          importPagination.pageSize,
          importRowStatusFilter,
        );
      }

      if (selectedSyncJobId) {
        const syncJob = await apiFetch<SyncJobRecord>(`/api/v1/sync/jobs/${selectedSyncJobId}`);
        setSelectedSyncJob(syncJob);
      }
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to refresh candidate operations data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      setIsLoading(true);

      try {
        const [candidateData, syncJobData] = await Promise.all([fetchCandidates(initialCandidateFilters), fetchSyncJobs(initialSyncFilters)]);

        if (!isMounted) {
          return;
        }

        setCandidates(candidateData.items);
        setCandidatePagination({ page: candidateData.page, pageSize: candidateData.pageSize, total: candidateData.total });
        setSyncJobs(syncJobData.items);
        setSyncPagination({ page: syncJobData.page, pageSize: syncJobData.pageSize, total: syncJobData.total });
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load candidate operations data");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void initialize();
    void loadReferenceOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function refreshLists() {
      setIsLoading(true);

      try {
        const [candidateData, syncJobData] = await Promise.all([fetchCandidates(candidateFilters), fetchSyncJobs(syncFilters)]);

        if (!isMounted) {
          return;
        }

        setCandidates(candidateData.items);
        setCandidatePagination({ page: candidateData.page, pageSize: candidateData.pageSize, total: candidateData.total });
        setSyncJobs(syncJobData.items);
        setSyncPagination({ page: syncJobData.page, pageSize: syncJobData.pageSize, total: syncJobData.total });
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to refresh candidate operations data");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void refreshLists();

    return () => {
      isMounted = false;
    };
  }, [candidateFilters, syncFilters]);

  useEffect(() => {
    let isMounted = true;

    async function refreshImportRows() {
      if (!currentImportJob) {
        return;
      }

      setIsLoadingImportRows(true);

      try {
        const rowData = await fetchImportRows(
          currentImportJob.importJobId,
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
          setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load import row review");
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

  async function handleImportUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploadingImport(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (!importForm.file) {
        throw createApiError("Choose an Excel workbook before staging the import");
      }

      const importJob = await uploadCandidateImport(importForm);
      setCurrentImportJob(importJob);
      setImportPagination((current) => ({ ...current, page: 1 }));
      setImportRowStatusFilter("");
      setSuccessMessage("File checked successfully");
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to stage candidate import");
    } finally {
      setIsUploadingImport(false);
    }
  }

  async function handleCreateCandidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingCandidate(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch<CandidateRecord>("/api/v1/candidates", {
        method: "POST",
        body: JSON.stringify(buildIndividualCandidatePayload(individualCandidateForm)),
      });
      setIndividualCandidateForm(emptyIndividualCandidateForm);
      setShowCreateModal(false);
      setSuccessMessage("Learner registered successfully");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to save candidate");
    } finally {
      setIsCreatingCandidate(false);
    }
  }

  async function handleDownloadImportTemplate() {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await downloadStaticWorkbook("candidate_details.xlsx", "/candidate_details.xlsx");

      setSuccessMessage("Sample upload sheet downloaded successfully");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to download sample import workbook");
    }
  }

  async function handleCommitImport() {
    if (!currentImportJob) {
      return;
    }

    setIsCommittingImport(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const committedJob = await apiFetch<ImportJobRecord>(`/api/v1/candidates/imports/${currentImportJob.importJobId}/commit`, {
        method: "POST",
      });
      setCurrentImportJob(committedJob);
      setSuccessMessage("Valid candidates saved. Select the records you want to send to Skill India.");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to commit candidate import");
    } finally {
      setIsCommittingImport(false);
    }
  }

  async function loadLearnerDetail(candidateId: string) {
    setIsLoadingDetail(true);
    setShowDetailModal(true);
    setDetailCandidate(null);

    try {
      const candidate = await apiFetch<CandidateRecord>(`/api/v1/candidates/${candidateId}`);
      setDetailCandidate(candidate);
    } catch (error) {
      setShowDetailModal(false);
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load learner details");
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function loadReferenceOptions() {
    try {
      const [centerData, programData] = await Promise.all([
        apiFetch<{ items: CenterOption[] }>("/api/v1/masters/training-centers?page=1&pageSize=100"),
        apiFetch<{ items: ProgramOption[] }>("/api/v1/masters/programs?page=1&pageSize=100"),
      ]);
      setCenters(centerData.items);
      setPrograms(programData.items);
    } catch {
      // Reference data is optional for the main list; link modal will show empty selects.
    }
  }

  function openLinkModal(candidate?: CandidateRecord) {
    setLinkForm({
      centerId: centers[0]?.centerId ?? "",
      dateOfBirth: candidate?.personalDetails.dateOfBirth?.slice(0, 10) ?? "",
      fullName: candidate?.personalDetails.fullName ?? "",
      mobileNumber: candidate?.contactDetails.mobileNumber ?? "",
      programId: programs[0]?.programId ?? "",
      sidhCandidateId: candidate?.sidhCandidateId ?? "",
    });
    setShowLinkModal(true);
  }

  async function handleLinkExistingCandidate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLinkingCandidate(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch("/api/v1/candidates/link-existing-sidh", {
        method: "POST",
        body: JSON.stringify(linkForm),
      });
      setShowLinkModal(false);
      setLinkForm(emptyLinkForm);
      setSuccessMessage("Learner linked to existing government ID");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to link existing government ID");
    } finally {
      setIsLinkingCandidate(false);
    }
  }

  async function handleQueueSync(candidateId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch<SyncJobRecord>(`/api/v1/candidates/${candidateId}/sync`, {
        method: "POST",
      });
      setSuccessMessage("Learner added to the government queue. Open Sync queue and run sync to submit.");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to add candidate to the Skill India queue");
    }
  }

  async function handleQueueSelectedCandidates() {
    if (activeSelectedCandidateIds.length === 0) {
      return;
    }

    setIsQueueingSelected(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await queueCandidateSyncBulk(activeSelectedCandidateIds);
      setSelectedCandidateIds([]);
      setSuccessMessage(
        result.queuedCount === 0
          ? "No selected learners were added to the queue — they may already be queued or registered"
          : `${result.queuedCount} learner${result.queuedCount === 1 ? "" : "s"} added to the government queue. Open Sync queue and run sync to submit.`,
      );
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to queue selected learners");
    } finally {
      setIsQueueingSelected(false);
    }
  }

  async function handleQueueAllReadyOnPage() {
    if (selectableCandidateIds.length === 0) {
      return;
    }

    setSelectedCandidateIds(selectableCandidateIds);
    setIsQueueingSelected(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await queueCandidateSyncBulk(selectableCandidateIds);
      setSelectedCandidateIds([]);
      setSuccessMessage(
        result.queuedCount === 0
          ? "No learners on this page were added to the queue"
          : `${result.queuedCount} learner${result.queuedCount === 1 ? "" : "s"} on this page added to the queue. Open Sync queue and run sync.`,
      );
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to queue learners on this page");
    } finally {
      setIsQueueingSelected(false);
    }
  }

  async function handleRetrySyncJob(syncJobId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch<SyncJobRecord>(`/api/v1/sync/jobs/${syncJobId}/retry`, {
        method: "POST",
      });
      setSuccessMessage("Candidate returned to the Skill India queue");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to retry sync job");
    }
  }

  async function handleProcessQueuedSyncJobs() {
    setIsProcessingSyncJobs(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await apiFetch<ProcessSyncJobsResult>("/api/v1/sync/jobs/process", {
        body: JSON.stringify({ limit: Number(processLimit) || 5 }),
        method: "POST",
      });

      setSuccessMessage(
        result.processedCount === 0
          ? "No queued candidates were ready to submit"
          : `Submitted ${result.processedCount} queued candidate${result.processedCount === 1 ? "" : "s"}: ${result.succeededCount} completed, ${result.retryScheduledCount} waiting to retry, ${result.manualReviewCount} need review, ${result.deadLetterCount} failed`,
      );
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to submit queued candidates");
    } finally {
      setIsProcessingSyncJobs(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-5 bg-slate-100 px-4 py-4 md:gap-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{content.heading}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{content.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => startTransition(() => void refreshVisibleData())}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
          >
            <IconRefresh className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => openLinkModal()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
          >
            <IconLink className="h-4 w-4" />
            Link govt. ID
          </button>
          <button
            type="button"
            onClick={() => switchTab("bulk_upload")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
          >
            <IconFileSpreadsheet className="h-4 w-4" />
            Bulk import
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <IconUserPlus className="h-4 w-4" />
            Register learner
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          active={activeTab === "all_candidates" && !candidateFilters.syncStatus && !candidateFilters.search}
          icon={<IconUsers className="h-5 w-5" />}
          label="Total learners"
          value={isLoading ? null : candidatePagination.total}
          onClick={clearLearnerFilters}
        />
        <StatCard
          active={activeTab === "all_candidates" && candidateFilters.syncStatus === "not_queued"}
          icon={<IconCircleCheck className="h-5 w-5" />}
          label="Ready to send"
          value={isLoading ? null : readyToSyncCount}
          onClick={() => applySyncFilter("not_queued")}
        />
        <StatCard
          active={activeTab === "all_candidates" && candidateFilters.syncStatus === "failed"}
          icon={<IconRotateClockwise className="h-5 w-5" />}
          label="Needs attention"
          value={isLoading ? null : needsAttentionCount}
          onClick={() => applySyncFilter("failed")}
        />
        <StatCard
          active={activeTab === "skill_india_queue"}
          icon={<IconSend className="h-5 w-5" />}
          label="Sync queue"
          value={isLoading ? null : syncPagination.total}
          onClick={() => switchTab("skill_india_queue")}
        />
      </div>

      {/* Main panel */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-2 sm:px-5">
          {candidateWorkspaceTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition sm:px-4",
                activeTab === tab.id
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-slate-400 hover:text-slate-600",
              )}
            >
              {tab.icon}
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  activeTab === tab.id ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500",
                )}
              >
                {tabCounts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5 md:p-6">
          {activeTab === "all_candidates" ? (
            <div className="space-y-4">
              <WorkflowBanner onGoToSync={() => switchTab("skill_india_queue")} />

              {/* Sticky bulk action bar */}
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        disabled={queueableOnPageCount === 0}
                        onChange={(event) => {
                          setSelectedCandidateIds(event.target.checked ? selectableCandidateIds : []);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400 disabled:opacity-40"
                      />
                      Select all ready on this page
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-sky-700">
                        {queueableOnPageCount}
                      </span>
                    </label>
                    {activeSelectedCandidateIds.length > 0 ? (
                      <span className="text-sm text-slate-600">
                        {activeSelectedCandidateIds.length} selected
                        <button
                          type="button"
                          onClick={() => setSelectedCandidateIds([])}
                          className="ml-2 text-xs font-medium text-sky-700 underline-offset-2 hover:underline"
                        >
                          Clear
                        </button>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {queueableOnPageCount === 0
                          ? "No learners on this page can be sent yet"
                          : "Tick learners below, or use the row actions"}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <LearnerActionButton
                      disabled={activeSelectedCandidateIds.length === 0 || isQueueingSelected}
                      icon={isQueueingSelected ? <IconLoader2 className="h-3.5 w-3.5 animate-spin" /> : <IconSend className="h-3.5 w-3.5" />}
                      label={
                        activeSelectedCandidateIds.length > 0
                          ? `Add ${activeSelectedCandidateIds.length} to queue`
                          : "Add selected to queue"
                      }
                      onClick={() => void handleQueueSelectedCandidates()}
                      tone="primary"
                    />
                    {queueableOnPageCount > 0 ? (
                      <LearnerActionButton
                        disabled={isQueueingSelected}
                        icon={<IconListCheck className="h-3.5 w-3.5" />}
                        label={`Queue all ${queueableOnPageCount} ready`}
                        onClick={() => void handleQueueAllReadyOnPage()}
                      />
                    ) : null}
                    <LearnerActionButton
                      icon={<IconArrowRight className="h-3.5 w-3.5" />}
                      label="Open sync queue"
                      onClick={() => switchTab("skill_india_queue")}
                    />
                  </div>
                </div>
              </div>

              {/* Search & filters */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative flex-1 lg:max-w-sm">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={candidateFilters.search}
                    onChange={(event) =>
                      setCandidateFilters((current) => ({ ...current, page: 1, search: event.target.value }))
                    }
                    className={cn(inputClassName, "pl-9")}
                    placeholder="Search name, mobile, or ID…"
                  />
                </div>
                <select
                  value={candidateFilters.syncStatus}
                  onChange={(event) =>
                    setCandidateFilters((current) => ({ ...current, page: 1, syncStatus: event.target.value }))
                  }
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-300"
                >
                  <option value="">All sync statuses</option>
                  {candidateSyncStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {formatStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "All", value: "" },
                  { label: "Ready to send", value: "not_queued" },
                  { label: "In queue", value: "queued" },
                  { label: "Registered", value: "synced" },
                  { label: "Failed", value: "failed" },
                ].map((pill) => (
                  <button
                    key={pill.value || "all"}
                    type="button"
                    onClick={() =>
                      setCandidateFilters((current) => ({ ...current, page: 1, syncStatus: pill.value }))
                    }
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      candidateFilters.syncStatus === pill.value
                        ? "bg-sky-100 text-sky-700"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <IconLoader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : candidates.length === 0 ? (
                <EmptyState message="No learners match your filters. Register one, import from Excel, or link an existing government ID." />
              ) : (
                <>
                  <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          <th className="w-10 px-4 py-3">Select</th>
                          <th className="px-4 py-3">Learner</th>
                          <th className="px-4 py-3">Mobile</th>
                          <th className="px-4 py-3">Government ID</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Next step</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {candidates.map((candidate) => {
                          const actionState = getLearnerActionState(candidate);
                          const isSelected = activeSelectedCandidateIds.includes(candidate.candidateId);

                          return (
                            <tr
                              key={candidate.candidateId}
                              className={cn(
                                "cursor-pointer transition-colors hover:bg-slate-50/80",
                                isSelected && "bg-sky-50/50",
                              )}
                              onClick={() => void loadLearnerDetail(candidate.candidateId)}
                            >
                              <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!actionState.canSelect}
                                  title={actionState.disableReason ?? "Select to add to government queue"}
                                  onChange={(event) => {
                                    setSelectedCandidateIds((current) =>
                                      event.target.checked
                                        ? [...current, candidate.candidateId]
                                        : current.filter((id) => id !== candidate.candidateId),
                                    );
                                  }}
                                  className="h-4 w-4 rounded border-slate-300 text-sky-600 disabled:cursor-not-allowed disabled:opacity-40"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-slate-900">{candidate.personalDetails.fullName}</div>
                                <div className="text-xs text-slate-400">{candidate.candidateId}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{candidate.contactDetails.mobileNumber}</td>
                              <td className="px-4 py-3 text-slate-600">
                                {candidate.sidhCandidateId ?? <span className="text-slate-300">Not assigned</span>}
                              </td>
                              <td className="px-4 py-3">
                                <StatusPill status={actionState.status} label={actionState.statusLabel} />
                              </td>
                              <td className="max-w-[180px] px-4 py-3 text-xs text-slate-500">{actionState.nextStep}</td>
                              <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  <LearnerActionButton
                                    icon={<IconEye className="h-3.5 w-3.5" />}
                                    label="View"
                                    onClick={() => void loadLearnerDetail(candidate.candidateId)}
                                  />
                                  {actionState.canQueue ? (
                                    <LearnerActionButton
                                      icon={<IconSend className="h-3.5 w-3.5" />}
                                      label="Add to queue"
                                      onClick={() => void handleQueueSync(candidate.candidateId)}
                                      tone="primary"
                                    />
                                  ) : null}
                                  {actionState.canViewQueue ? (
                                    <LearnerActionButton
                                      icon={<IconArrowRight className="h-3.5 w-3.5" />}
                                      label="Sync queue"
                                      onClick={() => switchTab("skill_india_queue")}
                                    />
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 md:hidden">
                    {candidates.map((candidate) => {
                      const actionState = getLearnerActionState(candidate);
                      const isSelected = activeSelectedCandidateIds.includes(candidate.candidateId);

                      return (
                        <div
                          key={candidate.candidateId}
                          className={cn(
                            "rounded-2xl border p-3",
                            isSelected ? "border-sky-200 bg-sky-50/50" : "border-slate-200 bg-white",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!actionState.canSelect}
                              title={actionState.disableReason}
                              onChange={(event) => {
                                setSelectedCandidateIds((current) =>
                                  event.target.checked
                                    ? [...current, candidate.candidateId]
                                    : current.filter((id) => id !== candidate.candidateId),
                                );
                              }}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 disabled:opacity-40"
                            />
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => void loadLearnerDetail(candidate.candidateId)}
                                className="w-full text-left"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate font-medium text-slate-900">
                                      {candidate.personalDetails.fullName}
                                    </div>
                                    <div className="text-xs text-slate-500">{candidate.contactDetails.mobileNumber}</div>
                                  </div>
                                  <StatusPill status={actionState.status} label={actionState.statusLabel} />
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{actionState.nextStep}</p>
                              </button>
                              {candidate.syncState?.lastFailureMessage ? (
                                <p className="mt-2 text-xs text-rose-600">{candidate.syncState.lastFailureMessage}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {actionState.canQueue ? (
                                  <LearnerActionButton
                                    icon={<IconSend className="h-3.5 w-3.5" />}
                                    label="Add to queue"
                                    onClick={() => void handleQueueSync(candidate.candidateId)}
                                    tone="primary"
                                  />
                                ) : null}
                                {actionState.canViewQueue ? (
                                  <LearnerActionButton
                                    icon={<IconArrowRight className="h-3.5 w-3.5" />}
                                    label="Sync queue"
                                    onClick={() => switchTab("skill_india_queue")}
                                  />
                                ) : null}
                                <LearnerActionButton
                                  icon={<IconEye className="h-3.5 w-3.5" />}
                                  label="View"
                                  onClick={() => void loadLearnerDetail(candidate.candidateId)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <PaginationControls
                page={candidatePagination.page}
                pageSize={candidatePagination.pageSize}
                total={candidatePagination.total}
                onPageChange={(page) => setCandidateFilters((current) => ({ ...current, page }))}
              />
            </div>
          ) : null}

          {activeTab === "bulk_upload" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">How bulk import works</p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-slate-600">
                  <li>Download the template and fill in learner details</li>
                  <li>Upload the file — we check every row and show errors in plain language</li>
                  <li>Save valid rows, then send learners to the government portal from All learners</li>
                </ol>
              </div>

              <div>
                <h2 className="text-base font-semibold text-slate-900">Bulk import from Excel</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Upload a spreadsheet, review validation results, then save valid rows as learners.
                </p>
              </div>

              <form
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-end"
                onSubmit={handleImportUpload}
              >
                <FormField label="Excel file" className="flex-1">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(event) =>
                      setImportForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
                    }
                    className={cn(inputClassName, "py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-sky-700")}
                    required
                  />
                </FormField>
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
                    disabled={isUploadingImport || !isImportReady}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isUploadingImport ? (
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <IconUpload className="h-4 w-4" />
                    )}
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
                          ? `${currentImportJob.committedRows} learner${currentImportJob.committedRows === 1 ? "" : "s"} saved — go to All learners to send them to the government portal`
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
                    <h3 className="text-sm font-semibold text-slate-800">Imported learners list</h3>
                    <p className="text-xs text-slate-500">
                      One row per spreadsheet line — scroll sideways to see every column.
                    </p>
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
                  <EmptyState message="Upload your Excel file to see a list of learners with any errors highlighted." />
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
                  <ImportRowsList rows={importRows} onView={openImportRowModal} />
                )}

                {currentImportJob && importPagination.total > 0 ? (
                  <PaginationControls
                    page={importPagination.page}
                    pageSize={importPagination.pageSize}
                    total={importPagination.total}
                    onPageChange={(page) => setImportPagination((current) => ({ ...current, page }))}
                  />
                ) : null}
                {currentImportJob && importPagination.total > 0 ? (
                  <p className="text-center text-xs text-slate-500">
                    Showing {(importPagination.page - 1) * importPagination.pageSize + 1}–
                    {Math.min(importPagination.page * importPagination.pageSize, importPagination.total)} of{" "}
                    {importPagination.total.toLocaleString()} rows · only this page is loaded for speed
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === "skill_india_queue" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Learners must be added to this queue from the <strong>All learners</strong> tab first. Then use{" "}
                <strong>Run sync</strong> below to submit them to the government portal.
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Government sync queue</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Submit queued learners to the government portal and track delivery status.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={syncFilters.status}
                    onChange={(event) =>
                      setSyncFilters((current) => ({ ...current, page: 1, status: event.target.value }))
                    }
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-300"
                  >
                    <option value="">All statuses</option>
                    {syncJobStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={processLimit}
                    onChange={(event) => setProcessLimit(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-300"
                  >
                    {[1, 5, 10, 25].map((limit) => (
                      <option key={limit} value={limit}>
                        Process {limit}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleProcessQueuedSyncJobs()}
                    disabled={isProcessingSyncJobs}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isProcessingSyncJobs ? (
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <IconPlayerPlay className="h-4 w-4" />
                    )}
                    Run sync
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <ImportStat label="In progress" value={queuedJobs} />
                <ImportStat label="Needs review" value={flaggedJobs} tone={flaggedJobs > 0 ? "danger" : undefined} />
                <ImportStat label="Total jobs" value={syncPagination.total} />
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                  <IconLoader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : syncJobs.length === 0 ? (
                <EmptyState message="No sync jobs yet. Queue learners from the All learners tab." />
              ) : (
                <div className="space-y-2">
                  {syncJobs.map((job) => (
                    <div
                      key={job.syncJobId}
                      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{job.candidateId}</span>
                          <StatusPill status={job.status} />
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          <span>Retries: {job.retryCount}</span>
                          {job.latestRemoteCandidateId ? <span>ID: {job.latestRemoteCandidateId}</span> : null}
                          {job.nextRunAt ? <span>Next: {formatDateTime(job.nextRunAt)}</span> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => void loadSyncJobDetails(job.syncJobId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <IconEye className="h-3.5 w-3.5" />
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRetrySyncJob(job.syncJobId)}
                          disabled={job.status === "processing"}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <IconRotateClockwise className="h-3.5 w-3.5" />
                          Retry
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <PaginationControls
                page={syncPagination.page}
                pageSize={syncPagination.pageSize}
                total={syncPagination.total}
                onPageChange={(page) => setSyncFilters((current) => ({ ...current, page }))}
              />
            </div>
          ) : null}
        </div>
      </section>

      {showImportRowModal && selectedImportRow ? (
        <ImportRowViewModal
          row={selectedImportRow}
          onClose={() => {
            setShowImportRowModal(false);
            setSelectedImportRow(null);
          }}
        />
      ) : null}

      {showCreateModal ? (
        <Modal
          icon={<IconUserPlus className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50"
          title="Register learner"
          subtitle="Add one learner with the same fields used for government portal registration."
          onClose={() => setShowCreateModal(false)}
        >
          <form className="space-y-5" onSubmit={handleCreateCandidate}>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Personal details</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Name prefix">
                  <input
                    value={individualCandidateForm.namePrefix}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, namePrefix: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="Mr"
                  />
                </FormField>
                <FormField label="First name *">
                  <input
                    value={individualCandidateForm.firstName}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, firstName: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="First name"
                    required
                  />
                </FormField>
                <FormField label="Gender *">
                  <input
                    value={individualCandidateForm.gender}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, gender: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="Male / Female / Other"
                    required
                  />
                </FormField>
                <FormField label="Date of birth *">
                  <input
                    type="date"
                    value={individualCandidateForm.dob}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, dob: event.target.value }))
                    }
                    className={inputClassName}
                    required
                  />
                </FormField>
                <FormField label="Father name">
                  <input
                    value={individualCandidateForm.fatherName}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, fatherName: event.target.value }))
                    }
                    className={inputClassName}
                  />
                </FormField>
                <FormField label="Guardian name">
                  <input
                    value={individualCandidateForm.guardianName}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, guardianName: event.target.value }))
                    }
                    className={inputClassName}
                  />
                </FormField>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Contact</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Phone *">
                  <input
                    value={individualCandidateForm.phone}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, phone: event.target.value }))
                    }
                    className={inputClassName}
                    inputMode="numeric"
                    placeholder="9876543210"
                    required
                  />
                </FormField>
                <FormField label="Country code">
                  <input
                    value={individualCandidateForm.countryCode}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, countryCode: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="91"
                  />
                </FormField>
                <FormField label="Email" className="sm:col-span-2">
                  <input
                    type="email"
                    value={individualCandidateForm.email}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, email: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="email@example.com"
                  />
                </FormField>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Location</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="State">
                  <input
                    value={individualCandidateForm.state}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, state: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="State"
                  />
                </FormField>
                <FormField label="City">
                  <input
                    value={individualCandidateForm.city}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, city: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="City"
                  />
                </FormField>
                <FormField label="Training center" className="sm:col-span-2">
                  <input
                    value={individualCandidateForm.centerName}
                    onChange={(event) =>
                      setIndividualCandidateForm((current) => ({ ...current, centerName: event.target.value }))
                    }
                    className={inputClassName}
                    placeholder="Center name"
                  />
                </FormField>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingCandidate || !isIndividualCandidateReady}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isCreatingCandidate ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconPlus className="h-4 w-4" />
                )}
                Save learner
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showDetailModal ? (
        <Modal
          icon={<IconUsers className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50"
          title={detailCandidate?.personalDetails.fullName ?? "Learner details"}
          subtitle={detailCandidate?.candidateId ?? "Loading learner record…"}
          onClose={() => {
            setShowDetailModal(false);
            setDetailCandidate(null);
          }}
        >
          {isLoadingDetail || !detailCandidate ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <IconLoader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            (() => {
              const actionState = getLearnerActionState(detailCandidate);
              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={actionState.status} label={actionState.statusLabel} />
                    <span className="text-xs text-slate-500">{actionState.nextStep}</span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailMeta label="Mobile" value={detailCandidate.contactDetails.mobileNumber} />
                    <DetailMeta
                      label="Email"
                      value={detailCandidate.contactDetails.email ?? "Not provided"}
                    />
                    <DetailMeta
                      label="Government ID"
                      value={detailCandidate.sidhCandidateId ?? "Not assigned yet"}
                    />
                    <DetailMeta
                      label="Date of birth"
                      value={detailCandidate.personalDetails.dateOfBirth ?? "Not provided"}
                    />
                    <DetailMeta label="Gender" value={detailCandidate.personalDetails.gender ?? "—"} />
                    <DetailMeta
                      label="Registration"
                      value={
                        detailCandidate.registrationMode === "existing_sidh_link"
                          ? "Linked from portal"
                          : "Registered locally"
                      }
                    />
                    <DetailMeta
                      label="Last sync attempt"
                      value={formatDateTime(detailCandidate.syncState?.lastAttemptAt)}
                    />
                    <DetailMeta
                      label="Last successful sync"
                      value={formatDateTime(detailCandidate.syncState?.lastSuccessAt)}
                    />
                  </div>

                  {detailCandidate.syncState?.lastFailureMessage ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      Last error: {detailCandidate.syncState.lastFailureMessage}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {actionState.canQueue ? (
                      <LearnerActionButton
                        icon={<IconSend className="h-3.5 w-3.5" />}
                        label="Add to government queue"
                        onClick={() => void handleQueueSync(detailCandidate.candidateId)}
                        tone="primary"
                      />
                    ) : null}
                    {actionState.canViewQueue ? (
                      <LearnerActionButton
                        icon={<IconArrowRight className="h-3.5 w-3.5" />}
                        label="Open sync queue"
                        onClick={() => {
                          setShowDetailModal(false);
                          switchTab("skill_india_queue");
                        }}
                      />
                    ) : null}
                    {!detailCandidate.sidhCandidateId && detailCandidate.registrationMode !== "existing_sidh_link" ? (
                      <LearnerActionButton
                        icon={<IconLink className="h-3.5 w-3.5" />}
                        label="Link existing govt. ID"
                        onClick={() => {
                          setShowDetailModal(false);
                          openLinkModal(detailCandidate);
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })()
          )}
        </Modal>
      ) : null}

      {showLinkModal ? (
        <Modal
          icon={<IconLink className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50"
          title="Link existing government ID"
          subtitle="Connect a learner who is already registered on the government portal."
          onClose={() => setShowLinkModal(false)}
        >
          <form className="space-y-4" onSubmit={handleLinkExistingCandidate}>
            <FormField label="Government candidate ID *">
              <input
                value={linkForm.sidhCandidateId}
                onChange={(event) => setLinkForm((current) => ({ ...current, sidhCandidateId: event.target.value }))}
                className={inputClassName}
                placeholder="Existing portal ID"
                required
              />
            </FormField>
            <FormField label="Full name *">
              <input
                value={linkForm.fullName}
                onChange={(event) => setLinkForm((current) => ({ ...current, fullName: event.target.value }))}
                className={inputClassName}
                required
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Mobile *">
                <input
                  value={linkForm.mobileNumber}
                  onChange={(event) => setLinkForm((current) => ({ ...current, mobileNumber: event.target.value }))}
                  className={inputClassName}
                  inputMode="numeric"
                  placeholder="10 digit number"
                  required
                />
              </FormField>
              <FormField label="Date of birth *">
                <input
                  type="date"
                  value={linkForm.dateOfBirth}
                  onChange={(event) => setLinkForm((current) => ({ ...current, dateOfBirth: event.target.value }))}
                  className={inputClassName}
                  required
                />
              </FormField>
            </div>
            <FormField label="Training program *">
              <select
                value={linkForm.programId}
                onChange={(event) => setLinkForm((current) => ({ ...current, programId: event.target.value }))}
                className={inputClassName}
                required
              >
                <option value="">Select program</option>
                {programs.map((program) => (
                  <option key={program.programId} value={program.programId}>
                    {program.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Training center *">
              <select
                value={linkForm.centerId}
                onChange={(event) => setLinkForm((current) => ({ ...current, centerId: event.target.value }))}
                className={inputClassName}
                required
              >
                <option value="">Select center</option>
                {centers.map((center) => (
                  <option key={center.centerId} value={center.centerId}>
                    {center.centerName}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLinkingCandidate}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isLinkingCandidate ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconLink className="h-4 w-4" />}
                Link learner
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {showSyncDetailModal ? (
        <Modal
          icon={<IconSend className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50"
          title="Sync job history"
          subtitle={selectedSyncJob ? `Candidate ${selectedSyncJob.candidateId}` : "Loading…"}
          onClose={() => {
            setShowSyncDetailModal(false);
            setSelectedSyncJob(null);
            setSelectedSyncJobId(null);
          }}
        >
          {isLoadingSyncDetail || !selectedSyncJob ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <IconLoader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{selectedSyncJob.syncJobId}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Created {formatDateTime(selectedSyncJob.createdAt)} · Retries {selectedSyncJob.retryCount}
                  </div>
                </div>
                <StatusPill status={selectedSyncJob.status} />
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Attempts</h4>
                {selectedSyncJob.attempts.length === 0 ? (
                  <EmptyState message="No attempts recorded yet." />
                ) : (
                  <div className="space-y-2">
                    {selectedSyncJob.attempts.map((attempt, index) => (
                      <div key={attempt.attemptId ?? `${selectedSyncJob.syncJobId}-${index}`} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium text-slate-900">
                            {attempt.attemptId ?? `Attempt ${index + 1}`}
                          </div>
                          <StatusPill status={attempt.status ?? "processing"} />
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDateTime(attempt.startedAt)} → {formatDateTime(attempt.finishedAt)}
                        </div>
                        {attempt.failureMessage ? (
                          <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
                            {attempt.failureMessage}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(selectedSyncJob.transactions ?? []).length > 0 ? (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Portal transactions
                  </h4>
                  <div className="space-y-2">
                    {(selectedSyncJob.transactions ?? []).map((transaction) => (
                      <div key={transaction.transactionId} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{transaction.operation}</div>
                          <div className="text-xs text-slate-500">{formatDateTime(transaction.createdAt)}</div>
                        </div>
                        <StatusPill
                          status={transaction.success ? "succeeded" : "failed"}
                          label={transaction.responseStatus ? String(transaction.responseStatus) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Learner sent to portal
                </h4>
                {(() => {
                  const summary = extractSyncPayloadSummary(selectedSyncJob.payloadSnapshot);
                  return (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DetailMeta label="Name" value={summary.fullName} />
                      <DetailMeta label="Mobile" value={summary.mobile} />
                      <DetailMeta label="Email" value={summary.email} />
                      <DetailMeta label="Date of birth" value={summary.dob} />
                      <DetailMeta label="City" value={summary.city} />
                      <DetailMeta label="State" value={summary.state} />
                      <DetailMeta label="Training center" value={summary.centerName} />
                      <DetailMeta label="Gender" value={summary.gender} />
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

function WorkflowBanner({ onGoToSync }: { onGoToSync: () => void }) {
  const steps = [
    { label: "Register", detail: "Add one learner or import from Excel" },
    { label: "Select & queue", detail: "Tick ready learners and add to government queue" },
    { label: "Run sync", detail: "Submit queued learners to the government portal" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">How it works</p>
        <button
          type="button"
          onClick={onGoToSync}
          className="text-xs font-medium text-sky-700 hover:underline"
        >
          Go to sync queue →
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.label} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
              {index + 1}
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-800">{step.label}</p>
              <p className="text-[11px] leading-4 text-slate-500">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LearnerActionButton({
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
  tone?: "neutral" | "primary";
}) {
  const toneClass =
    tone === "primary"
      ? "border-sky-200 bg-sky-600 text-white hover:bg-sky-700 disabled:bg-sky-300"
      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        toneClass,
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function FormField({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>
      {children}
    </div>
  );
}

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
        active ? "border-sky-300 ring-1 ring-sky-200" : "border-slate-200",
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
            <span className={cn("rounded-xl p-2.5", iconBg)}>{icon}</span>
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

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

function PaginationControls({ onPageChange, page, pageSize, total }: { onPageChange: (page: number) => void; page: number; pageSize: number; total: number }) {
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

function StatusPill({ label, status }: { label?: string; status?: string | null }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusPillClass(status)}`}>{label ?? formatStatusLabel(status)}</span>;
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  const isEmpty = value === EMPTY_FIELD || value === "—" || value === "Not available";

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cn("mt-0.5 text-sm", isEmpty ? "text-slate-400 italic" : "text-slate-700")}>{value}</div>
    </div>
  );
}

function ImportRowViewModal({ onClose, row }: { onClose: () => void; row: ImportRowRecord }) {
  const details = extractImportRowPreview(row.normalized);

  return (
    <Modal
      icon={<IconEye className="h-5 w-5 text-sky-600" />}
      iconBg="bg-sky-50"
      title={`Row ${formatImportDisplayRowNumber(row.rowNumber)} · ${details.fullName}`}
      subtitle="Full learner details from your spreadsheet"
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <ImportStatusPill status={row.status} />
          {row.candidateId ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Saved as {row.candidateId}
            </span>
          ) : null}
        </div>

        <ImportDetailSection title="Personal details">
          <ImportDetailField label="Name prefix" value={details.namePrefix} />
          <ImportDetailField label="First name" value={details.firstName} />
          <ImportDetailField label="Full name" value={details.fullName} />
          <ImportDetailField label="Gender" value={details.gender} />
          <ImportDetailField label="Date of birth" value={details.dob} />
          <ImportDetailField label="Father's name" value={details.fatherName} />
          <ImportDetailField label="Guardian's name" value={details.guardianName} />
        </ImportDetailSection>

        <ImportDetailSection title="Contact details">
          <ImportDetailField label="Phone" value={details.mobile} />
          <ImportDetailField label="Country code" value={details.countryCode} />
          <ImportDetailField label="Email" value={details.email} className="sm:col-span-2" />
        </ImportDetailSection>

        <ImportDetailSection title="Location">
          <ImportDetailField label="State" value={details.state} />
          <ImportDetailField label="City" value={details.city} />
          <ImportDetailField label="Training center" value={details.centerName} className="sm:col-span-2" />
        </ImportDetailSection>

        {row.errors.length > 0 ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-800">Issues to fix</p>
            <ul className="mt-2 space-y-1.5 text-sm text-rose-700">
              {row.errors.map((error, index) => (
                <li key={`${row.rowId}-modal-issue-${index}`}>{formatImportError(error)}</li>
              ))}
            </ul>
          </div>
        ) : row.status === "duplicate" && row.duplicateOfCandidateId ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
            Matches existing learner <strong>{row.duplicateOfCandidateId}</strong>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            No issues found — this row is ready to save.
          </div>
        )}
      </div>
    </Modal>
  );
}

function ImportDetailSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function ImportDetailField({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const isEmpty = value === EMPTY_FIELD;

  return (
    <div className={cn("min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={cn("mt-0.5 break-words text-sm font-medium", isEmpty ? "italic text-slate-400" : "text-slate-800")}>
        {value}
      </p>
    </div>
  );
}

const ImportRowListItem = memo(function ImportRowListItem({
  onView,
  row,
}: {
  onView: (row: ImportRowRecord) => void;
  row: ImportRowRecord;
}) {
  const details = extractImportRowPreview(row.normalized);
  const location = [details.city, details.state].filter((part) => part !== EMPTY_FIELD).join(", ") || EMPTY_FIELD;
  const issuePreview =
    row.errors.length > 0
      ? row.errors.map(formatImportError)[0]
      : row.status === "duplicate" && row.duplicateOfCandidateId
        ? `Duplicate of ${row.duplicateOfCandidateId}`
        : null;

  return (
    <>
      <tr
        className={cn(
          "hidden md:table-row",
          row.status === "invalid" && "bg-rose-50/40",
          row.status === "duplicate" && "bg-amber-50/30",
        )}
      >
        <td className="w-14 shrink-0 px-3 py-3 text-xs font-medium text-slate-500">
          #{formatImportDisplayRowNumber(row.rowNumber)}
        </td>
        <td className="min-w-0 px-3 py-3">
          <p className="truncate font-medium text-slate-900" title={details.fullName}>
            {details.fullName}
          </p>
          <p className="truncate text-xs text-slate-500" title={details.gender}>
            {details.gender}
          </p>
        </td>
        <td className="w-[7.5rem] px-3 py-3 text-slate-700">{details.mobile}</td>
        <td className="min-w-0 px-3 py-3">
          <p className="truncate text-slate-700" title={location}>
            {location}
          </p>
        </td>
        <td className="w-36 shrink-0 px-3 py-3">
          <ImportStatusPill status={row.status} />
        </td>
        <td className="min-w-0 max-w-[12rem] px-3 py-3">
          {issuePreview ? (
            <p className="line-clamp-2 text-xs text-rose-700" title={issuePreview}>
              {issuePreview}
            </p>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>
        <td className="w-20 px-3 py-3 text-right">
          <button
            type="button"
            onClick={() => onView(row)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
          >
            <IconEye className="h-3.5 w-3.5" />
            View
          </button>
        </td>
      </tr>

      <tr className="md:hidden">
        <td colSpan={7} className="p-0">
          <div
            className={cn(
              "border-b border-slate-100 px-3 py-3",
              row.status === "invalid" && "bg-rose-50/40",
              row.status === "duplicate" && "bg-amber-50/30",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-nowrap items-center gap-2">
                  <span className="shrink-0 text-xs font-medium text-slate-500">
                    Row {formatImportDisplayRowNumber(row.rowNumber)}
                  </span>
                  <ImportStatusPill status={row.status} />
                </div>
                <p className="mt-1 truncate font-medium text-slate-900">{details.fullName}</p>
                <p className="text-xs text-slate-600">{details.mobile}</p>
                <p className="truncate text-xs text-slate-500">{location}</p>
                {issuePreview ? <p className="mt-1 line-clamp-2 text-xs text-rose-700">{issuePreview}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => onView(row)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-sky-700"
              >
                <IconEye className="h-3.5 w-3.5" />
                View
              </button>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
});

function ImportRowsList({
  onView,
  rows,
}: {
  onView: (row: ImportRowRecord) => void;
  rows: ImportRowRecord[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/90 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="w-14 px-3 py-2.5">Row</th>
              <th className="px-3 py-2.5">Learner</th>
              <th className="w-[7.5rem] px-3 py-2.5">Mobile</th>
              <th className="w-[28%] px-3 py-2.5">Location</th>
              <th className="w-36 shrink-0 px-3 py-2.5">Status</th>
              <th className="w-[12rem] px-3 py-2.5">Issue</th>
              <th className="w-20 px-3 py-2.5 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ImportRowListItem key={row.rowId} onView={onView} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        <table className="w-full">
          <tbody>
            {rows.map((row) => (
              <ImportRowListItem key={row.rowId} onView={onView} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        getStatusPillClass(status),
      )}
    >
      {formatImportStatusLabel(status)}
    </span>
  );
}

const inputClassName =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300";