import mongoose, { type InferSchemaType, type Model } from "mongoose";

const attendanceRecordSchema = new mongoose.Schema(
  {
    attendanceRecordId: {
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
    candidateId: {
      type: String,
      required: true,
      index: true,
    },
    attendanceDate: {
      type: Date,
      required: true,
      index: true,
    },
    attendanceStatus: {
      type: String,
      enum: ["present", "absent"],
      required: true,
    },
    trainingStatus: {
      type: String,
      enum: ["ongoing", "completed", "dropout"],
      default: null,
    },
    sourceUploadId: {
      type: String,
      default: null,
    },
    committedByUserId: {
      type: String,
      default: null,
    },
    committedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

attendanceRecordSchema.index({ batchId: 1, candidateId: 1, attendanceDate: 1 }, { unique: true });

export type AttendanceRecordDocument = InferSchemaType<typeof attendanceRecordSchema>;

export const AttendanceRecordModel =
  (mongoose.models.AttendanceRecord as Model<AttendanceRecordDocument> | undefined) ??
  mongoose.model<AttendanceRecordDocument>("AttendanceRecord", attendanceRecordSchema);