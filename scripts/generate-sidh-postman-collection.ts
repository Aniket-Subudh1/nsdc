import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { getEnv, getSidhCredentials } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { BatchModel } from "@/lib/server/models/batch";
import { CandidateModel } from "@/lib/server/models/candidate";
import { CourseModel } from "@/lib/server/models/course";
import { ProgramModel } from "@/lib/server/models/program";
import { SchemeModel } from "@/lib/server/models/scheme";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { SIDH_BATCH_DEFAULTS } from "@/lib/server/sidh-defaults";
import { toSidhDate } from "@/lib/server/sidh-payload";
import { buildSidhBatchPayload } from "@/lib/sidh-batch-payload";

loadEnvConfig(process.cwd());

type JsonRecord = Record<string, unknown>;

type PostmanHeader = { key: string; value: string; type?: string };
type PostmanRequest = {
  method: string;
  header: PostmanHeader[];
  body?: {
    mode: "raw";
    raw: string;
    options?: { raw: { language: "json" } };
  };
  url: string | { raw: string; host?: string[]; path?: string[]; query?: Array<{ key: string; value: string }> };
  description?: string;
};
type PostmanItem = {
  name: string;
  request: PostmanRequest;
  event?: Array<{ listen: string; script: { type: string; exec: string[] } }>;
  response?: unknown[];
};

function jsonBody(value: unknown) {
  return {
    mode: "raw" as const,
    raw: JSON.stringify(value, null, 2),
    options: { raw: { language: "json" as const } },
  };
}

function authHeaders(): PostmanHeader[] {
  return [
    { key: "Content-Type", value: "application/json", type: "text" },
    { key: "Accept", value: "application/json", type: "text" },
    { key: "Authorization", value: "{{sidhAccessToken}}", type: "text" },
    { key: "Cookie", value: "{{sidhCookie}}", type: "text" },
    { key: "x-csrf-token", value: "{{sidhCsrfToken}}", type: "text" },
  ];
}

function requestItem(name: string, request: PostmanRequest, events?: PostmanItem["event"]): PostmanItem {
  return {
    name,
    request,
    event: events,
    response: [],
  };
}

function event(listen: "prerequest" | "test", lines: string[]) {
  return {
    listen,
    script: {
      type: "text/javascript",
      exec: lines,
    },
  };
}

