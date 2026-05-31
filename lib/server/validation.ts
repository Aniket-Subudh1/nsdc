import { z } from "zod";

import { ROLE_KEYS } from "@/lib/server/rbac";

export const authPortalSchema = z.enum(["admin", "training_partner"]);
const loginTextSchema = z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string());
const loginPasswordSchema = z.preprocess((value) => (typeof value === "string" ? value : ""), z.string());
const loginPortalSchema = z.preprocess(
  (value) => (value === "admin" || value === "training_partner" ? value : undefined),
  authPortalSchema.optional(),
);
const roleSchema = z.enum(ROLE_KEYS);
const statusSchema = z.enum(["active", "inactive"]);
const approvalStatusSchema = z.enum(["approved", "pending", "rejected", "expired"]);
const jobRoleMappingTypeSchema = z.enum(["QP_NOS", "JOB_ROLE", "HYBRID"]);
const optionalQueryBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();
const mobileNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Mobile number must be a 10 digit value")
  .optional()
  .or(z.literal(""));

export const loginSchema = z.object({
  email: loginTextSchema,
  password: loginPasswordSchema,
  portal: loginPortalSchema,
});

export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().email(),
  portal: authPortalSchema,
});

export const forgotPasswordResetSchema = z.object({
  email: z.string().trim().email(),
  portal: authPortalSchema,
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be a 6 digit code"),
  newPassword: z.string().min(8).max(128),
});

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    mobileNumber: mobileNumberSchema,
    role: roleSchema.optional(),
    roles: z.array(roleSchema).min(1).optional(),
    centerIds: z.array(z.string().trim().min(1)).default([]),
    temporaryPassword: z.string().min(8).max(128),
  })
  .superRefine((value, ctx) => {
    if (!value.role && (!value.roles || value.roles.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one role is required",
        path: ["role"],
      });
    }
  });

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().optional(),
    mobileNumber: mobileNumberSchema,
    status: z.enum(["active", "inactive"]).optional(),
    mustChangePassword: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field is required",
  });

export const assignRolesSchema = z.object({
  roles: z.array(roleSchema).min(1),
});

export const assignCentersSchema = z.object({
  centerIds: z.array(z.string().trim().min(1)).default([]),
});

export const createTrainingCenterSchema = z.object({
  centerName: z.string().trim().min(3).max(160),
  centerCode: z.string().trim().min(3).max(60),
  sidhTcId: z.string().trim().optional(),
  district: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  programIds: z.array(z.string().trim().min(1)).min(1, "At least one program is required"),
  status: statusSchema.default("active"),
});

export const updateTrainingCenterSchema = z
  .object({
    centerName: z.string().trim().min(3).max(160).optional(),
    centerCode: z.string().trim().min(3).max(60).optional(),
    sidhTcId: z.string().trim().optional(),
    district: z.string().trim().min(2).max(120).optional(),
    state: z.string().trim().min(2).max(120).optional(),
    programIds: z.array(z.string().trim().min(1)).min(1).optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field is required",
  });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const listQueryBaseSchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  status: statusSchema.optional(),
});

export const programListQuerySchema = listQueryBaseSchema.extend({
  syncToSidh: optionalQueryBooleanSchema,
});

export const sectorListQuerySchema = listQueryBaseSchema;

export const schemeListQuerySchema = listQueryBaseSchema.extend({
  syncEnabled: optionalQueryBooleanSchema,
});

export const createProgramSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  syncToSidh: z.boolean().default(false),
  status: statusSchema.default("active"),
});

export const updateProgramSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    code: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    syncToSidh: z.boolean().optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field is required",
  });

export const createSectorSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  status: statusSchema.default("active"),
});

const optionalDateStringSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    return value.trim() === "" ? undefined : value;
  },
  z.string().date().optional(),
);

