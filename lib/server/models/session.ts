import mongoose, { type InferSchemaType, type Model } from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  },
);

export type SessionDocument = InferSchemaType<typeof sessionSchema>;

export const SessionModel =
  (mongoose.models.Session as Model<SessionDocument> | undefined) ??
  mongoose.model<SessionDocument>("Session", sessionSchema);