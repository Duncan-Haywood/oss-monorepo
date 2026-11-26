// Consent records (append-only) and the org settings they control.
import type { ConsentScope, MemberRole } from "@shared/enums";
import { ROLE_RANK } from "@shared/enums";
import { POLICY_VERSION } from "@shared/legal";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { consentRecords, orgSettings } from "../../db/schema";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { audit } from "./audit";

/** Scopes that change behaviour for the whole organization: only admins/owners may set them. */
export const ORG_LEVEL_SCOPES: readonly ConsentScope[] = [
  "data_processing",
  "document_upload",
  "website_crawl",
  "voice_recording",
  "autopilot_submission",
];

export const isOrgLevelScope = (s: ConsentScope) => ORG_LEVEL_SCOPES.includes(s);

export const canSetScope = (role: MemberRole, scope: ConsentScope) =>
  !isOrgLevelScope(scope) || ROLE_RANK[role] >= ROLE_RANK.admin;

/** Salted SHA-256 of the client IP; raw IPs are never stored. */
export async function hashIp(ctx: AppContext, ip: string | null | undefined) {
  if (!ip) return null;
  return sha256Hex(`${ctx.env.AUTH_SECRET ?? "grant-autopilot"}:ip:${ip.trim()}`);
}

/** Client IP + user agent from request headers (Cloudflare sets CF-Connecting-IP). */
export function clientMeta(headers: Headers) {
  const ip =
    headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const ua = headers.get("user-agent");
  return { ip, userAgent: ua ? ua.slice(0, 512) : null };
}

export interface RecordConsentInput {
  orgId: string;
  userId: string | null;
  scope: ConsentScope;
  granted: boolean;
  ip?: string | null;
  userAgent?: string | null;
  policyVersion?: string;
  requestId?: string;
}

/**
 * Append a consent record and apply its effect on org_settings:
 * website_crawl ↔ allowWebsiteCrawl, voice_recording ↔ storeVoiceRecordings,
 * data_processing (granted) → dataPolicy* acceptance, autopilot_submission (revoked) → autopilot off.
 * Callers are responsible for role checks (see canSetScope).
 */
export async function recordConsent(ctx: AppContext, input: RecordConsentInput) {
  const now = ctx.now();
  const row = {
    id: newId("cns"),
    orgId: input.orgId,
    userId: input.userId,
    scope: input.scope,
    policyVersion: input.policyVersion ?? POLICY_VERSION,
    granted: input.granted,
    ipHash: await hashIp(ctx, input.ip),
    userAgent: input.userAgent ?? null,
    createdAt: now,
  };
  await ctx.db.insert(consentRecords).values(row);

  const patch: Partial<typeof orgSettings.$inferInsert> = {};
  if (input.scope === "website_crawl") patch.allowWebsiteCrawl = input.granted;
  if (input.scope === "voice_recording") patch.storeVoiceRecordings = input.granted;
  if (input.scope === "autopilot_submission" && !input.granted) patch.autopilotEnabled = false;
  if (input.scope === "data_processing" && input.granted) {
    patch.dataPolicyVersion = row.policyVersion;
    patch.dataPolicyAcceptedAt = now;
    patch.dataPolicyAcceptedBy = input.userId;
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.update(orgSettings).set(patch).where(eq(orgSettings.orgId, input.orgId));
  }

  await audit(ctx, {
    orgId: input.orgId,
    actorType: "user",
    actorId: input.userId,
    action: input.granted ? "consent.granted" : "consent.revoked",
    targetType: "consent",
    targetId: row.id,
    metadata: { scope: input.scope, policyVersion: row.policyVersion },
    requestId: input.requestId,
  });
  return row;
}

export interface ConsentState {
  granted: boolean;
  policyVersion: string;
  recordedAt: Date;
  userId: string | null;
}

/** All consent records (newest first) plus the current state per scope. User-level scopes
 *  (terms, privacy, ai_interview) report the requesting user's latest choice. */
export async function listConsents(ctx: AppContext, orgId: string, viewerId: string) {
  const items = await ctx.db
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.orgId, orgId))
    .orderBy(desc(consentRecords.createdAt), desc(consentRecords.id))
    .limit(500);
  const current: Partial<Record<ConsentScope, ConsentState>> = {};
  for (const r of items) {
    if (current[r.scope]) continue;
    if (!isOrgLevelScope(r.scope) && r.userId !== viewerId) continue;
    current[r.scope] = {
      granted: r.granted,
      policyVersion: r.policyVersion,
      recordedAt: r.createdAt,
      userId: r.userId,
    };
  }
  return { items, current };
}

/** Latest org-level decision for a scope (false when never granted). */
export async function hasConsent(ctx: AppContext, orgId: string, scope: ConsentScope) {
  const row = await ctx.db
    .select({ granted: consentRecords.granted })
    .from(consentRecords)
    .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, scope)))
    .orderBy(desc(consentRecords.createdAt), desc(consentRecords.id))
    .get();
  return row?.granted ?? false;
}