export const createSchemeSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    code: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional(),
    status: statusSchema.default("active"),
    syncEnabled: z.boolean().default(false),
    sidhSchemeId: z.string().trim().optional(),
    fundingType: z.string().trim().optional(),
    beneficiaryType: z.string().trim().optional(),
    validFrom: optionalDateStringSchema,
    validTo: optionalDateStringSchema,
  })
  .superRefine((value, ctx) => {
    if (value.syncEnabled && !value.sidhSchemeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sync-enabled schemes require a SIDH Scheme ID",
        path: ["syncEnabled"],
      });
    }
  });

export const updateSchemeSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    code: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    status: statusSchema.optional(),
    syncEnabled: z.boolean().optional(),
    sidhSchemeId: z.string().trim().optional(),
    fundingType: z.string().trim().optional(),
    beneficiaryType: z.string().trim().optional(),
    validFrom: optionalDateStringSchema,
    validTo: optionalDateStringSchema,
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field is required",
  });

export const createCourseSchema = z.object({
  sectorId: z.string().trim().min(1),
  programIds: z.array(z.string().trim().min(1)).default([]),
  schemeIds: z.array(z.string().trim().min(1)).default([]),
  courseName: z.string().trim().min(2).max(200),
  internalCourseCode: z.string().trim().min(2).max(80),
  sidhCourseId: z.string().trim().min(2).max(120),
  associatedQpOrJobRole: z.string().trim().min(2).max(200),
  nsqfLevel: z.coerce.number().min(1).max(10),
  trainingHours: z.coerce.number().positive(),
  gtUploadedDurationHours: z.coerce.number().positive().optional(),
  approvalStatus: approvalStatusSchema.default("pending"),
  approvalDate: z.string().date().optional(),
  validityStartDate: z.string().date(),
  validityEndDate: z.string().date(),
  minimumAge: z.coerce.number().int().min(0),
  price: z.coerce.number().min(0),
  qpCode: z.string().trim().min(2).max(120),
  jobRoleMappingType: jobRoleMappingTypeSchema,
  status: statusSchema.default("active"),
});

export const updateCourseSchema = z
  .object({
    sectorId: z.string().trim().min(1).optional(),
    programIds: z.array(z.string().trim().min(1)).optional(),
    schemeIds: z.array(z.string().trim().min(1)).optional(),
    courseName: z.string().trim().min(2).max(200).optional(),
    internalCourseCode: z.string().trim().min(2).max(80).optional(),
    sidhCourseId: z.string().trim().min(2).max(120).optional(),
    associatedQpOrJobRole: z.string().trim().min(2).max(200).optional(),
    nsqfLevel: z.coerce.number().min(1).max(10).optional(),
    trainingHours: z.coerce.number().positive().optional(),
    gtUploadedDurationHours: z.coerce.number().positive().optional(),
    approvalStatus: approvalStatusSchema.optional(),
    approvalDate: z.string().date().optional(),
    validityStartDate: z.string().date().optional(),
    validityEndDate: z.string().date().optional(),
    minimumAge: z.coerce.number().int().min(0).optional(),
    price: z.coerce.number().min(0).optional(),
    qpCode: z.string().trim().min(2).max(120).optional(),
    jobRoleMappingType: jobRoleMappingTypeSchema.optional(),
    status: statusSchema.optional(),
    currentVersion: z.coerce.number().int().positive().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field is required",
  });

export const courseListQuerySchema = listQueryBaseSchema.extend({
  sectorId: z.string().trim().optional(),
  programId: z.string().trim().optional(),
  approvalStatus: approvalStatusSchema.optional(),
  validOn: z.string().date().optional(),
});

export const courseVersionsQuerySchema = z.object({
  courseId: z.string().trim().min(1),
});

