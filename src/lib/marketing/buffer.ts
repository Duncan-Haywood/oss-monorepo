/**
 * Buffer classic REST API client (marketing-content-scheduling tier-6
 * empty-backlog scaffold, see buffer-gate.ts for the dormant-by-default
 * flag). ACCESS-TOKEN-BASED ONLY: profile listing + update creation, no
 * money movement, no per-lead OAuth. Uses global fetch directly (no SDK
 * exists for Buffer) — mirrors src/lib/deploy/handoff.ts's
 * tryProvisionVercelDomain precedent for a fetch-based third-party API, so
 * tests mock `global.fetch` the same way handoff.test.ts does.
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
import { orderGrantsSoldCapabilityEntitlement } from "@/lib/orders/recurring";
import { isMarketingBundleTier, leadEligibleForMarketingPack } from "./monthly-pack";
import type { MarketingContentVariant } from "./types";

const BUFFER_API_BASE = "https://api.bufferapp.com/1";

/** Opaque Buffer profile ids hard-reject over this length rather than truncate (AGENT_PROTOCOL opaque-id class). */
export const MAX_BUFFER_PROFILE_ID_LENGTH = 64;
/** Generous ceiling on how many profiles one lead can map to — bounds request/storage size, not a real product limit. */
export const MAX_BUFFER_PROFILES_PER_LEAD = 20;

export interface BufferProfile {
  id: string;
  /** e.g. "facebook", "instagram", "twitter", "linkedin". */
  service: string;
  formattedUsername?: string;
}

/** List every social profile connected to the operator's own Buffer account. */
export async function listBufferProfiles(accessToken: string): Promise<BufferProfile[]> {
  // Sent via the Authorization header, never the URL query string — a query-string
  // token is exactly what generic HTTP-layer logging/tracing/proxy tooling captures
  // by default (http.url spans, access logs), leaking a credential that grants
  // full post-as access to every connected social profile (buffer-token-header-not-query).
  const response = await fetch(`${BUFFER_API_BASE}/profiles.json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Buffer profile list failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as Array<{
    id: string;
    service: string;
    formatted_username?: string;
  }>;
  return data.map((profile) => ({
    id: profile.id,
    service: profile.service,
    formattedUsername: profile.formatted_username,
  }));
}

export type CreateBufferUpdateResult =
  | { success: true; updateIds: string[] }
  | { success: false; error: string };

/**
 * Queue one Buffer update (scheduled into the profile's existing posting
 * slots, never posted immediately) for one or more profiles. Never throws —
 * a Buffer-side rejection (invalid profile, over length, rate limited)
 * resolves { success: false } so the caller can surface it per-profile.
 */
export async function createBufferUpdate(
  accessToken: string,
  params: { profileIds: string[]; text: string },
): Promise<CreateBufferUpdateResult> {
  const body = new URLSearchParams();
  body.set("access_token", accessToken);
  for (const profileId of params.profileIds) {
    body.append("profile_ids[]", profileId);
  }
  body.set("text", params.text);

  try {
    const response = await fetch(`${BUFFER_API_BASE}/updates/create.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const raw = (await response.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      updates?: Array<{ id: string }>;
    } | null;

    if (!response.ok || raw?.success === false) {
      return {
        success: false,
        error: raw?.message ?? `Buffer update create failed (${response.status})`,
      };
    }

    return { success: true, updateIds: (raw?.updates ?? []).map((update) => update.id) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Buffer API error",
    };
  }
}

/**
 * Which generated marketing content type is compatible with a Buffer
 * profile's `service`. Only facebook/instagram map cleanly onto a single
 * Buffer social post today — gbp_post/email_campaign/local_seo_meta/
 * seasonal_promo/ad_copy/review_request_email have no matching Buffer
 * profile service, so a profile of any other service is skipped rather than
 * guessed at.
 */
export function bufferServiceContentType(
  service: string,
): Extract<MarketingContentVariant["contentType"], "facebook_caption" | "instagram_caption"> | null {
  if (service === "facebook") return "facebook_caption";
  if (service === "instagram") return "instagram_caption";
  return null;
}

/**
 * The dashboard's per-lead Buffer profile checkbox selection: an in-memory
 * draft (only populated once the operator has toggled at least one checkbox
 * for that lead this session) falling back to the lead's already-saved
 * mapping. A single choke point for this fallback chain — every UI call site
 * that reads "what's currently selected for this lead" (checkbox render,
 * toggle, and save) must use the exact same resolution, or a call site that
 * skips the saved-mapping fallback (reading only the in-memory draft) treats
 * "operator hasn't touched a checkbox yet" as "operator selected nothing",
 * silently wiping a previously-saved mapping on save (buffer-profile-selection-save-wipe-fix).
 */
export function resolveBufferSelection(
  draftSelectionByLead: Record<string, string[] | undefined>,
  slug: string,
  savedProfileIds: string[] | undefined,
): string[] {
  return draftSelectionByLead[slug] ?? savedProfileIds ?? [];
}

