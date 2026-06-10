import mongoose, { type InferSchemaType, type Model } from "mongoose";

import { ROLE_KEYS } from "@/lib/server/rbac";

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    mobileNumber: {
      type: String,
      trim: true,
      default: null,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    roles: {
      type: [String],
      enum: ROLE_KEYS,
      default: [],
    },
    centerIds: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    createdByUserId: {
      type: String,
      default: null,
    },
    updatedByUserId: {
      type: String,
      default: null,
    },
    passwordResetOtpHash: {
      type: String,
      default: null,
    },
    passwordResetOtpExpiresAt: {
      type: Date,
      default: null,
    },
    passwordResetOtpPortal: {
      type: String,
      enum: ["admin", "training_partner", null],
      default: null,
    },
    passwordResetOtpSentAt: {
      type: Date,
      default: null,
    },
    loginOtpHash: {
      type: String,
      default: null,
    },
    loginOtpExpiresAt: {
      type: Date,
      default: null,
    },
    loginOtpChallengeId: {
      type: String,
      default: null,
    },
    loginOtpSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const UserModel =
  (mongoose.models.User as Model<UserDocument> | undefined) ??
  mongoose.model<UserDocument>("User", userSchema);