const pinCodeSchema = z.string().trim().regex(/^\d{6}$/, "PIN code must be a 6 digit value");
const registrationModeSchema = z.enum(["internal_registration", "existing_sidh_link"]);
const candidateSyncStatusSchema = z.enum(["not_queued", "queued", "processing", "synced", "failed", "manual_review", "linked"]);
const syncJobStatusSchema = z.enum(["queued", "processing", "succeeded", "failed", "manual_review", "dead_letter"]);
const batchStatusSchema = z.enum(["draft", "ready", "active", "completed", "cancelled"]);
const batchSyncStatusSchema = z.enum(["not_synced", "queued", "processing", "synced", "failed", "manual_review", "cancelled"]);
const attendanceUploadStatusSchema = z.enum(["staged", "validated", "committed", "failed"]);
const attendanceStatusSchema = z.enum(["present", "absent"]);
const candidateTrainingStatusSchema = z.enum(["ongoing", "completed", "dropout"]);
const timeSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm format");
const requiredStringSchema = z.string().trim().min(1);
const stringOrNumberIdSchema = z.union([requiredStringSchema, z.coerce.number().int().positive()]);
const yesNoSchema = z.enum(["Yes", "No"]).optional().or(z.literal(""));
const nullableTrimmedStringSchema = z.string().trim().optional().or(z.literal(""));

const candidateAddressSchema = z.object({
  address: z.string().trim().min(2),
  state: z.string().trim().min(2),
  district: z.string().trim().min(2),
  pinCode: pinCodeSchema,
  city: z.string().trim().min(2),
  tehsil: z.string().trim().min(2),
  constituency: z.string().trim().min(2),
});

const candidateCommunicationAddressBaseSchema = z.object({
    sameAsPermanent: z.boolean().default(true),
    address: nullableTrimmedStringSchema,
    state: nullableTrimmedStringSchema,
    district: nullableTrimmedStringSchema,
    pinCode: nullableTrimmedStringSchema,
    city: nullableTrimmedStringSchema,
    tehsil: nullableTrimmedStringSchema,
    constituency: nullableTrimmedStringSchema,
  });

const candidateCommunicationAddressSchema = candidateCommunicationAddressBaseSchema.superRefine((value, ctx) => {
    if (value.sameAsPermanent) {
      return;
    }

    const requiredFields = [
      ["address", value.address],
      ["state", value.state],
      ["district", value.district],
      ["pinCode", value.pinCode],
      ["city", value.city],
      ["tehsil", value.tehsil],
      ["constituency", value.constituency],
    ] as const;

    for (const [field, fieldValue] of requiredFields) {
      if (!fieldValue?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Communication address is required when sameAsPermanent is false",
          path: [field],
        });
      }
    }

    if (value.pinCode?.trim() && !/^\d{6}$/.test(value.pinCode.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PIN code must be a 6 digit value",
        path: ["pinCode"],
      });
    }
  });

const candidatePersonalDetailsBaseSchema = z.object({
    salutation: nullableTrimmedStringSchema,
    fullName: z.string().trim().min(2).max(160),
    gender: z.string().trim().min(1).max(80),
    dateOfBirth: z.string().date(),
    maritalStatus: nullableTrimmedStringSchema,
    fathersName: nullableTrimmedStringSchema,
    mothersName: nullableTrimmedStringSchema,
    guardiansName: nullableTrimmedStringSchema,
    religion: nullableTrimmedStringSchema,
    category: nullableTrimmedStringSchema,
    disability: z.boolean().default(false),
    typeOfDisability: nullableTrimmedStringSchema,
    educationLevel: nullableTrimmedStringSchema,
  });

const candidatePersonalDetailsSchema = candidatePersonalDetailsBaseSchema.superRefine((value, ctx) => {
    if (!value.fathersName?.trim() && !value.guardiansName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Father name or guardian name is required",
        path: ["fathersName"],
      });
    }

    if (value.disability && !value.typeOfDisability?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Disability type is required when disability is yes",
        path: ["typeOfDisability"],
      });
    }
  });

const candidateContactDetailsSchema = z.object({
  email: z.string().trim().email().optional().or(z.literal("")),
  countryCode: z.string().trim().min(1).default("91"),
  mobileNumber: z.string().trim().regex(/^\d{10}$/, "Mobile number must be a 10 digit value"),
});

