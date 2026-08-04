import { loadEnvConfig } from "@next/env";

import { SIDH_BATCH_DEFAULTS } from "@/lib/server/sidh-defaults";
import { buildSidhBatchPayload, calculateBatchEndDate } from "@/lib/sidh-batch-payload";
import { getEnv, getSidhBatchContext, getSidhCredentials } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { CourseModel } from "@/lib/server/models/course";
import { ProgramModel } from "@/lib/server/models/program";
import { SchemeModel } from "@/lib/server/models/scheme";
import { SectorModel } from "@/lib/server/models/sector";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { UserModel } from "@/lib/server/models/user";
import { getPermissionsForRoles } from "@/lib/server/rbac";
import { createBatch, queueBatchSync } from "@/lib/server/services/batches";
import {
  createCourse,
  createProgram,
  createScheme,
  createSector,
  updateCourse,
} from "@/lib/server/services/masters";
import { serializeUser } from "@/lib/server/services/session";
import {
  createTrainingCenter,
  verifyTrainingCenterForSidh,
} from "@/lib/server/services/training-centers";

loadEnvConfig(process.cwd());

type ScriptSeed = {
  centerId: string;
  courseId: string;
  programId: string;
  schemeId: string;
  sectorId: string;
};

type CliOptions = {
  dryRun: boolean;
  sidhCourseId: string;
  sidhSchemeId: string;
  sidhSchemeReferenceId: string;
  sidhTcId: string;
};

const SCRIPT_TAG = "script-uat-batch";

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    sidhCourseId: process.env.SCRIPT_SIDH_COURSE_ID?.trim() || "FeeSchCor_48128",
    sidhSchemeId: process.env.SCRIPT_SIDH_SCHEME_ID?.trim() || SIDH_BATCH_DEFAULTS.schemeId,
    sidhSchemeReferenceId: process.env.SCRIPT_SIDH_SCHEME_REF?.trim() || SIDH_BATCH_DEFAULTS.schemeReferenceId,
    sidhTcId: process.env.SCRIPT_SIDH_TC_ID?.trim() || "TC164648",
  };

  for (const argument of args) {
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (argument.startsWith("--sidh-course-id=")) {
      options.sidhCourseId = argument.split("=")[1]?.trim() || options.sidhCourseId;
      continue;
    }

    if (argument.startsWith("--sidh-scheme-id=")) {
      options.sidhSchemeId = argument.split("=")[1]?.trim() || options.sidhSchemeId;
      continue;
    }

    if (argument.startsWith("--sidh-scheme-ref=")) {
      options.sidhSchemeReferenceId = argument.split("=")[1]?.trim() || options.sidhSchemeReferenceId;
      continue;
    }

    if (argument.startsWith("--sidh-tc-id=")) {
      options.sidhTcId = argument.split("=")[1]?.trim() || options.sidhTcId;
    }
  }

  return options;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
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
    sessionId: `batch_script_${Date.now()}`,
    user: serializeUser(workerUser),
  };
}

