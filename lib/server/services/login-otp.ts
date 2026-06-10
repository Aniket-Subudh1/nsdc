import { createHash, randomInt } from "node:crypto";

import { getEnv } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { isMailerConfigured, sendLoginOtpEmail } from "@/lib/server/mailer";
import { connectToDatabase } from "@/lib/server/mongodb";
import { UserModel } from "@/lib/server/models/user";
import { writeAuditLog } from "@/lib/server/services/audit";

function createOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function createOtpHash(otp: string) {
  return createHash("sha256").update(otp.trim()).digest("hex");
}

export function getOtpExpiryTime(value: unknown) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  const time = date.getTime();

  return Number.isNaN(time) ? null : time;
}

export function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");

  if (!domain) {
    return email;
  }

  const visible = localPart.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(1, localPart.length - 1))}@${domain}`;
}

type InitiateAdminLoginOtpInput = {
  email: string;
  ipAddress?: string | null;
  requestId?: string;
  userId: string;
};

type VerifyAdminLoginOtpInput = {
  challengeId: string;
  email: string;
  ipAddress?: string | null;
  otp: string;
  requestId?: string;
};

export async function initiateAdminLoginOtp(input: InitiateAdminLoginOtpInput) {
  await connectToDatabase();

  if (!isMailerConfigured()) {
    throw new ApiError(
      500,
      "MAILER_NOT_CONFIGURED",
      "SMTP is not configured for admin login verification emails",
    );
  }

  const user = await UserModel.findOne({ userId: input.userId, status: "active" });

  if (!user) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const otp = createOtpCode();
  const challengeId = createPrefixedId("lch");
  const expiresAt = new Date(Date.now() + getEnv().LOGIN_OTP_TTL_MINUTES * 60 * 1000);
  const updateResult = await UserModel.updateOne(
    { userId: input.userId, status: "active" },
    {
      $set: {
        loginOtpHash: createOtpHash(otp),
        loginOtpExpiresAt: expiresAt,
        loginOtpChallengeId: challengeId,
        loginOtpSentAt: new Date(),
      },
    },
  );

  if (updateResult.matchedCount === 0) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  try {
    await sendLoginOtpEmail({
      email: user.email,
      name: user.name,
      otp,
    });
  } catch {
    await UserModel.updateOne(
      { userId: input.userId },
      {
        $set: {
          loginOtpHash: null,
          loginOtpExpiresAt: null,
          loginOtpChallengeId: null,
          loginOtpSentAt: null,
        },
      },
    );
    throw new ApiError(500, "EMAIL_SEND_FAILED", "Unable to send login verification email");
  }

  await writeAuditLog({
    action: "auth.login.otp_sent",
    actorUserId: user.userId,
    entityId: user.userId,
    entityType: "user",
    ipAddress: input.ipAddress,
    metadata: { email: input.email, challengeId },
    requestId: input.requestId,
  });

  return {
    challengeId,
    maskedEmail: maskEmail(user.email),
    message: "A verification code has been sent to your registered email address.",
  };
}

export async function verifyAdminLoginOtp(input: VerifyAdminLoginOtpInput) {
  await connectToDatabase();

  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedOtp = input.otp.trim();
  const normalizedChallengeId = input.challengeId.trim();
  const user = await UserModel.findOne({
    email: normalizedEmail,
    loginOtpChallengeId: normalizedChallengeId,
    status: "active",
  });

  if (!user) {
    throw new ApiError(400, "INVALID_OTP", "Invalid or expired verification code");
  }

  const expiryTime = getOtpExpiryTime(user.loginOtpExpiresAt);
  const isOtpValid =
    Boolean(user.loginOtpHash) &&
    expiryTime !== null &&
    expiryTime > Date.now() &&
    user.loginOtpHash === createOtpHash(normalizedOtp);

  if (!isOtpValid) {
    await writeAuditLog({
      action: "auth.login.otp_failed",
      actorUserId: user.userId,
      entityId: user.userId,
      entityType: "user",
      ipAddress: input.ipAddress,
      metadata: { email: normalizedEmail, challengeId: normalizedChallengeId },
      requestId: input.requestId,
    });
    throw new ApiError(400, "INVALID_OTP", "Invalid or expired verification code");
  }

  const clearedUser = await UserModel.findOneAndUpdate(
    {
      userId: user.userId,
      loginOtpChallengeId: normalizedChallengeId,
      loginOtpHash: createOtpHash(normalizedOtp),
    },
    {
      $set: {
        loginOtpHash: null,
        loginOtpExpiresAt: null,
        loginOtpChallengeId: null,
        loginOtpSentAt: null,
      },
    },
    { new: true },
  );

  if (!clearedUser) {
    throw new ApiError(400, "INVALID_OTP", "Invalid or expired verification code");
  }

  return clearedUser;
}
