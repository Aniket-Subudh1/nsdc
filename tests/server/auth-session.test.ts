import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getAccessTokenTtlMinutes,
  getAuthCookieMaxAgeSeconds,
  getSessionExpiresAt,
  getSessionTtlHours,
} from "@/lib/server/auth-session";
import { createEnv, resetEnvCache } from "@/lib/server/env";

describe("auth session ttl", () => {
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

  it("defaults auth to seven days across token, cookie, and session ttl", () => {
    const env = createEnv(process.env);

    expect(getAccessTokenTtlMinutes(env)).toBe(7 * 24 * 60);
    expect(getSessionTtlHours(env)).toBe(7 * 24);
    expect(getAuthCookieMaxAgeSeconds(env)).toBe(7 * 24 * 60 * 60);

    const expiresAt = getSessionExpiresAt(env);
    const ttlMs = expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it("allows explicit ttl overrides", () => {
    const env = createEnv({
      ...process.env,
      AUTH_SESSION_TTL_DAYS: "7",
      ACCESS_TOKEN_TTL_MINUTES: "120",
      SESSION_TTL_HOURS: "48",
    });

    expect(getAccessTokenTtlMinutes(env)).toBe(120);
    expect(getSessionTtlHours(env)).toBe(48);
    expect(getAuthCookieMaxAgeSeconds(env)).toBe(120 * 60);
  });
});
