import mongoose, { type InferSchemaType, type Model } from "mongoose";

const outboxEventSchema = new mongoose.Schema(
  {
    outboxEventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
    },
    entityId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "processed", "failed"],
      default: "pending",
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export type OutboxEventDocument = InferSchemaType<typeof outboxEventSchema>;

export const OutboxEventModel =
  (mongoose.models.OutboxEvent as Model<OutboxEventDocument> | undefined) ??
  mongoose.model<OutboxEventDocument>("OutboxEvent", outboxEventSchema);