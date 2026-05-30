import mongoose, { type InferSchemaType, type Model } from "mongoose";

const attendanceRowErrorSchema = new mongoose.Schema(
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
);

const attendanceUploadRowSchema = new mongoose.Schema(
  {
    rowId: {
      type: String,
      required: true,
    },
    rowNumber: {
      type: Number,
      required: true,
    },
    candidateId: {
      type: String,
      default: null,
    },
    attendanceDate: {
      type: Date,
      default: null,
    },
    attendanceStatus: {
      type: String,
      enum: ["present", "absent"],
      default: null,
    },
    trainingStatus: {
      type: String,
      enum: ["ongoing", "completed", "dropout"],
      default: null,
    },
    status: {
      type: String,
      enum: ["valid", "invalid", "duplicate"],
      required: true,
    },
    errors: {
      type: [attendanceRowErrorSchema],
      default: [],
    },
    normalized: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false, suppressReservedKeysWarning: true },
);

const attendanceUploadSchema = new mongoose.Schema(
  {
    attendanceUploadId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    batchId: {
      type: String,
      required: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["staged", "validated", "committed", "failed"],
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
    committedRows: {
      type: Number,
      default: 0,
    },
    rows: {
      type: [attendanceUploadRowSchema],
      default: [],
    },
    createdByUserId: {
      type: String,
      default: null,
    },
    committedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

attendanceUploadSchema.index({ batchId: 1, createdAt: -1 });

export type AttendanceUploadDocument = InferSchemaType<typeof attendanceUploadSchema>;

export const AttendanceUploadModel =
  (mongoose.models.AttendanceUpload as Model<AttendanceUploadDocument> | undefined) ??
  mongoose.model<AttendanceUploadDocument>("AttendanceUpload", attendanceUploadSchema);