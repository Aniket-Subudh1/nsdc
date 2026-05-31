import mongoose, { type InferSchemaType, type Model } from "mongoose";

const schemeSchema = new mongoose.Schema(
  {
    schemeId: {
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
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    syncEnabled: {
      type: Boolean,
      default: false,
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
    sidhSchemeId: {
      type: String,
      default: null,
      trim: true,
    },
    fundingType: {
      type: String,
      default: null,
      trim: true,
    },
    beneficiaryType: {
      type: String,
      default: null,
      trim: true,
    },
    validFrom: {
      type: Date,
      default: null,
    },
    validTo: {
      type: Date,
      default: null,
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

export type SchemeDocument = InferSchemaType<typeof schemeSchema>;

export const SchemeModel =
  (mongoose.models.Scheme as Model<SchemeDocument> | undefined) ??
  mongoose.model<SchemeDocument>("Scheme", schemeSchema);