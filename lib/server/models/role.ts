import mongoose, { type InferSchemaType, type Model } from "mongoose";

import { PERMISSIONS, ROLE_KEYS } from "@/lib/server/rbac";

const roleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ROLE_KEYS,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    permissions: {
      type: [String],
      enum: PERMISSIONS,
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export type RoleDocument = InferSchemaType<typeof roleSchema>;

export const RoleModel =
  (mongoose.models.Role as Model<RoleDocument> | undefined) ??
  mongoose.model<RoleDocument>("Role", roleSchema);