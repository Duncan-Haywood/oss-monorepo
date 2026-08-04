/**
 * Complete-tier client voice FAQ/script pack — sold promise before Twilio.
 * See /docs/voice-agent-flow + /docs/product-bundles.
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
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
 * Eligible when the lead is paid/live AND has at least one Complete order.
 * Growth alone does not unlock client voice (phone is Complete-only).
 */
export function leadEligibleForClientVoicePack(
  lead: { stage: LeadPipelineStage },
  orders: ReadonlyArray<{ tier: string }>,
): boolean {
  if (!leadStageEligibleForClientVoicePack(lead.stage)) return false;
  return orders.some((o) => isCompleteBundleTier(o.tier));
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
  orders: ReadonlyArray<{ leadSlug: string; tier: string }>,
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
