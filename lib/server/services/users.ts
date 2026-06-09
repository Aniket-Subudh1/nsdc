import { hashPassword } from "@/lib/server/auth";
import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { UserModel } from "@/lib/server/models/user";
import {
  canAccessCenters,
  canManageUsers,
  getPermissionsForRoles,
  type RoleKey,
} from "@/lib/server/rbac";
import {
  isPlatformAdminOnly,
  validateRoleCenterAssignment,
  validateRoleCenterState,
  type RoleCenterValidationCode,
} from "@/lib/server/user-role-policy";
import { writeAuditLog } from "@/lib/server/services/audit";
import { type AuthSession, serializeUser } from "@/lib/server/services/session";

type CreateUserInput = {
  centerIds: string[];
  email: string;
  mobileNumber?: string;
  name: string;
  requestId?: string;
  roles: RoleKey[];
  temporaryPassword: string;
};

type UpdateUserInput = {
  email?: string;
  mobileNumber?: string;
  mustChangePassword?: boolean;
  name?: string;
  requestId?: string;
  status?: "active" | "inactive";
};

function ensureCanReadUsers(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("users:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to users");
  }
}

function ensureCanManageUsers(actor: AuthSession) {
  if (!canManageUsers(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage users");
  }
}

function ensureAssignableRoles(actor: AuthSession, roles: RoleKey[]) {
  if (!actor.user.roles.includes("platform_admin") && roles.includes("platform_admin")) {
    throw new ApiError(403, "FORBIDDEN", "Only platform admins can assign platform_admin role");
  }
}

const ROLE_CENTER_MESSAGES: Record<RoleCenterValidationCode, string> = {
  CENTER_REQUIRED: "Training partners must be assigned to a training center",
  CENTER_COUNT_INVALID: "Training partners must be assigned to exactly one training center",
  CENTER_NOT_ALLOWED: "Admins cannot be assigned to specific training centers",
};

function throwRoleCenterValidationError(code: RoleCenterValidationCode) {
  throw new ApiError(400, code, ROLE_CENTER_MESSAGES[code]);
}

function ensureRoleCenterRequirements(roles: RoleKey[], centerIds: string[]) {
  const errorCode = validateRoleCenterAssignment(roles, centerIds);
  if (errorCode) {
    throwRoleCenterValidationError(errorCode);
  }
}

function ensureFinalRoleCenterState(roles: RoleKey[], centerIds: string[]) {
  const errorCode = validateRoleCenterState(roles, centerIds);
  if (errorCode) {
    throwRoleCenterValidationError(errorCode);
  }
}

async function ensureCenterIdsExist(centerIds: string[]) {
  if (centerIds.length === 0) {
    return;
  }

  const count = await TrainingCenterModel.countDocuments({ centerId: { $in: centerIds } });

  if (count !== centerIds.length) {
    throw new ApiError(400, "CENTER_NOT_FOUND", "One or more training centers do not exist");
  }
}

function getScopedUserFilter(actor: AuthSession) {
  if (actor.user.roles.includes("platform_admin")) {
    return {};
  }

  return { centerIds: { $in: actor.user.centerIds } };
}

async function getScopedUser(actor: AuthSession, userId: string) {
  const user = await UserModel.findOne({ userId, ...getScopedUserFilter(actor) });

  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  }

  return user;
}

export async function createUser(actor: AuthSession, input: CreateUserInput) {
  await connectToDatabase();
  ensureCanManageUsers(actor);
  ensureAssignableRoles(actor, input.roles);

  if (!canAccessCenters(actor.user.roles, actor.user.centerIds, input.centerIds)) {
    throw new ApiError(403, "FORBIDDEN", "You cannot assign users outside your center scope");
  }

  const existingUser = await UserModel.findOne({ email: input.email.trim().toLowerCase() });

  if (existingUser) {
    throw new ApiError(409, "USER_EXISTS", "A user with this email already exists");
  }

  ensureFinalRoleCenterState(input.roles, input.centerIds);
  await ensureCenterIdsExist(input.centerIds);

  const user = await UserModel.create({
    userId: createPrefixedId("usr"),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    mobileNumber: input.mobileNumber?.trim() || null,
    passwordHash: await hashPassword(input.temporaryPassword),
    roles: input.roles,
    centerIds: isPlatformAdminOnly(input.roles) ? [] : input.centerIds,
    status: "active",
    mustChangePassword: true,
    createdByUserId: actor.user.id,
    updatedByUserId: actor.user.id,
  });

  await writeAuditLog({
    action: "admin.user.created",
    actorUserId: actor.user.id,
    entityId: user.userId,
    entityType: "user",
    metadata: { roles: user.roles, centerIds: user.centerIds },
    requestId: input.requestId,
  });

  return serializeUser(user);
}

