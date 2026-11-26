// Platform admin console DTOs (/api/admin/*). Metadata only: no tenant content (document text,
// facts, interview turns, application content) ever appears in these shapes. Import in the client.
import type { SubscriptionStatus } from "@shared/enums";

export interface AdminPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AdminSpendByPurposeDto {
  purpose: string;
  calls: number;
  costMicros: number;
}

export interface AdminTopOrgDto {
  orgId: string;
  orgName: string | null;
  calls: number;
  costMicros: number;
}

export interface AdminFailureDto {
  kind: "document" | "application";
  id: string;
  orgId: string;
  orgName: string | null;
  /** Operational error message, truncated. Never document or draft text. */
  error: string | null;
  updatedAt: string;
}

export interface AdminDiscoveryRunDto {
  id: string;
  source: string;
  trigger: "cron" | "manual";
  status: "running" | "succeeded" | "failed";
  found: number;
  created: number;
  updated: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface AdminOverviewDto {
  generatedAt: string;
  /** ISO start of the current UTC month (the month-to-date window). */
  monthStart: string;
  counts: { orgs: number; users: number };
  applicationsByStatus: Record<string, number>;
  submissionsLast30Days: number;
  llm: {
    monthToDateCostMicros: number;
    monthToDateCalls: number;
    byPurpose: AdminSpendByPurposeDto[];
    topOrgs: AdminTopOrgDto[];
  };
  failedJobs: {
    documents: number;
    applications: number;
    discoveryRuns: number;
    recent: AdminFailureDto[];
  };
  lastDiscoveryRuns: AdminDiscoveryRunDto[];
}

export interface AdminOrgSubscriptionDto {
  planKey: string;
  status: SubscriptionStatus;
  provider: string | null;
  currentPeriodEnd: string | null;
  compNote: string | null;
}

export interface AdminOrgRowDto {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  applicationCount: number;
  monthToDateCostMicros: number;
  /** Newest audit-log entry for the org (falls back to createdAt). */
  lastActivityAt: string;
  subscription: { planKey: string; status: SubscriptionStatus } | null;
}

export interface AdminOrgDetailDto {
  org: { id: string; name: string; slug: string; createdAt: string };
  subscription: AdminOrgSubscriptionDto | null;
  /** Row counts per tenant table (SQL table name -> rows owned by the org). */
  tableCounts: Record<string, number>;
  /** Status breakdowns (enum values only). */
  statusCounts: {
    documents: Record<string, number>;
    facts: Record<string, number>;
    applications: Record<string, number>;
  };
  llm: { totalCostMicros: number; monthToDateCostMicros: number; calls: number };
  lastActivityAt: string;
  /** org_settings row (routing + privacy settings). Null if the org has none. */
  settings: Record<string, unknown> | null;
}

export interface AdminLlmCallDto {
  id: string;
  orgId: string | null;
  applicationId: string | null;
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  latencyMs: number;
  stopReason: string | null;
  error: string | null;
  createdAt: string;
}

export interface AdminBillingEventDto {
  id: string;
  provider: string;
  providerEventId: string;
  type: string;
  orgId: string | null;
  processedAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface AdminAuditEntryDto {
  id: string;
  orgId: string | null;
  actorType: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
}

export interface AdminCompBody {
  note: string;
}
