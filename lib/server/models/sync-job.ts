import mongoose, { type InferSchemaType, type Model } from "mongoose";

const syncAttemptSchema = new mongoose.Schema(
  {
    attemptId: {
      type: String,
      required: true,
      index: true,
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
    remoteCandidateId: {
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

const syncJobSchema = new mongoose.Schema(
  {
    syncJobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ["candidate"],
      default: "candidate",
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    candidateId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "succeeded", "failed", "manual_review", "dead_letter"],
      default: "queued",
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
    retryCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    nextRunAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    payloadSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    latestRemoteCandidateId: {
      type: String,
      default: null,
    },
    attempts: {
      type: [syncAttemptSchema],
      default: [],
    },
    createdByUserId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export type SyncJobDocument = InferSchemaType<typeof syncJobSchema>;

export const SyncJobModel =
  (mongoose.models.SyncJob as Model<SyncJobDocument> | undefined) ??
  mongoose.model<SyncJobDocument>("SyncJob", syncJobSchema);