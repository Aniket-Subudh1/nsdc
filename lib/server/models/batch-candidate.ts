import mongoose, { type InferSchemaType, type Model } from "mongoose";

const batchCandidateSchema = new mongoose.Schema(
  {
    batchCandidateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    batchId: {
      type: String,
      required: true,
      index: true,
    },
    candidateId: {
      type: String,
      required: true,
      index: true,
    },
    enrollmentStatus: {
      type: String,
      enum: ["not_enrolled", "queued", "processing", "synced", "failed", "manual_review", "cancelled"],
      default: "not_enrolled",
      index: true,
    },
    sidhEnrollmentId: {
      type: String,
      trim: true,
      default: null,
    },
    remoteStatus: {
      type: String,
      trim: true,
      default: null,
    },
    lastEnrollmentSyncAt: {
      type: Date,
      default: null,
    },
    lastEnrollmentFailureCode: {
      type: String,
      default: null,
    },
    lastEnrollmentFailureMessage: {
      type: String,
      default: null,
    },
    enrolledAt: {
      type: Date,
      default: null,
    },
    addedByUserId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

batchCandidateSchema.index({ batchId: 1, candidateId: 1 }, { unique: true });
batchCandidateSchema.index({ candidateId: 1, enrollmentStatus: 1 });

export type BatchCandidateDocument = InferSchemaType<typeof batchCandidateSchema>;

export const BatchCandidateModel =
  (mongoose.models.BatchCandidate as Model<BatchCandidateDocument> | undefined) ??
  mongoose.model<BatchCandidateDocument>("BatchCandidate", batchCandidateSchema);