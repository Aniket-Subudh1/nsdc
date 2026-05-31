import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "@/lib/server/auth";
import { resetEnvCache } from "@/lib/server/env";
import { loginSchema } from "@/lib/server/validation";

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

  it("lets login attempts reach credential verification even when the password is short", () => {
    expect(
      loginSchema.parse({
        email: "admin@example.com",
        password: "short",
        portal: "admin",
      }),
    ).toMatchObject({
      email: "admin@example.com",
      password: "short",
      portal: "admin",
    });
  });

  it("lets empty login passwords reach credential verification", () => {
    expect(
      loginSchema.parse({
        email: "admin@example.com",
        password: "",
        portal: "admin",
      }),
    ).toMatchObject({
      email: "admin@example.com",
      password: "",
      portal: "admin",
    });
  });

  it("normalizes malformed login fields instead of rejecting the request body", () => {
    expect(
      loginSchema.parse({
        email: "not-an-email",
        password: null,
        portal: "unexpected",
      }),
    ).toEqual({
      email: "not-an-email",
      password: "",
      portal: undefined,
    });
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