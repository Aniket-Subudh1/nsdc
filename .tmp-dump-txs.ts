import { writeFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { connectToDatabase } = await import("./lib/server/mongodb");
  const { SidhApiTransactionModel } = await import("./lib/server/models/sidh-api-transaction");
  await connectToDatabase();
  const txs = await SidhApiTransactionModel.find({}).sort({ createdAt: -1 }).limit(8).lean();
  await writeFile(
    ".tmp-latest-sidh-txs.json",
    JSON.stringify(
      txs.map((tx) => ({
        createdAt: tx.createdAt,
        endpoint: tx.endpoint,
        operation: tx.operation,
        requestHeaders: tx.requestHeaders,
        requestPayload: tx.requestPayload,
        responsePayload: tx.responsePayload,
        responseStatus: tx.responseStatus,
        syncJobId: tx.syncJobId,
      })),
      null,
      2,
    ),
    "utf8",
  );
}

void main().catch(() => process.exit(1));