async function ensureScriptMasterData(actor: Awaited<ReturnType<typeof resolveWorkerActor>>, options: CliOptions): Promise<ScriptSeed> {
  const requestId = `batch-script-${Date.now()}`;
  const trainingHours = 240;
  const trainingHoursPerDay = 8;
  const startDate = addDays(new Date(), 7);
  const endDate = calculateBatchEndDate(startDate, trainingHours, trainingHoursPerDay);
  const validityStartDate = addDays(new Date(), -30);
  const validityEndDate = addDays(new Date(), 365);

  let sector = await SectorModel.findOne({ code: `${SCRIPT_TAG}-sector` }).lean();
  if (!sector) {
    const created = await createSector(actor, {
      code: `${SCRIPT_TAG}-sector`,
      description: "Script-generated sector for SIDH batch testing",
      name: "Script UAT Sector",
      requestId,
      status: "active",
    });
    sector = await SectorModel.findOne({ sectorId: created.sectorId }).lean();
    if (!sector) {
      throw new Error(`Failed to load created sector ${created.sectorId}`);
    }
    console.log(`Created sector: ${created.sectorId}`);
  } else {
    console.log(`Reusing sector: ${sector.sectorId}`);
  }

  let program = await ProgramModel.findOne({ code: `${SCRIPT_TAG}-program` }).lean();
  if (!program) {
    const created = await createProgram(actor, {
      assessmentMode: SIDH_BATCH_DEFAULTS.assessmentMode,
      batchCategoryType: SIDH_BATCH_DEFAULTS.type,
      batchType: SIDH_BATCH_DEFAULTS.batchType,
      code: `${SCRIPT_TAG}-program`,
      createdSource: SIDH_BATCH_DEFAULTS.createdSource,
      description: "Script-generated program for SIDH batch testing",
      feePaidBy: SIDH_BATCH_DEFAULTS.feePaidBy,
      name: SIDH_BATCH_DEFAULTS.skillingCategoryName,
      requestId,
      skillingCategoryId: SIDH_BATCH_DEFAULTS.skillingCategoryId,
      skillingCategoryName: SIDH_BATCH_DEFAULTS.skillingCategoryName,
      skillingCategoryScheme: SIDH_BATCH_DEFAULTS.scheme,
      status: "active",
      syncToSidh: true,
    });
    program = await ProgramModel.findOne({ programId: created.programId }).lean();
    if (!program) {
      throw new Error(`Failed to load created program ${created.programId}`);
    }
    console.log(`Created program: ${created.programId}`);
  } else {
    console.log(`Reusing program: ${program.programId}`);
  }

  let scheme = await SchemeModel.findOne({ code: `${SCRIPT_TAG}-scheme` }).lean();
  if (!scheme) {
    const created = await createScheme(actor, {
      assessmentMode: SIDH_BATCH_DEFAULTS.assessmentMode,
      batchCategoryType: SIDH_BATCH_DEFAULTS.type,
      batchType: SIDH_BATCH_DEFAULTS.batchType,
      code: `${SCRIPT_TAG}-scheme`,
      createdSource: SIDH_BATCH_DEFAULTS.createdSource,
      description: "Script-generated scheme for SIDH batch testing",
      name: "Script UAT Fee Based Scheme",
      requestId,
      sidhSchemeId: options.sidhSchemeId,
      sidhSchemeReferenceId: options.sidhSchemeReferenceId,
      sidhSchemeType: SIDH_BATCH_DEFAULTS.schemeType,
      status: "active",
      syncEnabled: true,
      validFrom: validityStartDate,
      validTo: validityEndDate,
    });
    scheme = await SchemeModel.findOne({ schemeId: created.schemeId }).lean();
    if (!scheme) {
      throw new Error(`Failed to load created scheme ${created.schemeId}`);
    }
    console.log(`Created scheme: ${created.schemeId}`);
  } else {
    console.log(`Reusing scheme: ${scheme.schemeId}`);
  }

  let course = await CourseModel.findOne({ internalCourseCode: `${SCRIPT_TAG}-course` }).lean();
  if (!course) {
    const created = await createCourse(actor, {
      approvalDate: validityStartDate,
      approvalStatus: "approved",
      associatedQpOrJobRole: "Retail Sales Associate",
      courseName: "Script UAT Retail Course",
      internalCourseCode: `${SCRIPT_TAG}-course`,
      jobRoleMappingType: "JOB_ROLE",
      minimumAge: 18,
      nsqfLevel: 4,
      price: 500,
      programIds: [program.programId],
      qpCode: "QP-SCRIPT-001",
      requestId,
      schemeIds: [scheme.schemeId],
      sectorId: sector.sectorId,
      shortForm: "SCRIPT",
      sidhCourseId: options.sidhCourseId,
      status: "active",
      totalHours: trainingHours,
      trainingHours: trainingHours,
      trainingPerDayHours: trainingHoursPerDay,
      validityEndDate,
      validityStartDate,
    });
    course = await CourseModel.findOne({ courseId: created.courseId }).lean();
    if (!course) {
      throw new Error(`Failed to load created course ${created.courseId}`);
    }
    console.log(`Created course: ${created.courseId} (${created.sidhCourseId})`);
  } else {
    const existingCourse = await CourseModel.findOne({ courseId: course.courseId });
    if (!existingCourse) {
      throw new Error(`Course ${course.courseId} disappeared during seeding`);
    }

    await updateCourse(actor, existingCourse.courseId, {
      approvalStatus: "approved",
      currentVersion: existingCourse.version,
      requestId,
      sidhCourseId: options.sidhCourseId,
      status: "active",
      validityEndDate,
      validityStartDate,
    });
    console.log(`Reusing course: ${existingCourse.courseId} (${options.sidhCourseId})`);
  }

  let center = await TrainingCenterModel.findOne({ centerCode: `${SCRIPT_TAG}-center` }).lean();
  if (!center) {
    const created = await createTrainingCenter(actor, {
      centerCode: `${SCRIPT_TAG}-center`,
      centerName: "Script UAT Training Center",
      district: "Khordha",
      programIds: [program.programId],
      requestId,
      sidhTcId: options.sidhTcId,
      state: "Odisha",
      status: "active",
    });
    center = await TrainingCenterModel.findOne({ centerId: created.centerId }).lean();
    if (!center) {
      throw new Error(`Failed to load created training center ${created.centerId}`);
    }
    console.log(`Created training center: ${created.centerId} (${options.sidhTcId})`);
  } else {
    console.log(`Reusing training center: ${center.centerId} (${center.sidhTcId ?? options.sidhTcId})`);
  }

  if (!center.verifiedForSidh) {
    await verifyTrainingCenterForSidh(actor, center.centerId, requestId);
    console.log(`Verified training center for SIDH: ${center.centerId}`);
  }

  return {
    centerId: center.centerId,
    courseId: course.courseId,
    programId: program.programId,
    schemeId: scheme.schemeId,
    sectorId: sector.sectorId,
  };
}

