import { createHash } from "node:crypto";

import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { readWorkbookSheetsFromArrayBuffer } from "@/lib/spreadsheet/node";
import { CandidateModel } from "@/lib/server/models/candidate";
import { ImportJobModel } from "@/lib/server/models/import-job";
import { OutboxEventModel } from "@/lib/server/models/outbox-event";
import { ProgramModel } from "@/lib/server/models/program";
import { SidhApiTransactionModel } from "@/lib/server/models/sidh-api-transaction";
import { SyncJobModel } from "@/lib/server/models/sync-job";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import {
  canAccessCenters,
  canManageCandidates,
  canManageSync,
  getPermissionsForRoles,
} from "@/lib/server/rbac";
import { writeAuditLog } from "@/lib/server/services/audit";
import { type AuthSession } from "@/lib/server/services/session";
import {
  createCandidateSchema,
  type CandidateImportInput,
  type CandidateListQuery,
  type CreateCandidateInput,
  type LinkExistingSidhCandidateInput,
  type SyncJobsQuery,
  type UpdateCandidateInput,
} from "@/lib/server/validation";

type PagedList<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

type CandidateCreateOptions = {
  queueSync?: boolean;
  requestId?: string;
  skipAudit?: boolean;
  sourceImportJobId?: string;
};

type AddressLike = {
  address?: string | null;
  city?: string | null;
  constituency?: string | null;
  district?: string | null;
  pinCode?: string | null;
  state?: string | null;
  tehsil?: string | null;
};

type CommunicationAddressLike = AddressLike & {
  sameAsPermanent?: boolean | null;
};

type CandidateLike = {
  candidateId: string;
  centerId: string;
  communicationAddress: CommunicationAddressLike;
  countryCode?: string | null;
  createdAt?: Date;
  dateOfBirth: Date | string;
  disability: boolean;
  domicileDistrict?: string | null;
  domicileState?: string | null;
  duplicateHash: string;
  educationLevel?: string | null;
  email?: string | null;
  employmentDetails?: string | null;
  employmentStatus?: string | null;
  employed?: string | null;
  fathersName?: string | null;
  fullName: string;
  gender?: string | null;
  guardiansName?: string | null;
  heardAboutUs?: string | null;
  idNumber?: string | null;
  idType: string;
  maritalStatus?: string | null;
  mobileNumber: string;
  mothersName?: string | null;
  monthsOfPreviousExperience?: number | null;
  permanentAddress: AddressLike;
  previousExperienceSector?: string | null;
  programId: string;
  registrationMode: "internal_registration" | "existing_sidh_link";
  religion?: string | null;
  salutation?: string | null;
  sidhCandidateId?: string | null;
  syncState?: Record<string, unknown> | null;
  trainingStatus?: string | null;
  typeOfAlternateId?: string | null;
  typeOfDisability?: string | null;
  updatedAt?: Date;
  aadhaarReferenceNo?: string | null;
  category?: string | null;
};

type ImportJobLike = {
  centerId: string;
  committedAt?: Date | null;
  committedRows: number;
  createdAt?: Date;
  duplicateRows: number;
  fileName: string;
  importJobId: string;
  invalidRows: number;
  programId: string;
  registrationMode: string;
  status: string;
  totalRows: number;
  updatedAt?: Date;
  validRows: number;
};

type SyncJobLike = {
  attempts?: Iterable<unknown> | null;
  candidateId: string;
  createdAt?: Date;
  entityId: string;
  entityType: string;
  latestRemoteCandidateId?: string | null;
  nextRunAt?: Date;
  payloadSnapshot?: Record<string, unknown>;
  retryCount: number;
  status: string;
  syncJobId: string;
  updatedAt?: Date;
};

type SerializedCandidate = ReturnType<typeof serializeCandidate>;

function ensureCanReadCandidates(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("candidates:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to candidates");
  }
}

function ensureCanWriteCandidates(actor: AuthSession) {
  if (!canManageCandidates(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage candidates");
  }
}

function ensureCanReadSyncJobs(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("sync:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to sync jobs");
  }
}

function ensureCanWriteSyncJobs(actor: AuthSession) {
  if (!canManageSync(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage sync jobs");
  }
}

function normalizeWhitespace(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeFullName(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeIdValue(value?: string | null) {
  return value ? value.replace(/\s+/g, "").toUpperCase() : "";
}

function normalizeYesNo(value: unknown): "Yes" | "No" | "" {
  const normalized = normalizeWhitespace(String(value ?? "")).toLowerCase();

  if (normalized === "yes") {
    return "Yes";
  }

  if (normalized === "no") {
    return "No";
  }

  return "";
}

function toIsoDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "INVALID_DATE", "Invalid date provided");
  }

  return parsed;
}

