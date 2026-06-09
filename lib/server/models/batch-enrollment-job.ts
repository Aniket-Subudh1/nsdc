import mongoose, { type InferSchemaType, type Model } from "mongoose";

const batchEnrollmentJobSchema = new mongoose.Schema(
  {
    enrollmentJobId: {
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
    status: {
      type: String,
      enum: ["staged", "committed", "failed"],
      default: "staged",
      index: true,
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    validRows: {
      type: Number,
      default: 0,
    },
    invalidRows: {
      type: Number,
      default: 0,
    },
    duplicateRows: {
      type: Number,
      default: 0,
    },
    committedRows: {
      type: Number,
      default: 0,
    },
    committedAt: {
      type: Date,
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

export type BatchEnrollmentJobDocument = InferSchemaType<typeof batchEnrollmentJobSchema>;

export const BatchEnrollmentJobModel =
  (mongoose.models.BatchEnrollmentJob as Model<BatchEnrollmentJobDocument> | undefined) ??
  mongoose.model<BatchEnrollmentJobDocument>("BatchEnrollmentJob", batchEnrollmentJobSchema);
