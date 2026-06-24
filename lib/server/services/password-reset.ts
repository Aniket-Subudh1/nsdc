import { createHash, randomInt } from "node:crypto";

import { hashPassword } from "@/lib/server/auth";
import { getEnv } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http";
import { isMailerConfigured, sendPasswordResetOtpEmail } from "@/lib/server/mailer";
import { connectToDatabase } from "@/lib/server/mongodb";
import { SessionModel } from "@/lib/server/models/session";
import { UserModel } from "@/lib/server/models/user";
import { writeAuditLog } from "@/lib/server/services/audit";
import { getOtpExpiryTime } from "@/lib/server/services/login-otp";
import { assertPortalAccess } from "@/lib/server/services/session";

type PasswordResetPortal = "admin" | "training_partner";

type RequestPasswordResetOtpInput = {
  email: string;
  ipAddress?: string | null;
  portal: PasswordResetPortal;
  requestId?: string;
};

type ResetPasswordWithOtpInput = {
  email: string;
  ipAddress?: string | null;
  newPassword: string;
  otp: string;
  portal: PasswordResetPortal;
  requestId?: string;
};

function createOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function createOtpHash(otp: string) {
  return createHash("sha256").update(otp.trim()).digest("hex");
}

function getLoginPath(portal: PasswordResetPortal) {
  return portal === "admin" ? "/admin/login" : "/training-partner/login";
}

function getGenericRequestResponse() {
  return {
    message: "If that account exists, an OTP has been sent to the registered email address.",
  };
}

export async function requestPasswordResetOtp(input: RequestPasswordResetOtpInput) {
  await connectToDatabase();

  if (!isMailerConfigured()) {
    throw new ApiError(
      500,
      "MAILER_NOT_CONFIGURED",
      "SMTP is not configured for forgot password emails",
    );
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user || user.status !== "active") {
    await writeAuditLog({
      action: "auth.password_reset.request_ignored",
      entityType: "auth",
      ipAddress: input.ipAddress,
      metadata: { email: normalizedEmail, portal: input.portal, reason: "missing_or_inactive_user" },
      requestId: input.requestId,
    });

    return getGenericRequestResponse();
  }

  try {
    assertPortalAccess(Array.from(user.roles), input.portal);
  } catch {
    await writeAuditLog({
      action: "auth.password_reset.request_ignored",
      actorUserId: user.userId,
      entityId: user.userId,
      entityType: "user",
      ipAddress: input.ipAddress,
      metadata: { email: normalizedEmail, portal: input.portal, reason: "portal_mismatch" },
      requestId: input.requestId,
    });

    return getGenericRequestResponse();
  }

  const otp = createOtpCode();
  const expiresAt = new Date(Date.now() + getEnv().PASSWORD_RESET_OTP_TTL_MINUTES * 60 * 1000);

  user.passwordResetOtpHash = createOtpHash(otp);
  user.passwordResetOtpExpiresAt = expiresAt;
  user.passwordResetOtpPortal = input.portal;
  user.passwordResetOtpSentAt = new Date();
  await user.save();

  try {
    await sendPasswordResetOtpEmail({
      email: user.email,
      name: user.name,
      otp,
      portal: input.portal,
    });
  } catch {
    throw new ApiError(500, "EMAIL_SEND_FAILED", "Unable to send password reset OTP email");
  }

  await writeAuditLog({
    action: "auth.password_reset.otp_requested",
    actorUserId: user.userId,
    entityId: user.userId,
    entityType: "user",
    ipAddress: input.ipAddress,
    metadata: { portal: input.portal, email: normalizedEmail },
    requestId: input.requestId,
  });

  return getGenericRequestResponse();
}

export async function resetPasswordWithOtp(input: ResetPasswordWithOtpInput) {
  await connectToDatabase();

  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedOtp = input.otp.trim();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user || user.status !== "active") {
    throw new ApiError(
      400,
      "OTP_CHALLENGE_INVALID",
      "No active password reset request. Request a new OTP.",
    );
  }

  try {
    assertPortalAccess(Array.from(user.roles), input.portal);
  } catch {
    throw new ApiError(
      400,
      "OTP_CHALLENGE_INVALID",
      "No active password reset request. Request a new OTP.",
    );
  }

  if (!user.passwordResetOtpHash || user.passwordResetOtpPortal !== input.portal) {
    throw new ApiError(
      400,
      "OTP_CHALLENGE_INVALID",
      "No active password reset request. Request a new OTP.",
    );
  }

  const expiryTime = getOtpExpiryTime(user.passwordResetOtpExpiresAt);

  if (expiryTime === null) {
    throw new ApiError(
      400,
      "OTP_CHALLENGE_INVALID",
      "No active password reset request. Request a new OTP.",
    );
  }

  if (expiryTime <= Date.now()) {
    throw new ApiError(400, "OTP_EXPIRED", "This OTP has expired. Request a new one.");
  }

  if (user.passwordResetOtpHash !== createOtpHash(normalizedOtp)) {
    throw new ApiError(
      400,
      "OTP_WRONG",
      "The OTP you entered is incorrect. If you requested a new code, use the latest one.",
    );
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.mustChangePassword = false;
  user.updatedByUserId = user.userId;
  user.passwordResetOtpHash = null;
  user.passwordResetOtpExpiresAt = null;
  user.passwordResetOtpPortal = null;
  user.passwordResetOtpSentAt = null;
  await user.save();

  await SessionModel.deleteMany({ userId: user.userId });

  await writeAuditLog({
    action: "auth.password_reset.completed",
    actorUserId: user.userId,
    entityId: user.userId,
    entityType: "user",
    ipAddress: input.ipAddress,
    metadata: { portal: input.portal, email: normalizedEmail },
    requestId: input.requestId,
  });

  return {
    message: "Password reset successful. Please sign in with your new password.",
    redirectPath: getLoginPath(input.portal),
  };
}