const candidateIdentityBaseSchema = z.object({
    idType: z.string().trim().min(1).max(120),
    typeOfAlternateId: nullableTrimmedStringSchema,
    aadhaarReferenceNo: nullableTrimmedStringSchema,
    idNumber: nullableTrimmedStringSchema,
  });

const candidateIdentitySchema = candidateIdentityBaseSchema.superRefine((value, ctx) => {
    const usesAadhaar = /aadhaar|adhar/i.test(value.idType);

    if (usesAadhaar && !value.aadhaarReferenceNo?.trim() && !value.idNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Aadhaar reference number or ID number is required for Aadhaar-based identity",
        path: ["aadhaarReferenceNo"],
      });
    }

    if (!usesAadhaar && !value.idNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ID number is required",
        path: ["idNumber"],
      });
    }

    if (/alternate/i.test(value.idType) && !value.typeOfAlternateId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Alternate ID type is required when alternate ID is selected",
        path: ["typeOfAlternateId"],
      });
    }
  });

const candidateDomicileSchema = z.object({
  state: z.string().trim().min(2).max(120),
  district: z.string().trim().min(2).max(120),
});

const candidateExperienceBaseSchema = z.object({
    trainingStatus: z.string().trim().min(1).max(80),
    previousExperienceSector: nullableTrimmedStringSchema,
    monthsOfPreviousExperience: z.coerce.number().int().min(0).optional().nullable(),
    employed: yesNoSchema,
    employmentStatus: nullableTrimmedStringSchema,
    employmentDetails: nullableTrimmedStringSchema,
    heardAboutUs: nullableTrimmedStringSchema,
  });

const candidateExperienceSchema = candidateExperienceBaseSchema.superRefine((value, ctx) => {
    if (/experienced/i.test(value.trainingStatus)) {
      if (!value.previousExperienceSector?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Previous experience sector is required for experienced candidates",
          path: ["previousExperienceSector"],
        });
      }

      if (value.monthsOfPreviousExperience === null || value.monthsOfPreviousExperience === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Months of previous experience is required for experienced candidates",
          path: ["monthsOfPreviousExperience"],
        });
      }
    }
  });

export const createCandidateSchema = z.object({
  programId: z.string().trim().min(1),
  centerId: z.string().trim().min(1),
  registrationMode: registrationModeSchema.default("internal_registration"),
  personalDetails: candidatePersonalDetailsSchema,
  contactDetails: candidateContactDetailsSchema,
  identity: candidateIdentitySchema,
  domicile: candidateDomicileSchema,
  permanentAddress: candidateAddressSchema,
  communicationAddress: candidateCommunicationAddressSchema,
  experience: candidateExperienceSchema,
});

export const updateCandidateSchema = z
  .object({
    programId: z.string().trim().min(1).optional(),
    centerId: z.string().trim().min(1).optional(),
    registrationMode: registrationModeSchema.optional(),
    personalDetails: candidatePersonalDetailsBaseSchema.partial().optional(),
    contactDetails: candidateContactDetailsSchema.partial().optional(),
    identity: candidateIdentityBaseSchema.partial().optional(),
    domicile: candidateDomicileSchema.partial().optional(),
    permanentAddress: candidateAddressSchema.partial().optional(),
    communicationAddress: candidateCommunicationAddressBaseSchema.partial().optional(),
    experience: candidateExperienceBaseSchema.partial().optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field is required",
  });

export const linkExistingSidhCandidateSchema = z.object({
  programId: z.string().trim().min(1),
  centerId: z.string().trim().min(1),
  sidhCandidateId: z.string().trim().min(2).max(120),
  mobileNumber: z.string().trim().regex(/^\d{10}$/, "Mobile number must be a 10 digit value"),
  fullName: z.string().trim().min(2).max(160),
  dateOfBirth: z.string().date(),
});

export const candidateListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  programId: z.string().trim().optional(),
  centerId: z.string().trim().optional(),
  syncStatus: candidateSyncStatusSchema.optional(),
  registrationMode: registrationModeSchema.optional(),
});

