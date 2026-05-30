import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEnv } from "@/lib/server/env";
import { createSidhConnector, SidhConnectorError } from "@/lib/server/services/sidh-connector";

const mocks = vi.hoisted(() => ({
  createTransaction: vi.fn(),
}));

vi.mock("@/lib/server/models/sidh-api-transaction", () => ({
  SidhApiTransactionModel: {
    create: mocks.createTransaction,
  },
}));

function createJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    status: init.status ?? 200,
  });
}

describe("SIDH connector", () => {
  const env = createEnv({
    ACCESS_TOKEN_TTL_MINUTES: "60",
    APP_ENV: "test",
    DATABASE_URL: "mongodb://localhost:27017/nsdc-test",
    JWT_ACCESS_SECRET: "12345678901234567890123456789012",
    JWT_REFRESH_SECRET: "12345678901234567890123456789012",
    NODE_ENV: "test",
    PASSWORD_RESET_OTP_TTL_MINUTES: "10",
    REDIS_URL: "",
    SEED_ADMIN_EMAIL: "admin@example.com",
    SEED_ADMIN_NAME: "Admin",
    SEED_ADMIN_PASSWORD: "StrongPass@123",
    SESSION_SECRET: "12345678901234567890123456789012",
    SESSION_TTL_HOURS: "12",
    SIDH_ENV: "uat",
    SIDH_PROD_BASE_URL: "https://adminservices.skillindiadigital.gov.in",
    SIDH_PROD_PASSWORD: "prod-password",
    SIDH_PROD_TP_ID: "TP_PROD",
    SIDH_PROD_USERNAME: "prod-user",
    SIDH_UAT_BASE_URL: "https://backend.itrackglobal.com",
    SIDH_UAT_PASSWORD: "uat-password",
    SIDH_UAT_TP_ID: "TP_UAT",
    SIDH_UAT_USERNAME: "uat-user",
    SMTP_FROM: "",
    SMTP_HOST: "",
    SMTP_PASS: "",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("boots auth and registers a candidate", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            "x-csrf-token": "csrf-token",
          },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ publicKey: "test-public-key", secretKey: "test-secret" }))
      .mockResolvedValueOnce(
        createJsonResponse(
          { accessToken: "access-token" },
          {
            headers: {
              "set-cookie": "sidh-session=abc123",
            },
          },
        ),
      )
      .mockResolvedValueOnce(createJsonResponse({ candidateId: "CAN_778899" }, { status: 201 }));

    const connector = createSidhConnector({ env, fetchImpl });
    const result = await connector.registerCandidate({
      attemptId: "syncatt_001",
      payload: {
        candidate: { fullName: "Rohit Kumar" },
        candidateReferenceId: "cand_001",
        center: { centerId: "tc_001", centerName: "Center One", sidhTcId: "TC164648" },
        meta: { centerId: "tc_001", programId: "prg_001", registrationMode: "internal_registration" },
        tpId: "TP_UAT",
      },
      syncJobId: "sync_001",
    });

    expect(result.remoteCandidateId).toBe("CAN_778899");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(mocks.createTransaction).toHaveBeenCalledTimes(4);
  });

  it("refreshes auth and retries once on 412", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { headers: { "x-csrf-token": "csrf-1" }, status: 200 }))
      .mockResolvedValueOnce(createJsonResponse({ publicKey: "key-1", secretKey: "secret-1" }))
      .mockResolvedValueOnce(createJsonResponse({ accessToken: "token-1" }))
      .mockResolvedValueOnce(createJsonResponse({ message: "expired auth" }, { status: 412 }))
      .mockResolvedValueOnce(new Response(null, { headers: { "x-csrf-token": "csrf-2" }, status: 200 }))
      .mockResolvedValueOnce(createJsonResponse({ publicKey: "key-2", secretKey: "secret-2" }))
      .mockResolvedValueOnce(createJsonResponse({ accessToken: "token-2" }))
      .mockResolvedValueOnce(createJsonResponse({ candidateId: "CAN_445566" }, { status: 201 }));

    const connector = createSidhConnector({ env, fetchImpl });
    const result = await connector.registerCandidate({
      attemptId: "syncatt_002",
      payload: {
        candidate: { fullName: "Rohit Kumar" },
        candidateReferenceId: "cand_001",
        center: { centerId: "tc_001", centerName: "Center One", sidhTcId: "TC164648" },
        meta: { centerId: "tc_001", programId: "prg_001", registrationMode: "internal_registration" },
        tpId: "TP_UAT",
      },
      syncJobId: "sync_001",
    });

    expect(result.remoteCandidateId).toBe("CAN_445566");
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });

  it("surfaces unreconciled conflict errors", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { headers: { "x-csrf-token": "csrf-token" }, status: 200 }))
      .mockResolvedValueOnce(createJsonResponse({ publicKey: "test-public-key", secretKey: "test-secret" }))
      .mockResolvedValueOnce(createJsonResponse({ accessToken: "access-token" }))
      .mockResolvedValueOnce(createJsonResponse({ message: "already exists" }, { status: 409 }));

    const connector = createSidhConnector({ env, fetchImpl });

    await expect(
      connector.registerCandidate({
        attemptId: "syncatt_003",
        payload: {
          candidate: { fullName: "Rohit Kumar" },
          candidateReferenceId: "cand_001",
          center: { centerId: "tc_001", centerName: "Center One", sidhTcId: "TC164648" },
          meta: { centerId: "tc_001", programId: "prg_001", registrationMode: "internal_registration" },
          tpId: "TP_UAT",
        },
        syncJobId: "sync_001",
      }),
    ).rejects.toBeInstanceOf(SidhConnectorError);
  });

  it("carries the csrf cookie into key fetch and login", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            "set-cookie": "csrf-session=abc123",
            "x-csrf-token": "csrf-token",
          },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ publicKey: "test-public-key", secretKey: "test-secret" }))
      .mockResolvedValueOnce(createJsonResponse({ accessToken: "access-token" }))
      .mockResolvedValueOnce(createJsonResponse({ candidateId: "CAN_445566" }, { status: 201 }));

    const connector = createSidhConnector({ env, fetchImpl });

    await connector.registerCandidate({
      attemptId: "syncatt_004",
      payload: {
        candidate: { fullName: "Rohit Kumar" },
        candidateReferenceId: "cand_001",
        center: { centerId: "tc_001", centerName: "Center One", sidhTcId: "TC164648" },
        meta: { centerId: "tc_001", programId: "prg_001", registrationMode: "internal_registration" },
        tpId: "TP_UAT",
      },
      syncJobId: "sync_001",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://backend.itrackglobal.com/api/user/v1/getkey",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "csrf-session=abc123",
          "x-csrf-token": "csrf-token",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://backend.itrackglobal.com/api/user/v1/login",
      expect.objectContaining({
        body: expect.stringContaining("username=uat-user"),
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: "csrf-session=abc123",
          "x-csrf-token": "csrf-token",
        }),
      }),
    );
  });

  it("encrypts the login password when the returned PEM contains indented lines", async () => {
    const indentedPem = `-----BEGIN PUBLIC KEY-----
    MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAyN6utk97FCkC6cycT0mN
    bPcwSzxvsheiDtZFMTmC0yszmL8xWWsf06bPjglLzJzGRJEAXlP4/UC07y4qFxWO
    QnmOZiUQWFVeKPih52ib44u0dclqojyHNj7A0dieoeH1TaIvs5ng0FqJy3s0jIpk
    vUNGtJsbr6Bt+lsPccBIu0fJ84VBG9KVEZu0Ob75kPLgSFlbMFPn+Hwa5UDnOXjq
    kP0qAPvTFxZqgyGoLZOcffL4ZO9pZkNl5nSEta6XetQgZ9gqWGb01tS0GH5NOzul
    PsdcLTNlCs56dwuvyntUU3cdc3ZLRoMkHCa50sBcEbK1q631+LZjJo3eOpdWkPZl
    EyNNNjGB+PayzqfLjN8Vn1sBsnspL8fm8CQJsntrwapS28Ap1WZ1r4mTMsSf+tj8
    4ADGPmLZBVN3db4vjDIybWo9NAA2+Od12YlTb4tKp3FVMXRb4OTwNN7+6Ylxo+vm
    W9TYYtnikBG2DSJQWF/s9z7WYE2fD2URooHAXluXyQ8RAcRKOx4CFBQmfbYF3JNU
    t7ZQzk77WAzeQK3mQfJm+R0pTJMNx8O1/USVLWqhl+TxeZb6W/fo3y/6OiWyeYfP
    mnwuoms+MOvbv6HtYcpA3Kb6NbmtlHG+sSbjwGWALhreVfPateoGJIn/YRwBMFHG
    q28mY/SYVxdVCZO2+aXuneUCAwEAAQ==
    -----END PUBLIC KEY-----`;

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { headers: { "x-csrf-token": "csrf-token" }, status: 200 }))
      .mockResolvedValueOnce(createJsonResponse({ publicKey: indentedPem, secret: "test-secret" }))
      .mockResolvedValueOnce(createJsonResponse({ accessToken: "access-token" }))
      .mockResolvedValueOnce(createJsonResponse({ candidateId: "CAN_778899" }, { status: 201 }));

    const connector = createSidhConnector({ env, fetchImpl });

    await connector.registerCandidate({
      attemptId: "syncatt_006",
      payload: {
        candidate: { fullName: "Rohit Kumar" },
        candidateReferenceId: "cand_001",
        center: { centerId: "tc_001", centerName: "Center One", sidhTcId: "TC164648" },
        meta: { centerId: "tc_001", programId: "prg_001", registrationMode: "internal_registration" },
        tpId: "TP_UAT",
      },
      syncJobId: "sync_001",
    });

    const loginCall = fetchImpl.mock.calls[2];
    const loginBody = new URLSearchParams(String(loginCall?.[1]?.body ?? ""));
    const encryptedPassword = loginBody.get("password");

    expect(encryptedPassword).toBeTruthy();
    expect(encryptedPassword).not.toBe(Buffer.from("uat-password:test-secret", "utf8").toString("base64"));
  });

  it("preserves plain-text auth errors instead of failing json parsing", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { headers: { "x-csrf-token": "csrf-token" }, status: 200 }))
      .mockResolvedValueOnce(new Response("Unauthorized : csrf", { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { headers: { "x-csrf-token": "csrf-token-2" }, status: 200 }))
      .mockResolvedValueOnce(new Response("Unauthorized : csrf", { status: 401 }));

    const connector = createSidhConnector({ env, fetchImpl });

    await expect(
      connector.registerCandidate({
        attemptId: "syncatt_005",
        payload: {
          candidate: { fullName: "Rohit Kumar" },
          candidateReferenceId: "cand_001",
          center: { centerId: "tc_001", centerName: "Center One", sidhTcId: "TC164648" },
          meta: { centerId: "tc_001", programId: "prg_001", registrationMode: "internal_registration" },
          tpId: "TP_UAT",
        },
        syncJobId: "sync_001",
      }),
    ).rejects.toMatchObject({
      code: "SIDH_AUTH_FAILED",
      message: "Unauthorized : csrf",
      status: 401,
    });
  });

  it("marks login 403 responses as non-retryable credential rejections", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { headers: { "x-csrf-token": "csrf-token", "set-cookie": "csrf-session=abc123" }, status: 200 }))
      .mockResolvedValueOnce(createJsonResponse({ publicKey: "test-public-key", secret: "test-secret" }))
      .mockResolvedValueOnce(new Response("Error in request", { status: 403 }));

    const connector = createSidhConnector({ env, fetchImpl });

    await expect(
      connector.registerCandidate({
        attemptId: "syncatt_007",
        payload: {
          candidate: { fullName: "Rohit Kumar" },
          candidateReferenceId: "cand_001",
          center: { centerId: "tc_001", centerName: "Center One", sidhTcId: "TC164648" },
          meta: { centerId: "tc_001", programId: "prg_001", registrationMode: "internal_registration" },
          tpId: "TP_UAT",
        },
        syncJobId: "sync_001",
      }),
    ).rejects.toMatchObject({
      code: "SIDH_LOGIN_REJECTED",
      manualReview: true,
      retryable: false,
      status: 403,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});