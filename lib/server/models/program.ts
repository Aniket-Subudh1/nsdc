import mongoose, { type InferSchemaType, type Model } from "mongoose";

const programSchema = new mongoose.Schema(
  {
    programId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    syncToSidh: {
      type: Boolean,
      default: false,
    },
    skillingCategoryId: {
      type: Number,
      default: 1,
    },
    skillingCategoryName: {
      type: String,
      default: null,
      trim: true,
    },
    skillingCategoryScheme: {
      type: String,
      default: "Fee Based",
      trim: true,
    },
    assessmentMode: {
      type: String,
      default: "Self",
      trim: true,
    },
    batchType: {
      type: String,
      default: "Regular",
      trim: true,
    },
    batchCategoryType: {
      type: String,
      default: "Fee Based",
      trim: true,
    },
    feePaidBy: {
      type: String,
      default: "Self-Paid",
      trim: true,
    },
    createdSource: {
      type: String,
      default: "Created for NSDC Academy Partners",
      trim: true,
    },
    verifiedForSidh: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verifiedByUserId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
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

export type ProgramDocument = InferSchemaType<typeof programSchema>;

export const ProgramModel =
  (mongoose.models.Program as Model<ProgramDocument> | undefined) ??
  mongoose.model<ProgramDocument>("Program", programSchema);