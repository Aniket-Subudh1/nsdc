import mongoose, { type InferSchemaType, type Model } from "mongoose";

const courseImportRowSchema = new mongoose.Schema(
  {
    rowId: {
      type: String,
      required: true,
      index: true,
    },
    rowNumber: {
      type: Number,
      required: true,
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
    errors: {
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
  { _id: false, suppressReservedKeysWarning: true },
);

const courseImportJobSchema = new mongoose.Schema(
  {
    importJobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["staged", "committed", "failed"],
      default: "staged",
      index: true,
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    validRows: {
      type: Number,
      default: 0,
    },
    invalidRows: {
      type: Number,
      default: 0,
    },
    duplicateRows: {
      type: Number,
      default: 0,
    },
    committedRows: {
      type: Number,
      default: 0,
    },
    rows: {
      type: [courseImportRowSchema],
      default: [],
    },
    committedAt: {
      type: Date,
      default: null,
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

export type CourseImportJobDocument = InferSchemaType<typeof courseImportJobSchema>;

export const CourseImportJobModel =
  (mongoose.models.CourseImportJob as Model<CourseImportJobDocument> | undefined) ??
  mongoose.model<CourseImportJobDocument>("CourseImportJob", courseImportJobSchema);
