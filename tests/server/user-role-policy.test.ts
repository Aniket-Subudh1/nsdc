import { describe, expect, it } from "vitest";

import {
  isCenterManagerOnly,
  isPlatformAdminOnly,
  validateRoleCenterAssignment,
  validateRoleCenterState,
} from "@/lib/server/user-role-policy";

describe("user role policy", () => {
  it("identifies platform admin only users", () => {
    expect(isPlatformAdminOnly(["platform_admin"])).toBe(true);
    expect(isPlatformAdminOnly(["platform_admin", "center_manager"])).toBe(false);
  });

  it("identifies center manager only users", () => {
    expect(isCenterManagerOnly(["center_manager"])).toBe(true);
    expect(isCenterManagerOnly(["training_partner_admin"])).toBe(false);
  });

  it("allows admins without center assignments", () => {
    expect(validateRoleCenterState(["platform_admin"], [])).toBeNull();
    expect(validateRoleCenterAssignment(["platform_admin"], ["tc_001"])).toBeNull();
  });

  it("rejects admins with center assignments in final state", () => {
    expect(validateRoleCenterState(["platform_admin"], ["tc_001"])).toBe("CENTER_NOT_ALLOWED");
  });

  it("requires training partners to have exactly one center", () => {
    expect(validateRoleCenterState(["center_manager"], [])).toBe("CENTER_REQUIRED");
    expect(validateRoleCenterState(["center_manager"], ["tc_001", "tc_002"])).toBe(
      "CENTER_COUNT_INVALID",
    );
    expect(validateRoleCenterState(["center_manager"], ["tc_001"])).toBeNull();
  });

  it("allows temporary center assignment while changing an admin to training partner", () => {
    expect(validateRoleCenterAssignment(["platform_admin"], ["tc_001"])).toBeNull();
  });
});
