import mongoose, { type InferSchemaType, type Model } from "mongoose";

const candidateImportRowSchema = new mongoose.Schema(
  {
    importJobId: {
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
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    normalized: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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
    duplicateOfCandidateId: {
      type: String,
      default: null,
    },
    candidateId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

candidateImportRowSchema.index({ importJobId: 1, status: 1, rowNumber: 1 });

export type CandidateImportRowDocument = InferSchemaType<typeof candidateImportRowSchema>;

export const CandidateImportRowModel =
  (mongoose.models.CandidateImportRow as Model<CandidateImportRowDocument> | undefined) ??
  mongoose.model<CandidateImportRowDocument>("CandidateImportRow", candidateImportRowSchema);
