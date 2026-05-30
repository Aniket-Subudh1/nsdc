import mongoose, { type InferSchemaType, type Model } from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    auditLogId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    actorUserId: {
      type: String,
      default: null,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
    },
    entityId: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    requestId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;

export const AuditLogModel =
  (mongoose.models.AuditLog as Model<AuditLogDocument> | undefined) ??
  mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema);