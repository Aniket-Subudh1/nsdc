"use client";

import { startTransition, useEffect, useState } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Upload,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError, type ApiEnvelope } from "@/lib/client/api";
import { downloadWorkbook } from "@/lib/spreadsheet/browser";

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

type ImportFormState = {
  file: File | null;
};

type CandidateFilters = {
  page: number;
  pageSize: number;
  search: string;
  syncStatus: string;
};

type IndividualCandidateFormState = {
  countryCode: string;
  dob: string;
  email: string;
  fatherName: string;
  firstName: string;
  gender: string;
  guardianName: string;
  namePrefix: string;
  phone: string;
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

const portalContent = {
  admin: {
    description:
      "Upload candidate files, review saved records, and send the right candidates to Skill India from one operator workspace.",
    heading: "Candidate Uploads",
  },
  training_partner: {
    description:
      "Work within your assigned centers to upload candidate files, review each row, and submit selected candidates to Skill India.",
    heading: "Candidate Uploads",
  },
} as const;

const candidateSyncStatusOptions = ["not_queued", "queued", "processing", "synced", "failed", "manual_review", "linked"];
const syncJobStatusOptions = ["queued", "processing", "succeeded", "failed", "manual_review", "dead_letter"];
const pageSizeOptions = [12, 24, 48];

const emptyImportForm: ImportFormState = {
  file: null,
};

const initialCandidateFilters: CandidateFilters = {
  page: 1,
  pageSize: 12,
  search: "",
  syncStatus: "",
};

const emptyIndividualCandidateForm: IndividualCandidateFormState = {
  countryCode: "91",
  dob: "",
  email: "",
  fatherName: "",
  firstName: "",
  gender: "",
  guardianName: "",
  namePrefix: "",
  phone: "",
};

const initialSyncFilters: SyncFilters = {
  page: 1,
  pageSize: 12,
  status: "",
};

const candidateImportTemplateRows = [
  {
    "Name Prefix": "Mr",
    "First Name": "Import Valid Candidate QA",
    Gender: "Male",
    DOB: "10/06/2005",
    "Father's Name": "Import Parent QA",
    "Guardian Name": "",
    Email: "import.valid.qa@example.com",
    Phone: "9876543212",
    "Country Code": "91",
  },
  {
    "Name Prefix": "Ms",
    "First Name": "Import Invalid Candidate QA",
    Gender: "Female",
    DOB: "12/07/2005",
    "Father's Name": "Import Parent QA",
    "Guardian Name": "",
    Email: "import.invalid.qa@example.com",
    Phone: "",
    "Country Code": "91",
  },
  {
    "Name Prefix": "Mr",
    "First Name": "Import Valid Candidate QA",
    Gender: "Male",
    DOB: "10/06/2005",
    "Father's Name": "Import Parent QA",
    "Guardian Name": "",
    Email: "import.duplicate.qa@example.com",
    Phone: "9876543212",
    "Country Code": "91",
  },
] as const;

const candidateImportTemplateInstructions = [
  { Note: "Keep the sheet headers unchanged. The upload checks only Name Prefix, First Name, Gender, DOB, father or guardian name, email, phone, and country code." },
  { Note: "Use dd/mm/yyyy for DOB in the sample sheet." },
  { Note: "The app applies your allowed center and program automatically when saving candidates." },
  { Note: "After saving valid rows, select the candidates you want to send to Skill India and add them to the queue." },
] as const;

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
  };
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

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getStatusPillClass(status?: string | null) {
  if (!status) {
    return "bg-slate-100 text-slate-700";
  }

  if (["synced", "succeeded", "linked"].includes(status)) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (["failed", "manual_review", "dead_letter"].includes(status)) {
    return "bg-rose-100 text-rose-700";
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

async function fetchImportRows(jobId: string, page: number, pageSize: number) {
  return apiFetch<PagedImportRows>(`/api/v1/candidates/imports/${jobId}/rows?${buildQueryString({ page, pageSize })}`);
}

async function queueCandidateSyncBulk(candidateIds: string[]) {
  return apiFetch<BulkQueueResult>("/api/v1/candidates/sync/bulk", {
    body: JSON.stringify({ candidateIds }),
    method: "POST",
  });
}

export default function CandidatesManager({ portal }: CandidatesManagerProps) {
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
  const [importPagination, setImportPagination] = useState({ page: 1, pageSize: 12, total: 0 });
  const [expandedImportRowId, setExpandedImportRowId] = useState<string | null>(null);
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const content = portalContent[portal];
  const selectableCandidateIds = candidates
    .filter((candidate) => candidate.registrationMode === "internal_registration" && !candidate.sidhCandidateId)
    .map((candidate) => candidate.candidateId);
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

  async function loadImportRows(jobId: string, page = importPagination.page, pageSize = importPagination.pageSize) {
    const rowData = await fetchImportRows(jobId, page, pageSize);
    setImportRows(rowData.items);
    setImportPagination({ page: rowData.page, pageSize: rowData.pageSize, total: rowData.total });
  }

  async function loadSyncJobDetails(syncJobId: string) {
    setIsLoadingSyncDetail(true);

    try {
      const syncJob = await apiFetch<SyncJobRecord>(`/api/v1/sync/jobs/${syncJobId}`);
      setSelectedSyncJobId(syncJobId);
      setSelectedSyncJob(syncJob);
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
        await loadImportRows(currentImportJob.importJobId, importPagination.page, importPagination.pageSize);
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

      try {
        const rowData = await fetchImportRows(currentImportJob.importJobId, importPagination.page, importPagination.pageSize);

        if (!isMounted) {
          return;
        }

        setImportRows(rowData.items);
        setImportPagination({ page: rowData.page, pageSize: rowData.pageSize, total: rowData.total });
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load import row review");
        }
      }
    }

    void refreshImportRows();

    return () => {
      isMounted = false;
    };
  }, [currentImportJob, importPagination.page, importPagination.pageSize]);

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
      setExpandedImportRowId(null);
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
      setSuccessMessage("Candidate saved successfully");
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
      await downloadWorkbook("skill-india-candidate-upload-template.xlsx", [
        { name: "Candidate Import Template", rows: [...candidateImportTemplateRows] },
        { name: "Instructions", rows: [...candidateImportTemplateInstructions] },
      ]);

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

  async function handleQueueSync(candidateId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch<SyncJobRecord>(`/api/v1/candidates/${candidateId}/sync`, {
        method: "POST",
      });
      setSuccessMessage("Candidate added to the Skill India queue");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to add candidate to the Skill India queue");
    }
  }

  async function handleQueueSelectedCandidates() {
    if (activeSelectedCandidateIds.length === 0) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await queueCandidateSyncBulk(activeSelectedCandidateIds);
      setSelectedCandidateIds([]);
      setSuccessMessage(
        result.queuedCount === 0
          ? "No selected candidates were added to the Skill India queue"
          : `${result.queuedCount} candidate${result.queuedCount === 1 ? "" : "s"} added to the Skill India queue`,
      );
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to queue selected candidates");
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
    <div className="flex flex-1 flex-col gap-6 bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Operations</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{content.heading}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{content.description}</p>
          </div>
          <button
            type="button"
            onClick={() => startTransition(() => void refreshVisibleData())}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
          >
            <RefreshCw className="h-4 w-4" /> Refresh visible data
          </button>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Users className="h-5 w-5" />} label="Candidates in scope" value={candidatePagination.total} />
        <MetricCard icon={<Send className="h-5 w-5" />} label="Queued or processing" value={queuedJobs} />
        <MetricCard icon={<RotateCcw className="h-5 w-5" />} label="Flagged jobs" value={flaggedJobs} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-sky-50 p-2 text-sky-600">
              <Upload className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Candidate Registration</h2>
              <p className="text-sm text-slate-500">Use the same Skill India registration fields for bulk upload or for adding one candidate directly.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <MiniStat label="1" value="Download sample" />
            <MiniStat label="2" value="Upload or add one" />
            <MiniStat label="3" value="Save and send" />
          </div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            The candidate registration payload now follows the Skill India candidate format only: name prefix, first name, gender, DOB, father or guardian name, email, phone, and country code. Program, center, and registration mode are applied internally.
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => void handleDownloadImportTemplate()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700">
              <Download className="h-4 w-4" /> Download sample sheet
            </button>
            <button type="button" onClick={() => startTransition(() => void refreshVisibleData())} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700">
              <RefreshCw className="h-4 w-4" /> Refresh candidates
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Saved Candidates</h2>
              <p className="text-sm text-slate-500">Review saved candidates, choose the records to send, and track their Skill India ID after submission.</p>
            </div>
            {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /> : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <InlineField icon={<Search className="h-4 w-4" />} label="Search">
              <input value={candidateFilters.search} onChange={(event) => setCandidateFilters((current) => ({ ...current, page: 1, search: event.target.value }))} className={inputClassName} placeholder="Name, mobile, SIDH ID, or candidate ID" />
            </InlineField>
            <InlineField label="Sync status">
              <select value={candidateFilters.syncStatus} onChange={(event) => setCandidateFilters((current) => ({ ...current, page: 1, syncStatus: event.target.value }))} className={inputClassName}>
                <option value="">All statuses</option>
                {candidateSyncStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </InlineField>
            <InlineField label="Page size">
              <select value={candidateFilters.pageSize} onChange={(event) => setCandidateFilters((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))} className={inputClassName}>
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>{size} rows</option>
                ))}
              </select>
            </InlineField>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="inline-flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => {
                  setSelectedCandidateIds(event.target.checked ? selectableCandidateIds : []);
                }}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              Select all send-ready candidates on this page
            </label>
            <button
              type="button"
              onClick={() => void handleQueueSelectedCandidates()}
              disabled={activeSelectedCandidateIds.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> Add selected to Skill India queue
            </button>
            <span className="text-sm text-slate-500">{activeSelectedCandidateIds.length} selected</span>
          </div>

          <div className="mt-6 space-y-3">
            {candidates.length === 0 ? (
              <EmptyState message={isLoading ? "Loading candidate records..." : "No candidates match the current filters."} />
            ) : (
              candidates.map((candidate) => (
                <div key={candidate.candidateId} className={`rounded-2xl border p-4 ${activeSelectedCandidateIds.includes(candidate.candidateId) ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-1 items-start gap-3 text-left">
                      <input
                        type="checkbox"
                        checked={activeSelectedCandidateIds.includes(candidate.candidateId)}
                        disabled={candidate.registrationMode !== "internal_registration" || Boolean(candidate.sidhCandidateId)}
                        onChange={(event) => {
                          setSelectedCandidateIds((current) =>
                            event.target.checked
                              ? [...current, candidate.candidateId]
                              : current.filter((candidateId) => candidateId !== candidate.candidateId),
                          );
                        }}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                      />
                      <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">{candidate.personalDetails.fullName}</div>
                      <div className="mt-1 text-sm text-slate-600">{candidate.contactDetails.mobileNumber} • {candidate.candidateId}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{candidate.registrationMode === "existing_sidh_link" ? "Already linked" : "Ready for submission"}</span>
                        {candidate.sidhCandidateId ? <span>Skill India ID {candidate.sidhCandidateId}</span> : null}
                      </div>
                      </div>
                    </div>
                    <StatusPill status={candidate.syncState?.status ?? "not_queued"} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleQueueSync(candidate.candidateId)} disabled={candidate.registrationMode === "existing_sidh_link" || Boolean(candidate.sidhCandidateId)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <Send className="h-3.5 w-3.5" /> Add to Skill India queue
                    </button>
                    {candidate.syncState?.lastFailureMessage ? (
                      <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">Last issue: {candidate.syncState.lastFailureMessage}</div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5">
            <PaginationControls page={candidatePagination.page} pageSize={candidatePagination.pageSize} total={candidatePagination.total} onPageChange={(page) => setCandidateFilters((current) => ({ ...current, page }))} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-sky-50 p-2 text-sky-600">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create Individual Candidate</h2>
                <p className="text-sm text-slate-500">Add one candidate with the same fields used by the Skill India registration API.</p>
              </div>
            </div>

            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleCreateCandidate}>
              <Field label="Name prefix">
                <input value={individualCandidateForm.namePrefix} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, namePrefix: event.target.value }))} className={inputClassName} placeholder="Mr" />
              </Field>
              <Field label="First name">
                <input value={individualCandidateForm.firstName} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, firstName: event.target.value }))} className={inputClassName} placeholder="Candidate first name" required />
              </Field>
              <Field label="Gender">
                <input value={individualCandidateForm.gender} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, gender: event.target.value }))} className={inputClassName} placeholder="Male" required />
              </Field>
              <Field label="DOB">
                <input type="date" value={individualCandidateForm.dob} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, dob: event.target.value }))} className={inputClassName} required />
              </Field>
              <Field label="Father name">
                <input value={individualCandidateForm.fatherName} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, fatherName: event.target.value }))} className={inputClassName} placeholder="Father name" />
              </Field>
              <Field label="Guardian name">
                <input value={individualCandidateForm.guardianName} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, guardianName: event.target.value }))} className={inputClassName} placeholder="Guardian name" />
              </Field>
              <Field label="Email">
                <input type="email" value={individualCandidateForm.email} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, email: event.target.value }))} className={inputClassName} placeholder="candidate@example.com" />
              </Field>
              <Field label="Phone">
                <input value={individualCandidateForm.phone} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, phone: event.target.value }))} className={inputClassName} inputMode="numeric" placeholder="9876543210" required />
              </Field>
              <Field label="Country code">
                <input value={individualCandidateForm.countryCode} onChange={(event) => setIndividualCandidateForm((current) => ({ ...current, countryCode: event.target.value }))} className={inputClassName} inputMode="numeric" placeholder="91" />
              </Field>
              <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
                <button type="submit" disabled={isCreatingCandidate || !isIndividualCandidateReady} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {isCreatingCandidate ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Save candidate
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-emerald-50 p-2 text-emerald-600">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Bulk Upload</h2>
                <p className="text-sm text-slate-500">Upload the registration sheet, check the file, then save the valid rows into your candidate list.</p>
              </div>
            </div>

            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleImportUpload}>
              <Field label="Workbook">
                <input type="file" accept=".xlsx,.xls" onChange={(event) => setImportForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} className={`${inputClassName} py-2`} required />
              </Field>
              <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => void handleDownloadImportTemplate()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700">
                  <Download className="h-4 w-4" /> Download sample sheet
                </button>
                <button type="submit" disabled={isUploadingImport || !isImportReady} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {isUploadingImport ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Check file
                </button>
                {currentImportJob ? (
                  <button type="button" disabled={isCommittingImport || currentImportJob.status === "committed"} onClick={() => void handleCommitImport()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {isCommittingImport ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Save valid candidates
                  </button>
                ) : null}
              </div>
            </form>

            {currentImportJob ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">{currentImportJob.fileName}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <MiniStat label="Total" value={currentImportJob.totalRows} />
                  <MiniStat label="Valid" value={currentImportJob.validRows} />
                  <MiniStat label="Invalid" value={currentImportJob.invalidRows} />
                  <MiniStat label="Duplicate" value={currentImportJob.duplicateRows} />
                </div>
              </div>
            ) : null}

            <p className="mt-4 text-sm text-slate-500">
              Use the sample sheet to confirm the column layout before uploading your own file.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Import Row Review</h2>
                <p className="text-sm text-slate-500">Inspect row validation, duplicate checks, and the saved payload preview before you keep the valid rows.</p>
              </div>
              {currentImportJob ? (
                <div className="w-full sm:w-44">
                  <select value={importPagination.pageSize} onChange={(event) => setImportPagination((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))} className={inputClassName}>
                    {pageSizeOptions.map((size) => (
                      <option key={size} value={size}>{size} rows</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="mt-6 space-y-3">
              {importRows.length === 0 ? (
                <EmptyState message="Stage an import workbook to inspect row-level validation results." />
              ) : (
                importRows.map((row) => (
                  <div key={row.rowId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Row {row.rowNumber}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
                          <span>{row.status}</span>
                          {row.duplicateOfCandidateId ? <span>Duplicate of {row.duplicateOfCandidateId}</span> : null}
                          {row.candidateId ? <span>Candidate {row.candidateId}</span> : null}
                        </div>
                      </div>
                      <button type="button" onClick={() => setExpandedImportRowId((current) => (current === row.rowId ? null : row.rowId))} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                        <Eye className="h-3.5 w-3.5" /> {expandedImportRowId === row.rowId ? "Hide row details" : "Show row details"}
                      </button>
                    </div>
                    {row.errors.length > 0 ? (
                      <div className="mt-3 space-y-2 text-sm text-rose-700">
                        {row.errors.map((error, index) => (
                          <div key={`${row.rowId}-${index}`}>{error.field ? `${error.field}: ` : ""}{error.message}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-slate-600">Row is ready for commit.</div>
                    )}
                    {expandedImportRowId === row.rowId ? <JsonPanel className="mt-4" title="Row payload preview" value={row.normalized} /> : null}
                  </div>
                ))
              )}
            </div>
            {currentImportJob ? (
              <div className="mt-5">
                <PaginationControls page={importPagination.page} pageSize={importPagination.pageSize} total={importPagination.total} onPageChange={(page) => setImportPagination((current) => ({ ...current, page }))} />
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Skill India Queue</h2>
                <p className="text-sm text-slate-500">Review queued candidates, submit them to Skill India, retry failed submissions, and inspect the delivery history.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <select value={syncFilters.status} onChange={(event) => setSyncFilters((current) => ({ ...current, page: 1, status: event.target.value }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300">
                  <option value="">All sync statuses</option>
                  {syncJobStatusOptions.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <select value={syncFilters.pageSize} onChange={(event) => setSyncFilters((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300">
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>{size} rows</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Submit queued candidates</div>
                <div className="mt-1 text-sm text-slate-500">Run the background worker to send queued candidates and refresh their latest Skill India status.</div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <select value={processLimit} onChange={(event) => setProcessLimit(event.target.value)} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300">
                  {[1, 5, 10, 25].map((limit) => (
                    <option key={limit} value={limit}>{limit} jobs</option>
                  ))}
                </select>
                <button type="button" onClick={() => void handleProcessQueuedSyncJobs()} disabled={isProcessingSyncJobs} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {isProcessingSyncJobs ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Submit queued candidates
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-3">
                {syncJobs.length === 0 ? (
                  <EmptyState message={isLoading ? "Loading sync jobs..." : "No sync jobs match the current filters."} />
                ) : (
                  syncJobs.map((job) => (
                    <div key={job.syncJobId} className={`rounded-2xl border p-4 ${selectedSyncJobId === job.syncJobId ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{job.syncJobId}</div>
                          <div className="mt-1 text-sm text-slate-600">Candidate {job.candidateId}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>Retries {job.retryCount}</span>
                            {job.nextRunAt ? <span>Next run {formatDateTime(job.nextRunAt)}</span> : null}
                            {job.latestRemoteCandidateId ? <span>SIDH {job.latestRemoteCandidateId}</span> : null}
                          </div>
                        </div>
                        <StatusPill status={job.status} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void loadSyncJobDetails(job.syncJobId)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                          <Workflow className="h-3.5 w-3.5" /> View history
                        </button>
                        <button type="button" onClick={() => void handleRetrySyncJob(job.syncJobId)} disabled={job.status === "processing"} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                          <RotateCcw className="h-3.5 w-3.5" /> Requeue candidate
                        </button>
                      </div>
                    </div>
                  ))
                )}
                <PaginationControls page={syncPagination.page} pageSize={syncPagination.pageSize} total={syncPagination.total} onPageChange={(page) => setSyncFilters((current) => ({ ...current, page }))} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Sync job detail</div>
                    <div className="mt-1 text-sm text-slate-500">Attempts, transaction history, and the payload snapshot used by the worker</div>
                  </div>
                  {isLoadingSyncDetail ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /> : null}
                </div>

                {!selectedSyncJob ? (
                  <EmptyState message="Select a sync job to inspect attempts and SIDH transaction history." />
                ) : (
                  <div className="mt-5 space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{selectedSyncJob.syncJobId}</div>
                          <div className="mt-1 text-sm text-slate-600">Candidate {selectedSyncJob.candidateId}</div>
                        </div>
                        <StatusPill status={selectedSyncJob.status} />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <DetailMeta label="Created" value={formatDateTime(selectedSyncJob.createdAt)} />
                        <DetailMeta label="Updated" value={formatDateTime(selectedSyncJob.updatedAt)} />
                        <DetailMeta label="Retry count" value={String(selectedSyncJob.retryCount)} />
                        <DetailMeta label="Latest SIDH candidate" value={selectedSyncJob.latestRemoteCandidateId ?? "Not available"} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">Attempt history</div>
                      <div className="mt-4 space-y-3">
                        {selectedSyncJob.attempts.length === 0 ? (
                          <EmptyState message="No attempts have been recorded yet." />
                        ) : (
                          selectedSyncJob.attempts.map((attempt, index) => (
                            <div key={attempt.attemptId ?? `${selectedSyncJob.syncJobId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{attempt.attemptId ?? `Attempt ${index + 1}`}</div>
                                  <div className="mt-1 text-xs text-slate-500">Started {formatDateTime(attempt.startedAt)} • Finished {formatDateTime(attempt.finishedAt)}</div>
                                </div>
                                <StatusPill status={attempt.status ?? "processing"} />
                              </div>
                              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                <span>Response code: {attempt.responseCode ?? "Not available"}</span>
                                <span>Retryable: {attempt.retryable ? "Yes" : "No"}</span>
                                <span>Failure code: {attempt.failureCode ?? "Not available"}</span>
                                <span>Remote candidate: {attempt.remoteCandidateId ?? "Not available"}</span>
                              </div>
                              {attempt.failureMessage ? <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{attempt.failureMessage}</div> : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">Skill India transactions</div>
                      <div className="mt-4 space-y-3">
                        {(selectedSyncJob.transactions ?? []).length === 0 ? (
                          <EmptyState message="No SIDH transaction logs are available for this job yet." />
                        ) : (
                          (selectedSyncJob.transactions ?? []).map((transaction) => (
                            <div key={transaction.transactionId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{transaction.operation}</div>
                                  <div className="mt-1 text-xs text-slate-500">{transaction.endpoint} • {formatDateTime(transaction.createdAt)}</div>
                                </div>
                                <StatusPill status={transaction.success ? "succeeded" : "failed"} label={transaction.responseStatus ? `${transaction.responseStatus}` : transaction.success ? "ok" : "failed"} />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <JsonPanel title="Submitted payload" value={selectedSyncJob.payloadSnapshot} />
                  </div>
                )}
              </div>
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

function InlineField({ children, icon, label }: { children: React.ReactNode; icon?: React.ReactNode; label: string }) {
  return (
    <label className="block space-y-2">
      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center gap-2 text-sky-600">{icon}</div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{message}</div>;
}

function PaginationControls({ onPageChange, page, pageSize, total }: { onPageChange: (page: number) => void; page: number; pageSize: number; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-600">Page {page} of {totalPages} • {total} total records</div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StatusPill({ label, status }: { label?: string; status?: string | null }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusPillClass(status)}`}>{label ?? status ?? "unknown"}</span>;
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function JsonPanel({ className = "", title, value }: { className?: string; title: string; value: unknown }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`.trim()}>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs text-slate-100">{formatJson(value)}</pre>
    </div>
  );
}

const inputClassName = "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300";