"use client";

import {
  CAMPAIGN_STATUS_LABELS_HE,
  CLIENT_STATUS_LABELS_HE,
  META_CONNECTION_STATUS_LABELS_HE,
  APPROVAL_STATUS_LABELS_HE,
  RECOMMENDATION_SEVERITY_LABELS_HE,
} from "@campaignos/shared";
import { Badge } from "./ui";

type Tone = "gray" | "green" | "amber" | "red" | "blue" | "indigo";

const CAMPAIGN_TONE: Record<string, Tone> = {
  DRAFT: "gray",
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  PUBLISHING: "indigo",
  PUBLISHED: "green",
  PAUSED: "amber",
  ARCHIVED: "gray",
  ERROR: "red",
};
const CLIENT_TONE: Record<string, Tone> = { ONBOARDING: "amber", ACTIVE: "green", PAUSED: "amber", ARCHIVED: "gray" };
const META_TONE: Record<string, Tone> = { CONNECTED: "green", NEEDS_RECONNECT: "amber", ERROR: "red", DISCONNECTED: "gray" };
const APPROVAL_TONE: Record<string, Tone> = { PENDING: "amber", APPROVED: "green", REJECTED: "red", EXPIRED: "gray", CONSUMED: "blue" };
const SEVERITY_TONE: Record<string, Tone> = { INFO: "blue", SUGGESTION: "indigo", WARNING: "amber", CRITICAL: "red" };

export function CampaignStatusBadge({ status }: { status: string }) {
  return <Badge tone={CAMPAIGN_TONE[status] ?? "gray"}>{CAMPAIGN_STATUS_LABELS_HE[status as never] ?? status}</Badge>;
}
export function ClientStatusBadge({ status }: { status: string }) {
  return <Badge tone={CLIENT_TONE[status] ?? "gray"}>{CLIENT_STATUS_LABELS_HE[status as never] ?? status}</Badge>;
}
export function MetaStatusBadge({ status }: { status: string }) {
  return <Badge tone={META_TONE[status] ?? "gray"}>{META_CONNECTION_STATUS_LABELS_HE[status as never] ?? status}</Badge>;
}
export function ApprovalStatusBadge({ status }: { status: string }) {
  return <Badge tone={APPROVAL_TONE[status] ?? "gray"}>{APPROVAL_STATUS_LABELS_HE[status as never] ?? status}</Badge>;
}
export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={SEVERITY_TONE[severity] ?? "gray"}>{RECOMMENDATION_SEVERITY_LABELS_HE[severity as never] ?? severity}</Badge>;
}
