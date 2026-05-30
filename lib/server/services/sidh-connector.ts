import { constants, publicEncrypt } from "node:crypto";

import { type AppEnv, getEnv, getSidhCredentials } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { SidhApiTransactionModel } from "@/lib/server/models/sidh-api-transaction";

export type CandidateRegistrationPayload = {
  candidateReferenceId: string;
  candidate: Record<string, unknown>;
  center: {
    centerId: string;
    centerName: string | null;
    sidhTcId: string | null;
  };
  meta: {
    centerId: string;
    programId: string;
    registrationMode: string;
  };
  tpId: string;
};

export type RegisterCandidateInput = {
  attemptId: string;
  payload: CandidateRegistrationPayload;
  syncJobId: string;
};

export type RegisterCandidateResult = {
  remoteCandidateId: string | null;
  responseBody: unknown;
  responseStatus: number;
};

export class SidhConnectorError extends Error {
  code: string;
  manualReview: boolean;
  remoteCandidateId: string | null;
  responseBody: unknown;
  retryable: boolean;
  status: number | null;

  constructor(input: {
    code: string;
    manualReview?: boolean;
    message: string;
    remoteCandidateId?: string | null;
    responseBody?: unknown;
    retryable?: boolean;
    status?: number | null;
  }) {
    super(input.message);
    this.code = input.code;
    this.manualReview = input.manualReview ?? false;
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
  body?: Record<string, unknown>;
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
    return trimmed;
  }

  const wrapped = trimmed.match(/.{1,64}/g)?.join("\n") ?? trimmed;
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
  return {
    password: encryptedPassword,
    tpId,
    username,
  };
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

function classifyError(responseStatus: number, responseBody: unknown, fallbackMessage: string) {
  const remoteCandidateId = extractRemoteCandidateId(responseBody);

  if (responseStatus === 401 || responseStatus === 403) {
    return new SidhConnectorError({
      code: "SIDH_AUTH_FAILED",
      message: fallbackMessage,
      responseBody,
      retryable: true,
      status: responseStatus,
    });
  }

  if (responseStatus === 409) {
    return new SidhConnectorError({
      code: "SIDH_CONFLICT",
      manualReview: remoteCandidateId === null,
      message: fallbackMessage,
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
    const requestHeaders = {
      Accept: "application/json",
      ...buildAuthHeaders(options.session),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    };

    try {
      const response = await fetchImpl(url, {
        body: options.body ? JSON.stringify(options.body) : undefined,
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
        requestPayload: options.body ?? {},
        responseHeaders,
        responsePayload: payload,
        responseStatus: response.status,
        success: response.ok,
        syncJobId: options.syncJobId,
      });

      if (!response.ok) {
        cachedSession = null;
        const message = extractErrorMessage(payload, `SIDH ${options.operation} failed`);
        throw classifyError(response.status, payload, message);
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
        requestPayload: options.body ?? {},
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
          (error.status === 401 || error.status === 403 || error.status === 412 || error.code === "SIDH_AUTH_FAILED")
        ) {
          cachedSession = null;
          return executeRegistration(true);
        }

        throw error;
      }
    },
  };
}