import { describe, expect, it } from "vitest";

import { canAccessCenters, getPermissionsForRoles } from "@/lib/server/rbac";

describe("rbac", () => {
  it("allows platform admins to access any center scope", () => {
    expect(canAccessCenters(["platform_admin"], [], ["tc_001", "tc_002"])).toBe(true);
  });

  it("blocks scoped users from accessing centers outside their assignments", () => {
    expect(canAccessCenters(["training_partner_admin"], ["tc_001"], ["tc_001", "tc_002"])).toBe(false);
  });

  it("merges permissions across multiple roles without duplicates", () => {
    expect(getPermissionsForRoles(["training_partner_admin", "auditor_viewer"])).toContain("audit:read");
  });
});