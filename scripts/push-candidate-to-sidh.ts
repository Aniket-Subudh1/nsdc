import { loadEnvConfig } from "@next/env";

import { getEnv } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { CandidateModel } from "@/lib/server/models/candidate";
import { UserModel } from "@/lib/server/models/user";
import { getPermissionsForRoles } from "@/lib/server/rbac";
import { processQueuedSyncJobs } from "@/lib/server/services/candidate-sync-worker";
import { createCandidate, queueCandidateSync } from "@/lib/server/services/candidates";
import { serializeUser } from "@/lib/server/services/session";

loadEnvConfig(process.cwd());

type CandidateGender = "Male" | "Female" | "Transgender";

type CliOptions = {
  candidateId?: string;
  create: boolean;
  dryRun: boolean;
  fatherName: string;
  firstName: string;
  gender: CandidateGender;
  mobile?: string;
};

function parseGender(value: string | undefined, fallback: CandidateGender): CandidateGender {
  if (value === "Male" || value === "Female" || value === "Transgender") {
    return value;
  }

  return fallback;
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    create: false,
    dryRun: false,
    fatherName: "Test Father",
    firstName: "UAT Test Candidate",
    gender: "Male",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument) {
      continue;
    }

    if (argument === "--create") {
      options.create = true;
      continue;
    }

    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (argument === "--candidate-id") {
      options.candidateId = args[index + 1]?.trim();
      index += 1;
      continue;
    }

    if (argument.startsWith("--candidate-id=")) {
      options.candidateId = argument.split("=")[1]?.trim();
      continue;
    }

    if (argument === "--name") {
      options.firstName = args[index + 1]?.trim() || options.firstName;
      index += 1;
      continue;
    }

    if (argument.startsWith("--name=")) {
      options.firstName = argument.split("=")[1]?.trim() || options.firstName;
      continue;
    }

    if (argument === "--mobile") {
      options.mobile = args[index + 1]?.trim();
      index += 1;
      continue;
    }

    if (argument.startsWith("--mobile=")) {
      options.mobile = argument.split("=")[1]?.trim();
      continue;
    }

    if (argument === "--father-name") {
      options.fatherName = args[index + 1]?.trim() || options.fatherName;
      index += 1;
      continue;
    }

    if (argument.startsWith("--father-name=")) {
      options.fatherName = argument.split("=")[1]?.trim() || options.fatherName;
      continue;
    }

    if (argument === "--gender") {
      options.gender = parseGender(args[index + 1]?.trim(), options.gender);
      index += 1;
      continue;
    }

    if (argument.startsWith("--gender=")) {
      options.gender = parseGender(argument.split("=")[1]?.trim(), options.gender);
    }
  }

  if (!options.candidateId) {
    options.create = true;
  }

  return options;
}

function createUniqueMobile(explicit?: string) {
  if (explicit) {
    if (!/^\d{10}$/.test(explicit)) {
      throw new Error("Mobile number must be exactly 10 digits");
    }

    return explicit;
  }

  const suffix = String(Date.now()).slice(-9);
  return `9${suffix}`;
}

function createTestDob() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 22);
  return date.toISOString().slice(0, 10);
}

async function resolveWorkerActor() {
  const env = getEnv();
  await connectToDatabase();

  const preferredUser = await UserModel.findOne({
    email: env.SEED_ADMIN_EMAIL.trim().toLowerCase(),
    status: "active",
  });
  const workerUser = preferredUser ?? (await UserModel.findOne({ roles: "platform_admin", status: "active" }));

  if (!workerUser) {
    throw new Error("No active platform admin is available. Run npm run seed:admin first.");
  }

  return {
    permissions: getPermissionsForRoles(workerUser.roles),
    sessionId: `push_script_${Date.now()}`,
    user: serializeUser(workerUser),
  };
}

