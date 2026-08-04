import mongoose, { type InferSchemaType, type Model } from "mongoose";

const syncEventSchema = new mongoose.Schema(
  {
    syncEventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ["candidate", "batch", "enrollment"],
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    syncJobId: {
      type: String,
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      enum: ["queued", "claimed", "attempt_started", "attempt_failed", "succeeded", "dead_lettered", "requeued", "replayed"],
      required: true,
      index: true,
    },
    requestId: {
      type: String,
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

syncEventSchema.index({ createdAt: -1 });
syncEventSchema.index({ syncJobId: 1, createdAt: -1 });

export type SyncEventDocument = InferSchemaType<typeof syncEventSchema>;

export const SyncEventModel =
  (mongoose.models.SyncEvent as Model<SyncEventDocument> | undefined) ??
  mongoose.model<SyncEventDocument>("SyncEvent", syncEventSchema);
