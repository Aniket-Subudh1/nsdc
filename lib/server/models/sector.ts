import mongoose, { type InferSchemaType, type Model } from "mongoose";

const sectorSchema = new mongoose.Schema(
  {
    sectorId: {
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

export type SectorDocument = InferSchemaType<typeof sectorSchema>;

export const SectorModel =
  (mongoose.models.Sector as Model<SectorDocument> | undefined) ??
  mongoose.model<SectorDocument>("Sector", sectorSchema);