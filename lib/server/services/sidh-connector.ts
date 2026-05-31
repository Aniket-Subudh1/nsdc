import { constants, publicEncrypt } from "node:crypto";

import { type AppEnv, getEnv, getSidhCredentials } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { SidhApiTransactionModel } from "@/lib/server/models/sidh-api-transaction";

export type CandidateRegistrationPayload = {
  PersonalDetails: {
    DOB: string;
    FatherName?: string;
    FirstName: string;
    Gender?: string;
    GuardianName?: string;
    NamePrefix?: string;
  };
  ContactDetails: {
    CountryCode: string;
    Email?: string;
    Phone: string;
  };
};

export type BatchCreationPayload = {
  assessmentEndDate: string;
  assessmentMode: string;
  assessmentStartDate: string;
  batchEndDate: string;
  batchEndTime: string;
  batchFee: {
    totalFees: number;
  };
  batchName: string;
  batchStartDate: string;
  batchStartTime: string;
  batchType: string;
  courseId: string;
  createdSource: string;
  feePaidBy: string;
  schemeId: string;
  schemeReferenceId: string;
  schemeType: string;
  size: number;
  skillingcategory: {
    id: number;
    name: string;
    scheme: string;
  };
  tcId: string;
  tpId?: string;
  trainingHoursPerDay: number;
  type: string;
};

export type EnrollmentPayload = {
  batchId: string | null | undefined;
  candidateIds: string[];
};

export type TrainingAssessmentPayload = {
  batchId: number | string;
  candidates: Array<{
    assessmentDetails: {
      assessmentAgency: string;
      assessmentDataUploadedOn: string;
      assessmentPercentage: number;
      assessmentStatus: string;
      assessorID: string;
      assessorName: string;
      grade?: string;
    };
    candidateID: string;
    certificationDetails: {
      certificationDate: string;
      certificationName: string;
      certifyingAgency: string;
      isCertified: boolean;
    };
    trainingDetails: {
      attendance: number;
      trainingStatus: string;
    };
  }>;
};

export type CertificateGenerationPayload = {
  batchId: number | string;
  userName: string;
};

export type CertificateDownloadPayload = {
  batchId: number | string;
  candidateId: string;
  type?: string;
};

export type RegisterCandidateInput = {
  attemptId: string;
  payload: CandidateRegistrationPayload;
  syncJobId: string;
};

export type CreateBatchInput = {
  attemptId: string;
  payload: BatchCreationPayload;
  syncJobId: string;
};

export type EnrollCandidateInput = {
  attemptId: string;
  payload: EnrollmentPayload;
  syncJobId: string;
};

export type SubmitTrainingAssessmentInput = {
  attemptId: string;
  payload: TrainingAssessmentPayload;
  syncJobId: string;
};

export type GenerateCertificateInput = {
  attemptId: string;
  payload: CertificateGenerationPayload;
  syncJobId: string;
};

export type DownloadCertificateInput = {
  attemptId: string;
  payload: CertificateDownloadPayload;
  syncJobId: string;
};

export type RegisterCandidateResult = {
  remoteCandidateId: string | null;
  responseBody: unknown;
  responseStatus: number;
};

export type CreateBatchResult = {
  remoteBatchId: string | null;
  responseBody: unknown;
  responseStatus: number;
};

export type EnrollCandidateResult = {
  remoteEnrollmentId: string | null;
  responseBody: unknown;
  responseStatus: number;
};

export type SubmitTrainingAssessmentResult = {
  responseBody: unknown;
  responseStatus: number;
};

export type GenerateCertificateResult = {
  responseBody: unknown;
  responseStatus: number;
};

export type DownloadCertificateResult = {
  contentType: string | null;
  fileName: string | null;
  responseBody: ArrayBuffer;
  responseStatus: number;
};

export class SidhConnectorError extends Error {
  code: string;
  manualReview: boolean;
  remoteBatchId: string | null;
  remoteCandidateId: string | null;
  responseBody: unknown;
  retryable: boolean;
  status: number | null;

  constructor(input: {
    code: string;
    manualReview?: boolean;
    message: string;
    remoteBatchId?: string | null;
    remoteCandidateId?: string | null;
    responseBody?: unknown;
    retryable?: boolean;
    status?: number | null;
  }) {
    super(input.message);
    this.code = input.code;
    this.manualReview = input.manualReview ?? false;
    this.remoteBatchId = input.remoteBatchId ?? null;
    this.remoteCandidateId = input.remoteCandidateId ?? null;
    this.responseBody = input.responseBody ?? null;
    this.retryable = input.retryable ?? false;
    this.status = input.status ?? null;
  }
}

