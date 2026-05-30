import mongoose, { type InferSchemaType, type Model } from "mongoose";

const trainingCenterProgramSchema = new mongoose.Schema(
  {
    centerProgramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    centerId: {
      type: String,
      required: true,
      index: true,
    },
    programId: {
      type: String,
      required: true,
      index: true,
    },
    assignedByUserId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

trainingCenterProgramSchema.index({ centerId: 1, programId: 1 }, { unique: true });

export type TrainingCenterProgramDocument = InferSchemaType<typeof trainingCenterProgramSchema>;

export const TrainingCenterProgramModel =
  (mongoose.models.TrainingCenterProgram as Model<TrainingCenterProgramDocument> | undefined) ??
  mongoose.model<TrainingCenterProgramDocument>("TrainingCenterProgram", trainingCenterProgramSchema);