function toDateOnly(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function normalizeCountryCode(value?: string | null) {
  const digits = (value ?? "91").replace(/\D/g, "");
  return digits ? `+${digits}` : "+91";
}

async function loadSeedData() {
  await connectToDatabase();

  const env = getEnv();
  const credentials = getSidhCredentials(env);

  const [batch, scheme, program, candidates] = await Promise.all([
    BatchModel.findOne({}).sort({ updatedAt: -1 }).lean<JsonRecord | null>(),
    SchemeModel.findOne({ sidhSchemeId: { $nin: [null, ""] } })
      .sort({ updatedAt: -1 })
      .lean<JsonRecord | null>(),
    ProgramModel.findOne({}).sort({ updatedAt: -1 }).lean<JsonRecord | null>(),
    CandidateModel.find({ sidhCandidateId: { $nin: [null, ""] } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean<JsonRecord[]>(),
  ]);

  if (!batch) {
    throw new Error("No batches found in MongoDB to seed the SIDH collection");
  }

  const [course, center] = await Promise.all([
    CourseModel.findOne({ courseId: batch.courseId }).lean<JsonRecord | null>(),
    TrainingCenterModel.findOne({ centerId: batch.centerId }).lean<JsonRecord | null>(),
  ]);

  if (!course?.sidhCourseId) {
    throw new Error(`Batch ${String(batch.batchId)} course is missing sidhCourseId`);
  }

  if (!center?.sidhTcId) {
    throw new Error(`Batch ${String(batch.centerId)} center is missing sidhTcId`);
  }

  if (!scheme?.sidhSchemeId || !scheme.sidhSchemeReferenceId) {
    throw new Error("No SIDH-ready scheme found in MongoDB");
  }

  const primaryCandidate =
    candidates.find((candidate) => candidate.sidhCandidateId === "CAN_38830776") ?? candidates[0] ?? null;

  if (!primaryCandidate) {
    throw new Error("No synced SIDH candidates found in MongoDB");
  }

  const fee =
    typeof batch.fee === "number" && batch.fee > 0
      ? batch.fee
      : typeof course.price === "number" && course.price > 0
        ? course.price
        : 500;

  const batchPayload = buildSidhBatchPayload({
    assessmentDate: batch.assessmentDate as Date | string,
    batchName: String(batch.batchName),
    batchSize: Number(batch.batchSize ?? 1),
    configuredTpId: credentials.tpId,
    course: {
      sidhCourseId: String(course.sidhCourseId),
      trainingPerDayHours: Number(course.trainingPerDayHours ?? batch.trainingHoursPerDay ?? 8),
    },
    endDate: batch.endDate as Date | string,
    endTime: (batch.endTime as string | null | undefined) ?? "17:00",
    fee,
    options: {
      assessmentMode: (batch.sidhAssessmentMode as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.assessmentMode,
      batchType: (batch.sidhBatchType as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.batchType,
      categoryType: (batch.sidhCategoryType as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.type,
      createdSource: (batch.sidhCreatedSource as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.createdSource,
      feePaidBy: (batch.sidhFeePaidBy as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.feePaidBy,
      tpId: credentials.tpId,
    },
    program: {
      name: (program?.name as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.skillingCategoryName,
      skillingCategoryId:
        (program?.skillingCategoryId as number | null | undefined) ?? SIDH_BATCH_DEFAULTS.skillingCategoryId,
      skillingCategoryName:
        (program?.skillingCategoryName as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.skillingCategoryName,
      skillingCategoryScheme:
        (program?.skillingCategoryScheme as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.scheme,
    },
    scheme: {
      sidhSchemeId: String(scheme.sidhSchemeId),
      sidhSchemeReferenceId: String(scheme.sidhSchemeReferenceId),
      sidhSchemeType:
        (scheme.sidhSchemeType as string | null | undefined) ?? SIDH_BATCH_DEFAULTS.schemeType,
    },
    startDate: batch.startDate as Date | string,
    startTime: (batch.startTime as string | null | undefined) ?? "09:00",
    tcId: String(center.sidhTcId),
  });

  const candidateRegisterPayload = {
    PersonalDetails: {
      DOB: toSidhDate(primaryCandidate.dateOfBirth),
      FatherName: String(primaryCandidate.fathersName ?? "Test Father"),
      FirstName: String(primaryCandidate.fullName ?? "SIDH Candidate"),
      Gender: String(primaryCandidate.gender ?? "Male"),
      NamePrefix: String(primaryCandidate.salutation ?? "Mr"),
    },
    ContactDetails: {
      CountryCode: normalizeCountryCode(primaryCandidate.countryCode as string | null | undefined),
      Email: String(primaryCandidate.email ?? "sidh.candidate@example.com"),
      Phone: String(primaryCandidate.mobileNumber ?? "9777019529"),
    },
  };

  const candidateIds = candidates
    .map((candidate) => String(candidate.sidhCandidateId ?? "").trim())
    .filter(Boolean);

  return {
    assessmentDate: toDateOnly(batch.assessmentDate as Date | string),
    batch,
    batchEndDate: toDateOnly(batch.endDate as Date | string),
    batchPayload,
    batchStartDate: toDateOnly(batch.startDate as Date | string),
    candidateIds,
    candidateRegisterPayload,
    center,
    course,
    credentials,
    envName: env.SIDH_ENV,
    primaryCandidate,
    program,
    scheme,
  };
}

function buildCollection(seed: Awaited<ReturnType<typeof loadSeedData>>) {
  const sidhCandidateId = String(seed.primaryCandidate.sidhCandidateId);
  const courseName = String(seed.course.courseName ?? seed.course.name ?? "Course");
  const enrollCandidateIds = seed.candidateIds.length > 0 ? seed.candidateIds : [sidhCandidateId];

  const csrfCapture = event("test", [
    "const csrf = pm.response.headers.get('x-csrf-token');",
    "if (csrf) {",
    "  pm.collectionVariables.set('sidhCsrfToken', csrf);",
    "  pm.environment.set('sidhCsrfToken', csrf);",
    "}",
    "const setCookie = pm.response.headers.get('set-cookie');",
    "if (setCookie) {",
    "  const cookie = setCookie.split(';')[0];",
    "  pm.collectionVariables.set('sidhCookie', cookie);",
    "  pm.environment.set('sidhCookie', cookie);",
    "}",
  ]);

  const keyCapture = event("test", [
    "const body = pm.response.json();",
    "const publicKey = body.publicKey || body.public_key || body.key;",
    "const secretKey = body.secretKey || body.secret_key || body.secret;",
    "if (publicKey) {",
    "  pm.collectionVariables.set('sidhPublicKey', publicKey);",
    "  pm.environment.set('sidhPublicKey', publicKey);",
    "}",
    "if (secretKey) {",
    "  pm.collectionVariables.set('sidhSecretKey', secretKey);",
    "  pm.environment.set('sidhSecretKey', secretKey);",
    "}",
  ]);

  const loginEncrypt = event("prerequest", [
    "const password =",
    "  pm.environment.get('sidhPassword') ||",
    "  pm.collectionVariables.get('sidhPassword') ||",
    "  pm.variables.get('sidhPassword');",
    "const publicKeyPem =",
    "  pm.environment.get('sidhPublicKey') ||",
    "  pm.collectionVariables.get('sidhPublicKey') ||",
    "  pm.variables.get('sidhPublicKey');",
    "const secretKey =",
    "  pm.environment.get('sidhSecretKey') ||",
    "  pm.collectionVariables.get('sidhSecretKey') ||",
    "  pm.variables.get('sidhSecretKey') ||",
    "  '';",
    "if (!password) {",
    "  throw new Error(",
    "    'sidhPassword is empty. In Postman top-right, select environment \"SIDH production (DB-seeded)\", then confirm sidhPassword is set under that environment. Re-import postman/SIDH-Production.postman_environment.json if needed.'",
    "  );",
    "}",
    "if (!publicKeyPem) { throw new Error('Run Auth request 2 (Get encryption key) first to populate sidhPublicKey.'); }",
    "",
    "function pemToArrayBuffer(pem) {",
    "  const b64 = String(pem)",
    "    .replace(/-----BEGIN PUBLIC KEY-----/, '')",
    "    .replace(/-----END PUBLIC KEY-----/, '')",
    "    .replace(/\\s+/g, '');",
    "  const binary = atob(b64);",
    "  const bytes = new Uint8Array(binary.length);",
    "  for (let i = 0; i < binary.length; i += 1) { bytes[i] = binary.charCodeAt(i); }",
    "  return bytes.buffer;",
    "}",
    "",
    "function bufferToBase64(buffer) {",
    "  const bytes = new Uint8Array(buffer);",
    "  let binary = '';",
    "  bytes.forEach((b) => { binary += String.fromCharCode(b); });",
    "  return btoa(binary);",
    "}",
    "",
    "function normalizePem(pem) {",
    "  if (String(pem).includes('BEGIN PUBLIC KEY')) { return String(pem); }",
    "  const compact = String(pem).replace(/\\s+/g, '');",
    "  const wrapped = compact.match(/.{1,64}/g).join('\\n');",
    "  return '-----BEGIN PUBLIC KEY-----\\n' + wrapped + '\\n-----END PUBLIC KEY-----';",
    "}",
    "",
    "const spki = pemToArrayBuffer(normalizePem(publicKeyPem));",
    "const key = await crypto.subtle.importKey(",
    "  'spki',",
    "  spki,",
    "  { name: 'RSA-OAEP', hash: 'SHA-256' },",
    "  false,",
    "  ['encrypt']",
    ");",
    "const encrypted = await crypto.subtle.encrypt(",
    "  { name: 'RSA-OAEP' },",
    "  key,",
    "  new TextEncoder().encode(password)",
    ");",
    "const encryptedPassword = bufferToBase64(encrypted) + secretKey;",
    "pm.collectionVariables.set('sidhEncryptedPassword', encryptedPassword);",
    "pm.environment.set('sidhEncryptedPassword', encryptedPassword);",
  ]);

  const loginCapture = event("test", [
    "const body = pm.response.json();",
    "const token = body.accessToken || body.token || body.authToken || body.jwt;",
    "if (token) {",
    "  pm.collectionVariables.set('sidhAccessToken', token);",
    "  pm.environment.set('sidhAccessToken', token);",
    "}",
  ]);

  const batchIdCapture = event("test", [
    "try {",
    "  const body = pm.response.json();",
    "  const batchId = body.batchId || body.batchID || (body.data && body.data.batchId);",
    "  if (batchId) {",
    "    pm.collectionVariables.set('sidhBatchId', String(batchId));",
    "    pm.environment.set('sidhBatchId', String(batchId));",
    "  }",
    "} catch (error) {}",
  ]);

  const candidateIdCapture = event("test", [
    "try {",
    "  const body = pm.response.json();",
    "  const candidateId = body.candidateId || body.candidateID || (body.data && body.data.candidateId);",
    "  if (candidateId) {",
    "    pm.collectionVariables.set('sidhCandidateId', String(candidateId));",
    "    pm.environment.set('sidhCandidateId', String(candidateId));",
    "  }",
    "  const message = typeof body === 'string' ? body : (body.message || '');",
    "  const match = String(message).match(/\\bCAN_[A-Za-z0-9_-]+\\b/);",
    "  if (match) {",
    "    pm.collectionVariables.set('sidhCandidateId', match[0]);",
    "    pm.environment.set('sidhCandidateId', match[0]);",
    "  }",
    "} catch (error) {}",
  ]);

  const authFolder = {
    name: "1. Auth",
    description:
      "SIDH auth bootstrap matching the app connector: CSRF → getkey → RSA-OAEP login. Select the SIDH Production environment (includes sidhPassword from .env when regenerated), then run these in order.",
    item: [
      requestItem(
        "1. Get CSRF bootstrap",
        {
          method: "HEAD",
          header: [{ key: "Accept", value: "application/json", type: "text" }],
          url: "{{sidhBaseUrl}}/api/user/v1",
          description: "Captures `x-csrf-token` and session cookie used by later SIDH calls.",
        },
        [csrfCapture],
      ),
      requestItem(
        "2. Get encryption key",
        {
          method: "GET",
          header: [
            { key: "Accept", value: "application/json", type: "text" },
            { key: "Cookie", value: "{{sidhCookie}}", type: "text" },
            { key: "x-csrf-token", value: "{{sidhCsrfToken}}", type: "text" },
          ],
          url: "{{sidhBaseUrl}}/api/user/v1/getkey",
          description: "Returns `publicKey` + `secretKey` used to encrypt the SIDH password.",
        },
        [keyCapture],
      ),
      requestItem(
        "3. Login",
        {
          method: "POST",
          header: [
            { key: "Content-Type", value: "application/json", type: "text" },
            { key: "Accept", value: "application/json", type: "text" },
            { key: "Cookie", value: "{{sidhCookie}}", type: "text" },
            { key: "x-csrf-token", value: "{{sidhCsrfToken}}", type: "text" },
          ],
          body: jsonBody({
            userName: "{{sidhUsername}}",
            password: "{{sidhEncryptedPassword}}",
          }),
          url: "{{sidhBaseUrl}}/api/user/v1/login",
          description:
            "Pre-request encrypts `sidhPassword` with RSA-OAEP SHA-256 and appends `sidhSecretKey`, matching the app connector.",
        },
        [loginEncrypt, loginCapture],
      ),
    ],
  };

  const candidateFolder = {
    name: "2. Candidate",
    item: [
      requestItem(
        "Register candidate",
        {
          method: "POST",
          header: authHeaders(),
          body: jsonBody(seed.candidateRegisterPayload),
          url: "{{sidhBaseUrl}}/api/user/v1/register/Candidate/v1",
          description:
            "Payload rebuilt from synced MongoDB candidate `" +
            String(seed.primaryCandidate.candidateId) +
            "` / `" +
            sidhCandidateId +
            "`. Re-registering an existing mobile may return conflict.",
        },
        [candidateIdCapture],
      ),
    ],
  };

  const batchFolder = {
    name: "3. Batch",
    item: [
      requestItem(
        "Create batch",
        {
          method: "POST",
          header: authHeaders(),
          body: jsonBody(seed.batchPayload),
          url: "{{sidhBaseUrl}}/api/batch/v1/create",
          description:
            "Built via `buildSidhBatchPayload` from MongoDB batch `" +
            String(seed.batch.batchId) +
            "` (`" +
            String(seed.batch.batchName) +
            "`). Production currently returns 403 if Batch Creation is not enabled for this TP.",
        },
        [batchIdCapture],
      ),
      requestItem(
        "Enroll candidates into batch",
        {
          method: "POST",
          header: authHeaders(),
          body: jsonBody({
            batchId: "{{sidhBatchId}}",
            candidateIds: enrollCandidateIds,
          }),
          url: "{{sidhBaseUrl}}/api/thirdparty/v1/enroll/Candidate",
          description: "Uses real synced SIDH candidate IDs from MongoDB. Requires a valid remote `sidhBatchId`.",
        },
      ),
    ],
  };

  const assessmentFolder = {
    name: "4. Assessment + Certificate",
    item: [
      requestItem(
        "Submit training + assessment",
        {
          method: "POST",
          header: authHeaders(),
          body: jsonBody({
            batchId: "{{sidhBatchId}}",
            candidates: [
              {
                candidateID: "{{sidhCandidateId}}",
                trainingDetails: {
                  attendance: 90,
                  trainingStatus: "completed",
                },
                assessmentDetails: {
                  assessmentAgency: "Self",
                  assessmentDataUploadedOn: "{{assessmentDate}}T00:00:00Z",
                  assessmentPercentage: 80,
                  assessmentStatus: "Pass",
                  assessorID: "ASSR_001",
                  assessorName: "Assessor One",
                  grade: "A",
                },
                certificationDetails: {
                  certificationDate: "{{assessmentDate}}T00:00:00Z",
                  certificationName: courseName,
                  certifyingAgency: "Self",
                  isCertified: true,
                },
              },
            ],
          }),
          url: "{{sidhBaseUrl}}/v1/candidates/candidate/pushBatchEachCandidate",
        },
      ),
      requestItem(
        "Generate certificate",
        {
          method: "POST",
          header: authHeaders(),
          body: jsonBody({
            batchId: "{{sidhBatchId}}",
            userName: "{{sidhCandidateId}}",
          }),
          url: "{{sidhBaseUrl}}/api/v1/cert/certificate?for=trainingPartner",
        },
      ),
      requestItem(
        "Download certificate",
        {
          method: "GET",
          header: [
            { key: "Accept", value: "application/pdf,application/octet-stream,application/json", type: "text" },
            { key: "Authorization", value: "{{sidhAccessToken}}", type: "text" },
            { key: "Cookie", value: "{{sidhCookie}}", type: "text" },
            { key: "x-csrf-token", value: "{{sidhCsrfToken}}", type: "text" },
          ],
          url: "{{sidhBaseUrl}}/api/v1/cert/uc/singledocdownload?batchId={{sidhBatchId}}&candidateId={{sidhCandidateId}}&type=externalcertificate",
        },
      ),
    ],
  };

  return {
    info: {
      name: `SIDH Partner APIs (${seed.envName})`,
      description: [
        "SIDH / Skill India partner APIs only (no NSDC portal routes).",
        "",
        `Seeded from MongoDB against SIDH_ENV=${seed.envName}.`,
        `Base URL: ${seed.credentials.baseUrl}`,
        `TP: ${seed.credentials.tpId}`,
        `Batch: ${String(seed.batch.batchName)} (${String(seed.batch.batchId)})`,
        `Course: ${String(seed.course.sidhCourseId)}`,
        `Scheme: ${String(seed.scheme.sidhSchemeId)} / ${String(seed.scheme.sidhSchemeReferenceId)}`,
        `TC: ${String(seed.center.sidhTcId)}`,
        `Candidates: ${enrollCandidateIds.join(", ")}`,
        "",
        "Secrets: regenerate with `npm run postman:sidh` to load `sidhPassword` from `.env` into the local environment file.",
        "Select environment `SIDH production (DB-seeded)`, then run Auth requests 1 → 2 → 3 before any business API.",
      ].join("\n"),
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [
      { key: "sidhBaseUrl", value: seed.credentials.baseUrl },
      { key: "sidhUsername", value: seed.credentials.username },
      { key: "sidhTpId", value: seed.credentials.tpId },
      { key: "sidhPassword", value: "" },
      { key: "sidhEncryptedPassword", value: "" },
      { key: "sidhPublicKey", value: "" },
      { key: "sidhSecretKey", value: "" },
      { key: "sidhCsrfToken", value: "" },
      { key: "sidhCookie", value: "" },
      { key: "sidhAccessToken", value: "" },
      { key: "sidhBatchId", value: String(seed.batch.sidhBatchId ?? "") },
      { key: "sidhCandidateId", value: sidhCandidateId },
      { key: "sidhCourseId", value: String(seed.course.sidhCourseId) },
      { key: "sidhSchemeId", value: String(seed.scheme.sidhSchemeId) },
      { key: "sidhSchemeReferenceId", value: String(seed.scheme.sidhSchemeReferenceId) },
      { key: "sidhTcId", value: String(seed.center.sidhTcId) },
      { key: "batchStartDate", value: seed.batchStartDate },
      { key: "batchEndDate", value: seed.batchEndDate },
      { key: "assessmentDate", value: seed.assessmentDate },
    ],
    item: [authFolder, candidateFolder, batchFolder, assessmentFolder],
  };
}

function buildEnvironment(seed: Awaited<ReturnType<typeof loadSeedData>>) {
  const values = [
    ["sidhBaseUrl", seed.credentials.baseUrl],
    ["sidhUsername", seed.credentials.username],
    ["sidhTpId", seed.credentials.tpId],
    ["sidhPassword", seed.credentials.password],
    ["sidhEncryptedPassword", ""],
    ["sidhPublicKey", ""],
    ["sidhSecretKey", ""],
    ["sidhCsrfToken", ""],
    ["sidhCookie", ""],
    ["sidhAccessToken", ""],
    ["sidhBatchId", String(seed.batch.sidhBatchId ?? "")],
    ["sidhCandidateId", String(seed.primaryCandidate.sidhCandidateId)],
    ["sidhCourseId", String(seed.course.sidhCourseId)],
    ["sidhSchemeId", String(seed.scheme.sidhSchemeId)],
    ["sidhSchemeReferenceId", String(seed.scheme.sidhSchemeReferenceId)],
    ["sidhTcId", String(seed.center.sidhTcId)],
    ["batchStartDate", seed.batchStartDate],
    ["batchEndDate", seed.batchEndDate],
    ["assessmentDate", seed.assessmentDate],
  ].map(([key, value]) => ({
    key,
    value,
    enabled: true,
    type: key.toLowerCase().includes("password") || key.toLowerCase().includes("token") ? "secret" : "default",
  }));

  return {
    id: `sidh-${seed.envName}`,
    name: `SIDH ${seed.envName} (DB-seeded)`,
    values,
    _postman_variable_scope: "environment",
  };
}

async function main() {
  const seed = await loadSeedData();
  const outDir = path.join(process.cwd(), "postman");
  await mkdir(outDir, { recursive: true });

  const collectionPath = path.join(outDir, "SIDH-Partner-APIs.postman_collection.json");
  const environmentPath = path.join(outDir, "SIDH-Production.postman_environment.json");

  await writeFile(collectionPath, `${JSON.stringify(buildCollection(seed), null, 2)}\n`, "utf8");
  await writeFile(environmentPath, `${JSON.stringify(buildEnvironment(seed), null, 2)}\n`, "utf8");

  console.log("Generated SIDH Postman artifacts");
  console.log(`- ${collectionPath}`);
  console.log(`- ${environmentPath}`);
  console.log(`Environment : ${seed.envName}`);
  console.log(`Base URL    : ${seed.credentials.baseUrl}`);
  console.log(`TP ID       : ${seed.credentials.tpId}`);
  console.log(`Batch       : ${String(seed.batch.batchName)}`);
  console.log(`Course      : ${String(seed.course.sidhCourseId)}`);
  console.log(`Scheme      : ${String(seed.scheme.sidhSchemeId)}`);
  console.log(`TC          : ${String(seed.center.sidhTcId)}`);
  console.log(`Candidate   : ${String(seed.primaryCandidate.sidhCandidateId)}`);
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const mongoose = await import("mongoose");
      await mongoose.default.disconnect();
    } catch {
      // ignore disconnect failures during script shutdown
    }
  });
