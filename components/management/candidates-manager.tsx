"use client";

import { startTransition, useEffect, useState } from "react";
import {
  BadgeCheck,
  FileSpreadsheet,
  Link2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";

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
    lastJobId?: string | null;
    status?: string | null;
  } | null;
};

type PagedCandidates = {
  items: CandidateRecord[];
  page: number;
  pageSize: number;
  total: number;
};

type SyncJobRecord = {
  attempts: Array<Record<string, unknown>>;
  candidateId: string;
  latestRemoteCandidateId: string | null;
  retryCount: number;
  status: string;
  syncJobId: string;
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

type AddressFormState = {
  address: string;
  city: string;
  constituency: string;
  district: string;
  pinCode: string;
  state: string;
  tehsil: string;
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

const portalContent = {
  admin: {
    description:
      "Create, review, import, and queue candidate registration records without calling SIDH from the browser.",
    heading: "Candidate Operations",
  },
  training_partner: {
    description:
      "Work inside your scoped center assignments for candidate intake, row review, and sync queue management.",
    heading: "Scoped Candidate Operations",
  },
} as const;

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

type LinkFormState = {
  centerId: string;
  dateOfBirth: string;
  fullName: string;
  mobileNumber: string;
  programId: string;
  sidhCandidateId: string;
};

const emptyLinkForm: LinkFormState = {
  centerId: "",
  dateOfBirth: "",
  fullName: "",
  mobileNumber: "",
  programId: "",
  sidhCandidateId: "",
};

type ImportFormState = {
  centerId: string;
  file: File | null;
  programId: string;
  registrationMode: "internal_registration" | "existing_sidh_link";
};

const emptyImportForm: ImportFormState = {
  centerId: "",
  file: null,
  programId: "",
  registrationMode: "internal_registration",
};

function createApiError(message: string, status = 400) {
  return new ClientApiError(message, status);
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
    programId: form.programId,
    centerId: form.centerId,
    registrationMode: form.registrationMode,
    personalDetails: form.personalDetails,
    contactDetails: form.contactDetails,
    identity: form.identity,
    domicile: form.domicile,
    permanentAddress: form.permanentAddress,
    communicationAddress: form.communicationAddress.sameAsPermanent
      ? { sameAsPermanent: true }
      : form.communicationAddress,
    experience: {
      ...form.experience,
      monthsOfPreviousExperience: form.experience.monthsOfPreviousExperience
        ? Number(form.experience.monthsOfPreviousExperience)
        : null,
    },
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
    method: "POST",
    body,
    credentials: "include",
  });
  const payload = (await response.json()) as ApiEnvelope<ImportJobRecord>;

  if (!response.ok || !payload.success) {
    throw new ClientApiError(payload.message ?? "Import upload failed", response.status);
  }

  return payload.data;
}

async function fetchDashboardDataResources() {
  return Promise.all([
    apiFetch<CandidateReferenceData>("/api/v1/reference-data/candidate"),
    apiFetch<PagedCandidates>("/api/v1/candidates?page=1&pageSize=12"),
    apiFetch<PagedSyncJobs>("/api/v1/sync/jobs?page=1&pageSize=12"),
  ]);
}

