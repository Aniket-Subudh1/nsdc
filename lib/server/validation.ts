import { z } from "zod";

import { ROLE_KEYS } from "@/lib/server/rbac";

export const authPortalSchema = z.enum(["admin", "training_partner"]);
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
  email: z.string().trim().email(),
  password: z.string().min(8),
  portal: authPortalSchema.optional(),
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
    validFrom: z.string().date().optional(),
    validTo: z.string().date().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.syncEnabled &&
      (!value.sidhSchemeId || !value.fundingType || !value.beneficiaryType || !value.validFrom || !value.validTo)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sync-enabled schemes require SIDH metadata and validity dates",
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
    validFrom: z.string().date().optional(),
    validTo: z.string().date().optional(),
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