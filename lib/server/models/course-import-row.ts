import mongoose, { type InferSchemaType, type Model } from "mongoose";

const courseImportRowSchema = new mongoose.Schema(
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
    duplicateOfCourseId: {
      type: String,
      default: null,
    },
    courseId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

courseImportRowSchema.index({ importJobId: 1, status: 1, rowNumber: 1 });

export type CourseImportRowDocument = InferSchemaType<typeof courseImportRowSchema>;

export const CourseImportRowModel =
  (mongoose.models.CourseImportRow as Model<CourseImportRowDocument> | undefined) ??
  mongoose.model<CourseImportRowDocument>("CourseImportRow", courseImportRowSchema);