export const candidateImportSchema = z.object({
  programId: z.string().trim().min(1),
  centerId: z.string().trim().min(1),
  registrationMode: registrationModeSchema.default("internal_registration"),
});

export const syncJobsQuerySchema = paginationQuerySchema.extend({
  entityType: z.enum(["candidate"]).optional(),
  status: syncJobStatusSchema.optional(),
});

export const processSyncJobsSchema = z.object({
  limit: z.coerce.number().int().positive().max(25).default(5),
});

const batchCandidateIdsSchema = z
  .array(z.string().trim().min(1))
  .max(80, "Batch size must never exceed 80 candidates")
  .superRefine((value, ctx) => {
    const seen = new Set<string>();

    value.forEach((candidateId, index) => {
      const normalized = candidateId.trim();

      if (seen.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Candidate can only be added to a batch once",
          path: [index],
        });
      }

      seen.add(normalized);
    });
  });

export const createBatchSchema = z
  .object({
    batchCode: z.string().trim().min(2).max(80),
    batchName: z.string().trim().min(2).max(160).optional().or(z.literal("")),
    batchSize: z.coerce.number().int().min(1).max(80).default(80),
    courseId: z.string().trim().min(1),
    schemeId: z.string().trim().min(1),
    centerId: z.string().trim().min(1),
    startDate: z.string().date(),
    endDate: z.string().date(),
    assessmentDate: z.string().date(),
    startTime: timeSchema.default("09:00"),
    endTime: timeSchema.default("17:00"),
    trainingHoursPerDay: z.coerce.number().int().positive().max(24).default(8),
    fee: z.coerce.number().min(0).default(0),
    status: batchStatusSchema.default("draft"),
    syncEnabled: z.boolean().default(true),
    allowAssessmentBeforeBatchEnd: z.boolean().default(false),
    allowCandidateOverlap: z.boolean().default(false),
    assessmentEligibilityThreshold: z.coerce.number().int().min(0).max(100).default(70),
    candidateIds: batchCandidateIdsSchema.default([]),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Batch start date must be before end date",
        path: ["endDate"],
      });
    }

    if (value.assessmentDate && !value.allowAssessmentBeforeBatchEnd && value.assessmentDate < value.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assessment date cannot be before batch end date unless explicitly configured",
        path: ["assessmentDate"],
      });
    }
  });

export const updateBatchSchema = z
  .object({
    batchCode: z.string().trim().min(2).max(80).optional(),
    batchName: z.string().trim().min(2).max(160).optional().or(z.literal("")),
    batchSize: z.coerce.number().int().min(1).max(80).optional(),
    courseId: z.string().trim().min(1).optional(),
    schemeId: z.string().trim().min(1).optional(),
    centerId: z.string().trim().min(1).optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    assessmentDate: z.string().date().optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    trainingHoursPerDay: z.coerce.number().int().positive().max(24).optional(),
    fee: z.coerce.number().min(0).optional(),
    status: batchStatusSchema.optional(),
    syncEnabled: z.boolean().optional(),
    allowAssessmentBeforeBatchEnd: z.boolean().optional(),
    allowCandidateOverlap: z.boolean().optional(),
    assessmentEligibilityThreshold: z.coerce.number().int().min(0).max(100).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "At least one field is required",
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Batch start date must be before end date",
        path: ["endDate"],
      });
    }

    if (
      value.assessmentDate &&
      value.endDate &&
      value.allowAssessmentBeforeBatchEnd !== true &&
      value.assessmentDate < value.endDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assessment date cannot be before batch end date unless explicitly configured",
        path: ["assessmentDate"],
      });
    }
  });

export const batchListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  courseId: z.string().trim().optional(),
  schemeId: z.string().trim().optional(),
  centerId: z.string().trim().optional(),
  status: batchStatusSchema.optional(),
  syncStatus: batchSyncStatusSchema.optional(),
  syncEnabled: optionalQueryBooleanSchema,
});

