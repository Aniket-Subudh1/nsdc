import { MongoClient, type Db, type Document, type IndexDescription } from "mongodb";

const BATCH_SIZE = 500;
const SAMPLE_SIZE = 5;

type CollectionReport = {
  collection: string;
  sourceCount: number;
  targetCount: number;
  indexesCopied: number;
  sampleOk: boolean;
  status: "ok" | "fail" | "skipped";
  detail?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function databaseNameFromUri(uri: string, fallback = "nsdc"): string {
  try {
    const parsed = new URL(uri);
    const name = parsed.pathname.replace(/^\//, "").split("/")[0];
    return name || fallback;
  } catch {
    const match = uri.match(/\/([^/?]+)(\?|$)/);
    return match?.[1] || fallback;
  }
}

async function listUserCollections(db: Db): Promise<string[]> {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  return collections
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("system."))
    .sort();
}

async function copyCollection(
  sourceDb: Db,
  targetDb: Db,
  collectionName: string,
): Promise<CollectionReport> {
  const source = sourceDb.collection(collectionName);
  const sourceCount = await source.countDocuments();

  const existing = await targetDb.listCollections({ name: collectionName }).toArray();
  if (existing.length > 0) {
    await targetDb.collection(collectionName).drop();
  }

  const target = targetDb.collection(collectionName);
  let copied = 0;
  let batch: Document[] = [];

  const cursor = source.find({}, { batchSize: BATCH_SIZE });
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      await target.insertMany(batch, { ordered: false });
      copied += batch.length;
      process.stdout.write(`\r  ${collectionName}: copied ${copied}/${sourceCount}`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await target.insertMany(batch, { ordered: false });
    copied += batch.length;
    process.stdout.write(`\r  ${collectionName}: copied ${copied}/${sourceCount}`);
  }

  if (sourceCount > 0) {
    process.stdout.write("\n");
  }

  const indexes = await source.indexes();
  const indexSpecs: IndexDescription[] = indexes
    .filter((index) => index.name !== "_id_")
    .map((index) => {
      const { key, name, v: _v, ns: _ns, ...options } = index;
      return {
        key,
        name,
        ...options,
      } as IndexDescription;
    });

  let indexesCopied = 0;
  if (indexSpecs.length > 0) {
    await target.createIndexes(indexSpecs);
    indexesCopied = indexSpecs.length;
  } else if (sourceCount === 0) {
    // Ensure empty collections still exist on the target.
    await targetDb.createCollection(collectionName);
  }

  const targetCount = await target.countDocuments();
  const sampleOk = await verifySampleIds(sourceDb, targetDb, collectionName, sourceCount);

  return {
    collection: collectionName,
    sourceCount,
    targetCount,
    indexesCopied,
    sampleOk,
    status: sourceCount === targetCount && sampleOk ? "ok" : "fail",
    detail:
      sourceCount !== targetCount
        ? `count mismatch (${sourceCount} vs ${targetCount})`
        : !sampleOk
          ? "sample _id mismatch"
          : undefined,
  };
}

async function verifySampleIds(
  sourceDb: Db,
  targetDb: Db,
  collectionName: string,
  sourceCount: number,
): Promise<boolean> {
  if (sourceCount === 0) {
    return true;
  }

  const source = sourceDb.collection(collectionName);
  const target = targetDb.collection(collectionName);

  const [minDoc] = await source.find().sort({ _id: 1 }).limit(1).toArray();
  const [maxDoc] = await source.find().sort({ _id: -1 }).limit(1).toArray();

  if (minDoc?._id != null) {
    const found = await target.findOne({ _id: minDoc._id }, { projection: { _id: 1 } });
    if (!found) return false;
  }
  if (maxDoc?._id != null && String(maxDoc._id) !== String(minDoc?._id)) {
    const found = await target.findOne({ _id: maxDoc._id }, { projection: { _id: 1 } });
    if (!found) return false;
  }

  const sample = await source
    .aggregate([{ $sample: { size: Math.min(SAMPLE_SIZE, sourceCount) } }, { $project: { _id: 1 } }])
    .toArray();

  for (const doc of sample) {
    const found = await target.findOne({ _id: doc._id }, { projection: { _id: 1 } });
    if (!found) return false;
  }

  return true;
}

async function verifyCollectionSet(sourceDb: Db, targetDb: Db): Promise<string[]> {
  const sourceNames = await listUserCollections(sourceDb);
  const targetNames = new Set(await listUserCollections(targetDb));
  return sourceNames.filter((name) => !targetNames.has(name));
}

function printReport(reports: CollectionReport[]) {
  console.log("\nMigration report");
  console.log("-".repeat(88));
  console.log(
    [
      "collection".padEnd(36),
      "source".padStart(8),
      "target".padStart(8),
      "indexes".padStart(8),
      "sample".padStart(8),
      "status".padStart(8),
    ].join(" "),
  );
  console.log("-".repeat(88));

  for (const report of reports) {
    console.log(
      [
        report.collection.padEnd(36),
        String(report.sourceCount).padStart(8),
        String(report.targetCount).padStart(8),
        String(report.indexesCopied).padStart(8),
        (report.sampleOk ? "ok" : "fail").padStart(8),
        report.status.padStart(8),
      ].join(" "),
      report.detail ? `  ${report.detail}` : "",
    );
  }

  console.log("-".repeat(88));
  const totalSource = reports.reduce((sum, r) => sum + r.sourceCount, 0);
  const totalTarget = reports.reduce((sum, r) => sum + r.targetCount, 0);
  console.log(`Collections: ${reports.length}`);
  console.log(`Documents:   source=${totalSource} target=${totalTarget}`);
}

async function main() {
  const sourceUri = requireEnv("SOURCE_DATABASE_URL");
  const targetUri = requireEnv("TARGET_DATABASE_URL");

  const sourceDbName = databaseNameFromUri(sourceUri);
  const targetDbName = databaseNameFromUri(targetUri);

  console.log(`Source DB: ${sourceDbName}`);
  console.log(`Target DB: ${targetDbName}`);

  const sourceClient = new MongoClient(sourceUri);
  const targetClient = new MongoClient(targetUri);

  try {
    await sourceClient.connect();
    await targetClient.connect();

    const sourceDb = sourceClient.db(sourceDbName);
    const targetDb = targetClient.db(targetDbName);

    const collectionNames = await listUserCollections(sourceDb);
    if (collectionNames.length === 0) {
      throw new Error(`No user collections found in source database "${sourceDbName}"`);
    }

    console.log(`Found ${collectionNames.length} collections to migrate\n`);

    const reports: CollectionReport[] = [];
    for (const name of collectionNames) {
      console.log(`Migrating ${name}...`);
      const report = await copyCollection(sourceDb, targetDb, name);
      reports.push(report);
      if (report.status === "fail") {
        console.error(`  FAILED: ${report.detail ?? "unknown error"}`);
      } else {
        console.log(
          `  OK: ${report.sourceCount} docs, ${report.indexesCopied} indexes`,
        );
      }
    }

    const missing = await verifyCollectionSet(sourceDb, targetDb);
    if (missing.length > 0) {
      for (const name of missing) {
        reports.push({
          collection: name,
          sourceCount: 0,
          targetCount: 0,
          indexesCopied: 0,
          sampleOk: false,
          status: "fail",
          detail: "missing on target after migration",
        });
      }
    }

    printReport(reports);

    const failed = reports.filter((report) => report.status !== "ok");
    if (failed.length > 0) {
      console.error(`\nMigration verification failed for ${failed.length} collection(s).`);
      process.exitCode = 1;
      return;
    }

    console.log("\nMigration completed successfully. All collections verified.");
  } finally {
    await Promise.allSettled([sourceClient.close(), targetClient.close()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
