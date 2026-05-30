import mongoose, { type InferSchemaType, type Model } from "mongoose";

const referenceValueSchema = new mongoose.Schema(
  {
    referenceValueId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

referenceValueSchema.index({ category: 1, code: 1 }, { unique: true });

export type ReferenceValueDocument = InferSchemaType<typeof referenceValueSchema>;

export const ReferenceValueModel =
  (mongoose.models.ReferenceValue as Model<ReferenceValueDocument> | undefined) ??
  mongoose.model<ReferenceValueDocument>("ReferenceValue", referenceValueSchema);