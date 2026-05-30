import mongoose, { type InferSchemaType, type Model } from "mongoose";

const batchDailySessionSchema = new mongoose.Schema(
  {
    batchDailySessionId: {
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
    sessionDate: {
      type: Date,
      required: true,
      index: true,
    },
    expectedCandidateCount: {
      type: Number,
      default: 0,
    },
    presentCount: {
      type: Number,
      default: 0,
    },
    absentCount: {
      type: Number,
      default: 0,
    },
    sourceUploadId: {
      type: String,
      default: null,
    },
    committedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

batchDailySessionSchema.index({ batchId: 1, sessionDate: 1 }, { unique: true });

export type BatchDailySessionDocument = InferSchemaType<typeof batchDailySessionSchema>;

export const BatchDailySessionModel =
  (mongoose.models.BatchDailySession as Model<BatchDailySessionDocument> | undefined) ??
  mongoose.model<BatchDailySessionDocument>("BatchDailySession", batchDailySessionSchema);