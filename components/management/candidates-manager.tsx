"use client";

import { startTransition, useEffect, useState } from "react";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Upload,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError, type ApiEnvelope } from "@/lib/client/api";

type CandidatesManagerProps = {
  portal: "admin" | "training_partner";
};

type ProgramRecord = {
  name: string;
  programId: string;
};

type TrainingCenterRecord = {
  centerCode: string;
  centerId: string;
  centerName: string;
};

type CandidateReferenceData = {
  programs: ProgramRecord[];
  trainingCenters: TrainingCenterRecord[];
  enums: Record<string, Array<{ code: string; label: string }>>;
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

type CandidateFormState = {
  centerId: string;
  communicationAddress: AddressFormState & { sameAsPermanent: boolean };
  contactDetails: {
    countryCode: string;
    email: string;
    mobileNumber: string;
  };
  domicile: {
    district: string;
    state: string;
  };
  experience: {
    employmentDetails: string;
    employmentStatus: string;
    employed: string;
    heardAboutUs: string;
    monthsOfPreviousExperience: string;
    previousExperienceSector: string;
    trainingStatus: string;
  };
  identity: {
    aadhaarReferenceNo: string;
    idNumber: string;
    idType: string;
    typeOfAlternateId: string;
  };
  permanentAddress: AddressFormState;
  personalDetails: {
    category: string;
    dateOfBirth: string;
    disability: boolean;
    educationLevel: string;
    fathersName: string;
    fullName: string;
    gender: string;
    guardiansName: string;
    maritalStatus: string;
    mothersName: string;
    religion: string;
    salutation: string;
    typeOfDisability: string;
  };
  programId: string;
  registrationMode: "internal_registration" | "existing_sidh_link";
};

type LinkFormState = {
  centerId: string;
  dateOfBirth: string;
  fullName: string;
  mobileNumber: string;
  programId: string;
  sidhCandidateId: string;
};

type ImportFormState = {
  centerId: string;
  file: File | null;
  programId: string;
  registrationMode: "internal_registration" | "existing_sidh_link";
};

type CandidateFilters = {
  centerId: string;
  page: number;
  pageSize: number;
  programId: string;
  registrationMode: string;
  search: string;
  syncStatus: string;
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

const portalContent = {
  admin: {
    description:
      "Create, review, import, and queue candidate registration records through internal APIs, then drive the server-side SIDH worker from the operations screen.",
    heading: "Candidate Operations",
  },
  training_partner: {
    description:
      "Work inside your scoped center assignments for candidate intake, row review, queue monitoring, and controlled SIDH sync processing.",
    heading: "Scoped Candidate Operations",
  },
} as const;

const candidateSyncStatusOptions = ["not_queued", "queued", "processing", "synced", "failed", "manual_review", "linked"];
const syncJobStatusOptions = ["queued", "processing", "succeeded", "failed", "manual_review", "dead_letter"];
const pageSizeOptions = [12, 24, 48];

const emptyAddress: AddressFormState = {
  address: "",
  city: "",
  constituency: "",
  district: "",
  pinCode: "",
  state: "",
  tehsil: "",
};

const emptyCandidateForm: CandidateFormState = {
  centerId: "",
  communicationAddress: {
    ...emptyAddress,
    sameAsPermanent: true,
  },
  contactDetails: {
    countryCode: "91",
    email: "",
    mobileNumber: "",
  },
  domicile: {
    district: "",
    state: "",
  },
  experience: {
    employmentDetails: "",
    employmentStatus: "",
    employed: "",
    heardAboutUs: "",
    monthsOfPreviousExperience: "",
    previousExperienceSector: "",
    trainingStatus: "Fresher",
  },
  identity: {
    aadhaarReferenceNo: "",
    idNumber: "",
    idType: "Alternate ID",
    typeOfAlternateId: "Voter ID Card",
  },
  permanentAddress: emptyAddress,
  personalDetails: {
    category: "",
    dateOfBirth: "",
    disability: false,
    educationLevel: "",
    fathersName: "",
    fullName: "",
    gender: "Male",
    guardiansName: "",
    maritalStatus: "",
    mothersName: "",
    religion: "",
    salutation: "Mr",
    typeOfDisability: "",
  },
  programId: "",
  registrationMode: "internal_registration",
};

const emptyLinkForm: LinkFormState = {
  centerId: "",
  dateOfBirth: "",
  fullName: "",
  mobileNumber: "",
  programId: "",
  sidhCandidateId: "",
};

const emptyImportForm: ImportFormState = {
  centerId: "",
  file: null,
  programId: "",
  registrationMode: "internal_registration",
};

const initialCandidateFilters: CandidateFilters = {
  centerId: "",
  page: 1,
  pageSize: 12,
  programId: "",
  registrationMode: "",
  search: "",
  syncStatus: "",
};

const initialSyncFilters: SyncFilters = {
  page: 1,
  pageSize: 12,
  status: "",
};

const candidateImportTemplateRows = [
  {
    Salutation: "Mr",
    FullName: "Import Valid Candidate QA",
    Gender: "Male",
    DateofBirth: "10/06/2005",
    MaritalStatus: "Single/Unmarried",
    FathersName: "Import Parent QA",
    MothersName: "",
    GuardianName: "",
    Religion: "Hinduism",
    Category: "General",
    Disability: "No",
    TypeofDisability: "",
    EducationLevel: "12th Pass",
    EmailID: "import.valid.qa@example.com",
    CountryCode: "91",
    MobileNo: "9876543212",
    IDType: "Alternate ID",
    TypeofAlternateID: "Voter ID Card",
    AdharReferenceNo: "",
    IDNo: "IMPV12345",
    DomicileState: "Odisha",
    DomicileDistrict: "Khordha",
    PermanentAddressAddress: "Import Plot 1",
    PermanentAddressState: "Odisha",
    PermanentAddressDistrict: "Khordha",
    PermanentAddressPINCode: "751001",
    PermanentAddressCity: "Bhubaneswar",
    PermanentAddressTehsil: "Bhubaneswar",
    PermanentAddressConstituency: "Bhubaneswar Central",
    CommunicationSameasPermanentAddress: "Yes",
    CommunicationAddressAddress: "",
    CommunicationAddressState: "",
    CommunicationAddressDistrict: "",
    CommunicationAddressPINCode: "",
    CommunicationAddressCity: "",
    CommunicationAddressTehsil: "",
    CommunicationAddressConstituency: "",
    TrainingStatus: "Fresher",
    PreviousExperienceSector: "",
    Noofmonthsofpreviousexperience: "",
    Employed: "",
    EmploymentStatus: "",
    EmploymentDetails: "",
    HeardAboutUs: "Training Provider",
  },
  {
    Salutation: "Ms",
    FullName: "Import Invalid Candidate QA",
    Gender: "Female",
    DateofBirth: "12/07/2005",
    MaritalStatus: "Single/Unmarried",
    FathersName: "Import Parent QA",
    MothersName: "",
    GuardianName: "",
    Religion: "Hinduism",
    Category: "General",
    Disability: "No",
    TypeofDisability: "",
    EducationLevel: "12th Pass",
    EmailID: "import.invalid.qa@example.com",
    CountryCode: "91",
    MobileNo: "",
    IDType: "Alternate ID",
    TypeofAlternateID: "Voter ID Card",
    AdharReferenceNo: "",
    IDNo: "IMPV12346",
    DomicileState: "Odisha",
    DomicileDistrict: "Khordha",
    PermanentAddressAddress: "Import Plot 2",
    PermanentAddressState: "Odisha",
    PermanentAddressDistrict: "Khordha",
    PermanentAddressPINCode: "751001",
    PermanentAddressCity: "Bhubaneswar",
    PermanentAddressTehsil: "Bhubaneswar",
    PermanentAddressConstituency: "Bhubaneswar Central",
    CommunicationSameasPermanentAddress: "Yes",
    CommunicationAddressAddress: "",
    CommunicationAddressState: "",
    CommunicationAddressDistrict: "",
    CommunicationAddressPINCode: "",
    CommunicationAddressCity: "",
    CommunicationAddressTehsil: "",
    CommunicationAddressConstituency: "",
    TrainingStatus: "Fresher",
    PreviousExperienceSector: "",
    Noofmonthsofpreviousexperience: "",
    Employed: "",
    EmploymentStatus: "",
    EmploymentDetails: "",
    HeardAboutUs: "Training Provider",
  },
  {
    Salutation: "Mr",
    FullName: "Import Valid Candidate QA",
    Gender: "Male",
    DateofBirth: "10/06/2005",
    MaritalStatus: "Single/Unmarried",
    FathersName: "Import Parent QA",
    MothersName: "",
    GuardianName: "",
    Religion: "Hinduism",
    Category: "General",
    Disability: "No",
    TypeofDisability: "",
    EducationLevel: "12th Pass",
    EmailID: "import.duplicate.qa@example.com",
    CountryCode: "91",
    MobileNo: "9876543212",
    IDType: "Alternate ID",
    TypeofAlternateID: "Voter ID Card",
    AdharReferenceNo: "",
    IDNo: "IMPV12345",
    DomicileState: "Odisha",
    DomicileDistrict: "Khordha",
    PermanentAddressAddress: "Import Plot 1",
    PermanentAddressState: "Odisha",
    PermanentAddressDistrict: "Khordha",
    PermanentAddressPINCode: "751001",
    PermanentAddressCity: "Bhubaneswar",
    PermanentAddressTehsil: "Bhubaneswar",
    PermanentAddressConstituency: "Bhubaneswar Central",
    CommunicationSameasPermanentAddress: "Yes",
    CommunicationAddressAddress: "",
    CommunicationAddressState: "",
    CommunicationAddressDistrict: "",
    CommunicationAddressPINCode: "",
    CommunicationAddressCity: "",
    CommunicationAddressTehsil: "",
    CommunicationAddressConstituency: "",
    TrainingStatus: "Fresher",
    PreviousExperienceSector: "",
    Noofmonthsofpreviousexperience: "",
    Employed: "",
    EmploymentStatus: "",
    EmploymentDetails: "",
    HeardAboutUs: "Training Provider",
  },
] as const;

const candidateImportTemplateInstructions = [
  { Note: "Use the Candidates screen to choose Program, Training Center, and Registration mode before uploading." },
  { Note: "Sheet 'Candidate Import Template' contains three sample rows: valid, invalid, and duplicate." },
  { Note: "Keep the header names unchanged. The backend normalizes these headers during import parsing." },
  { Note: "DateofBirth values in this sample use dd/mm/yyyy to match the existing QA flow." },
  { Note: "Existing SIDH link imports still use the same workbook columns; Registration mode is selected in the UI, not per row." },
] as const;

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

function candidateToForm(candidate: CandidateRecord): CandidateFormState {
  return {
    centerId: candidate.centerId,
    communicationAddress: {
      ...emptyAddress,
      ...candidate.communicationAddress,
      sameAsPermanent: candidate.communicationAddress.sameAsPermanent,
    },
    contactDetails: {
      countryCode: "91",
      email: candidate.contactDetails.email ?? "",
      mobileNumber: candidate.contactDetails.mobileNumber,
    },
    domicile: {
      district: candidate.domicile.district ?? "",
      state: candidate.domicile.state ?? "",
    },
    experience: {
      employmentDetails: candidate.experience.employmentDetails ?? "",
      employmentStatus: candidate.experience.employmentStatus ?? "",
      employed: candidate.experience.employed ?? "",
      heardAboutUs: candidate.experience.heardAboutUs ?? "",
      monthsOfPreviousExperience: candidate.experience.monthsOfPreviousExperience?.toString() ?? "",
      previousExperienceSector: candidate.experience.previousExperienceSector ?? "",
      trainingStatus: candidate.experience.trainingStatus ?? "Fresher",
    },
    identity: {
      aadhaarReferenceNo: "",
      idNumber: candidate.identity.idNumber ?? "",
      idType: candidate.identity.idType,
      typeOfAlternateId: candidate.identity.typeOfAlternateId ?? "",
    },
    permanentAddress: {
      ...emptyAddress,
      ...candidate.permanentAddress,
    },
    personalDetails: {
      category: candidate.personalDetails.category ?? "",
      dateOfBirth: candidate.personalDetails.dateOfBirth ?? "",
      disability: candidate.personalDetails.disability,
      educationLevel: candidate.personalDetails.educationLevel ?? "",
      fathersName: candidate.personalDetails.fathersName ?? "",
      fullName: candidate.personalDetails.fullName,
      gender: candidate.personalDetails.gender ?? "Male",
      guardiansName: candidate.personalDetails.guardiansName ?? "",
      maritalStatus: candidate.personalDetails.maritalStatus ?? "",
      mothersName: candidate.personalDetails.mothersName ?? "",
      religion: candidate.personalDetails.religion ?? "",
      salutation: candidate.personalDetails.salutation ?? "Mr",
      typeOfDisability: candidate.personalDetails.typeOfDisability ?? "",
    },
    programId: candidate.programId,
    registrationMode: candidate.registrationMode,
  };
}

function buildCandidatePayload(form: CandidateFormState) {
  return {
    centerId: form.centerId,
    communicationAddress: form.communicationAddress.sameAsPermanent ? { sameAsPermanent: true } : form.communicationAddress,
    contactDetails: form.contactDetails,
    domicile: form.domicile,
    experience: {
      ...form.experience,
      monthsOfPreviousExperience: form.experience.monthsOfPreviousExperience
        ? Number(form.experience.monthsOfPreviousExperience)
        : null,
    },
    identity: form.identity,
    permanentAddress: form.permanentAddress,
    personalDetails: form.personalDetails,
    programId: form.programId,
    registrationMode: form.registrationMode,
  };
}

async function uploadCandidateImport(form: ImportFormState) {
  if (!form.file) {
    throw createApiError("Choose an Excel file before uploading");
  }

  const body = new FormData();
  body.set("file", form.file);
  body.set("programId", form.programId);
  body.set("centerId", form.centerId);
  body.set("registrationMode", form.registrationMode);

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

async function fetchReferenceData() {
  return apiFetch<CandidateReferenceData>("/api/v1/reference-data/candidate");
}

async function fetchCandidates(filters: CandidateFilters) {
  const query = buildQueryString({
    centerId: filters.centerId || undefined,
    page: filters.page,
    pageSize: filters.pageSize,
    programId: filters.programId || undefined,
    registrationMode: filters.registrationMode || undefined,
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

export default function CandidatesManager({ portal }: CandidatesManagerProps) {
  const [referenceData, setReferenceData] = useState<CandidateReferenceData | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [candidateFilters, setCandidateFilters] = useState(initialCandidateFilters);
  const [candidatePagination, setCandidatePagination] = useState({ page: 1, pageSize: 12, total: 0 });
  const [syncJobs, setSyncJobs] = useState<SyncJobRecord[]>([]);
  const [syncFilters, setSyncFilters] = useState(initialSyncFilters);
  const [syncPagination, setSyncPagination] = useState({ page: 1, pageSize: 12, total: 0 });
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidateForm, setCandidateForm] = useState(emptyCandidateForm);
  const [linkForm, setLinkForm] = useState(emptyLinkForm);
  const [importForm, setImportForm] = useState(emptyImportForm);
  const [currentImportJob, setCurrentImportJob] = useState<ImportJobRecord | null>(null);
  const [importRows, setImportRows] = useState<ImportRowRecord[]>([]);
  const [importPagination, setImportPagination] = useState({ page: 1, pageSize: 12, total: 0 });
  const [expandedImportRowId, setExpandedImportRowId] = useState<string | null>(null);
  const [selectedSyncJobId, setSelectedSyncJobId] = useState<string | null>(null);
  const [selectedSyncJob, setSelectedSyncJob] = useState<SyncJobRecord | null>(null);
  const [processLimit, setProcessLimit] = useState("5");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSyncDetail, setIsLoadingSyncDetail] = useState(false);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isUploadingImport, setIsUploadingImport] = useState(false);
  const [isCommittingImport, setIsCommittingImport] = useState(false);
  const [isProcessingSyncJobs, setIsProcessingSyncJobs] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const content = portalContent[portal];
  const selectedCandidate = candidates.find((candidate) => candidate.candidateId === selectedCandidateId) ?? null;
  const queuedJobs = syncJobs.filter((job) => job.status === "queued" || job.status === "processing").length;
  const flaggedJobs = syncJobs.filter((job) => job.status === "failed" || job.status === "manual_review" || job.status === "dead_letter").length;
  const isImportReady = Boolean(importForm.programId && importForm.centerId && importForm.file);

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
        const [candidateReference, candidateData, syncJobData] = await Promise.all([
          fetchReferenceData(),
          fetchCandidates(initialCandidateFilters),
          fetchSyncJobs(initialSyncFilters),
        ]);

        if (!isMounted) {
          return;
        }

        setReferenceData(candidateReference);
        setCandidates(candidateData.items);
        setCandidatePagination({ page: candidateData.page, pageSize: candidateData.pageSize, total: candidateData.total });
        setSyncJobs(syncJobData.items);
        setSyncPagination({ page: syncJobData.page, pageSize: syncJobData.pageSize, total: syncJobData.total });

        if (candidateReference.programs[0]) {
          setCandidateForm((current) => (current.programId ? current : { ...current, programId: candidateReference.programs[0].programId }));
          setLinkForm((current) => (current.programId ? current : { ...current, programId: candidateReference.programs[0].programId }));
          setImportForm((current) => (current.programId ? current : { ...current, programId: candidateReference.programs[0].programId }));
        }

        if (candidateReference.trainingCenters[0]) {
          setCandidateForm((current) => (current.centerId ? current : { ...current, centerId: candidateReference.trainingCenters[0].centerId }));
          setLinkForm((current) => (current.centerId ? current : { ...current, centerId: candidateReference.trainingCenters[0].centerId }));
          setImportForm((current) => (current.centerId ? current : { ...current, centerId: candidateReference.trainingCenters[0].centerId }));
        }
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
      if (!referenceData) {
        return;
      }

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
  }, [referenceData, candidateFilters, syncFilters]);

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

  function clearCandidateForm() {
    setSelectedCandidateId(null);
    setCandidateForm((current) => ({
      ...emptyCandidateForm,
      centerId: current.centerId,
      programId: current.programId,
    }));
  }

  async function handleCandidateSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingCandidate(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = buildCandidatePayload(candidateForm);

      if (selectedCandidate) {
        await apiFetch<CandidateRecord>(`/api/v1/candidates/${selectedCandidate.candidateId}`, {
          body: JSON.stringify(payload),
          method: "PATCH",
        });
      } else {
        await apiFetch<CandidateRecord>("/api/v1/candidates", {
          body: JSON.stringify(payload),
          method: "POST",
        });
      }

      clearCandidateForm();
      setSuccessMessage(selectedCandidate ? "Candidate updated successfully" : "Candidate created successfully");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to save candidate");
    } finally {
      setIsSavingCandidate(false);
    }
  }

  async function handleLinkExisting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingLink(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch<CandidateRecord>("/api/v1/candidates/link-existing-sidh", {
        body: JSON.stringify(linkForm),
        method: "POST",
      });

      setLinkForm((current) => ({ ...emptyLinkForm, centerId: current.centerId, programId: current.programId }));
      setSuccessMessage("Existing SIDH candidate linked successfully");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to link existing SIDH candidate");
    } finally {
      setIsSavingLink(false);
    }
  }

  async function handleImportUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploadingImport(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (!importForm.programId) {
        throw createApiError("Select a program before staging the import");
      }

      if (!importForm.centerId) {
        throw createApiError("Select a training center before staging the import");
      }

      if (!importForm.file) {
        throw createApiError("Choose an Excel workbook before staging the import");
      }

      const importJob = await uploadCandidateImport(importForm);
      setCurrentImportJob(importJob);
      setImportPagination((current) => ({ ...current, page: 1 }));
      setExpandedImportRowId(null);
      setSuccessMessage("Candidate import staged successfully");
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to stage candidate import");
    } finally {
      setIsUploadingImport(false);
    }
  }

  async function handleDownloadImportTemplate() {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const templateSheet = XLSX.utils.json_to_sheet([...candidateImportTemplateRows]);
      const instructionsSheet = XLSX.utils.json_to_sheet([...candidateImportTemplateInstructions]);

      XLSX.utils.book_append_sheet(workbook, templateSheet, "Candidate Import Template");
      XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");
      XLSX.writeFileXLSX(workbook, "nsdc-candidate-import-template.xlsx");

      setSuccessMessage("Sample candidate import workbook downloaded successfully");
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
      setSuccessMessage("Candidate import committed and sync jobs queued for valid rows");
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
      setSuccessMessage("Candidate sync queued successfully");
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to queue candidate sync");
    }
  }

  async function handleRetrySyncJob(syncJobId: string) {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch<SyncJobRecord>(`/api/v1/sync/jobs/${syncJobId}/retry`, {
        method: "POST",
      });
      setSuccessMessage("Sync job re-queued successfully");
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
          ? "No queued sync jobs were ready to process"
          : `Processed ${result.processedCount} jobs: ${result.succeededCount} succeeded, ${result.retryScheduledCount} re-queued, ${result.manualReviewCount} manual review, ${result.deadLetterCount} dead letter`,
      );
      await refreshVisibleData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to process queued sync jobs");
    } finally {
      setIsProcessingSyncJobs(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Sprint 03</p>
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
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selectedCandidate ? "Edit Candidate" : "Create Candidate"}</h2>
              <p className="text-sm text-slate-500">Backed by GET, POST, PATCH, and queue-sync endpoints under /api/v1/candidates</p>
            </div>
          </div>

          <form className="mt-6 space-y-6" onSubmit={handleCandidateSave}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Program">
                <select value={candidateForm.programId} onChange={(event) => setCandidateForm((current) => ({ ...current, programId: event.target.value }))} className={inputClassName}>
                  <option value="">Select program</option>
                  {(referenceData?.programs ?? []).map((program) => (
                    <option key={program.programId} value={program.programId}>{program.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Training center">
                <select value={candidateForm.centerId} onChange={(event) => setCandidateForm((current) => ({ ...current, centerId: event.target.value }))} className={inputClassName}>
                  <option value="">Select center</option>
                  {(referenceData?.trainingCenters ?? []).map((center) => (
                    <option key={center.centerId} value={center.centerId}>{center.centerName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Full name">
                <input value={candidateForm.personalDetails.fullName} onChange={(event) => setCandidateForm((current) => ({ ...current, personalDetails: { ...current.personalDetails, fullName: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Date of birth">
                <input type="date" value={candidateForm.personalDetails.dateOfBirth} onChange={(event) => setCandidateForm((current) => ({ ...current, personalDetails: { ...current.personalDetails, dateOfBirth: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Gender">
                <select value={candidateForm.personalDetails.gender} onChange={(event) => setCandidateForm((current) => ({ ...current, personalDetails: { ...current.personalDetails, gender: event.target.value } }))} className={inputClassName}>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="Mobile number">
                <input value={candidateForm.contactDetails.mobileNumber} onChange={(event) => setCandidateForm((current) => ({ ...current, contactDetails: { ...current.contactDetails, mobileNumber: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Father name">
                <input value={candidateForm.personalDetails.fathersName} onChange={(event) => setCandidateForm((current) => ({ ...current, personalDetails: { ...current.personalDetails, fathersName: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Guardian name">
                <input value={candidateForm.personalDetails.guardiansName} onChange={(event) => setCandidateForm((current) => ({ ...current, personalDetails: { ...current.personalDetails, guardiansName: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Email">
                <input value={candidateForm.contactDetails.email} onChange={(event) => setCandidateForm((current) => ({ ...current, contactDetails: { ...current.contactDetails, email: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="ID type">
                <input value={candidateForm.identity.idType} onChange={(event) => setCandidateForm((current) => ({ ...current, identity: { ...current.identity, idType: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="ID number">
                <input value={candidateForm.identity.idNumber} onChange={(event) => setCandidateForm((current) => ({ ...current, identity: { ...current.identity, idNumber: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Alternate ID type">
                <input value={candidateForm.identity.typeOfAlternateId} onChange={(event) => setCandidateForm((current) => ({ ...current, identity: { ...current.identity, typeOfAlternateId: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Permanent address">
                <input value={candidateForm.permanentAddress.address} onChange={(event) => setCandidateForm((current) => ({ ...current, permanentAddress: { ...current.permanentAddress, address: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Permanent district">
                <input value={candidateForm.permanentAddress.district} onChange={(event) => setCandidateForm((current) => ({ ...current, permanentAddress: { ...current.permanentAddress, district: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Permanent state">
                <input value={candidateForm.permanentAddress.state} onChange={(event) => setCandidateForm((current) => ({ ...current, permanentAddress: { ...current.permanentAddress, state: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Permanent PIN code">
                <input value={candidateForm.permanentAddress.pinCode} onChange={(event) => setCandidateForm((current) => ({ ...current, permanentAddress: { ...current.permanentAddress, pinCode: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Permanent city">
                <input value={candidateForm.permanentAddress.city} onChange={(event) => setCandidateForm((current) => ({ ...current, permanentAddress: { ...current.permanentAddress, city: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Permanent tehsil">
                <input value={candidateForm.permanentAddress.tehsil} onChange={(event) => setCandidateForm((current) => ({ ...current, permanentAddress: { ...current.permanentAddress, tehsil: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Permanent constituency">
                <input value={candidateForm.permanentAddress.constituency} onChange={(event) => setCandidateForm((current) => ({ ...current, permanentAddress: { ...current.permanentAddress, constituency: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Communication same as permanent">
                <select value={candidateForm.communicationAddress.sameAsPermanent ? "yes" : "no"} onChange={(event) => setCandidateForm((current) => ({ ...current, communicationAddress: { ...current.communicationAddress, sameAsPermanent: event.target.value === "yes" } }))} className={inputClassName}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              {!candidateForm.communicationAddress.sameAsPermanent ? (
                <>
                  <Field label="Communication address">
                    <input value={candidateForm.communicationAddress.address} onChange={(event) => setCandidateForm((current) => ({ ...current, communicationAddress: { ...current.communicationAddress, address: event.target.value } }))} className={inputClassName} />
                  </Field>
                  <Field label="Communication district">
                    <input value={candidateForm.communicationAddress.district} onChange={(event) => setCandidateForm((current) => ({ ...current, communicationAddress: { ...current.communicationAddress, district: event.target.value } }))} className={inputClassName} />
                  </Field>
                  <Field label="Communication state">
                    <input value={candidateForm.communicationAddress.state} onChange={(event) => setCandidateForm((current) => ({ ...current, communicationAddress: { ...current.communicationAddress, state: event.target.value } }))} className={inputClassName} />
                  </Field>
                  <Field label="Communication PIN code">
                    <input value={candidateForm.communicationAddress.pinCode} onChange={(event) => setCandidateForm((current) => ({ ...current, communicationAddress: { ...current.communicationAddress, pinCode: event.target.value } }))} className={inputClassName} />
                  </Field>
                  <Field label="Communication city">
                    <input value={candidateForm.communicationAddress.city} onChange={(event) => setCandidateForm((current) => ({ ...current, communicationAddress: { ...current.communicationAddress, city: event.target.value } }))} className={inputClassName} />
                  </Field>
                  <Field label="Communication tehsil">
                    <input value={candidateForm.communicationAddress.tehsil} onChange={(event) => setCandidateForm((current) => ({ ...current, communicationAddress: { ...current.communicationAddress, tehsil: event.target.value } }))} className={inputClassName} />
                  </Field>
                  <Field label="Communication constituency">
                    <input value={candidateForm.communicationAddress.constituency} onChange={(event) => setCandidateForm((current) => ({ ...current, communicationAddress: { ...current.communicationAddress, constituency: event.target.value } }))} className={inputClassName} />
                  </Field>
                </>
              ) : null}
              <Field label="Domicile state">
                <input value={candidateForm.domicile.state} onChange={(event) => setCandidateForm((current) => ({ ...current, domicile: { ...current.domicile, state: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Domicile district">
                <input value={candidateForm.domicile.district} onChange={(event) => setCandidateForm((current) => ({ ...current, domicile: { ...current.domicile, district: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Training status">
                <select value={candidateForm.experience.trainingStatus} onChange={(event) => setCandidateForm((current) => ({ ...current, experience: { ...current.experience, trainingStatus: event.target.value } }))} className={inputClassName}>
                  <option>Fresher</option>
                  <option>Experienced</option>
                </select>
              </Field>
              <Field label="Previous experience sector">
                <input value={candidateForm.experience.previousExperienceSector} onChange={(event) => setCandidateForm((current) => ({ ...current, experience: { ...current.experience, previousExperienceSector: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Months of previous experience">
                <input value={candidateForm.experience.monthsOfPreviousExperience} onChange={(event) => setCandidateForm((current) => ({ ...current, experience: { ...current.experience, monthsOfPreviousExperience: event.target.value } }))} className={inputClassName} />
              </Field>
              <Field label="Heard about us">
                <input value={candidateForm.experience.heardAboutUs} onChange={(event) => setCandidateForm((current) => ({ ...current, experience: { ...current.experience, heardAboutUs: event.target.value } }))} className={inputClassName} />
              </Field>
            </div>

            <FormActions clearLabel="Clear form" isSaving={isSavingCandidate} onClear={clearCandidateForm} submitLabel={selectedCandidate ? "Save candidate" : "Create candidate"} />
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Candidate list</h2>
              <p className="text-sm text-slate-500">Search, filter, and page through candidate records in your visible scope</p>
            </div>
            {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /> : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <InlineField icon={<Search className="h-4 w-4" />} label="Search">
              <input value={candidateFilters.search} onChange={(event) => setCandidateFilters((current) => ({ ...current, page: 1, search: event.target.value }))} className={inputClassName} placeholder="Name, mobile, SIDH ID, or candidate ID" />
            </InlineField>
            <InlineField icon={<Filter className="h-4 w-4" />} label="Registration mode">
              <select value={candidateFilters.registrationMode} onChange={(event) => setCandidateFilters((current) => ({ ...current, page: 1, registrationMode: event.target.value }))} className={inputClassName}>
                <option value="">All modes</option>
                <option value="internal_registration">Internal registration</option>
                <option value="existing_sidh_link">Existing SIDH link</option>
              </select>
            </InlineField>
            <InlineField label="Program">
              <select value={candidateFilters.programId} onChange={(event) => setCandidateFilters((current) => ({ ...current, page: 1, programId: event.target.value }))} className={inputClassName}>
                <option value="">All programs</option>
                {(referenceData?.programs ?? []).map((program) => (
                  <option key={program.programId} value={program.programId}>{program.name}</option>
                ))}
              </select>
            </InlineField>
            <InlineField label="Center">
              <select value={candidateFilters.centerId} onChange={(event) => setCandidateFilters((current) => ({ ...current, page: 1, centerId: event.target.value }))} className={inputClassName}>
                <option value="">All centers</option>
                {(referenceData?.trainingCenters ?? []).map((center) => (
                  <option key={center.centerId} value={center.centerId}>{center.centerName}</option>
                ))}
              </select>
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

          <div className="mt-6 space-y-3">
            {candidates.length === 0 ? (
              <EmptyState message={isLoading ? "Loading candidate records..." : "No candidates match the current filters."} />
            ) : (
              candidates.map((candidate) => (
                <div key={candidate.candidateId} className={`rounded-2xl border p-4 ${selectedCandidateId === candidate.candidateId ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => {
                        setSelectedCandidateId(candidate.candidateId);
                        setCandidateForm(candidateToForm(candidate));
                      }}
                    >
                      <div className="text-sm font-semibold text-slate-900">{candidate.personalDetails.fullName}</div>
                      <div className="mt-1 text-sm text-slate-600">{candidate.contactDetails.mobileNumber} • {candidate.programId}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>Center {candidate.centerId}</span>
                        <span>Mode {candidate.registrationMode}</span>
                        {candidate.sidhCandidateId ? <span>SIDH {candidate.sidhCandidateId}</span> : null}
                      </div>
                    </button>
                    <StatusPill status={candidate.syncState?.status ?? "not_queued"} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleQueueSync(candidate.candidateId)} disabled={candidate.registrationMode === "existing_sidh_link"} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <Send className="h-3.5 w-3.5" /> Queue sync
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
              <span className="rounded-2xl bg-amber-50 p-2 text-amber-600">
                <Link2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Link Existing SIDH Candidate</h2>
                <p className="text-sm text-slate-500">Backed by POST /api/v1/candidates/link-existing-sidh</p>
              </div>
            </div>

            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleLinkExisting}>
              <Field label="Program">
                <select value={linkForm.programId} onChange={(event) => setLinkForm((current) => ({ ...current, programId: event.target.value }))} className={inputClassName}>
                  <option value="">Select program</option>
                  {(referenceData?.programs ?? []).map((program) => (
                    <option key={program.programId} value={program.programId}>{program.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Training center">
                <select value={linkForm.centerId} onChange={(event) => setLinkForm((current) => ({ ...current, centerId: event.target.value }))} className={inputClassName}>
                  <option value="">Select center</option>
                  {(referenceData?.trainingCenters ?? []).map((center) => (
                    <option key={center.centerId} value={center.centerId}>{center.centerName}</option>
                  ))}
                </select>
              </Field>
              <Field label="SIDH candidate ID">
                <input value={linkForm.sidhCandidateId} onChange={(event) => setLinkForm((current) => ({ ...current, sidhCandidateId: event.target.value }))} className={inputClassName} />
              </Field>
              <Field label="Mobile number">
                <input value={linkForm.mobileNumber} onChange={(event) => setLinkForm((current) => ({ ...current, mobileNumber: event.target.value }))} className={inputClassName} />
              </Field>
              <Field label="Full name">
                <input value={linkForm.fullName} onChange={(event) => setLinkForm((current) => ({ ...current, fullName: event.target.value }))} className={inputClassName} />
              </Field>
              <Field label="Date of birth">
                <input type="date" value={linkForm.dateOfBirth} onChange={(event) => setLinkForm((current) => ({ ...current, dateOfBirth: event.target.value }))} className={inputClassName} />
              </Field>
              <div className="md:col-span-2">
                <FormActions clearLabel="Clear link form" isSaving={isSavingLink} onClear={() => setLinkForm((current) => ({ ...emptyLinkForm, programId: current.programId, centerId: current.centerId }))} submitLabel="Link candidate" />
              </div>
            </form>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-emerald-50 p-2 text-emerald-600">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Bulk Import Staging</h2>
                <p className="text-sm text-slate-500">Upload first, review row status, then commit valid rows</p>
              </div>
            </div>

            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleImportUpload}>
              <Field label="Program">
                <select value={importForm.programId} onChange={(event) => setImportForm((current) => ({ ...current, programId: event.target.value }))} className={inputClassName} required>
                  <option value="">Select program</option>
                  {(referenceData?.programs ?? []).map((program) => (
                    <option key={program.programId} value={program.programId}>{program.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Training center">
                <select value={importForm.centerId} onChange={(event) => setImportForm((current) => ({ ...current, centerId: event.target.value }))} className={inputClassName} required>
                  <option value="">Select center</option>
                  {(referenceData?.trainingCenters ?? []).map((center) => (
                    <option key={center.centerId} value={center.centerId}>{center.centerName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Registration mode">
                <select value={importForm.registrationMode} onChange={(event) => setImportForm((current) => ({ ...current, registrationMode: event.target.value as ImportFormState["registrationMode"] }))} className={inputClassName}>
                  <option value="internal_registration">Internal registration</option>
                  <option value="existing_sidh_link">Existing SIDH link</option>
                </select>
              </Field>
              <Field label="Workbook">
                <input type="file" accept=".xlsx,.xls" onChange={(event) => setImportForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} className={`${inputClassName} py-2`} required />
              </Field>
              <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => void handleDownloadImportTemplate()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700">
                  <Download className="h-4 w-4" /> Download sample workbook
                </button>
                <button type="submit" disabled={isUploadingImport || !isImportReady} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {isUploadingImport ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Stage import
                </button>
                {currentImportJob ? (
                  <button type="button" disabled={isCommittingImport || currentImportJob.status === "committed"} onClick={() => void handleCommitImport()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {isCommittingImport ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Commit valid rows
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
              Use the sample workbook to download the expected column layout with valid, invalid, and duplicate example rows before uploading your own file.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Import Row Review</h2>
                <p className="text-sm text-slate-500">Inspect row-level validation, duplicate signals, and the normalized payload ready for commit</p>
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
                        <Eye className="h-3.5 w-3.5" /> {expandedImportRowId === row.rowId ? "Hide row payload" : "Show row payload"}
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
                    {expandedImportRowId === row.rowId ? <JsonPanel className="mt-4" title="Normalized row payload" value={row.normalized} /> : null}
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
                <h2 className="text-lg font-semibold text-slate-900">Sync Queue</h2>
                <p className="text-sm text-slate-500">Filter queue state, process queued jobs, retry individual jobs, and inspect attempts plus transaction history</p>
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
                <div className="text-sm font-semibold text-slate-900">Process queued sync jobs</div>
                <div className="mt-1 text-sm text-slate-500">Server-side worker execution: POST /api/v1/sync/jobs/process</div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <select value={processLimit} onChange={(event) => setProcessLimit(event.target.value)} className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300">
                  {[1, 5, 10, 25].map((limit) => (
                    <option key={limit} value={limit}>{limit} jobs</option>
                  ))}
                </select>
                <button type="button" onClick={() => void handleProcessQueuedSyncJobs()} disabled={isProcessingSyncJobs} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {isProcessingSyncJobs ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Process queued jobs
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
                          <Workflow className="h-3.5 w-3.5" /> Inspect history
                        </button>
                        <button type="button" onClick={() => void handleRetrySyncJob(job.syncJobId)} disabled={job.status === "processing"} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                          <RotateCcw className="h-3.5 w-3.5" /> Retry job
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
                      <div className="text-sm font-semibold text-slate-900">SIDH transactions</div>
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

                    <JsonPanel title="Payload snapshot" value={selectedSyncJob.payloadSnapshot} />
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

function FormActions({ clearLabel, isSaving, onClear, submitLabel }: { clearLabel: string; isSaving: boolean; onClear: () => void; submitLabel: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button type="submit" disabled={isSaving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
        {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {submitLabel}
      </button>
      <button type="button" onClick={onClear} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600">
        {clearLabel}
      </button>
    </div>
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

function MiniStat({ label, value }: { label: string; value: number }) {
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

function MessageCard({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      {message}
    </div>
  );
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