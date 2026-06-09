import mongoose, { type InferSchemaType, type Model } from "mongoose";

const batchEnrollmentRowSchema = new mongoose.Schema(
  {
    enrollmentJobId: {
      type: String,
      required: true,
      index: true,
    },
    rowId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    rowNumber: {
      type: Number,
      required: true,
      index: true,
    },
    candidateId: {
      type: String,
      required: true,
      index: true,
    },
    candidateName: {
      type: String,
      default: null,
    },
    candidateMobileNumber: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["valid", "invalid", "duplicate", "committed", "skipped"],
      default: "invalid",
      index: true,
    },
    validationErrors: {
      type: [
        new mongoose.Schema(
          {
            field: {
              type: String,
              default: null,
            },
            message: {
              type: String,
              required: true,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

batchEnrollmentRowSchema.index({ enrollmentJobId: 1, status: 1, rowNumber: 1 });

export type BatchEnrollmentRowDocument = InferSchemaType<typeof batchEnrollmentRowSchema>;

export const BatchEnrollmentRowModel =
  (mongoose.models.BatchEnrollmentRow as Model<BatchEnrollmentRowDocument> | undefined) ??
  mongoose.model<BatchEnrollmentRowDocument>("BatchEnrollmentRow", batchEnrollmentRowSchema);