export const addCandidatesToBatchSchema = z.object({
  candidateIds: z.array(z.string().trim().min(1)).min(1).max(80),
});

export const batchSyncRequestSchema = z.object({
  forceResync: z.boolean().default(false),
});

export const enrollmentSyncRequestSchema = z.object({
  candidateIds: z.array(z.string().trim().min(1)).optional(),
  forceResync: z.boolean().default(false),
});

export const trainingAssessmentSubmissionSchema = z.object({
  batchId: stringOrNumberIdSchema.optional(),
  candidates: z
    .array(
      z.object({
        candidateID: requiredStringSchema,
        trainingDetails: z.object({
          trainingStatus: requiredStringSchema,
          attendance: z.coerce.number().int().min(0).max(100),
        }),
        assessmentDetails: z.object({
          assessmentStatus: requiredStringSchema,
          assessmentPercentage: z.coerce.number().int().min(0).max(100),
          grade: requiredStringSchema.optional(),
          assessmentDataUploadedOn: requiredStringSchema,
          assessmentAgency: requiredStringSchema.default("Self"),
          assessorID: requiredStringSchema,
          assessorName: requiredStringSchema,
        }),
        certificationDetails: z.object({
          certificationName: requiredStringSchema,
          isCertified: z.boolean(),
          certifyingAgency: requiredStringSchema,
          certificationDate: requiredStringSchema,
        }),
      }),
    )
    .min(1),
});

export const certificateGenerationRequestSchema = z
  .object({
    candidateId: requiredStringSchema.optional(),
    userName: requiredStringSchema.optional(),
  })
  .refine((value) => value.candidateId || value.userName, {
    message: "candidateId or userName is required",
    path: ["candidateId"],
  });

export const certificateDownloadQuerySchema = z.object({
  candidateId: requiredStringSchema,
  type: requiredStringSchema.default("externalcertificate"),
});

export const attendanceImportFormSchema = z.object({
  batchId: z.string().trim().min(1),
});

export const attendanceImportRowSchema = z.object({
  candidateId: z.string().trim().min(1),
  attendanceDate: z.string().date(),
  attendanceStatus: attendanceStatusSchema,
  trainingStatus: candidateTrainingStatusSchema.optional(),
});

export const attendanceCommitSchema = z.object({
  overwriteExisting: z.boolean().default(false),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type LinkExistingSidhCandidateInput = z.infer<typeof linkExistingSidhCandidateSchema>;
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;
export type CandidateImportInput = z.infer<typeof candidateImportSchema>;
export type SyncJobsQuery = z.infer<typeof syncJobsQuerySchema>;
export type ProcessSyncJobsInput = z.infer<typeof processSyncJobsSchema>;
export type BatchStatus = z.infer<typeof batchStatusSchema>;
export type BatchSyncStatus = z.infer<typeof batchSyncStatusSchema>;
export type AttendanceUploadStatus = z.infer<typeof attendanceUploadStatusSchema>;
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;
export type CandidateTrainingStatus = z.infer<typeof candidateTrainingStatusSchema>;
export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
export type BatchListQuery = z.infer<typeof batchListQuerySchema>;
export type AddCandidatesToBatchInput = z.infer<typeof addCandidatesToBatchSchema>;
export type BatchSyncRequestInput = z.infer<typeof batchSyncRequestSchema>;
export type EnrollmentSyncRequestInput = z.infer<typeof enrollmentSyncRequestSchema>;
export type TrainingAssessmentSubmissionInput = z.infer<typeof trainingAssessmentSubmissionSchema>;
export type CertificateGenerationRequestInput = z.infer<typeof certificateGenerationRequestSchema>;
export type CertificateDownloadQueryInput = z.infer<typeof certificateDownloadQuerySchema>;
export type AttendanceImportFormInput = z.infer<typeof attendanceImportFormSchema>;
export type AttendanceImportRowInput = z.infer<typeof attendanceImportRowSchema>;
export type AttendanceCommitInput = z.infer<typeof attendanceCommitSchema>;