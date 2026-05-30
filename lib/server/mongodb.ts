import mongoose from "mongoose";

import { getEnv } from "@/lib/server/env";

const globalMongoose = globalThis as typeof globalThis & {
  mongooseConnection?: Promise<typeof mongoose>;
};

mongoose.set("strictQuery", true);

export async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!globalMongoose.mongooseConnection) {
    const env = getEnv();
    globalMongoose.mongooseConnection = mongoose.connect(env.DATABASE_URL);
  }

  return globalMongoose.mongooseConnection;
}