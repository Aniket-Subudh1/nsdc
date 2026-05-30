import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "@/lib/server/auth";
import { resetEnvCache } from "@/lib/server/env";

describe("auth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
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
    };
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("StrongPass@123");

    await expect(verifyPassword("StrongPass@123", hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPass@123", hash)).resolves.toBe(false);
  });

  it("signs and verifies access tokens", async () => {
    const token = await signAccessToken({
      sub: "usr_001",
      sid: "ses_001",
      email: "admin@example.com",
      name: "Platform Admin",
      roles: ["platform_admin"],
      centerIds: [],
    });

    await expect(verifyAccessToken(token)).resolves.toMatchObject({
      userId: "usr_001",
      sessionId: "ses_001",
      email: "admin@example.com",
      name: "Platform Admin",
      roles: ["platform_admin"],
      centerIds: [],
    });
  });
});