export async function listUsers(actor: AuthSession, page: number, pageSize: number) {
  await connectToDatabase();
  ensureCanReadUsers(actor);

  const filter = getScopedUserFilter(actor);
  const [items, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    UserModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeUser(item)),
    total,
    page,
    pageSize,
  };
}

export async function getUserById(actor: AuthSession, userId: string) {
  await connectToDatabase();
  ensureCanReadUsers(actor);

  const user = await getScopedUser(actor, userId);

  return serializeUser(user);
}

export async function updateUser(actor: AuthSession, userId: string, input: UpdateUserInput) {
  await connectToDatabase();
  ensureCanManageUsers(actor);

  const user = await getScopedUser(actor, userId);

  if (input.email && input.email.trim().toLowerCase() !== user.email) {
    const existingUser = await UserModel.findOne({ email: input.email.trim().toLowerCase() });

    if (existingUser) {
      throw new ApiError(409, "USER_EXISTS", "A user with this email already exists");
    }
  }

  if (input.name !== undefined) {
    user.name = input.name.trim();
  }

  if (input.email !== undefined) {
    user.email = input.email.trim().toLowerCase();
  }

  if (input.mobileNumber !== undefined) {
    user.mobileNumber = input.mobileNumber.trim() || null;
  }

  if (input.status !== undefined) {
    user.status = input.status;
  }

  if (input.mustChangePassword !== undefined) {
    user.mustChangePassword = input.mustChangePassword;
  }

  user.updatedByUserId = actor.user.id;
  await user.save();

  await writeAuditLog({
    action: "admin.user.updated",
    actorUserId: actor.user.id,
    entityId: user.userId,
    entityType: "user",
    metadata: input,
    requestId: input.requestId,
  });

  return serializeUser(user);
}

export async function assignUserRoles(
  actor: AuthSession,
  userId: string,
  roles: RoleKey[],
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanManageUsers(actor);
  ensureAssignableRoles(actor, roles);

  const user = await getScopedUser(actor, userId);
  const nextCenterIds = isPlatformAdminOnly(roles) ? [] : user.centerIds;
  ensureFinalRoleCenterState(roles, nextCenterIds);
  user.roles = roles;
  user.centerIds = nextCenterIds;
  user.updatedByUserId = actor.user.id;
  await user.save();

  await writeAuditLog({
    action: "admin.user.roles_assigned",
    actorUserId: actor.user.id,
    entityId: user.userId,
    entityType: "user",
    metadata: { roles },
    requestId,
  });

  return serializeUser(user);
}

export async function assignUserCenters(
  actor: AuthSession,
  userId: string,
  centerIds: string[],
  requestId?: string,
) {
  await connectToDatabase();
  ensureCanManageUsers(actor);

  if (!canAccessCenters(actor.user.roles, actor.user.centerIds, centerIds)) {
    throw new ApiError(403, "FORBIDDEN", "You cannot assign users outside your center scope");
  }

  await ensureCenterIdsExist(centerIds);

  const user = await getScopedUser(actor, userId);
  ensureRoleCenterRequirements(user.roles, centerIds);
  user.centerIds = centerIds;
  user.updatedByUserId = actor.user.id;
  await user.save();

  await writeAuditLog({
    action: "admin.user.centers_assigned",
    actorUserId: actor.user.id,
    entityId: user.userId,
    entityType: "user",
    metadata: { centerIds },
    requestId,
  });

  return serializeUser(user);
}