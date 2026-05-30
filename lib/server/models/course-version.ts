import mongoose, { type InferSchemaType, type Model } from "mongoose";

const courseVersionSchema = new mongoose.Schema(
  {
    courseVersionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    courseId: {
      type: String,
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    changedByUserId: {
      type: String,
      default: null,
    },
    changeSummary: {
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

courseVersionSchema.index({ courseId: 1, version: 1 }, { unique: true });

export type CourseVersionDocument = InferSchemaType<typeof courseVersionSchema>;

export const CourseVersionModel =
  (mongoose.models.CourseVersion as Model<CourseVersionDocument> | undefined) ??
  mongoose.model<CourseVersionDocument>("CourseVersion", courseVersionSchema);