import mongoose, { type InferSchemaType, type Model } from "mongoose";

const trainingCenterSchema = new mongoose.Schema(
  {
    centerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    centerName: {
      type: String,
      required: true,
      trim: true,
    },
    centerCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    sidhTcId: {
      type: String,
      trim: true,
      default: null,
    },
    district: {
      type: String,
      trim: true,
      required: true,
    },
    state: {
      type: String,
      trim: true,
      required: true,
    },
    programIds: {
      type: [String],
      default: [],
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
  },
  {
    timestamps: true,
  },
);

export type TrainingCenterDocument = InferSchemaType<typeof trainingCenterSchema>;

export const TrainingCenterModel =
  (mongoose.models.TrainingCenter as Model<TrainingCenterDocument> | undefined) ??
  mongoose.model<TrainingCenterDocument>("TrainingCenter", trainingCenterSchema);