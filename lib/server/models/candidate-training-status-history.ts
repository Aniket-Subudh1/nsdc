import mongoose, { type InferSchemaType, type Model } from "mongoose";

const candidateTrainingStatusHistorySchema = new mongoose.Schema(
  {
    candidateTrainingStatusHistoryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    candidateId: {
      type: String,
      required: true,
      index: true,
    },
    batchId: {
      type: String,
      required: true,
      index: true,
    },
    trainingStatus: {
      type: String,
      enum: ["ongoing", "completed", "dropout"],
      required: true,
      index: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
      index: true,
    },
    sourceUploadId: {
      type: String,
      default: null,
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

candidateTrainingStatusHistorySchema.index({ candidateId: 1, batchId: 1, effectiveDate: -1 });

export type CandidateTrainingStatusHistoryDocument = InferSchemaType<typeof candidateTrainingStatusHistorySchema>;

export const CandidateTrainingStatusHistoryModel =
  (mongoose.models.CandidateTrainingStatusHistory as Model<CandidateTrainingStatusHistoryDocument> | undefined) ??
  mongoose.model<CandidateTrainingStatusHistoryDocument>("CandidateTrainingStatusHistory", candidateTrainingStatusHistorySchema);