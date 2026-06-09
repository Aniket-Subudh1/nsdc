import { loadEnvConfig } from "@next/env";

import { SIDH_BATCH_DEFAULTS } from "@/lib/server/sidh-defaults";
import { buildSidhBatchPayload } from "@/lib/sidh-batch-payload";
import { createEnv, getEnv, getSidhCredentials } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { createSidhConnector, SidhConnectorError } from "@/lib/server/services/sidh-connector";

loadEnvConfig(process.cwd());

type CheckResult = {
  detail?: string;
  name: string;
  ok: boolean;
};

function mask(value: string) {
  if (!value.trim()) {
    return "(missing)";
  }

  if (value.length <= 4) {
    return "***";
  }

  return `${value.slice(0, 2)}***`;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function summarizeSidhError(error: unknown) {
  if (error instanceof SidhConnectorError) {
    return `${error.code}: ${error.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

function interpretBatchFailure(message: string, tpId: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("batch creation is not allowed")) {
    return [
      `SIDH rejected batch creation for ${tpId}.`,
      "Authentication works, but this TP does not have batch-create permission on SIDH.",
      "Ask NSDC / Skill India support to enable Batch Creation API access for this TP.",
    ].join(" ");
  }

  if (normalized.includes("not allowed for this tp")) {
    return [
      `SIDH rejected the request for ${tpId}.`,
      "This is a SIDH account permission issue, not a wrong TP ID in your .env.",
    ].join(" ");
  }

  return message;
}

async function runCheck(name: string, fn: () => Promise<string | void>): Promise<CheckResult> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: summarizeSidhError(error),
    };
  }
}

async function main() {
  await connectToDatabase();

  const env = getEnv();
  const credentials = getSidhCredentials(env);
  const sidhCourseId = process.env.SCRIPT_SIDH_COURSE_ID?.trim() || "FeeSchCor_48128";
  const sidhTcId = process.env.SCRIPT_SIDH_TC_ID?.trim() || "TC164648";
  const sidhSchemeId = process.env.SCRIPT_SIDH_SCHEME_ID?.trim() || SIDH_BATCH_DEFAULTS.schemeId;
  const sidhSchemeReferenceId = process.env.SCRIPT_SIDH_SCHEME_REF?.trim() || SIDH_BATCH_DEFAULTS.schemeReferenceId;
  const startDate = addDays(new Date(), 14);
  const endDate = addDays(new Date(), 44);
  const assessmentDate = endDate;
  const probeBatchName = `Permission Check ${new Date().toISOString()}`;

  console.log("SIDH batch permission check");
  console.log("=".repeat(48));
  console.log(`Environment : ${env.SIDH_ENV}`);
  console.log(`Base URL    : ${credentials.baseUrl}`);
  console.log(`Username    : ${mask(credentials.username)}`);
  console.log(`TP ID       : ${mask(credentials.tpId)}`);
  console.log(`Course ID   : ${sidhCourseId}`);
  console.log(`Scheme ID   : ${sidhSchemeId}`);
  console.log(`Scheme ref  : ${sidhSchemeReferenceId}`);
  console.log(`TC ID       : ${sidhTcId}`);
  console.log("");

  const checks: CheckResult[] = [];

  checks.push(
    await runCheck("SIDH configuration", async () => {
      createEnv(process.env);

      if (!credentials.username.trim() || !credentials.password.trim() || !credentials.tpId.trim()) {
        throw new Error("Missing SIDH username, password, or TP ID for the active environment");
      }

      return "Credentials loaded for active environment";
    }),
  );

  const payload = buildSidhBatchPayload({
    assessmentDate,
    batchName: probeBatchName,
    batchSize: 1,
    configuredTpId: credentials.tpId,
    course: {
      sidhCourseId,
      trainingPerDayHours: 8,
    },
    endDate,
    endTime: "17:00",
    fee: 0,
    options: {
      assessmentMode: SIDH_BATCH_DEFAULTS.assessmentMode,
      batchType: SIDH_BATCH_DEFAULTS.batchType,
      categoryType: SIDH_BATCH_DEFAULTS.type,
      createdSource: SIDH_BATCH_DEFAULTS.createdSource,
      feePaidBy: SIDH_BATCH_DEFAULTS.feePaidBy,
      tpId: credentials.tpId,
    },
    program: {
      name: SIDH_BATCH_DEFAULTS.skillingCategoryName,
      skillingCategoryId: SIDH_BATCH_DEFAULTS.skillingCategoryId,
      skillingCategoryName: SIDH_BATCH_DEFAULTS.skillingCategoryName,
      skillingCategoryScheme: SIDH_BATCH_DEFAULTS.scheme,
    },
    scheme: {
      sidhSchemeId,
      sidhSchemeReferenceId,
      sidhSchemeType: SIDH_BATCH_DEFAULTS.schemeType,
    },
    startDate,
    startTime: "09:00",
    tcId: sidhTcId,
  });

  checks.push(
    await runCheck("Batch create permission", async () => {
      const connector = createSidhConnector();

      try {
        const result = await connector.createBatch({
          attemptId: `permcheck_${Date.now()}`,
          payload,
          syncJobId: `permcheck_${Date.now()}`,
        });

        if (!result.remoteBatchId) {
          throw new Error("SIDH accepted the request but did not return a batch ID");
        }

        return `Batch creation allowed. SIDH batch ID: ${result.remoteBatchId}`;
      } catch (error) {
        if (error instanceof SidhConnectorError) {
          throw new Error(interpretBatchFailure(error.message, credentials.tpId));
        }

        throw error;
      }
    }),
  );

  console.log("Checks");
  console.log("-".repeat(48));

  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`${status.padEnd(5)} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }

  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.length - passed;

  console.log("");
  console.log("Summary");
  console.log("-".repeat(48));
  console.log(`Passed: ${passed}/${checks.length}`);
  console.log(`Failed: ${failed}/${checks.length}`);

  if (failed === 0) {
    console.log("");
    console.log("This TP can create batches on SIDH for the active environment.");
    console.log("Note: this probe creates a real SIDH batch when permission is allowed.");
    return;
  }

  const batchCheck = checks.find((check) => check.name === "Batch create permission");

  console.log("");
  if (batchCheck?.detail?.includes("does not have batch-create permission")) {
    console.log("Diagnosis: SIDH auth/config is fine, but batch creation is blocked for this TP.");
    console.log("Next step: request NSDC to enable Batch Creation API access for this training partner.");
  } else if (batchCheck?.detail) {
    console.log("Diagnosis: batch creation failed for another reason. Review the failed check above.");
    console.log("If course/scheme/TC IDs belong to another TP, update SCRIPT_SIDH_* values in .env.");
  }

  process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