async function main() {
  const options = parseOptions();
  const env = getEnv();
  const credentials = getSidhCredentials(env);
  const sidhContext = getSidhBatchContext();
  const actor = await resolveWorkerActor();
  const requestId = `batch-script-${Date.now()}`;

  console.log("Create and push SIDH batch");
  console.log("=".repeat(48));
  console.log(`SIDH env          : ${env.SIDH_ENV}`);
  console.log(`SIDH base URL     : ${credentials.baseUrl}`);
  console.log(`TP ID             : ${credentials.tpId}`);
  console.log(`SIDH course ID    : ${options.sidhCourseId}`);
  console.log(`SIDH scheme ID    : ${options.sidhSchemeId}`);
  console.log(`SIDH scheme ref   : ${options.sidhSchemeReferenceId}`);
  console.log(`SIDH TC ID        : ${options.sidhTcId}`);
  console.log("");

  const seed = await ensureScriptMasterData(actor, options);
  const trainingHours = 240;
  const trainingHoursPerDay = 8;
  const startDate = addDays(new Date(), 7);
  const endDate = calculateBatchEndDate(startDate, trainingHours, trainingHoursPerDay);
  const assessmentDate = endDate;
  const batchCode = `SCRIPT-${Date.now().toString().slice(-8)}`;

  const [program, scheme, course, center] = await Promise.all([
    ProgramModel.findOne({ programId: seed.programId }).lean(),
    SchemeModel.findOne({ schemeId: seed.schemeId }).lean(),
    CourseModel.findOne({ courseId: seed.courseId }).lean(),
    TrainingCenterModel.findOne({ centerId: seed.centerId }).lean(),
  ]);

  if (!program || !scheme || !course || !center) {
    throw new Error("Script master data could not be loaded after seeding");
  }

  const payloadPreview = buildSidhBatchPayload({
    assessmentDate,
    batchName: `Script UAT Batch ${batchCode}`,
    batchSize: 25,
    configuredTpId: sidhContext.tpId,
    course: {
      sidhCourseId: course.sidhCourseId ?? options.sidhCourseId,
      trainingPerDayHours: course.trainingPerDayHours ?? trainingHoursPerDay,
    },
    endDate,
    endTime: "17:00",
    fee: course.price ?? 500,
    options: {
      assessmentMode: program.assessmentMode ?? SIDH_BATCH_DEFAULTS.assessmentMode,
      batchType: program.batchType ?? SIDH_BATCH_DEFAULTS.batchType,
      categoryType: program.batchCategoryType ?? SIDH_BATCH_DEFAULTS.type,
      createdSource: program.createdSource ?? SIDH_BATCH_DEFAULTS.createdSource,
      feePaidBy: program.feePaidBy ?? SIDH_BATCH_DEFAULTS.feePaidBy,
      tpId: sidhContext.tpId,
    },
    program: {
      assessmentMode: program.assessmentMode,
      batchCategoryType: program.batchCategoryType,
      batchType: program.batchType,
      createdSource: program.createdSource,
      feePaidBy: program.feePaidBy,
      name: program.name,
      skillingCategoryId: program.skillingCategoryId,
      skillingCategoryName: program.skillingCategoryName,
      skillingCategoryScheme: program.skillingCategoryScheme,
    },
    scheme: {
      assessmentMode: scheme.assessmentMode,
      batchCategoryType: scheme.batchCategoryType,
      batchType: scheme.batchType,
      createdSource: scheme.createdSource,
      fundingType: scheme.fundingType,
      sidhSchemeId: scheme.sidhSchemeId,
      sidhSchemeReferenceId: scheme.sidhSchemeReferenceId,
      sidhSchemeType: scheme.sidhSchemeType,
    },
    startDate,
    startTime: "09:00",
    tcId: center.sidhTcId ?? options.sidhTcId,
  });

  console.log("Master data ready");
  console.log(`  Sector   : ${seed.sectorId}`);
  console.log(`  Program  : ${seed.programId}`);
  console.log(`  Scheme   : ${seed.schemeId}`);
  console.log(`  Course   : ${seed.courseId}`);
  console.log(`  Center   : ${seed.centerId}`);
  console.log("");
  console.log("SIDH batch payload preview");
  console.log(JSON.stringify(payloadPreview, null, 2));
  console.log("");

  if (options.dryRun) {
    console.log("Dry run complete. Master data seeded and payload preview shown.");
    return;
  }

  const batch = await createBatch(actor, {
    allowAssessmentBeforeBatchEnd: true,
    allowCandidateOverlap: false,
    assessmentDate,
    assessmentEligibilityThreshold: 70,
    assessmentMode: program.assessmentMode ?? SIDH_BATCH_DEFAULTS.assessmentMode,
    batchCode,
    batchName: `Script UAT Batch ${batchCode}`,
    batchSize: 25,
    batchType: program.batchType ?? SIDH_BATCH_DEFAULTS.batchType,
    candidateIds: [],
    categoryType: program.batchCategoryType ?? SIDH_BATCH_DEFAULTS.type,
    centerId: seed.centerId,
    courseId: seed.courseId,
    createdSource: program.createdSource ?? SIDH_BATCH_DEFAULTS.createdSource,
    endDate,
    endTime: "17:00",
    fee: course.price ?? 500,
    feePaidBy: program.feePaidBy ?? SIDH_BATCH_DEFAULTS.feePaidBy,
    schemeId: seed.schemeId,
    startDate,
    startTime: "09:00",
    status: "ready",
    syncEnabled: true,
    tpId: sidhContext.tpId,
    trainingHoursPerDay: trainingHoursPerDay,
  }, requestId);

  console.log(`Created local batch: ${batch.batchId} (${batch.batchCode})`);
  console.log("Queueing SIDH batch sync...");

  const syncResult = await queueBatchSync(actor, batch.batchId, { forceResync: false }, requestId, { immediate: true });

  console.log("");
  console.log("Result");
  console.log("-".repeat(48));
  console.log(`Local batch ID : ${batch.batchId}`);
  console.log(`Batch code     : ${batch.batchCode}`);
  console.log(`Sync status    : ${syncResult.batchSync?.status ?? "unknown"}`);
  console.log(`SIDH batch ID  : ${syncResult.sidhBatchId ?? "(none)"}`);

  if (syncResult.batchSync?.lastFailureMessage) {
    console.log(`Failure code   : ${syncResult.batchSync.lastFailureCode ?? "unknown"}`);
    console.log(`Failure        : ${syncResult.batchSync.lastFailureMessage}`);
  }

  if (!syncResult.sidhBatchId) {
    console.log("");
    console.log("Batch was not pushed to SIDH. Review the failure message or SIDH API transaction logs.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Batch pushed to SIDH successfully.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
