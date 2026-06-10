import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/lib/server/env";
import { sendLoginOtpEmail } from "@/lib/server/mailer";
import { UserModel } from "@/lib/server/models/user";
import {
  createOtpHash,
  getOtpExpiryTime,
  initiateAdminLoginOtp,
  verifyAdminLoginOtp,
} from "@/lib/server/services/login-otp";

vi.mock("@/lib/server/mailer", () => ({
  isMailerConfigured: () => true,
  sendLoginOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/services/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/server/mongodb", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));

describe("login otp", () => {
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
      SMTP_HOST: "email-smtp.ap-southeast-2.amazonaws.com",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_USER: "smtp-user",
      SMTP_PASS: "smtp-pass",
      FROM_EMAIL: "Saveful <info@saveful.com>",
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
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  it("hashes OTP codes consistently", () => {
    expect(createOtpHash("123456")).toBe(createOtpHash(" 123456 "));
  });

  it("accepts persisted expiry values that are not Date instances", () => {
    expect(getOtpExpiryTime(new Date(Date.now() + 60_000))).toBeGreaterThan(Date.now());
    expect(getOtpExpiryTime("2030-01-01T00:00:00.000Z")).toBeGreaterThan(Date.now());
    expect(getOtpExpiryTime("invalid")).toBeNull();
  });

  it("stores and verifies an admin login OTP", async () => {
    let storedChallengeId = "";
    let storedOtpHash = "";
    let sentOtp = "";

    vi.mocked(sendLoginOtpEmail).mockImplementation(async (input) => {
      sentOtp = input.otp;
    });
    vi.spyOn(UserModel, "updateOne").mockImplementation(async (_filter, update) => {
      const set = (update as { $set: Record<string, string> }).$set;
      storedChallengeId = set.loginOtpChallengeId;
      storedOtpHash = set.loginOtpHash;
      return { matchedCount: 1 } as never;
    });
    vi.spyOn(UserModel, "findOne").mockImplementation(async () => {
      if (!storedChallengeId) {
        return {
          userId: "usr_test",
          email: "admin@example.com",
          name: "Platform Admin",
        } as never;
      }

      return {
        userId: "usr_test",
        email: "admin@example.com",
        loginOtpChallengeId: storedChallengeId,
        loginOtpHash: storedOtpHash,
        loginOtpExpiresAt: new Date(Date.now() + 60_000),
        status: "active",
      } as never;
    });
    vi.spyOn(UserModel, "findOneAndUpdate").mockResolvedValue({
      userId: "usr_test",
      email: "admin@example.com",
      status: "active",
      roles: ["platform_admin"],
    } as never);

    const challenge = await initiateAdminLoginOtp({
      userId: "usr_test",
      email: "admin@example.com",
    });

    expect(storedChallengeId).toBe(challenge.challengeId);
    expect(sentOtp).toHaveLength(6);

    const verifiedUser = await verifyAdminLoginOtp({
      email: "admin@example.com",
      challengeId: challenge.challengeId,
      otp: sentOtp,
    });

    expect(verifiedUser.email).toBe("admin@example.com");
  });
});
