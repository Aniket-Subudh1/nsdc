import mongoose, { type InferSchemaType, type Model } from "mongoose";

const batchSyncAttemptSchema = new mongoose.Schema(
  {
    attemptId: {
      type: String,
      required: true,
      index: true,
    },
    operation: {
      type: String,
      enum: ["batch_sync", "enrollment_sync"],
      required: true,
    },
    status: {
      type: String,
      enum: ["processing", "succeeded", "failed", "manual_review"],
      required: true,
    },
    responseCode: {
      type: Number,
      default: null,
    },
    failureCode: {
      type: String,
      default: null,
    },
    failureMessage: {
      type: String,
      default: null,
    },
    retryable: {
      type: Boolean,
      default: false,
    },
    remoteId: {
      type: String,
      default: null,
    },
    requestFingerprint: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const queuedStateSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["not_synced", "queued", "processing", "synced", "failed", "manual_review", "cancelled"],
      default: "not_synced",
      index: true,
    },
    lastJobId: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    nextRunAt: {
      type: Date,
      default: null,
      index: true,
    },
    lockId: {
      type: String,
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    lastFailureCode: {
      type: String,
      default: null,
    },
    lastFailureMessage: {
      type: String,
      default: null,
    },
    lastSuccessAt: {
      type: Date,
      default: null,
    },
    remoteStatus: {
      type: String,
      default: null,
    },
    requestFingerprint: {
      type: String,
      default: null,
    },
    attempts: {
      type: [batchSyncAttemptSchema],
      default: [],
    },
  },
  { _id: false },
);

const batchSyncStateSchema = new mongoose.Schema(
  {
    batchSyncStateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    batchId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sidhBatchId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    batchSync: {
      type: queuedStateSchema,
      default: () => ({}),
    },
    enrollmentSync: {
      type: queuedStateSchema,
      default: () => ({}),
    },
    createdByUserId: {
      type: String,
      default: null,
    },
    updatedByUserId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

batchSyncStateSchema.index({ "batchSync.status": 1, "batchSync.nextRunAt": 1 });
batchSyncStateSchema.index({ "enrollmentSync.status": 1, "enrollmentSync.nextRunAt": 1 });

export type BatchSyncStateDocument = InferSchemaType<typeof batchSyncStateSchema>;

export const BatchSyncStateModel =
  (mongoose.models.BatchSyncState as Model<BatchSyncStateDocument> | undefined) ??
  mongoose.model<BatchSyncStateDocument>("BatchSyncState", batchSyncStateSchema);