export default function CandidatesManager({ portal }: CandidatesManagerProps) {
  const [referenceData, setReferenceData] = useState<CandidateReferenceData | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJobRecord[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidateForm, setCandidateForm] = useState(emptyCandidateForm);
  const [linkForm, setLinkForm] = useState(emptyLinkForm);
  const [importForm, setImportForm] = useState(emptyImportForm);
  const [currentImportJob, setCurrentImportJob] = useState<ImportJobRecord | null>(null);
  const [importRows, setImportRows] = useState<ImportRowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isUploadingImport, setIsUploadingImport] = useState(false);
  const [isCommittingImport, setIsCommittingImport] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const content = portalContent[portal];
  const selectedCandidate = candidates.find((candidate) => candidate.candidateId === selectedCandidateId) ?? null;
  const queuedJobs = syncJobs.filter((job) => job.status === "queued" || job.status === "processing").length;
  const flaggedJobs = syncJobs.filter((job) => job.status === "failed" || job.status === "manual_review").length;

  async function loadDashboardData() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [candidateReference, candidateData, syncJobData] = await fetchDashboardDataResources();

      setReferenceData(candidateReference);
      setCandidates(candidateData.items);
      setSyncJobs(syncJobData.items);

      if (!candidateForm.programId && candidateReference.programs[0]) {
        setCandidateForm((current) => ({ ...current, programId: candidateReference.programs[0].programId }));
        setLinkForm((current) => ({ ...current, programId: candidateReference.programs[0].programId }));
        setImportForm((current) => ({ ...current, programId: candidateReference.programs[0].programId }));
      }

      if (!candidateForm.centerId && candidateReference.trainingCenters[0]) {
        setCandidateForm((current) => ({ ...current, centerId: candidateReference.trainingCenters[0].centerId }));
        setLinkForm((current) => ({ ...current, centerId: candidateReference.trainingCenters[0].centerId }));
        setImportForm((current) => ({ ...current, centerId: candidateReference.trainingCenters[0].centerId }));
      }
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load candidate operations data");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadImportRows(jobId: string) {
    const rowData = await apiFetch<PagedImportRows>(`/api/v1/candidates/imports/${jobId}/rows?page=1&pageSize=12`);
    setImportRows(rowData.items);
  }

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        const [candidateReference, candidateData, syncJobData] = await fetchDashboardDataResources();

        if (!isMounted) {
          return;
        }

        setReferenceData(candidateReference);
        setCandidates(candidateData.items);
        setSyncJobs(syncJobData.items);

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
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load candidate operations data");
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

  function clearCandidateForm() {
    setSelectedCandidateId(null);
    setCandidateForm((current) => ({
      ...emptyCandidateForm,
      programId: current.programId,
      centerId: current.centerId,
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
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch<CandidateRecord>("/api/v1/candidates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      clearCandidateForm();
      setSuccessMessage(selectedCandidate ? "Candidate updated successfully" : "Candidate created successfully");
      await loadDashboardData();
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
        method: "POST",
        body: JSON.stringify(linkForm),
      });

      setLinkForm((current) => ({ ...emptyLinkForm, centerId: current.centerId, programId: current.programId }));
      setSuccessMessage("Existing SIDH candidate linked successfully");
      await loadDashboardData();
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
      const importJob = await uploadCandidateImport(importForm);
      setCurrentImportJob(importJob);
      await loadImportRows(importJob.importJobId);
      setSuccessMessage("Candidate import staged successfully");
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to stage candidate import");
    } finally {
      setIsUploadingImport(false);
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
      await Promise.all([loadImportRows(committedJob.importJobId), loadDashboardData()]);
      setSuccessMessage("Candidate import committed and sync jobs queued for valid rows");
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
      await loadDashboardData();
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
      await loadDashboardData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to retry sync job");
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
            onClick={() => startTransition(() => void loadDashboardData())}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </section>

      {errorMessage ? <MessageCard tone="error" message={errorMessage} /> : null}
      {successMessage ? <MessageCard tone="success" message={successMessage} /> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Users className="h-5 w-5" />} label="Candidates in view" value={candidates.length} />
        <MetricCard icon={<Send className="h-5 w-5" />} label="Queued or processing" value={queuedJobs} />
        <MetricCard icon={<RotateCcw className="h-5 w-5" />} label="Failed or manual review" value={flaggedJobs} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-sky-50 p-2 text-sky-600">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{selectedCandidate ? "Edit Candidate" : "Create Candidate"}</h2>
              <p className="text-sm text-slate-500">Backed by GET, POST, PATCH, and POST sync endpoints under /api/v1/candidates</p>
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Candidate list</h2>
              <p className="text-sm text-slate-500">Latest created candidates in your visible scope</p>
            </div>
            {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /> : null}
          </div>

          <div className="mt-6 space-y-3">
            {candidates.length === 0 ? (
              <EmptyState message={isLoading ? "Loading candidate records..." : "No candidates available yet."} />
            ) : (
              candidates.map((candidate) => (
                <div key={candidate.candidateId} className={`rounded-2xl border p-4 ${selectedCandidateId === candidate.candidateId ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50"}`}>
                  <button type="button" className="w-full text-left" onClick={() => {
                    setSelectedCandidateId(candidate.candidateId);
                    setCandidateForm(candidateToForm(candidate));
                  }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{candidate.personalDetails.fullName}</div>
                        <div className="mt-1 text-sm text-slate-600">{candidate.contactDetails.mobileNumber} • {candidate.programId}</div>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{candidate.syncState?.status ?? "not_queued"}</span>
                    </div>
                  </button>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void handleQueueSync(candidate.candidateId)} disabled={candidate.registrationMode === "existing_sidh_link"} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <Send className="h-3.5 w-3.5" /> Queue sync
                    </button>
                  </div>
                </div>
              ))
            )}
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
                <select value={importForm.programId} onChange={(event) => setImportForm((current) => ({ ...current, programId: event.target.value }))} className={inputClassName}>
                  <option value="">Select program</option>
                  {(referenceData?.programs ?? []).map((program) => (
                    <option key={program.programId} value={program.programId}>{program.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Training center">
                <select value={importForm.centerId} onChange={(event) => setImportForm((current) => ({ ...current, centerId: event.target.value }))} className={inputClassName}>
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
                <input type="file" accept=".xlsx,.xls" onChange={(event) => setImportForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))} className={`${inputClassName} py-2`} />
              </Field>
              <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
                <button type="submit" disabled={isUploadingImport} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
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
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Import Row Review</h2>
              <p className="text-sm text-slate-500">Backed by GET /api/v1/candidates/imports/{'{jobId}'}/rows</p>
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
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{row.status}</div>
                      </div>
                      {row.candidateId ? <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{row.candidateId}</span> : null}
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
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Sync Queue</h2>
              <p className="text-sm text-slate-500">Backed by GET /api/v1/sync/jobs and POST /api/v1/sync/jobs/{'{jobId}'}/retry</p>
            </div>
            <div className="mt-6 space-y-3">
              {syncJobs.length === 0 ? (
                <EmptyState message={isLoading ? "Loading sync jobs..." : "No sync jobs available yet."} />
              ) : (
                syncJobs.map((job) => (
                  <div key={job.syncJobId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{job.syncJobId}</div>
                        <div className="mt-1 text-sm text-slate-600">Candidate {job.candidateId}</div>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{job.status}</span>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">Retries: {job.retryCount} {job.latestRemoteCandidateId ? `• SIDH ${job.latestRemoteCandidateId}` : ""}</div>
                    <div className="mt-4">
                      <button type="button" onClick={() => void handleRetrySyncJob(job.syncJobId)} disabled={job.status === "processing"} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                        <RotateCcw className="h-3.5 w-3.5" /> Retry job
                      </button>
                    </div>
                  </div>
                ))
              )}
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

const inputClassName = "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300";