/**
 * Stable idempotency key for "this exact pack variant was already queued to
 * this exact Buffer profile" — scoped to the pack's own generatedAt (not
 * yearMonth) so a mid-month regenerate (same yearMonth, new content) never
 * blocks the new content from posting: its generatedAt differs, so none of
 * the prior month's keys match and every variant is postable again. index is
 * the position within that profile's own content-type-filtered variant list
 * (the same indexing scheduleMarketingPackToBufferAction already uses for its
 * scheduled/failed labels), not the index into pack.variants as a whole. See
 * buffer-schedule-duplicate-post-guard.
 */
export function bufferPostedVariantKey(
  packGeneratedAt: string,
  profileId: string,
  contentType: MarketingContentVariant["contentType"],
  index: number,
): string {
  return `${packGeneratedAt}|${profileId}|${contentType}|${index}`;
}

/**
 * Keep only the posted-variant keys that belong to the pack currently being
 * scheduled against. A key from any other pack (an earlier month, or an
 * earlier generatedAt from a since-regenerated pack this month) can never
 * match a bufferPostedVariantKey computed against the current pack again, so
 * it's dead weight — pruning it here keeps the persisted list bounded instead
 * of growing forever across a lead's lifetime.
 */
export function pruneBufferPostedVariantKeysForPack(
  keys: readonly string[],
  packGeneratedAt: string,
): string[] {
  const prefix = `${packGeneratedAt}|`;
  return keys.filter((key) => key.startsWith(prefix));
}

/** Join a marketing pack variant's fields into one post body, same shape as the dashboard's own "Copy" button. */
export function formatMarketingVariantForBuffer(variant: MarketingContentVariant): string {
  return [
    variant.title,
    variant.body,
    variant.cta ? `CTA: ${variant.cta}` : null,
    variant.hashtags?.length ? variant.hashtags.join(" ") : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Eligible Growth/Complete lead (leadEligibleForMarketingPack) with no saved
 * Buffer profile mapping yet — scheduleMarketingPackToBufferAction hard-fails
 * with "Select Buffer profiles for this lead first" for every such lead, but
 * until now nothing surfaced which/how-many leads were stuck in that state
 * (see marketing-scheduling-buffer-profile-mapping-missing-visibility). Only
 * meaningful once the operator has opted into ALLOW_MARKETING_SCHEDULING —
 * callers must pass an empty `leads` array (or otherwise suppress this) while
 * the feature is off, since every eligible lead would otherwise report
 * "missing" forever with no way for the operator to act on it (this helper
 * itself takes no env dependency, matching the pure-helper convention every
 * sibling in pipeline-health.ts/daily-digest.ts follows).
 */
export function listLeadsMissingBufferProfileMapping<
  T extends {
    slug: string;
    stage: LeadPipelineStage;
    bufferProfileIds?: string[];
  },
>(
  leads: readonly T[],
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    commerceAddon?: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
  }>,
): T[] {
  return leads
    .filter((lead) => {
      if (lead.bufferProfileIds?.length) return false;
      return leadEligibleForMarketingPack(
        lead,
        orders.filter((o) => o.leadSlug === lead.slug),
      );
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Age in whole hours since the oldest qualifying Growth/Complete order among
 * `candidates` (as returned by listLeadsMissingBufferProfileMapping) was
 * created; null when there are no candidates or none of their orders parse.
 * Mirrors oldestCommerceCatalogCandidateAgeHours exactly — this is a one-time
 * setup gap (not month-keyed like oldestMarketingPacksDueAgeHours), so the
 * anchor is the qualifying order's own createdAt. Must gate on
 * orderGrantsSoldCapabilityEntitlement (not a raw recurringCanceledAt check)
 * so an older refunded/disputed order can never pull the reported age earlier
 * than the entitlement that actually makes the lead eligible (same
 * refund-dispute-oldest-age-parity contract as every sibling age helper).
 * Pass nowMs from the caller — never Date.now() inside list/age helpers.
 */
export function oldestBufferProfileMappingMissingAgeHours(
  candidates: ReadonlyArray<{ slug: string }>,
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    commerceAddon?: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
    createdAt?: string;
  }>,
  nowMs: number,
): number | null {
  const candidateSlugs = new Set(candidates.map((candidate) => candidate.slug));
  let oldestCreatedAtMs: number | null = null;
  for (const order of orders) {
    if (!candidateSlugs.has(order.leadSlug)) continue;
    if (!isMarketingBundleTier(order.tier)) continue;
    if (
      !orderGrantsSoldCapabilityEntitlement({
        ...order,
        commerceAddon: Boolean(order.commerceAddon),
      })
    ) {
      continue;
    }
    if (typeof order.createdAt !== "string") continue;
    const createdAtMs = Date.parse(order.createdAt);
    if (Number.isNaN(createdAtMs)) continue;
    if (oldestCreatedAtMs === null || createdAtMs < oldestCreatedAtMs) {
      oldestCreatedAtMs = createdAtMs;
    }
  }
  if (oldestCreatedAtMs === null) return null;
  return Math.max(0, Math.floor((nowMs - oldestCreatedAtMs) / HOUR_MS));
}
