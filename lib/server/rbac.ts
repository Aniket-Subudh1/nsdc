export const ROLE_KEYS = [
  "platform_admin",
  "training_partner_admin",
  "center_manager",
  "trainer_data_entry",
  "auditor_viewer",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const PERMISSIONS = [
  "auth:login",
  "auth:logout",
  "auth:me",
  "users:read",
  "users:write",
  "users:assign_roles",
  "users:assign_centers",
  "masters:read",
  "masters:write",
  "centers:read",
  "centers:write",
  "candidates:read",
  "candidates:write",
  "sync:read",
  "sync:write",
  "reference-data:read",
  "audit:read",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  platform_admin: [...PERMISSIONS],
  training_partner_admin: [
    "auth:login",
    "auth:logout",
    "auth:me",
    "users:read",
    "users:write",
    "users:assign_roles",
    "users:assign_centers",
    "masters:read",
    "masters:write",
    "centers:read",
    "centers:write",
    "candidates:read",
    "candidates:write",
    "sync:read",
    "sync:write",
    "reference-data:read",
  ],
  center_manager: [
    "auth:login",
    "auth:logout",
    "auth:me",
    "users:read",
    "masters:read",
    "centers:read",
    "candidates:read",
    "candidates:write",
    "sync:read",
    "reference-data:read",
  ],
  trainer_data_entry: [
    "auth:login",
    "auth:logout",
    "auth:me",
    "masters:read",
    "centers:read",
    "candidates:read",
    "candidates:write",
    "reference-data:read",
  ],
  auditor_viewer: [
    "auth:login",
    "auth:logout",
    "auth:me",
    "users:read",
    "masters:read",
    "centers:read",
    "candidates:read",
    "sync:read",
    "reference-data:read",
    "audit:read",
  ],
};

export const ADMIN_PORTAL_ROLES: RoleKey[] = ["platform_admin"];
export const TRAINING_PARTNER_PORTAL_ROLES: RoleKey[] = [
  "training_partner_admin",
  "center_manager",
  "trainer_data_entry",
  "auditor_viewer",
];

export function getPermissionsForRoles(roles: RoleKey[]) {
  return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []))];
}

export function hasAnyRole(userRoles: RoleKey[], allowedRoles: RoleKey[]) {
  return userRoles.some((role) => allowedRoles.includes(role));
}

export function canAccessCenters(
  actorRoles: RoleKey[],
  actorCenterIds: string[],
  targetCenterIds: string[],
) {
  if (actorRoles.includes("platform_admin")) {
    return true;
  }

  if (targetCenterIds.length === 0) {
    return true;
  }

  return targetCenterIds.every((centerId) => actorCenterIds.includes(centerId));
}

export function canManageUsers(actorRoles: RoleKey[]) {
  return hasAnyRole(actorRoles, ["platform_admin", "training_partner_admin"]);
}

export function canManageTrainingCenters(actorRoles: RoleKey[]) {
  return hasAnyRole(actorRoles, ["platform_admin", "training_partner_admin"]);
}

export function canManageMasters(actorRoles: RoleKey[]) {
  return hasAnyRole(actorRoles, ["platform_admin", "training_partner_admin"]);
}

export function canManageCandidates(actorRoles: RoleKey[]) {
  return hasAnyRole(actorRoles, ["platform_admin", "training_partner_admin", "center_manager", "trainer_data_entry"]);
}

export function canManageSync(actorRoles: RoleKey[]) {
  return hasAnyRole(actorRoles, ["platform_admin", "training_partner_admin"]);
}