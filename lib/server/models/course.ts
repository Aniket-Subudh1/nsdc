import mongoose, { type InferSchemaType, type Model } from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    courseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sectorId: {
      type: String,
      required: true,
      index: true,
    },
    programIds: {
      type: [String],
      default: [],
    },
    schemeIds: {
      type: [String],
      default: [],
    },
    courseName: {
      type: String,
      required: true,
      trim: true,
    },
    internalCourseCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    sidhCourseId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    associatedQpOrJobRole: {
      type: String,
      required: true,
      trim: true,
    },
    nsqfLevel: {
      type: String,
      required: true,
      trim: true,
    },
    trainingPerDayHours: {
      type: Number,
      default: null,
    },
    trainingHours: {
      type: Number,
      required: true,
    },
    gtUploadedDurationHours: {
      type: Number,
      default: null,
    },
    approvalStatus: {
      type: String,
      enum: ["approved", "pending", "rejected", "expired"],
      default: "pending",
      index: true,
    },
    approvalDate: {
      type: Date,
      default: null,
    },
    validityStartDate: {
      type: Date,
      required: true,
      index: true,
    },
    validityEndDate: {
      type: Date,
      required: true,
      index: true,
    },
    validity: {
      type: Number,
      default: null,
    },
    shortForm: {
      type: String,
      default: null,
      trim: true,
    },
    minimumAge: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    qpCode: {
      type: String,
      required: true,
      trim: true,
    },
    jobRoleMappingType: {
      type: String,
      enum: ["QP_NOS", "JOB_ROLE", "HYBRID"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    version: {
      type: Number,
      default: 1,
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

courseSchema.index({ sidhCourseId: 1, validityStartDate: 1, validityEndDate: 1, status: 1 });

export type CourseDocument = InferSchemaType<typeof courseSchema>;

export const CourseModel =
  (mongoose.models.Course as Model<CourseDocument> | undefined) ??
  mongoose.model<CourseDocument>("Course", courseSchema);