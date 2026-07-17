/**
 * Complete-tier client voice FAQ/script pack — sold promise before Twilio.
 * See /docs/voice-agent-flow + /docs/product-bundles.
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
import { orderGrantsSoldCapabilityEntitlement } from "@/lib/orders/recurring";
import type { ClientVoiceScriptType } from "./types";

/** Paid Complete unlocks the client AI phone product promise. */
export function isCompleteBundleTier(tier: string): boolean {
  return tier === "complete";
}

export function leadStageEligibleForClientVoicePack(
  stage: LeadPipelineStage,
): boolean {
  return stage === "paid" || stage === "live";
}

/**
 * Eligible when the lead is paid/live AND has at least one Complete order that
 * still grants active entitlement (active recurring, never refunded/disputed —
 * see orderGrantsSoldCapabilityEntitlement). Growth alone does not unlock
 * client voice (phone is Complete-only).
 */
export function leadEligibleForClientVoicePack(
  lead: { stage: LeadPipelineStage },
  orders: ReadonlyArray<{
    tier: string;
    commerceAddon?: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
  }>,
): boolean {
  if (!leadStageEligibleForClientVoicePack(lead.stage)) return false;
  return orders.some(
    (o) =>
      isCompleteBundleTier(o.tier) &&
      orderGrantsSoldCapabilityEntitlement({ ...o, commerceAddon: Boolean(o.commerceAddon) }),
  );
}

/**
 * Stable script set matching the sold Complete receptionist promise:
 * greeting, hours, services, booking CTA, after-hours, take-a-message.
 */
export const CLIENT_VOICE_FAQ_SCRIPT_TYPES: readonly ClientVoiceScriptType[] = [
  "inbound_greeting",
  "hours_faq",
  "services_faq",
  "booking_cta",
  "after_hours",
  "take_a_message",
] as const;

/**
 * Paid/live Complete leads still missing a FAQ pack — slug-sorted for stable UI lists.
 */
export function listClientVoicePacksDue<
  T extends { slug: string; stage: LeadPipelineStage },
>(
  leads: T[],
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    recurringCanceledAt?: number | null;
  }>,
  existingPacks: ReadonlyArray<{ leadSlug: string }>,
): T[] {
  const havePack = new Set(existingPacks.map((p) => p.leadSlug));
  return leads
    .filter((lead) => {
      if (havePack.has(lead.slug)) return false;
      return leadEligibleForClientVoicePack(
        lead,
        orders.filter((o) => o.leadSlug === lead.slug),
      );
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Age in whole hours since the oldest qualifying Complete order among
 * `candidates` (as returned by listClientVoicePacksDue) was created; null
 * when there are no candidates or none of their orders parse. Pass nowMs
 * from the caller — never Date.now() inside list/age helpers (see
 * oldestStarterUpsellCandidateAgeHours for the same pattern).
 */
export function oldestClientVoicePacksDueAgeHours(
  candidates: ReadonlyArray<{ slug: string }>,
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    recurringCanceledAt?: number | null;
    createdAt?: string;
  }>,
  nowMs: number,
): number | null {
  const candidateSlugs = new Set(candidates.map((candidate) => candidate.slug));
  let oldestCreatedAtMs: number | null = null;
  for (const order of orders) {
    if (!candidateSlugs.has(order.leadSlug)) continue;
    if (!isCompleteBundleTier(order.tier)) continue;
    if (
      typeof order.recurringCanceledAt === "number" &&
      Number.isFinite(order.recurringCanceledAt) &&
      order.recurringCanceledAt > 0
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
  if (nowMs < oldestCreatedAtMs) return 0;
  return Math.max(0, Math.floor((nowMs - oldestCreatedAtMs) / HOUR_MS));
}

export function scriptTypeLabel(scriptType: ClientVoiceScriptType | string): string {
  switch (scriptType) {
    case "inbound_greeting":
      return "Inbound greeting";
    case "hours_faq":
      return "Hours FAQ";
    case "services_faq":
      return "Services FAQ";
    case "booking_cta":
      return "Booking CTA";
    case "after_hours":
      return "After-hours message";
    case "take_a_message":
      return "Take a message";
    default:
      return String(scriptType);
  }
}