function parseTemplateDate(value: unknown) {
  const normalized = normalizeWhitespace(String(value ?? ""));

  if (!normalized) {
    return "";
  }

  const slashMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function createDuplicateHash(input: {
  dateOfBirth: string;
  fullName: string;
  idNumber: string;
  idType: string;
  mobileNumber: string;
}) {
  return createHash("sha256")
    .update(
      [
        normalizeFullName(input.fullName),
        input.dateOfBirth,
        input.mobileNumber.replace(/\D/g, ""),
        normalizeWhitespace(input.idType).toUpperCase(),
        normalizeIdValue(input.idNumber),
      ].join("|"),
    )
    .digest("hex");
}

function createSearchRegex(search?: string) {
  if (!search?.trim()) {
    return undefined;
  }

  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function resolveScopedCenterFilter(actor: AuthSession, centerId?: string) {
  const isPlatformAdmin = actor.user.roles.includes("platform_admin");

  if (centerId) {
    if (!isPlatformAdmin && !canAccessCenters(actor.user.roles, actor.user.centerIds, [centerId])) {
      throw new ApiError(403, "FORBIDDEN", "You do not have access to the requested center scope");
    }

    return centerId;
  }

  if (isPlatformAdmin) {
    return undefined;
  }

  return actor.user.centerIds;
}

async function ensureProgramExists(programId: string) {
  const program = await ProgramModel.findOne({ programId }).select({ programId: 1, name: 1, status: 1 });

  if (!program) {
    throw new ApiError(404, "PROGRAM_NOT_FOUND", "Program not found");
  }

  return program;
}

async function ensureTrainingCenterExists(centerId: string) {
  const center = await TrainingCenterModel.findOne({ centerId }).select({ centerId: 1, centerName: 1, status: 1 });

  if (!center) {
    throw new ApiError(404, "CENTER_NOT_FOUND", "Training center not found");
  }

  return center;
}

function serializeCandidate(candidate: CandidateLike) {
  return {
    id: candidate.candidateId,
    candidateId: candidate.candidateId,
    programId: candidate.programId,
    centerId: candidate.centerId,
    registrationMode: candidate.registrationMode,
    personalDetails: {
      salutation: candidate.salutation ?? null,
      fullName: candidate.fullName,
      gender: candidate.gender ?? null,
      dateOfBirth: toIsoDate(candidate.dateOfBirth)?.slice(0, 10) ?? null,
      maritalStatus: candidate.maritalStatus ?? null,
      fathersName: candidate.fathersName ?? null,
      mothersName: candidate.mothersName ?? null,
      guardiansName: candidate.guardiansName ?? null,
      religion: candidate.religion ?? null,
      disability: candidate.disability,
      typeOfDisability: candidate.typeOfDisability ?? null,
      category: candidate.category ?? null,
      educationLevel: candidate.educationLevel ?? null,
    },
    contactDetails: {
      email: candidate.email ?? null,
      mobileNumber: candidate.mobileNumber,
    },
    domicile: {
      state: candidate.domicileState ?? null,
      district: candidate.domicileDistrict ?? null,
    },
    identity: {
      idType: candidate.idType,
      typeOfAlternateId: candidate.typeOfAlternateId ?? null,
      idNumber: candidate.idNumber ?? null,
    },
    permanentAddress: candidate.permanentAddress,
    communicationAddress: candidate.communicationAddress,
    experience: {
      trainingStatus: candidate.trainingStatus ?? null,
      previousExperienceSector: candidate.previousExperienceSector ?? null,
      monthsOfPreviousExperience: candidate.monthsOfPreviousExperience ?? null,
      employed: candidate.employed ?? null,
      employmentStatus: candidate.employmentStatus ?? null,
      employmentDetails: candidate.employmentDetails ?? null,
      heardAboutUs: candidate.heardAboutUs ?? null,
    },
    sidhCandidateId: candidate.sidhCandidateId ?? null,
    syncState: candidate.syncState ?? null,
    duplicateHash: candidate.duplicateHash,
    createdAt: toIsoDate(candidate.createdAt),
    updatedAt: toIsoDate(candidate.updatedAt),
  };
}

function serializeImportJob(job: ImportJobLike) {
  return {
    id: job.importJobId,
    importJobId: job.importJobId,
    fileName: job.fileName,
    status: job.status,
    programId: job.programId,
    centerId: job.centerId,
    registrationMode: job.registrationMode,
    totalRows: job.totalRows,
    validRows: job.validRows,
    invalidRows: job.invalidRows,
    duplicateRows: job.duplicateRows,
    committedRows: job.committedRows,
    committedAt: toIsoDate(job.committedAt),
    createdAt: toIsoDate(job.createdAt),
    updatedAt: toIsoDate(job.updatedAt),
  };
}

function serializeImportRow(row: Record<string, unknown>) {
  return {
    rowId: row.rowId,
    rowNumber: row.rowNumber,
    status: row.status,
    errors: row.errors ?? [],
    duplicateOfCandidateId: row.duplicateOfCandidateId ?? null,
    candidateId: row.candidateId ?? null,
    normalized: row.normalized ?? {},
  };
}

function serializeSyncJob(job: SyncJobLike) {
  return {
    id: job.syncJobId,
    syncJobId: job.syncJobId,
    entityType: job.entityType,
    entityId: job.entityId,
    candidateId: job.candidateId,
    status: job.status,
    retryCount: job.retryCount,
    latestRemoteCandidateId: job.latestRemoteCandidateId ?? null,
    payloadSnapshot: job.payloadSnapshot ?? {},
    attempts: Array.from(job.attempts ?? []).map((attempt) => ({
      ...(attempt as Record<string, unknown>),
      startedAt: toIsoDate((attempt as { startedAt?: Date | string | null }).startedAt),
      finishedAt: toIsoDate((attempt as { finishedAt?: Date | string | null }).finishedAt),
    })),
    nextRunAt: toIsoDate(job.nextRunAt),
    createdAt: toIsoDate(job.createdAt),
    updatedAt: toIsoDate(job.updatedAt),
  };
}

function buildCandidateInputFromDocument(candidate: CandidateLike): CreateCandidateInput {
  return {
    programId: candidate.programId,
    centerId: candidate.centerId,
    registrationMode: candidate.registrationMode,
    personalDetails: {
      salutation: candidate.salutation ?? "",
      fullName: candidate.fullName,
      gender: candidate.gender ?? "Unknown",
      dateOfBirth: toIsoDate(candidate.dateOfBirth)?.slice(0, 10) ?? "",
      maritalStatus: candidate.maritalStatus ?? "",
      fathersName: candidate.fathersName ?? "",
      mothersName: candidate.mothersName ?? "",
      guardiansName: candidate.guardiansName ?? "",
      religion: candidate.religion ?? "",
      category: candidate.category ?? "",
      disability: candidate.disability ?? false,
      typeOfDisability: candidate.typeOfDisability ?? "",
      educationLevel: candidate.educationLevel ?? "",
    },
    contactDetails: {
      email: candidate.email ?? "",
      countryCode: candidate.countryCode ?? "91",
      mobileNumber: candidate.mobileNumber,
    },
    identity: {
      idType: candidate.idType,
      typeOfAlternateId: candidate.typeOfAlternateId ?? "",
      aadhaarReferenceNo: candidate.aadhaarReferenceNo ?? "",
      idNumber: candidate.idNumber ?? "",
    },
    domicile: {
      state: candidate.domicileState ?? "",
      district: candidate.domicileDistrict ?? "",
    },
    permanentAddress: {
      address: candidate.permanentAddress?.address ?? "",
      state: candidate.permanentAddress?.state ?? "",
      district: candidate.permanentAddress?.district ?? "",
      pinCode: candidate.permanentAddress?.pinCode ?? "",
      city: candidate.permanentAddress?.city ?? "",
      tehsil: candidate.permanentAddress?.tehsil ?? "",
      constituency: candidate.permanentAddress?.constituency ?? "",
    },
    communicationAddress: {
      sameAsPermanent: candidate.communicationAddress?.sameAsPermanent ?? true,
      address: candidate.communicationAddress?.address ?? "",
      state: candidate.communicationAddress?.state ?? "",
      district: candidate.communicationAddress?.district ?? "",
      pinCode: candidate.communicationAddress?.pinCode ?? "",
      city: candidate.communicationAddress?.city ?? "",
      tehsil: candidate.communicationAddress?.tehsil ?? "",
      constituency: candidate.communicationAddress?.constituency ?? "",
    },
    experience: {
      trainingStatus: candidate.trainingStatus ?? "Fresher",
      previousExperienceSector: candidate.previousExperienceSector ?? "",
      monthsOfPreviousExperience: candidate.monthsOfPreviousExperience ?? null,
      employed: normalizeYesNo(candidate.employed),
      employmentStatus: candidate.employmentStatus ?? "",
      employmentDetails: candidate.employmentDetails ?? "",
      heardAboutUs: candidate.heardAboutUs ?? "",
    },
  };
}

function mergeCandidateInput(base: CreateCandidateInput, patch: UpdateCandidateInput): CreateCandidateInput {
  return {
    ...base,
    programId: patch.programId ?? base.programId,
    centerId: patch.centerId ?? base.centerId,
    registrationMode: patch.registrationMode ?? base.registrationMode,
    personalDetails: {
      ...base.personalDetails,
      ...(patch.personalDetails ?? {}),
    },
    contactDetails: {
      ...base.contactDetails,
      ...(patch.contactDetails ?? {}),
    },
    identity: {
      ...base.identity,
      ...(patch.identity ?? {}),
    },
    domicile: {
      ...base.domicile,
      ...(patch.domicile ?? {}),
    },
    permanentAddress: {
      ...base.permanentAddress,
      ...(patch.permanentAddress ?? {}),
    },
    communicationAddress: {
      ...base.communicationAddress,
      ...(patch.communicationAddress ?? {}),
    },
    experience: {
      ...base.experience,
      ...(patch.experience ?? {}),
    },
  };
}

function buildCandidateRecord(input: CreateCandidateInput) {
  const duplicateIdentityValue = input.identity.idNumber || input.identity.aadhaarReferenceNo || input.contactDetails.mobileNumber;
  const duplicateHash = createDuplicateHash({
    dateOfBirth: input.personalDetails.dateOfBirth,
    fullName: input.personalDetails.fullName,
    idNumber: duplicateIdentityValue,
    idType: input.identity.idType,
    mobileNumber: input.contactDetails.mobileNumber,
  });
  const permanentAddress = {
    address: normalizeWhitespace(input.permanentAddress.address),
    state: normalizeWhitespace(input.permanentAddress.state),
    district: normalizeWhitespace(input.permanentAddress.district),
    pinCode: normalizeWhitespace(input.permanentAddress.pinCode),
    city: normalizeWhitespace(input.permanentAddress.city),
    tehsil: normalizeWhitespace(input.permanentAddress.tehsil),
    constituency: normalizeWhitespace(input.permanentAddress.constituency),
  };
  const communicationAddress = input.communicationAddress.sameAsPermanent
    ? {
        sameAsPermanent: true,
        ...permanentAddress,
      }
    : {
        sameAsPermanent: false,
        address: normalizeWhitespace(input.communicationAddress.address),
        state: normalizeWhitespace(input.communicationAddress.state),
        district: normalizeWhitespace(input.communicationAddress.district),
        pinCode: normalizeWhitespace(input.communicationAddress.pinCode),
        city: normalizeWhitespace(input.communicationAddress.city),
        tehsil: normalizeWhitespace(input.communicationAddress.tehsil),
        constituency: normalizeWhitespace(input.communicationAddress.constituency),
      };

  return {
    registrationMode: input.registrationMode,
    fullName: normalizeWhitespace(input.personalDetails.fullName),
    normalizedFullName: normalizeFullName(input.personalDetails.fullName),
    salutation: normalizeWhitespace(input.personalDetails.salutation) || null,
    gender: normalizeWhitespace(input.personalDetails.gender) || null,
    dateOfBirth: parseDate(input.personalDetails.dateOfBirth),
    email: normalizeWhitespace(input.contactDetails.email).toLowerCase() || null,
    maritalStatus: normalizeWhitespace(input.personalDetails.maritalStatus) || null,
    fathersName: normalizeWhitespace(input.personalDetails.fathersName) || null,
    mothersName: normalizeWhitespace(input.personalDetails.mothersName) || null,
    guardiansName: normalizeWhitespace(input.personalDetails.guardiansName) || null,
    religion: normalizeWhitespace(input.personalDetails.religion) || null,
    category: normalizeWhitespace(input.personalDetails.category) || null,
    disability: input.personalDetails.disability,
    typeOfDisability: normalizeWhitespace(input.personalDetails.typeOfDisability) || null,
    domicileState: normalizeWhitespace(input.domicile.state) || null,
    domicileDistrict: normalizeWhitespace(input.domicile.district) || null,
    idType: normalizeWhitespace(input.identity.idType),
    typeOfAlternateId: normalizeWhitespace(input.identity.typeOfAlternateId) || null,
    aadhaarReferenceNo: normalizeWhitespace(input.identity.aadhaarReferenceNo) || null,
    idNumber: normalizeWhitespace(input.identity.idNumber) || null,
    normalizedIdNumber: normalizeIdValue(input.identity.idNumber || input.identity.aadhaarReferenceNo || duplicateIdentityValue),
    countryCode: normalizeWhitespace(input.contactDetails.countryCode) || "91",
    mobileNumber: input.contactDetails.mobileNumber.replace(/\D/g, ""),
    educationLevel: normalizeWhitespace(input.personalDetails.educationLevel) || null,
    permanentAddress,
    communicationAddress,
    trainingStatus: normalizeWhitespace(input.experience.trainingStatus) || null,
    previousExperienceSector: normalizeWhitespace(input.experience.previousExperienceSector) || null,
    monthsOfPreviousExperience: input.experience.monthsOfPreviousExperience ?? null,
    employed: normalizeWhitespace(input.experience.employed) || null,
    employmentStatus: normalizeWhitespace(input.experience.employmentStatus) || null,
    employmentDetails: normalizeWhitespace(input.experience.employmentDetails) || null,
    heardAboutUs: normalizeWhitespace(input.experience.heardAboutUs) || null,
    programId: input.programId,
    centerId: input.centerId,
    duplicateHash,
  };
}

async function ensureNoDuplicateCandidate(duplicateHash: string, programId: string, centerId: string, excludeCandidateId?: string) {
  const existing = await CandidateModel.findOne({
    duplicateHash,
    programId,
    centerId,
    ...(excludeCandidateId ? { candidateId: { $ne: excludeCandidateId } } : {}),
  }).select({ candidateId: 1, fullName: 1 });

  if (existing) {
    throw new ApiError(409, "DUPLICATE_CANDIDATE", "A matching candidate already exists", [
      {
        field: "duplicateHash",
        message: `Candidate matches existing record ${existing.candidateId}`,
      },
    ]);
  }
}

async function createQueuedSyncJob(actor: AuthSession, candidate: SerializedCandidate, requestId?: string) {
  const existingQueuedJob = await SyncJobModel.findOne({
    candidateId: candidate.candidateId,
    status: { $in: ["queued", "processing"] },
  }).select({ syncJobId: 1 });

  if (existingQueuedJob) {
    throw new ApiError(409, "SYNC_ALREADY_QUEUED", "A sync job is already queued for this candidate");
  }

  const syncJobId = createPrefixedId("sync");
  const syncJob = await SyncJobModel.create({
    syncJobId,
    entityType: "candidate",
    entityId: candidate.candidateId,
    candidateId: candidate.candidateId,
    maxAttempts: 3,
    status: "queued",
    payloadSnapshot: candidate,
    createdByUserId: actor.user.id,
  });

  await OutboxEventModel.create({
    outboxEventId: createPrefixedId("evt"),
    eventType: "candidate.sync.queued",
    entityType: "candidate",
    entityId: candidate.candidateId,
    payload: {
      candidateId: candidate.candidateId,
      syncJobId,
    },
  });

  await CandidateModel.updateOne(
    { candidateId: candidate.candidateId },
    {
      $set: {
        syncState: {
          status: "queued",
          lastJobId: syncJobId,
          lastAttemptAt: null,
          lastSuccessAt: candidate.syncState?.lastSuccessAt ?? null,
          lastFailureCode: null,
          lastFailureMessage: null,
          retryCount: candidate.syncState?.retryCount ?? 0,
        },
        updatedByUserId: actor.user.id,
      },
    },
  );

  await writeAuditLog({
    action: "candidate.sync.queued",
    actorUserId: actor.user.id,
    entityType: "candidate",
    entityId: candidate.candidateId,
    metadata: { syncJobId },
    requestId,
  });

  return serializeSyncJob(syncJob);
}

async function createCandidateRecord(actor: AuthSession, input: CreateCandidateInput, options: CandidateCreateOptions = {}) {
  ensureCanWriteCandidates(actor);
  resolveScopedCenterFilter(actor, input.centerId);

  await Promise.all([ensureProgramExists(input.programId), ensureTrainingCenterExists(input.centerId)]);

  const normalized = buildCandidateRecord(createCandidateSchema.parse(input));
  await ensureNoDuplicateCandidate(normalized.duplicateHash, input.programId, input.centerId);

  const created = await CandidateModel.create({
    candidateId: createPrefixedId("cand"),
    ...normalized,
    sidhCandidateId: null,
    syncState: {
      status: "not_queued",
      lastJobId: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureCode: null,
      lastFailureMessage: null,
      retryCount: 0,
    },
    sourceImportJobId: options.sourceImportJobId ?? null,
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  const serialized = serializeCandidate(created);

  if (!options.skipAudit) {
    await writeAuditLog({
      action: "candidate.created",
      actorUserId: actor.user.id,
      entityType: "candidate",
      entityId: created.candidateId,
      metadata: { centerId: input.centerId, programId: input.programId, sourceImportJobId: options.sourceImportJobId ?? null },
      requestId: options.requestId,
    });
  }

  if (options.queueSync && input.registrationMode === "internal_registration") {
    const syncJob = await createQueuedSyncJob(actor, serialized, options.requestId);
    return {
      ...serialized,
      syncState: {
        ...(serialized.syncState ?? {}),
        status: "queued",
        lastJobId: syncJob.syncJobId,
      },
    };
  }

  return serialized;
}

function normalizeImportHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCellValue(row: Record<string, unknown>, keys: string[]) {
  const keyMap = new Map(Object.keys(row).map((key) => [normalizeImportHeader(key), row[key]]));

  for (const key of keys) {
    const value = keyMap.get(normalizeImportHeader(key));
    if (value !== undefined) {
      return value;
    }
  }

  return "";
}

function mapImportRowToCandidateInput(row: Record<string, unknown>, input: CandidateImportInput): CreateCandidateInput {
  return {
    programId: input.programId,
    centerId: input.centerId,
    registrationMode: input.registrationMode,
    personalDetails: {
      salutation: String(getCellValue(row, ["Salutation"])),
      fullName: String(getCellValue(row, ["FullName", "Full Name"])),
      gender: String(getCellValue(row, ["Gender"])),
      dateOfBirth: parseTemplateDate(getCellValue(row, ["DateofBirth", "Date of Birth"])),
      maritalStatus: String(getCellValue(row, ["MaritalStatus", "Marital Status"])),
      fathersName: String(getCellValue(row, ["FathersName", "Father Name"])),
      mothersName: String(getCellValue(row, ["MothersName", "Mother Name"])),
      guardiansName: String(getCellValue(row, ["GuardianName", "Guardian Name"])),
      religion: String(getCellValue(row, ["Religion"])),
      category: String(getCellValue(row, ["Category"])),
      disability: /^yes$/i.test(String(getCellValue(row, ["Disability"])).trim()),
      typeOfDisability: String(getCellValue(row, ["TypeofDisability", "Type of Disability"])),
      educationLevel: String(getCellValue(row, ["EducationLevel", "Education Level"])),
    },
    contactDetails: {
      email: String(getCellValue(row, ["EmailID", "Email Id"])),
      countryCode: String(getCellValue(row, ["CountryCode", "Country Code"])) || "91",
      mobileNumber: String(getCellValue(row, ["MobileNo", "Mobile Number"])),
    },
    identity: {
      idType: String(getCellValue(row, ["IDType", "ID Type"])),
      typeOfAlternateId: String(getCellValue(row, ["TypeofAlternateID", "Type of Alternate ID"])),
      aadhaarReferenceNo: String(getCellValue(row, ["AdharReferenceNo", "AadhaarReferenceNo"])),
      idNumber: String(getCellValue(row, ["IDNo", "ID Number"])),
    },
    domicile: {
      state: String(getCellValue(row, ["DomicileState", "Domicile State"])),
      district: String(getCellValue(row, ["DomicileDistrict", "Domicile District"])),
    },
    permanentAddress: {
      address: String(getCellValue(row, ["PermanentAddressAddress", "Permanent Address Address"])),
      state: String(getCellValue(row, ["PermanentAddressState", "Permanent Address State"])),
      district: String(getCellValue(row, ["PermanentAddressDistrict", "Permanent Address District"])),
      pinCode: String(getCellValue(row, ["PermanentAddressPINCode", "Permanent Address PIN Code"])),
      city: String(getCellValue(row, ["PermanentAddressCity", "Permanent Address City"])),
      tehsil: String(getCellValue(row, ["PermanentAddressTehsil", "Permanent Address Tehsil"])),
      constituency: String(getCellValue(row, ["PermanentAddressConstituency", "Permanent Address Constituency"])),
    },
    communicationAddress: {
      sameAsPermanent: !/^no$/i.test(String(getCellValue(row, ["CommunicationSameasPermanentAddress", "Communication Same as Permanent Address"])).trim()),
      address: String(getCellValue(row, ["CommunicationAddressAddress", "Communication Address Address"])),
      state: String(getCellValue(row, ["CommunicationAddressState", "Communication Address State"])),
      district: String(getCellValue(row, ["CommunicationAddressDistrict", "Communication Address District"])),
      pinCode: String(getCellValue(row, ["CommunicationAddressPINCode", "Communication Address PIN Code"])),
      city: String(getCellValue(row, ["CommunicationAddressCity", "Communication Address City"])),
      tehsil: String(getCellValue(row, ["CommunicationAddressTehsil", "Communication Address Tehsil"])),
      constituency: String(getCellValue(row, ["CommunicationAddressPermanentConstituency", "Communication Address Constituency"])),
    },
    experience: {
      trainingStatus: String(getCellValue(row, ["TrainingStatus", "Training Status"])) || "Fresher",
      previousExperienceSector: String(getCellValue(row, ["PreviousExperienceSector", "Previous Experience Sector"])),
      monthsOfPreviousExperience: (() => {
        const raw = String(getCellValue(row, ["Noofmonthsofpreviousexperience", "No of months of previous experience"])).trim();
        return raw ? Number(raw) : null;
      })(),
      employed: normalizeYesNo(getCellValue(row, ["Employed"])),
      employmentStatus: String(getCellValue(row, ["EmploymentStatus", "Employment Status"])),
      employmentDetails: String(getCellValue(row, ["EmploymentDetails", "Employment Details"])),
      heardAboutUs: String(getCellValue(row, ["HeardAboutUs", "Heard About Us"])),
    },
  };
}

export async function createCandidate(actor: AuthSession, input: CreateCandidateInput, options?: CandidateCreateOptions) {
  await connectToDatabase();
  return createCandidateRecord(actor, input, options);
}

export async function updateCandidate(actor: AuthSession, candidateId: string, patch: UpdateCandidateInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);

  const candidate = await CandidateModel.findOne({ candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  const mergedInput = createCandidateSchema.parse(mergeCandidateInput(buildCandidateInputFromDocument(candidate as never), patch));
  const normalized = buildCandidateRecord(mergedInput);

  await Promise.all([ensureProgramExists(mergedInput.programId), ensureTrainingCenterExists(mergedInput.centerId)]);
  await ensureNoDuplicateCandidate(normalized.duplicateHash, mergedInput.programId, mergedInput.centerId, candidateId);

  Object.assign(candidate, normalized, {
    updatedByUserId: actor.user.id,
  });
  await candidate.save();

  await writeAuditLog({
    action: "candidate.updated",
    actorUserId: actor.user.id,
    entityType: "candidate",
    entityId: candidateId,
    metadata: { programId: candidate.programId, centerId: candidate.centerId },
    requestId,
  });

  return serializeCandidate(candidate);
}

export async function getCandidate(actor: AuthSession, candidateId: string) {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const candidate = await CandidateModel.findOne({ candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  return serializeCandidate(candidate);
}

export async function listCandidates(actor: AuthSession, query: CandidateListQuery): Promise<PagedList<SerializedCandidate>> {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const filter: Record<string, unknown> = {};
  const scopedCenterFilter = resolveScopedCenterFilter(actor, query.centerId);
  const searchRegex = createSearchRegex(query.search);

  if (Array.isArray(scopedCenterFilter)) {
    filter.centerId = { $in: scopedCenterFilter };
  } else if (scopedCenterFilter) {
    filter.centerId = scopedCenterFilter;
  }

  if (query.programId) {
    filter.programId = query.programId;
  }

  if (query.registrationMode) {
    filter.registrationMode = query.registrationMode;
  }

  if (query.syncStatus) {
    filter["syncState.status"] = query.syncStatus;
  }

  if (searchRegex) {
    filter.$or = [
      { fullName: searchRegex },
      { mobileNumber: searchRegex },
      { sidhCandidateId: searchRegex },
      { candidateId: searchRegex },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    CandidateModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize),
    CandidateModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeCandidate(item)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function linkExistingSidhCandidate(actor: AuthSession, input: LinkExistingSidhCandidateInput, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);
  resolveScopedCenterFilter(actor, input.centerId);

  await Promise.all([ensureProgramExists(input.programId), ensureTrainingCenterExists(input.centerId)]);

  const existingSidhCandidate = await CandidateModel.findOne({ sidhCandidateId: input.sidhCandidateId }).select({ candidateId: 1 });

  if (existingSidhCandidate) {
    throw new ApiError(409, "SIDH_CANDIDATE_ALREADY_LINKED", "This SIDH candidate is already linked internally");
  }

  const duplicateHash = createDuplicateHash({
    dateOfBirth: input.dateOfBirth,
    fullName: input.fullName,
    idNumber: input.sidhCandidateId,
    idType: "SIDH_CANDIDATE_ID",
    mobileNumber: input.mobileNumber,
  });

  await ensureNoDuplicateCandidate(duplicateHash, input.programId, input.centerId);

  const candidate = await CandidateModel.create({
    candidateId: createPrefixedId("cand"),
    registrationMode: "existing_sidh_link",
    fullName: normalizeWhitespace(input.fullName),
    normalizedFullName: normalizeFullName(input.fullName),
    salutation: null,
    gender: null,
    dateOfBirth: parseDate(input.dateOfBirth),
    email: null,
    maritalStatus: null,
    fathersName: null,
    mothersName: null,
    guardiansName: "Linked from SIDH",
    religion: null,
    category: null,
    disability: false,
    typeOfDisability: null,
    domicileState: null,
    domicileDistrict: null,
    idType: "SIDH_CANDIDATE_ID",
    typeOfAlternateId: null,
    aadhaarReferenceNo: null,
    idNumber: input.sidhCandidateId,
    normalizedIdNumber: normalizeIdValue(input.sidhCandidateId),
    countryCode: "91",
    mobileNumber: input.mobileNumber,
    educationLevel: null,
    permanentAddress: {
      address: null,
      state: null,
      district: null,
      pinCode: null,
      city: null,
      tehsil: null,
      constituency: null,
    },
    communicationAddress: {
      sameAsPermanent: true,
      address: null,
      state: null,
      district: null,
      pinCode: null,
      city: null,
      tehsil: null,
      constituency: null,
    },
    trainingStatus: null,
    previousExperienceSector: null,
    monthsOfPreviousExperience: null,
    employed: null,
    employmentStatus: null,
    employmentDetails: null,
    heardAboutUs: null,
    programId: input.programId,
    centerId: input.centerId,
    duplicateHash,
    sidhCandidateId: input.sidhCandidateId,
    syncState: {
      status: "linked",
      lastJobId: null,
      lastAttemptAt: null,
      lastSuccessAt: new Date(),
      lastFailureCode: null,
      lastFailureMessage: null,
      retryCount: 0,
    },
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  await writeAuditLog({
    action: "candidate.sidh_linked",
    actorUserId: actor.user.id,
    entityType: "candidate",
    entityId: candidate.candidateId,
    metadata: { sidhCandidateId: input.sidhCandidateId },
    requestId,
  });

  return serializeCandidate(candidate);
}

export async function createCandidateImportJob(
  actor: AuthSession,
  input: CandidateImportInput,
  fileName: string,
  workbookBuffer: ArrayBuffer,
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);
  resolveScopedCenterFilter(actor, input.centerId);
  await Promise.all([ensureProgramExists(input.programId), ensureTrainingCenterExists(input.centerId)]);

  const workbookSheets = await readWorkbookSheetsFromArrayBuffer(workbookBuffer, { defaultValue: "" });
  const firstSheet = workbookSheets.find((sheet) => normalizeWhitespace(sheet.name).toLowerCase() === "candidate import template") ?? workbookSheets[0];

  if (!firstSheet) {
    throw new ApiError(400, "IMPORT_EMPTY_WORKBOOK", "Workbook does not contain any sheets");
  }

  const rawRows = firstSheet.rows;
  const seenHashes = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;

  for (const [index, rawRow] of rawRows.entries()) {
    const rowNumber = index + 2;
    const candidateInput = mapImportRowToCandidateInput(rawRow, input);
    const rowId = createPrefixedId("impr");

    try {
      const parsed = createCandidateSchema.parse(candidateInput);
      const normalized = buildCandidateRecord(parsed);
      const duplicateIdentityValue = parsed.identity.idNumber || parsed.identity.aadhaarReferenceNo || parsed.contactDetails.mobileNumber;
      const duplicateHash = createDuplicateHash({
        dateOfBirth: parsed.personalDetails.dateOfBirth,
        fullName: parsed.personalDetails.fullName,
        idNumber: duplicateIdentityValue,
        idType: parsed.identity.idType,
        mobileNumber: parsed.contactDetails.mobileNumber,
      });
      const existing = await CandidateModel.findOne({ duplicateHash, programId: parsed.programId, centerId: parsed.centerId }).select({ candidateId: 1 });

      if (existing || seenHashes.has(duplicateHash)) {
        duplicateRows += 1;
        rows.push({
          rowId,
          rowNumber,
          raw: rawRow,
          normalized: candidateInput,
          status: "duplicate",
          errors: [{ field: "duplicateHash", message: existing ? `Matches existing candidate ${existing.candidateId}` : "Matches another row in this import" }],
          duplicateOfCandidateId: existing?.candidateId ?? null,
          candidateId: null,
        });
        continue;
      }

      seenHashes.add(duplicateHash);
      validRows += 1;
      rows.push({
        rowId,
        rowNumber,
        raw: rawRow,
        normalized: {
          ...candidateInput,
          _duplicateHash: normalized.duplicateHash,
        },
        status: "valid",
        errors: [],
        duplicateOfCandidateId: null,
        candidateId: null,
      });
    } catch (error) {
      invalidRows += 1;
      const issues = error instanceof ApiError ? error.errors : "issues" in (error as object) ? (error as { issues: Array<{ path: Array<string | number>; message: string }> }).issues : [];
      rows.push({
        rowId,
        rowNumber,
        raw: rawRow,
        normalized: candidateInput,
        status: "invalid",
        errors: Array.isArray(issues)
          ? issues.map((issue) => ({ field: "path" in issue && Array.isArray(issue.path) ? issue.path.join(".") : "field" in issue ? issue.field : undefined, message: issue.message }))
          : [{ message: "Invalid row" }],
        duplicateOfCandidateId: null,
        candidateId: null,
      });
    }
  }

  const job = await ImportJobModel.create({
    importJobId: createPrefixedId("imp"),
    fileName,
    status: "staged",
    programId: input.programId,
    centerId: input.centerId,
    registrationMode: input.registrationMode,
    totalRows: rawRows.length,
    validRows,
    invalidRows,
    duplicateRows,
    committedRows: 0,
    rows,
    createdByUserId: actor.user.id,
  });

  await writeAuditLog({
    action: "candidate.import.staged",
    actorUserId: actor.user.id,
    entityType: "candidate_import",
    entityId: job.importJobId,
    metadata: { fileName, totalRows: rawRows.length, validRows, invalidRows, duplicateRows },
    requestId,
  });

  return serializeImportJob(job);
}

export async function getCandidateImportJob(actor: AuthSession, importJobId: string) {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const job = await ImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  resolveScopedCenterFilter(actor, job.centerId);
  return serializeImportJob(job);
}

export async function listCandidateImportRows(actor: AuthSession, importJobId: string, page: number, pageSize: number) {
  await connectToDatabase();
  ensureCanReadCandidates(actor);

  const job = await ImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  resolveScopedCenterFilter(actor, job.centerId);

  const rows = Array.from(job.rows as unknown as Array<Record<string, unknown>>);
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize).map((row) => serializeImportRow(row));

  return {
    items,
    page,
    pageSize,
    total: rows.length,
  };
}

export async function commitCandidateImportJob(actor: AuthSession, importJobId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);

  const job = await ImportJobModel.findOne({ importJobId });

  if (!job) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found");
  }

  resolveScopedCenterFilter(actor, job.centerId);

  if (job.status === "committed") {
    throw new ApiError(409, "IMPORT_ALREADY_COMMITTED", "This import job has already been committed");
  }

  const updatedRows: Array<Record<string, unknown>> = [];
  let committedRows = 0;

  for (const row of Array.from(job.rows as unknown as Array<Record<string, unknown>>)) {
    if (row.status !== "valid") {
      updatedRows.push(row);
      continue;
    }

    try {
      const candidateInput = createCandidateSchema.parse(row.normalized);
      const createdCandidate = await createCandidateRecord(actor, candidateInput, {
        queueSync: candidateInput.registrationMode === "internal_registration",
        requestId,
        skipAudit: true,
        sourceImportJobId: importJobId,
      });

      committedRows += 1;
      updatedRows.push({
        ...row,
        status: "committed",
        candidateId: createdCandidate.candidateId,
      });
    } catch (error) {
      updatedRows.push({
        ...row,
        status: "skipped",
        errors: [
          ...(Array.isArray(row.errors) ? (row.errors as Array<Record<string, unknown>>) : []),
          {
            message: error instanceof Error ? error.message : "Unable to commit row",
          },
        ],
      });
    }
  }

  job.rows = updatedRows as never;
  job.status = "committed";
  job.committedRows = committedRows;
  job.committedAt = new Date();
  await job.save();

  await writeAuditLog({
    action: "candidate.import.committed",
    actorUserId: actor.user.id,
    entityType: "candidate_import",
    entityId: importJobId,
    metadata: { committedRows },
    requestId,
  });

  return serializeImportJob(job);
}

export async function queueCandidateSync(actor: AuthSession, candidateId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteCandidates(actor);

  const candidate = await CandidateModel.findOne({ candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  if (candidate.registrationMode === "existing_sidh_link") {
    throw new ApiError(409, "SYNC_NOT_REQUIRED", "Existing SIDH linked candidates do not require registration sync");
  }

  return createQueuedSyncJob(actor, serializeCandidate(candidate), requestId);
}

export async function listSyncJobs(actor: AuthSession, query: SyncJobsQuery) {
  await connectToDatabase();
  ensureCanReadSyncJobs(actor);

  const scopedCenterFilter = resolveScopedCenterFilter(actor);
  const candidateIds = Array.isArray(scopedCenterFilter)
    ? (await CandidateModel.find({ centerId: { $in: scopedCenterFilter } }).select({ candidateId: 1 })).map((item) => item.candidateId)
    : undefined;
  const filter: Record<string, unknown> = {};

  if (query.entityType) {
    filter.entityType = query.entityType;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (candidateIds) {
    filter.candidateId = { $in: candidateIds };
  }

  const skip = (query.page - 1) * query.pageSize;
  const [items, total] = await Promise.all([
    SyncJobModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize),
    SyncJobModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeSyncJob(item)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getSyncJob(actor: AuthSession, syncJobId: string) {
  await connectToDatabase();
  ensureCanReadSyncJobs(actor);

  const job = await SyncJobModel.findOne({ syncJobId });

  if (!job) {
    throw new ApiError(404, "SYNC_JOB_NOT_FOUND", "Sync job not found");
  }

  const candidate = await CandidateModel.findOne({ candidateId: job.candidateId }).select({ centerId: 1 });
  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found for sync job");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  const transactions = await SidhApiTransactionModel.find({ syncJobId }).sort({ createdAt: -1 }).limit(20);

  return {
    ...serializeSyncJob(job),
    transactions: transactions.map((transaction) => ({
      transactionId: transaction.transactionId,
      operation: transaction.operation,
      endpoint: transaction.endpoint,
      responseStatus: transaction.responseStatus,
      success: transaction.success,
      createdAt: toIsoDate(transaction.createdAt),
    })),
  };
}

export async function retrySyncJob(actor: AuthSession, syncJobId: string, requestId?: string) {
  await connectToDatabase();
  ensureCanWriteSyncJobs(actor);

  const job = await SyncJobModel.findOne({ syncJobId });

  if (!job) {
    throw new ApiError(404, "SYNC_JOB_NOT_FOUND", "Sync job not found");
  }

  const candidate = await CandidateModel.findOne({ candidateId: job.candidateId });

  if (!candidate) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found");
  }

  resolveScopedCenterFilter(actor, candidate.centerId);

  if (job.status === "processing") {
    throw new ApiError(409, "SYNC_JOB_BUSY", "Sync job is currently processing");
  }

  job.status = "queued";
  job.lockId = null;
  job.lockedAt = null;
  job.nextRunAt = new Date();
  await job.save();

  candidate.syncState = {
    ...(candidate.syncState ?? {}),
    status: "queued",
    lastJobId: syncJobId,
  } as never;
  await candidate.save();

  await writeAuditLog({
    action: "candidate.sync.retried",
    actorUserId: actor.user.id,
    entityType: "sync_job",
    entityId: syncJobId,
    metadata: { candidateId: job.candidateId },
    requestId,
  });

  return serializeSyncJob(job);
}