async function resolveCandidateId(actor: Awaited<ReturnType<typeof resolveWorkerActor>>, options: CliOptions) {
  if (options.candidateId) {
    return options.candidateId;
  }

  const mobileNumber = createUniqueMobile(options.mobile);
  const requestId = `push-candidate-${Date.now()}`;

  console.log("Creating local test candidate...");
  console.log(`  Name   : ${options.firstName}`);
  console.log(`  Mobile : ${mobileNumber}`);

  const created = await createCandidate(
    actor,
    {
      program: "Fee-Based",
      contactDetails: {
        countryCode: "91",
        email: `uat.test.${mobileNumber}@example.com`,
        phone: mobileNumber,
      },
      locationDetails: {
        centerName: "UAT Script Center",
        district: "Bhubaneswar",
        state: "Odisha",
      },
      personalDetails: {
        dob: createTestDob(),
        fatherName: options.fatherName,
        firstName: options.firstName,
        gender: options.gender,
        guardianName: "",
        namePrefix: "Mr",
      },
    },
    { requestId, skipAudit: true },
  );

  console.log(`  Local ID: ${created.candidateId}`);
  return created.candidateId;
}

async function main() {
  const options = parseOptions();
  const env = getEnv();
  const actor = await resolveWorkerActor();
  const requestId = `push-candidate-${Date.now()}`;

  console.log("Push candidate to SIDH");
  console.log("=".repeat(48));
  console.log(`SIDH env : ${env.SIDH_ENV}`);
  console.log(`Base URL : ${env.SIDH_ENV === "production" ? env.SIDH_PROD_BASE_URL : env.SIDH_UAT_BASE_URL}`);
  console.log("");

  const candidateId = await resolveCandidateId(actor, options);
  const candidateBefore = await CandidateModel.findOne({ candidateId }).lean();

  if (!candidateBefore) {
    throw new Error(`Candidate ${candidateId} was not found`);
  }

  if (candidateBefore.sidhCandidateId) {
    console.log("Candidate is already linked with SIDH.");
    console.log(`  Local ID : ${candidateBefore.candidateId}`);
    console.log(`  SIDH ID  : ${candidateBefore.sidhCandidateId}`);
    console.log(`  Status   : ${candidateBefore.syncState?.status ?? "linked"}`);
    return;
  }

  const syncStatus = candidateBefore.syncState?.status ?? "not_queued";

  if (syncStatus === "queued" || syncStatus === "processing") {
    console.log(`Candidate already ${syncStatus}; processing sync queue...`);
  } else {
    console.log("Queueing candidate for SIDH registration...");
    const queuedJob = await queueCandidateSync(actor, candidateId, requestId);
    console.log(`  Sync job : ${queuedJob.syncJobId}`);
  }

  if (options.dryRun) {
    console.log("");
    console.log("Dry run complete. Candidate queued but not pushed.");
    console.log("Run npm run sync:process -- --once to process the queue.");
    return;
  }

  console.log("");
  console.log("Processing sync job against SIDH...");

  const result = await processQueuedSyncJobs(actor, {
    limit: 1,
    requestId,
  });

  const candidateAfter = await CandidateModel.findOne({ candidateId }).lean();
  const job = result.jobs.find((entry) => entry.candidateId === candidateId) ?? result.jobs[0];

  console.log("");
  console.log("Result");
  console.log("-".repeat(48));
  console.log(`Processed jobs : ${result.processedCount}`);
  console.log(`Succeeded      : ${result.succeededCount}`);
  console.log(`Failed/review  : ${result.manualReviewCount + result.deadLetterCount + result.retryScheduledCount}`);

  if (job) {
    console.log("");
    console.log(`Candidate ID : ${candidateId}`);
    console.log(`Job status   : ${job.status}`);
    console.log(`Message      : ${job.message}`);
    console.log(`SIDH ID      : ${job.remoteCandidateId ?? candidateAfter?.sidhCandidateId ?? "(none)"}`);
  }

  if (candidateAfter?.sidhCandidateId) {
    console.log("");
    console.log("Candidate pushed to SIDH successfully.");
    return;
  }

  console.log("");
  console.log("Candidate was not pushed. Review the message above or sync job details in the app.");
  process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
