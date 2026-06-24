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

type IssueLoginOtpInput = {
  auditAction: "auth.login.otp_sent" | "auth.login.otp_resent";
  email: string;
  ipAddress?: string | null;
  requestId?: string;
  userId: string;
};

type InitiateAdminLoginOtpInput = {
  email: string;
  ipAddress?: string | null;
  requestId?: string;
  userId: string;
};

type ResendAdminLoginOtpInput = {
  challengeId: string;
  email: string;
  ipAddress?: string | null;
  requestId?: string;
};

type VerifyAdminLoginOtpInput = {
  challengeId: string;
  email: string;
  ipAddress?: string | null;
  otp: string;
  requestId?: string;
};

async function issueLoginOtpForUser(input: IssueLoginOtpInput) {
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
    action: input.auditAction,
    actorUserId: user.userId,
    entityId: user.userId,
    entityType: "user",
    ipAddress: input.ipAddress,
    metadata: { email: input.email, challengeId },
    requestId: input.requestId,
  });

  const message =
    input.auditAction === "auth.login.otp_resent"
      ? "A new verification code has been sent to your registered email address."
      : "A verification code has been sent to your registered email address.";

  return {
    challengeId,
    maskedEmail: maskEmail(user.email),
    message,
  };
}

async function findLoginOtpChallenge(email: string, challengeId: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedChallengeId = challengeId.trim();

  const userByChallenge = await UserModel.findOne({
    email: normalizedEmail,
    loginOtpChallengeId: normalizedChallengeId,
    status: "active",
  });

  if (userByChallenge) {
    return {
      expiryTime: getOtpExpiryTime(userByChallenge.loginOtpExpiresAt),
      match: "exact" as const,
      user: userByChallenge,
    };
  }

  const userByEmail = await UserModel.findOne({
    email: normalizedEmail,
    status: "active",
  });

  if (!userByEmail) {
    return { expiryTime: null, match: "not_found" as const, user: null };
  }

  if (userByEmail.loginOtpChallengeId) {
    return {
      expiryTime: getOtpExpiryTime(userByEmail.loginOtpExpiresAt),
      match: "replaced" as const,
      user: userByEmail,
    };
  }

  return { expiryTime: null, match: "no_challenge" as const, user: userByEmail };
}

export async function initiateAdminLoginOtp(input: InitiateAdminLoginOtpInput) {
  await connectToDatabase();

  if (!isMailerConfigured()) {
    throw new ApiError(
      500,
      "MAILER_NOT_CONFIGURED",
      "SMTP is not configured for admin login verification emails",
    );
  }

  return issueLoginOtpForUser({
    auditAction: "auth.login.otp_sent",
    email: input.email,
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    userId: input.userId,
  });
}

export async function resendAdminLoginOtp(input: ResendAdminLoginOtpInput) {
  await connectToDatabase();

  if (!isMailerConfigured()) {
    throw new ApiError(
      500,
      "MAILER_NOT_CONFIGURED",
      "SMTP is not configured for admin login verification emails",
    );
  }

  const challenge = await findLoginOtpChallenge(input.email, input.challengeId);

  if (challenge.match === "not_found" || challenge.match === "no_challenge") {
    throw new ApiError(
      400,
      "OTP_CHALLENGE_INVALID",
      "Your verification session expired. Please sign in again.",
    );
  }

  if (challenge.match === "replaced") {
    throw new ApiError(
      400,
      "OTP_REPLACED",
      "A newer verification code was already sent. Use the latest code from your email, or sign in again.",
    );
  }

  return issueLoginOtpForUser({
    auditAction: "auth.login.otp_resent",
    email: input.email,
    ipAddress: input.ipAddress,
    requestId: input.requestId,
    userId: challenge.user.userId,
  });
}

export async function verifyAdminLoginOtp(input: VerifyAdminLoginOtpInput) {
  await connectToDatabase();

  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedOtp = input.otp.trim();
  const normalizedChallengeId = input.challengeId.trim();
  const challenge = await findLoginOtpChallenge(normalizedEmail, normalizedChallengeId);

  if (challenge.match === "not_found" || challenge.match === "no_challenge") {
    throw new ApiError(
      400,
      "OTP_CHALLENGE_INVALID",
      "Your verification session expired. Please sign in again.",
    );
  }

  if (challenge.match === "replaced") {
    throw new ApiError(
      400,
      "OTP_REPLACED",
      "This verification code was replaced by a newer one. Use the latest code from your email.",
    );
  }

  const user = challenge.user;
  const expiryTime = challenge.expiryTime;
  const hasOtpHash = Boolean(user.loginOtpHash);

  if (!hasOtpHash || expiryTime === null) {
    throw new ApiError(
      400,
      "OTP_CHALLENGE_INVALID",
      "Your verification session expired. Please sign in again.",
    );
  }

  if (expiryTime <= Date.now()) {
    await writeAuditLog({
      action: "auth.login.otp_failed",
      actorUserId: user.userId,
      entityId: user.userId,
      entityType: "user",
      ipAddress: input.ipAddress,
      metadata: {
        email: normalizedEmail,
        challengeId: normalizedChallengeId,
        reason: "expired",
      },
      requestId: input.requestId,
    });
    throw new ApiError(
      400,
      "OTP_EXPIRED",
      "This verification code has expired. Resend a new code or sign in again.",
    );
  }

  if (user.loginOtpHash !== createOtpHash(normalizedOtp)) {
    await writeAuditLog({
      action: "auth.login.otp_failed",
      actorUserId: user.userId,
      entityId: user.userId,
      entityType: "user",
      ipAddress: input.ipAddress,
      metadata: {
        email: normalizedEmail,
        challengeId: normalizedChallengeId,
        reason: "wrong_code",
      },
      requestId: input.requestId,
    });
    throw new ApiError(400, "OTP_WRONG", "The verification code you entered is incorrect.");
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
    throw new ApiError(
      400,
      "OTP_REPLACED",
      "This verification code was replaced by a newer one. Use the latest code from your email.",
    );
  }

  return clearedUser;
}
