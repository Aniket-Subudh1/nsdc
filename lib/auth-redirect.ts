import {
  ADMIN_PORTAL_ROLES,
  hasAnyRole,
  TRAINING_PARTNER_PORTAL_ROLES,
  type RoleKey,
} from "@/lib/server/rbac";

export function getPortalRedirectPath(
  portal: "admin" | "training_partner",
  roles: RoleKey[],
) {
  const canAccessPortal =
    portal === "admin"
      ? hasAnyRole(roles, ADMIN_PORTAL_ROLES)
      : hasAnyRole(roles, TRAINING_PARTNER_PORTAL_ROLES);

  if (canAccessPortal) {
    return portal === "admin" ? "/admin/dashboard" : "/training-partner/dashboard";
  }

  return hasAnyRole(roles, ADMIN_PORTAL_ROLES)
    ? "/admin/dashboard"
    : "/training-partner/dashboard";
}