type ConnectorSession = {
  accessToken: string | null;
  cookie: string | null;
  csrfToken: string;
};

type RequestOptions = {
  attemptId: string;
  body?: Record<string, unknown> | URLSearchParams;
  headers?: Record<string, string>;
  operation: string;
  path: string;
  session?: ConnectorSession;
  syncJobId: string;
};

type ConnectorDependencies = {
  env?: AppEnv;
  fetchImpl?: typeof fetch;
};

function normalizePublicKey(publicKey: string) {
  const trimmed = publicKey.trim();

  if (!trimmed) {
    throw new ApiError(500, "SIDH_KEY_MISSING", "SIDH public key bootstrap did not return a public key");
  }

  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    const normalizedLines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return normalizedLines.join("\n");
  }

  const compact = trimmed.replace(/\s+/g, "");
  const wrapped = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (/authorization|cookie|password|token|secret/i.test(key)) {
        return [key, "[REDACTED]"];
      }

      return [key, redactValue(entry)];
    }),
  );
}

function buildLoginPayload(username: string, encryptedPassword: string, tpId: string) {
  return new URLSearchParams({
    password: encryptedPassword,
    tpId,
    username,
  });
}

function buildAuthHeaders(session?: ConnectorSession) {
  return {
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    ...(session?.cookie ? { Cookie: session.cookie } : {}),
    ...(session?.csrfToken ? { "x-csrf-token": session.csrfToken } : {}),
  };
}

