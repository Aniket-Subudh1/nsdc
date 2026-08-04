import mongoose, { type InferSchemaType, type Model } from "mongoose";

const DEFAULT_TXN_RETENTION_SECONDS = 90 * 24 * 60 * 60;

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
      index: true,
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
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + DEFAULT_TXN_RETENTION_SECONDS * 1000),
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

sidhApiTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sidhApiTransactionSchema.index({ syncJobId: 1, operation: 1, success: 1, createdAt: -1 });

export type SidhApiTransactionDocument = InferSchemaType<typeof sidhApiTransactionSchema>;

export const SidhApiTransactionModel =
  (mongoose.models.SidhApiTransaction as Model<SidhApiTransactionDocument> | undefined) ??
  mongoose.model<SidhApiTransactionDocument>("SidhApiTransaction", sidhApiTransactionSchema);

const MAX_PAYLOAD_CHARS = 8_000;

/** Truncates large JSON payloads before persisting SidhApiTransaction rows. */
export function truncateTransactionPayload(value: unknown, maxChars = MAX_PAYLOAD_CHARS): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length <= maxChars) {
      return value;
    }

    return `${value.slice(0, maxChars)}…[truncated ${value.length - maxChars} chars]`;
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= maxChars) {
      return value;
    }

    return {
      _truncated: true,
      preview: `${serialized.slice(0, maxChars)}…`,
      originalChars: serialized.length,
    };
  } catch {
    return { _truncated: true, preview: "[unserializable payload]" };
  }
}
