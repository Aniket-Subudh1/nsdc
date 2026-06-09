import { createHash } from "node:crypto";

import { cookies } from "next/headers";

import {
  ACCESS_TOKEN_COOKIE,
  getTokenFromRequest,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "@/lib/server/auth";
import { ensureBootstrapData } from "@/lib/server/bootstrap";
import { getSessionExpiresAt } from "@/lib/server/auth-session";
import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { SessionModel } from "@/lib/server/models/session";
import { UserModel } from "@/lib/server/models/user";
import {
  ADMIN_PORTAL_ROLES,
  getPermissionsForRoles,
  hasAnyRole,
  TRAINING_PARTNER_PORTAL_ROLES,
  type PermissionKey,
  type RoleKey,
} from "@/lib/server/rbac";
import { writeAuditLog } from "@/lib/server/services/audit";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  mobileNumber: string | null;
  roles: RoleKey[];
  role: RoleKey;
  centerIds: string[];
  status: "active" | "inactive";
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

export type AuthSession = {
  permissions: PermissionKey[];
  sessionId: string;
  user: PublicUser;
};

type LoginInput = {
  email: string;
  ipAddress?: string | null;
  password: string;
  portal?: "admin" | "training_partner";
  requestId?: string;
  userAgent?: string | null;
};

function createTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeStringArray<T extends string>(values?: readonly T[] | null) {
  return values ? Array.from(values) : [];
}

export function serializeUser(user: {
  centerIds?: string[];
  email: string;
  lastLoginAt?: Date | null;
  mobileNumber?: string | null;
  mustChangePassword?: boolean;
  name: string;
  roles: RoleKey[];
  status?: "active" | "inactive";
  userId: string;
}) {
  const roles = normalizeStringArray(user.roles);
  const centerIds = normalizeStringArray(user.centerIds);

  return {
    id: user.userId,
    name: user.name,
    email: user.email,
    mobileNumber: user.mobileNumber ?? null,
    roles,
    role: roles[0] ?? "trainer_data_entry",
    centerIds,
    status: user.status ?? "active",
    mustChangePassword: user.mustChangePassword ?? false,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  } satisfies PublicUser;
}

export function getDefaultRedirectPath(roles: RoleKey[]) {
  return hasAnyRole(roles, ADMIN_PORTAL_ROLES) ? "/admin/dashboard" : "/training-partner/dashboard";
}

export function assertPortalAccess(roles: RoleKey[], portal?: "admin" | "training_partner") {
  if (!portal) {
    return;
  }

  const isAllowed =
    portal === "admin"
      ? hasAnyRole(roles, ADMIN_PORTAL_ROLES)
      : hasAnyRole(roles, TRAINING_PARTNER_PORTAL_ROLES);

  if (!isAllowed) {
    throw new ApiError(403, "PORTAL_ACCESS_DENIED", "This user cannot access the selected portal");
  }
}

export async function loginUser(input: LoginInput) {
  await connectToDatabase();
  await ensureBootstrapData();

  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user) {
    await writeAuditLog({
      action: "auth.login.failed",
      entityType: "auth",
      ipAddress: input.ipAddress,
      metadata: { email: normalizedEmail, reason: "user_not_found" },
      requestId: input.requestId,
    });
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const isPasswordValid = await verifyPassword(input.password, user.passwordHash);

  if (!isPasswordValid) {
    await writeAuditLog({
      action: "auth.login.failed",
      actorUserId: user.userId,
      entityId: user.userId,
      entityType: "user",
      ipAddress: input.ipAddress,
      metadata: { email: normalizedEmail, reason: "invalid_password" },
      requestId: input.requestId,
    });
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  if (user.status !== "active") {
    await writeAuditLog({
      action: "auth.login.failed",
      actorUserId: user.userId,
      entityId: user.userId,
      entityType: "user",
      ipAddress: input.ipAddress,
      metadata: { email: normalizedEmail, reason: "inactive_user" },
      requestId: input.requestId,
    });
    throw new ApiError(403, "USER_INACTIVE", "User account is inactive");
  }

  assertPortalAccess(user.roles, input.portal);

  const sessionId = createPrefixedId("ses");
  const accessToken = await signAccessToken({
    sub: user.userId,
    sid: sessionId,
    email: user.email,
    name: user.name,
    roles: normalizeStringArray(user.roles),
    centerIds: normalizeStringArray(user.centerIds),
  });

  const expiresAt = getSessionExpiresAt();

  await SessionModel.create({
    sessionId,
    userId: user.userId,
    tokenHash: createTokenHash(accessToken),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    expiresAt,
  });

  user.lastLoginAt = new Date();
  await user.save();

  await writeAuditLog({
    action: "auth.login.success",
    actorUserId: user.userId,
    entityId: user.userId,
    entityType: "user",
    ipAddress: input.ipAddress,
    metadata: { portal: input.portal ?? null, sessionId },
    requestId: input.requestId,
  });

  return {
    accessToken,
    permissions: getPermissionsForRoles(user.roles),
    redirectPath: getDefaultRedirectPath(user.roles),
    user: serializeUser(user),
  };
}

async function resolveSessionToken(token: string): Promise<AuthSession> {
  await connectToDatabase();

  let verifiedToken;

  try {
    verifiedToken = await verifyAccessToken(token);
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  const session = await SessionModel.findOne({
    sessionId: verifiedToken.sessionId,
    userId: verifiedToken.userId,
    tokenHash: createTokenHash(token),
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  const user = await UserModel.findOne({ userId: verifiedToken.userId });

  if (!user || user.status !== "active") {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  return {
    sessionId: session.sessionId,
    user: serializeUser(user),
    permissions: getPermissionsForRoles(user.roles),
  };
}

export async function requireAuth(request: Request) {
  const token = getTokenFromRequest(request);

  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  return resolveSessionToken(token);
}

export async function getServerSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    return await resolveSessionToken(token);
  } catch {
    return null;
  }
}

export async function logoutUser(request: Request, requestId?: string) {
  const token = getTokenFromRequest(request);

  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  const session = await resolveSessionToken(token);

  await SessionModel.deleteOne({ sessionId: session.sessionId });

  await writeAuditLog({
    action: "auth.logout",
    actorUserId: session.user.id,
    entityId: session.user.id,
    entityType: "user",
    requestId,
  });

  return session;
}