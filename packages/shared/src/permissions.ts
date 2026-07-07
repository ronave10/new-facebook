import type { OrgRole } from "./enums";

/**
 * RBAC permission catalog. Every guarded API action maps to exactly one permission.
 * Keep in sync with apps/api PermissionsGuard.
 */
export const PERMISSIONS = [
  "org.read",
  "org.manage",
  "member.read",
  "member.manage",
  "client.read",
  "client.write",
  "client.delete",
  "brand.read",
  "brand.write",
  "persona.read",
  "persona.generate",
  "persona.write",
  "meta.connect",
  "meta.read",
  "meta.sync",
  "audience.read",
  "audience.write",
  "campaign.read",
  "campaign.write",
  "campaign.generate",
  "campaign.approve",
  "campaign.publish",
  "campaign.pause",
  "analytics.read",
  "recommendation.read",
  "recommendation.generate",
  "recommendation.decide",
  "auditlog.read",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

const ACCOUNT_MANAGER_PERMISSIONS: Permission[] = [
  "org.read",
  "member.read",
  "client.read",
  "client.write",
  "brand.read",
  "brand.write",
  "persona.read",
  "persona.generate",
  "persona.write",
  "meta.connect",
  "meta.read",
  "meta.sync",
  "audience.read",
  "audience.write",
  "campaign.read",
  "campaign.write",
  "campaign.generate",
  "campaign.pause",
  "analytics.read",
  "recommendation.read",
  "recommendation.generate",
  "recommendation.decide",
];

const CLIENT_VIEWER_PERMISSIONS: Permission[] = [
  "org.read",
  "client.read",
  "brand.read",
  "persona.read",
  "meta.read",
  "audience.read",
  "campaign.read",
  "analytics.read",
  "recommendation.read",
];

/**
 * The RBAC matrix.
 * - ADMIN / AGENCY_OWNER: full control including approve & publish.
 * - ACCOUNT_MANAGER: full day-to-day work, but CANNOT approve or publish (maker-checker).
 * - CLIENT_VIEWER: read-only, optionally scoped to specific clients (member.clientScope).
 */
export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  ADMIN: ALL,
  AGENCY_OWNER: ALL,
  ACCOUNT_MANAGER: ACCOUNT_MANAGER_PERMISSIONS,
  CLIENT_VIEWER: CLIENT_VIEWER_PERMISSIONS,
};

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
