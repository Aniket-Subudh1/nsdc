import { type RoleKey } from "@/lib/server/rbac";

export function isPlatformAdminOnly(roles: RoleKey[]) {
  return roles.length === 1 && roles[0] === "platform_admin";
}

export function isCenterManagerOnly(roles: RoleKey[]) {
  return roles.length === 1 && roles[0] === "center_manager";
}

export type RoleCenterValidationCode =
  | "CENTER_REQUIRED"
  | "CENTER_COUNT_INVALID"
  | "CENTER_NOT_ALLOWED";

export function validateRoleCenterState(
  roles: RoleKey[],
  centerIds: string[],
): RoleCenterValidationCode | null {
  if (isPlatformAdminOnly(roles)) {
    return centerIds.length > 0 ? "CENTER_NOT_ALLOWED" : null;
  }

  if (centerIds.length === 0) {
    return "CENTER_REQUIRED";
  }

  if (isCenterManagerOnly(roles) && centerIds.length !== 1) {
    return "CENTER_COUNT_INVALID";
  }

  return null;
}

export function validateRoleCenterAssignment(roles: RoleKey[], centerIds: string[]) {
  if (isPlatformAdminOnly(roles)) {
    return null;
  }

  if (centerIds.length === 0) {
    return "CENTER_REQUIRED" as const;
  }

  if (isCenterManagerOnly(roles) && centerIds.length !== 1) {
    return "CENTER_COUNT_INVALID" as const;
  }

  return null;
}
