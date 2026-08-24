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

/**
 * Client voice packs that were generated but never emailed to the client —
 * same "generated ≠ delivered" gap as
 * listMarketingPacksMissingClientSend/commerce-buy-now-client-receipt-visibility.
 * Independent of listClientVoicePacksDue (generation debt vs. delivery
 * debt on packs that already exist). Gated on leadEligibleForClientVoicePack
 * for the same reason as the marketing twin — the client already paid for
 * the generated content, so the pack (not the lead's current entitlement
 * status) is what's tracked. See marketing-voice-pack-client-send-visibility.
 */
export function listClientVoicePacksMissingClientSend<
  T extends { leadSlug: string; sentToClientAt?: string },
>(
  packs: ReadonlyArray<T>,
  leads: ReadonlyArray<{ slug: string; stage: LeadPipelineStage }>,
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    commerceAddon?: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
  }>,
): T[] {
  const eligibleSlugs = new Set(
    leads
      .filter((lead) =>
        leadEligibleForClientVoicePack(
          lead,
          orders.filter((o) => o.leadSlug === lead.slug),
        ),
      )
      .map((lead) => lead.slug),
  );
  return packs
    .filter(
      (pack) =>
        eligibleSlugs.has(pack.leadSlug) &&
        !(typeof pack.sentToClientAt === "string" && pack.sentToClientAt.length > 0),
    )
    .sort((a, b) => a.leadSlug.localeCompare(b.leadSlug));
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Age in whole hours since the oldest of `candidates` (as returned by
 * listClientVoicePacksMissingClientSend) was generated; null when there are
 * no candidates or none of their generatedAt values parse. Anchored to
 * generatedAt, not a qualifying order — same rationale as
 * oldestMarketingPackMissingClientSendAgeHours. Pass nowMs from the caller —
 * never Date.now() inside list/age helpers.
 */
export function oldestClientVoicePackMissingClientSendAgeHours(
  candidates: ReadonlyArray<{ generatedAt?: string }>,
  nowMs: number,
): number | null {
  let oldestMs: number | null = null;
  for (const candidate of candidates) {
    if (typeof candidate.generatedAt !== "string") continue;
    const generatedAtMs = Date.parse(candidate.generatedAt);
    if (Number.isNaN(generatedAtMs)) continue;
    if (oldestMs === null || generatedAtMs < oldestMs) {
      oldestMs = generatedAtMs;
    }
  }
  if (oldestMs === null) return null;
  if (nowMs < oldestMs) return 0;
  return Math.max(0, Math.floor((nowMs - oldestMs) / HOUR_MS));
}

/**
 * Age in whole hours since the oldest qualifying Complete order among
 * `candidates` (as returned by listClientVoicePacksDue) was created; null
 * when there are no candidates or none of their orders parse. Pass nowMs
 * from the caller — never Date.now() inside list/age helpers (see
 * oldestStarterUpsellCandidateAgeHours for the same pattern).
 *
 * Must gate on orderGrantsSoldCapabilityEntitlement (not a raw
 * recurringCanceledAt check) — see refund-dispute-oldest-age-parity: an
 * older refunded/disputed Complete order must never pull the reported age
 * earlier than the entitlement that actually grants the voice pack.
 */
export function oldestClientVoicePacksDueAgeHours(
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
    if (!isCompleteBundleTier(order.tier)) continue;
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
