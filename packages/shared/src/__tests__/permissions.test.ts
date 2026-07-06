import { describe, expect, it } from "vitest";
import { roleHasPermission, ROLE_PERMISSIONS } from "../permissions";
import { GOAL_TO_META_OBJECTIVE, CAMPAIGN_GOALS } from "../enums";

describe("RBAC matrix", () => {
  it("AGENCY_OWNER can approve and publish", () => {
    expect(roleHasPermission("AGENCY_OWNER", "campaign.approve")).toBe(true);
    expect(roleHasPermission("AGENCY_OWNER", "campaign.publish")).toBe(true);
  });

  it("ACCOUNT_MANAGER can generate but NOT approve or publish", () => {
    expect(roleHasPermission("ACCOUNT_MANAGER", "campaign.generate")).toBe(true);
    expect(roleHasPermission("ACCOUNT_MANAGER", "campaign.approve")).toBe(false);
    expect(roleHasPermission("ACCOUNT_MANAGER", "campaign.publish")).toBe(false);
    expect(roleHasPermission("ACCOUNT_MANAGER", "member.manage")).toBe(false);
  });

  it("CLIENT_VIEWER is read-only", () => {
    expect(roleHasPermission("CLIENT_VIEWER", "client.read")).toBe(true);
    expect(roleHasPermission("CLIENT_VIEWER", "client.write")).toBe(false);
    expect(roleHasPermission("CLIENT_VIEWER", "campaign.write")).toBe(false);
    expect(roleHasPermission("CLIENT_VIEWER", "meta.connect")).toBe(false);
  });

  it("every role has a permission set", () => {
    for (const role of ["ADMIN", "AGENCY_OWNER", "ACCOUNT_MANAGER", "CLIENT_VIEWER"] as const) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});

describe("goal → Meta objective mapping", () => {
  it("maps every business goal to an ODAX objective", () => {
    for (const goal of CAMPAIGN_GOALS) {
      expect(GOAL_TO_META_OBJECTIVE[goal]).toMatch(/^OUTCOME_/);
    }
  });
});
