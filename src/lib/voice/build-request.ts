/**
 * Build a GenerateClientVoiceRequest from a Lead.
 *
 * Soft-cap business context with the same create-fields MAX_* policy as
 * marketing's normalizeMarketingGenerateBusiness so operator Generate voice
 * cannot burn Anthropic tokens on pre-cap CRM rows (twin of the public
 * POST /api/marketing/generate soft-cap + marketing businessContextFromLead).
 */

import type { Lead } from "@/lib/leads/types";
import { normalizeMarketingGenerateBusiness } from "@/lib/marketing/generate-limits";
import { CLIENT_VOICE_FAQ_SCRIPT_TYPES } from "./faq-pack";
import type {
  ClientVoiceBusinessContext,
  GenerateClientVoiceRequest,
} from "./types";

export function clientVoiceBusinessContextFromLead(
  lead: Lead,
): ClientVoiceBusinessContext {
  const hours =
    lead.hours.weekday || lead.hours.weekend
      ? `Weekdays ${lead.hours.weekday || "by appointment"}; Weekends ${lead.hours.weekend || "by appointment"}`
      : undefined;

  const normalized = normalizeMarketingGenerateBusiness({
    businessName: lead.businessName,
    category: lead.category,
    city: lead.city,
    state: lead.state || undefined,
    phone: lead.phone || undefined,
    hours,
    services: lead.services.length > 0 ? lead.services : ["our services"],
    tagline: lead.tagline || undefined,
    websiteUrl: undefined,
    tone: "friendly",
  });

  return {
    businessName: normalized.businessName,
    category: normalized.category,
    city: normalized.city,
    state: normalized.state,
    phone: normalized.phone,
    hours: normalized.hours,
    services: normalized.services,
    tagline: normalized.tagline,
    tone: normalized.tone,
  };
}

export function clientVoicePackRequestForLead(lead: Lead): GenerateClientVoiceRequest {
  return {
    leadId: lead.slug,
    scriptTypes: [...CLIENT_VOICE_FAQ_SCRIPT_TYPES],
    business: clientVoiceBusinessContextFromLead(lead),
  };
}
