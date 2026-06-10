import { describe, expect, it } from "vitest";

import { createEnv, getSidhBaseUrl, getSidhCredentials } from "@/lib/server/env";

const baseEnv = {
  NODE_ENV: "test",
  APP_ENV: "test",
  DATABASE_URL: "mongodb://127.0.0.1:27017/nsdc-test",
  REDIS_URL: "",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  SESSION_SECRET: "c".repeat(32),
  SIDH_ENV: "uat",
  SIDH_UAT_BASE_URL: "https://backend.itrackglobal.com",
  SIDH_PROD_BASE_URL: "https://adminservices.skillindiadigital.gov.in",
  SIDH_UAT_USERNAME: "",
  SIDH_UAT_PASSWORD: "",
  SIDH_PROD_USERNAME: "",
  SIDH_PROD_PASSWORD: "",
  SIDH_UAT_TP_ID: "",
  SIDH_PROD_TP_ID: "",
} as const;

describe("env", () => {
  it("resolves AWS SES SMTP settings without mutating IAM SMTP credentials", () => {
    const env = createEnv({
      ...baseEnv,
      SMTP_HOST: "email-smtp.ap-southeast-2.amazonaws.com",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_USER: "AKIATESTSMTPUSER",
      SMTP_PASS: "secret-smtp-pass",
      FROM_EMAIL: '"Saveful <info@saveful.com>"',
    });

    expect(env.SMTP_HOST).toBe("email-smtp.ap-southeast-2.amazonaws.com");
    expect(env.SMTP_USER).toBe("AKIATESTSMTPUSER");
    expect(env.SMTP_FROM).toBe("Saveful <info@saveful.com>");
  });

  it("resolves the UAT SIDH base URL when SIDH_ENV is uat", () => {
    const env = createEnv(baseEnv);

    expect(getSidhBaseUrl(env)).toBe("https://backend.itrackglobal.com");
  });

  it("rejects non-MongoDB connection strings", () => {
    expect(() =>
      createEnv({
        NODE_ENV: "test",
        APP_ENV: "test",
        DATABASE_URL: "postgresql://localhost/nsdc",
        REDIS_URL: "",
        JWT_ACCESS_SECRET: "a".repeat(32),
        JWT_REFRESH_SECRET: "b".repeat(32),
        SESSION_SECRET: "c".repeat(32),
        SIDH_ENV: "uat",
        SIDH_UAT_BASE_URL: "https://backend.itrackglobal.com",
        SIDH_PROD_BASE_URL: "https://adminservices.skillindiadigital.gov.in",
        SIDH_UAT_USERNAME: "",
        SIDH_UAT_PASSWORD: "",
        SIDH_PROD_USERNAME: "",
        SIDH_PROD_PASSWORD: "",
        SIDH_UAT_TP_ID: "",
        SIDH_PROD_TP_ID: "",
      }),
    ).toThrow("DATABASE_URL must be a MongoDB connection string");
  });

  it("falls back to the SIDH username when TP ID is blank", () => {
    const env = createEnv({
      ...baseEnv,
      SIDH_ENV: "production",
      SIDH_UAT_USERNAME: "TP200988",
      SIDH_PROD_USERNAME: "TP38273",
    });

    expect(getSidhCredentials(env).tpId).toBe("TP38273");
  });
});