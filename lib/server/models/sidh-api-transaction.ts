import mongoose, { type InferSchemaType, type Model } from "mongoose";

const sidhApiTransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    syncJobId: {
      type: String,
      default: null,
      index: true,
    },
    attemptId: {
      type: String,
      default: null,
    },
    operation: {
      type: String,
      required: true,
      trim: true,
    },
    endpoint: {
      type: String,
      required: true,
      trim: true,
    },
    requestPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    responsePayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    requestHeaders: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    responseHeaders: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    responseStatus: {
      type: Number,
      default: null,
    },
    success: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export type SidhApiTransactionDocument = InferSchemaType<typeof sidhApiTransactionSchema>;

export const SidhApiTransactionModel =
  (mongoose.models.SidhApiTransaction as Model<SidhApiTransactionDocument> | undefined) ??
  mongoose.model<SidhApiTransactionDocument>("SidhApiTransaction", sidhApiTransactionSchema);