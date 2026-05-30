import { describe, expect, it } from "vitest";

import { createEnv, getSidhBaseUrl } from "@/lib/server/env";

describe("env", () => {
  it("resolves the UAT SIDH base URL when SIDH_ENV is uat", () => {
    const env = createEnv({
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
    });

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
});