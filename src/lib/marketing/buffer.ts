/**
 * Buffer classic REST API client (marketing-content-scheduling tier-6
 * empty-backlog scaffold, see buffer-gate.ts for the dormant-by-default
 * flag). ACCESS-TOKEN-BASED ONLY: profile listing + update creation, no
 * money movement, no per-lead OAuth. Uses global fetch directly (no SDK
 * exists for Buffer) — mirrors src/lib/deploy/handoff.ts's
 * tryProvisionVercelDomain precedent for a fetch-based third-party API, so
 * tests mock `global.fetch` the same way handoff.test.ts does.
 */

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
  const url = `${BUFFER_API_BASE}/profiles.json?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url);
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
