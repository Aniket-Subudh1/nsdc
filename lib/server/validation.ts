import { z } from "zod";

import { ROLE_KEYS } from "@/lib/server/rbac";

const roleSchema = z.enum(ROLE_KEYS);
const mobileNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Mobile number must be a 10 digit value")
  .optional()
  .or(z.literal(""));

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  portal: z.enum(["admin", "training_partner"]).optional(),
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
  programIds: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});