function parseResponsePayload<T = unknown>(text: string, contentType: string | null): T | string {
  const trimmed = text.trim();

  if (!trimmed) {
    return {} as T;
  }

  const shouldParseJson = contentType?.toLowerCase().includes("json") || /^[\[{]/.test(trimmed);

  if (shouldParseJson) {
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function extractErrorMessage(responseBody: unknown, fallbackMessage: string) {
  if (typeof responseBody === "string" && responseBody.trim()) {
    return responseBody.trim();
  }

  return extractJsonValue<string>(responseBody, ["message", "error", "errorMessage"]) ?? fallbackMessage;
}

function serializeRequestBody(body: RequestOptions["body"]) {
  if (!body) {
    return { contentType: null, payload: undefined as string | undefined, requestPayload: {} as unknown };
  }

  if (body instanceof URLSearchParams) {
    return {
      contentType: "application/x-www-form-urlencoded",
      payload: body.toString(),
      requestPayload: Object.fromEntries(body.entries()),
    };
  }

  return {
    contentType: "application/json",
    payload: JSON.stringify(body),
    requestPayload: body,
  };
}

function extractJsonValue<T = unknown>(payload: unknown, candidates: string[]): T | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  for (const candidate of candidates) {
    const direct = record[candidate];
    if (direct !== undefined) {
      return direct as T;
    }
  }

  if (record.data && typeof record.data === "object") {
    const nested = extractJsonValue<T>(record.data, candidates);
    if (nested !== undefined) {
      return nested;
    }
  }

  if (record.result && typeof record.result === "object") {
    const nested = extractJsonValue<T>(record.result, candidates);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function extractFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const encodedFileName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedFileName) {
    return decodeURIComponent(encodedFileName.replace(/^"|"$/g, ""));
  }

  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

export function extractRemoteCandidateId(payload: unknown) {
  const value = extractJsonValue<string>(payload, [
    "candidateId",
    "candidateID",
    "sidhCandidateId",
    "CandidateId",
    "CandidateID",
    "referenceId",
    "referenceID",
  ]);

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractRemoteBatchId(payload: unknown) {
  const value = extractJsonValue<string>(payload, [
    "batchId",
    "batchID",
    "sidhBatchId",
    "BatchId",
    "BatchID",
  ]);

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractRemoteEnrollmentId(payload: unknown) {
  const value = extractJsonValue<string>(payload, [
    "enrollmentId",
    "enrollmentID",
    "candidateBatchId",
    "candidateBatchID",
    "batchCandidateId",
  ]);

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function encryptPassword(password: string, publicKey: string, secretKey: string) {
  const normalizedSecret = secretKey.trim();

  try {
    return publicEncrypt(
      {
        key: normalizePublicKey(publicKey),
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(JSON.stringify({ password, secretKey: normalizedSecret }), "utf8"),
    ).toString("base64");
  } catch {
    return Buffer.from(`${password}:${normalizedSecret}`, "utf8").toString("base64");
  }
}

async function logTransaction(input: {
  attemptId: string;
  endpoint: string;
  operation: string;
  requestHeaders: Record<string, string>;
  requestPayload: unknown;
  responseHeaders: Record<string, string>;
  responsePayload: unknown;
  responseStatus: number | null;
  success: boolean;
  syncJobId: string;
}) {
  await SidhApiTransactionModel.create({
    attemptId: input.attemptId,
    endpoint: input.endpoint,
    operation: input.operation,
    requestHeaders: redactValue(input.requestHeaders),
    requestPayload: redactValue(input.requestPayload),
    responseHeaders: redactValue(input.responseHeaders),
    responsePayload: redactValue(input.responsePayload),
    responseStatus: input.responseStatus,
    success: input.success,
    syncJobId: input.syncJobId,
    transactionId: createPrefixedId("txn"),
  });
}

function classifyError(responseStatus: number, responseBody: unknown, fallbackMessage: string, operation?: string) {
  const remoteCandidateId = extractRemoteCandidateId(responseBody);
  const remoteBatchId = extractRemoteBatchId(responseBody);

  if (responseStatus === 401) {
    return new SidhConnectorError({
      code: "SIDH_AUTH_FAILED",
      message: fallbackMessage,
      responseBody,
      retryable: true,
      status: responseStatus,
    });
  }

  if (responseStatus === 403) {
    return new SidhConnectorError({
      code: operation === "auth.login" ? "SIDH_LOGIN_REJECTED" : "SIDH_ACCESS_DENIED",
      manualReview: true,
      message:
        operation === "auth.login"
          ? "SIDH login was rejected. Verify SIDH username, password, and TP ID for the active environment."
          : fallbackMessage,
      responseBody,
      retryable: false,
      status: responseStatus,
    });
  }

  if (responseStatus === 409) {
    return new SidhConnectorError({
      code: "SIDH_CONFLICT",
      manualReview: remoteCandidateId === null && remoteBatchId === null,
      message: fallbackMessage,
      remoteBatchId,
      remoteCandidateId,
      responseBody,
      status: responseStatus,
    });
  }

  if (responseStatus === 412) {
    return new SidhConnectorError({
      code: "SIDH_PRECONDITION_FAILED",
      message: fallbackMessage,
      responseBody,
      retryable: true,
      status: responseStatus,
    });
  }

  if (responseStatus === 406) {
    return new SidhConnectorError({
      code: "SIDH_REMOTE_BATCH_CANCELLED",
      manualReview: true,
      message: fallbackMessage,
      responseBody,
      status: responseStatus,
    });
  }

  if (responseStatus >= 500) {
    return new SidhConnectorError({
      code: "SIDH_SERVER_ERROR",
      message: fallbackMessage,
      responseBody,
      retryable: true,
      status: responseStatus,
    });
  }

  return new SidhConnectorError({
    code: "SIDH_REQUEST_REJECTED",
    manualReview: true,
    message: fallbackMessage,
    responseBody,
    status: responseStatus,
  });
}

export function createSidhConnector(dependencies: ConnectorDependencies = {}) {
  const env = dependencies.env ?? getEnv();
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const credentials = getSidhCredentials(env);
  let cachedSession: ConnectorSession | null = null;

  async function requestJson(options: RequestOptions): Promise<{ headers: Headers; payload: unknown; status: number }> {
    const url = new URL(options.path, credentials.baseUrl).toString();
    const serializedBody = serializeRequestBody(options.body);
    const requestHeaders = {
      Accept: "application/json",
      ...buildAuthHeaders(options.session),
      ...(serializedBody.contentType ? { "Content-Type": serializedBody.contentType } : {}),
      ...(options.headers ?? {}),
    };

    try {
      const response = await fetchImpl(url, {
        body: serializedBody.payload,
        headers: requestHeaders,
        method: options.headers?.["x-http-method"] ?? (options.body ? "POST" : "GET"),
      });
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const text = await response.text();
      const payload = parseResponsePayload(text, response.headers.get("content-type"));

      await logTransaction({
        attemptId: options.attemptId,
        endpoint: options.path,
        operation: options.operation,
        requestHeaders,
        requestPayload: serializedBody.requestPayload,
        responseHeaders,
        responsePayload: payload,
        responseStatus: response.status,
        success: response.ok,
        syncJobId: options.syncJobId,
      });

      if (!response.ok) {
        cachedSession = null;
        const message = extractErrorMessage(payload, `SIDH ${options.operation} failed`);
        throw classifyError(response.status, payload, message, options.operation);
      }

      return {
        headers: response.headers,
        payload,
        status: response.status,
      };
    } catch (error) {
      if (error instanceof SidhConnectorError) {
        throw error;
      }

      await logTransaction({
        attemptId: options.attemptId,
        endpoint: options.path,
        operation: options.operation,
        requestHeaders,
        requestPayload: serializedBody.requestPayload,
        responseHeaders: {},
        responsePayload: { message: error instanceof Error ? error.message : "Unknown network error" },
        responseStatus: null,
        success: false,
        syncJobId: options.syncJobId,
      });

      throw new SidhConnectorError({
        code: "SIDH_NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Unable to reach SIDH",
        retryable: true,
      });
    }
  }

  async function requestBinary(options: RequestOptions): Promise<{ headers: Headers; payload: ArrayBuffer; status: number }> {
    const url = new URL(options.path, credentials.baseUrl).toString();
    const serializedBody = serializeRequestBody(options.body);
    const requestHeaders = {
      Accept: "application/pdf,application/octet-stream,application/json",
      ...buildAuthHeaders(options.session),
      ...(serializedBody.contentType ? { "Content-Type": serializedBody.contentType } : {}),
      ...(options.headers ?? {}),
    };

    try {
      const response = await fetchImpl(url, {
        body: serializedBody.payload,
        headers: requestHeaders,
        method: options.headers?.["x-http-method"] ?? (options.body ? "POST" : "GET"),
      });
      const responseHeaders = Object.fromEntries(response.headers.entries());
      const contentType = response.headers.get("content-type");
      const payload = await response.arrayBuffer();
      const responsePayload = response.ok
        ? { byteLength: payload.byteLength, contentType }
        : parseResponsePayload(Buffer.from(payload).toString("utf8"), contentType);

      await logTransaction({
        attemptId: options.attemptId,
        endpoint: options.path,
        operation: options.operation,
        requestHeaders,
        requestPayload: serializedBody.requestPayload,
        responseHeaders,
        responsePayload,
        responseStatus: response.status,
        success: response.ok,
        syncJobId: options.syncJobId,
      });

      if (!response.ok) {
        cachedSession = null;
        const message = extractErrorMessage(responsePayload, `SIDH ${options.operation} failed`);
        throw classifyError(response.status, responsePayload, message, options.operation);
      }

      return {
        headers: response.headers,
        payload,
        status: response.status,
      };
    } catch (error) {
      if (error instanceof SidhConnectorError) {
        throw error;
      }

      await logTransaction({
        attemptId: options.attemptId,
        endpoint: options.path,
        operation: options.operation,
        requestHeaders,
        requestPayload: serializedBody.requestPayload,
        responseHeaders: {},
        responsePayload: { message: error instanceof Error ? error.message : "Unknown network error" },
        responseStatus: null,
        success: false,
        syncJobId: options.syncJobId,
      });

      throw new SidhConnectorError({
        code: "SIDH_NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Unable to reach SIDH",
        retryable: true,
      });
    }
  }

  async function bootstrapAuth(syncJobId: string, attemptId: string) {
    if (!credentials.username.trim() || !credentials.password.trim() || !credentials.tpId.trim()) {
      throw new SidhConnectorError({
        code: "SIDH_CONFIG_MISSING",
        manualReview: true,
        message: "SIDH credentials are not configured for the active environment",
      });
    }

    const csrfResponse = await fetchImpl(new URL("/api/user/v1", credentials.baseUrl).toString(), {
      headers: {
        Accept: "application/json",
      },
      method: "HEAD",
    });
    const csrfHeaders = Object.fromEntries(csrfResponse.headers.entries());

    await logTransaction({
      attemptId,
      endpoint: "/api/user/v1",
      operation: "csrf.fetch",
      requestHeaders: { Accept: "application/json" },
      requestPayload: {},
      responseHeaders: csrfHeaders,
      responsePayload: {},
      responseStatus: csrfResponse.status,
      success: csrfResponse.ok,
      syncJobId,
    });

    if (!csrfResponse.ok) {
      throw classifyError(csrfResponse.status, {}, "Unable to fetch SIDH CSRF token");
    }

    const csrfToken = csrfResponse.headers.get("x-csrf-token")?.trim();
    const csrfCookie = csrfResponse.headers.get("set-cookie")?.trim() || null;

    if (!csrfToken) {
      throw new SidhConnectorError({
        code: "SIDH_CSRF_MISSING",
        manualReview: true,
        message: "SIDH CSRF bootstrap did not return x-csrf-token",
      });
    }

    const bootstrapSession: ConnectorSession = {
      accessToken: null,
      cookie: csrfCookie,
      csrfToken,
    };

    const keyResponse = await requestJson({
      attemptId,
      operation: "keys.fetch",
      path: "/api/user/v1/getkey",
      session: bootstrapSession,
      syncJobId,
    });
    const publicKey = extractJsonValue<string>(keyResponse.payload, ["publicKey", "public_key", "key"]);
    const secretKey = extractJsonValue<string>(keyResponse.payload, ["secretKey", "secret_key", "secret"]);

    if (!publicKey || !secretKey) {
      throw new SidhConnectorError({
        code: "SIDH_KEY_MISSING",
        manualReview: true,
        message: "SIDH key bootstrap did not return both public and secret keys",
      });
    }

    const loginResponse = await requestJson({
      attemptId,
      body: buildLoginPayload(credentials.username, encryptPassword(credentials.password, publicKey, secretKey), credentials.tpId),
      operation: "auth.login",
      path: "/api/user/v1/login",
      session: bootstrapSession,
      syncJobId,
    });
    const accessToken = extractJsonValue<string>(loginResponse.payload, ["accessToken", "token", "authToken", "jwt"]);
    const cookie = loginResponse.headers.get("set-cookie")?.trim() || bootstrapSession.cookie;

    cachedSession = {
      accessToken: accessToken?.trim() || null,
      cookie,
      csrfToken,
    };

    return cachedSession;
  }

  async function ensureSession(syncJobId: string, attemptId: string, forceRefresh = false) {
    if (!cachedSession || forceRefresh) {
      return bootstrapAuth(syncJobId, attemptId);
    }

    return cachedSession;
  }

  return {
    async registerCandidate(input: RegisterCandidateInput): Promise<RegisterCandidateResult> {
      const runRegistration = async (session: ConnectorSession) => {
        const response = await requestJson({
          attemptId: input.attemptId,
          body: input.payload,
          operation: "candidate.register",
          path: "/api/user/v1/register/Candidate/v1",
          session,
          syncJobId: input.syncJobId,
        });

        return {
          remoteCandidateId: extractRemoteCandidateId(response.payload),
          responseBody: response.payload,
          responseStatus: response.status,
        } satisfies RegisterCandidateResult;
      };

      const executeRegistration = async (forceRefresh = false) => {
        const session = await ensureSession(input.syncJobId, input.attemptId, forceRefresh);
        return runRegistration(session);
      };

      try {
        return await executeRegistration();
      } catch (error) {
        if (
          error instanceof SidhConnectorError &&
          (error.status === 401 || error.status === 412 || error.code === "SIDH_AUTH_FAILED")
        ) {
          cachedSession = null;
          return executeRegistration(true);
        }

        throw error;
      }
    },

    async createBatch(input: CreateBatchInput): Promise<CreateBatchResult> {
      const runCreateBatch = async (session: ConnectorSession) => {
        const response = await requestJson({
          attemptId: input.attemptId,
          body: {
            ...input.payload,
            tpId: input.payload.tpId?.trim() || credentials.tpId,
          },
          operation: "batch.create",
          path: "/api/batch/v1/create",
          session,
          syncJobId: input.syncJobId,
        });

        return {
          remoteBatchId: extractRemoteBatchId(response.payload),
          responseBody: response.payload,
          responseStatus: response.status,
        } satisfies CreateBatchResult;
      };

      const executeCreateBatch = async (forceRefresh = false) => {
        const session = await ensureSession(input.syncJobId, input.attemptId, forceRefresh);
        return runCreateBatch(session);
      };

      try {
        return await executeCreateBatch();
      } catch (error) {
        if (
          error instanceof SidhConnectorError &&
          (error.status === 401 || error.status === 412 || error.code === "SIDH_AUTH_FAILED")
        ) {
          cachedSession = null;
          return executeCreateBatch(true);
        }

        throw error;
      }
    },

    async enrollCandidate(input: EnrollCandidateInput): Promise<EnrollCandidateResult> {
      const runEnrollment = async (session: ConnectorSession) => {
        const response = await requestJson({
          attemptId: input.attemptId,
          body: input.payload,
          operation: "batch.enroll_candidate",
          path: "/api/thirdparty/v1/enroll/Candidate",
          session,
          syncJobId: input.syncJobId,
        });

        return {
          remoteEnrollmentId: extractRemoteEnrollmentId(response.payload),
          responseBody: response.payload,
          responseStatus: response.status,
        } satisfies EnrollCandidateResult;
      };

      const executeEnrollment = async (forceRefresh = false) => {
        const session = await ensureSession(input.syncJobId, input.attemptId, forceRefresh);
        return runEnrollment(session);
      };

      try {
        return await executeEnrollment();
      } catch (error) {
        if (
          error instanceof SidhConnectorError &&
          (error.status === 401 || error.status === 412 || error.code === "SIDH_AUTH_FAILED")
        ) {
          cachedSession = null;
          return executeEnrollment(true);
        }

        throw error;
      }
    },

    async submitTrainingAndAssessment(input: SubmitTrainingAssessmentInput): Promise<SubmitTrainingAssessmentResult> {
      const runSubmission = async (session: ConnectorSession) => {
        const response = await requestJson({
          attemptId: input.attemptId,
          body: input.payload,
          operation: "batch.training_assessment_submit",
          path: "/v1/candidates/candidate/pushBatchEachCandidate",
          session,
          syncJobId: input.syncJobId,
        });

        return {
          responseBody: response.payload,
          responseStatus: response.status,
        } satisfies SubmitTrainingAssessmentResult;
      };

      const executeSubmission = async (forceRefresh = false) => {
        const session = await ensureSession(input.syncJobId, input.attemptId, forceRefresh);
        return runSubmission(session);
      };

      try {
        return await executeSubmission();
      } catch (error) {
        if (
          error instanceof SidhConnectorError &&
          (error.status === 401 || error.status === 412 || error.code === "SIDH_AUTH_FAILED")
        ) {
          cachedSession = null;
          return executeSubmission(true);
        }

        throw error;
      }
    },

    async generateCertificate(input: GenerateCertificateInput): Promise<GenerateCertificateResult> {
      const runGeneration = async (session: ConnectorSession) => {
        const response = await requestJson({
          attemptId: input.attemptId,
          body: input.payload,
          operation: "certificate.generate",
          path: "/api/v1/cert/certificate?for=trainingPartner",
          session,
          syncJobId: input.syncJobId,
        });

        return {
          responseBody: response.payload,
          responseStatus: response.status,
        } satisfies GenerateCertificateResult;
      };

      const executeGeneration = async (forceRefresh = false) => {
        const session = await ensureSession(input.syncJobId, input.attemptId, forceRefresh);
        return runGeneration(session);
      };

      try {
        return await executeGeneration();
      } catch (error) {
        if (
          error instanceof SidhConnectorError &&
          (error.status === 401 || error.status === 412 || error.code === "SIDH_AUTH_FAILED")
        ) {
          cachedSession = null;
          return executeGeneration(true);
        }

        throw error;
      }
    },

    async downloadCertificate(input: DownloadCertificateInput): Promise<DownloadCertificateResult> {
      const runDownload = async (session: ConnectorSession) => {
        const query = new URLSearchParams({
          batchId: String(input.payload.batchId),
          candidateId: input.payload.candidateId,
          type: input.payload.type ?? "externalcertificate",
        });
        const response = await requestBinary({
          attemptId: input.attemptId,
          operation: "certificate.download",
          path: `/api/v1/cert/uc/singledocdownload?${query.toString()}`,
          session,
          syncJobId: input.syncJobId,
        });

        return {
          contentType: response.headers.get("content-type"),
          fileName: extractFileName(response.headers.get("content-disposition")),
          responseBody: response.payload,
          responseStatus: response.status,
        } satisfies DownloadCertificateResult;
      };

      const executeDownload = async (forceRefresh = false) => {
        const session = await ensureSession(input.syncJobId, input.attemptId, forceRefresh);
        return runDownload(session);
      };

      try {
        return await executeDownload();
      } catch (error) {
        if (
          error instanceof SidhConnectorError &&
          (error.status === 401 || error.status === 412 || error.code === "SIDH_AUTH_FAILED")
        ) {
          cachedSession = null;
          return executeDownload(true);
        }

        throw error;
      }
    },
  };
}