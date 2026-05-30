import mongoose, { type InferSchemaType, type Model } from "mongoose";

const batchSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    batchCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    batchName: {
      type: String,
      trim: true,
      default: null,
    },
    courseId: {
      type: String,
      required: true,
      index: true,
    },
    schemeId: {
      type: String,
      required: true,
      index: true,
    },
    centerId: {
      type: String,
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    assessmentDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "ready", "active", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
    syncEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    allowAssessmentBeforeBatchEnd: {
      type: Boolean,
      default: false,
    },
    allowCandidateOverlap: {
      type: Boolean,
      default: false,
    },
    assessmentEligibilityThreshold: {
      type: Number,
      default: 70,
    },
    candidateCount: {
      type: Number,
      default: 0,
    },
    sidhBatchId: {
      type: String,
      trim: true,
      default: null,
      index: true,
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

batchSchema.index({ centerId: 1, status: 1, startDate: 1, endDate: 1 });

export type BatchDocument = InferSchemaType<typeof batchSchema>;

export const BatchModel =
  (mongoose.models.Batch as Model<BatchDocument> | undefined) ??
  mongoose.model<BatchDocument>("Batch", batchSchema);