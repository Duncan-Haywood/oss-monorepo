/**
 * Build a GenerateClientVoiceRequest from a Lead.
 */

import type { Lead } from "@/lib/leads/types";
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

  return {
    businessName: lead.businessName,
    category: lead.category,
    city: lead.city,
    state: lead.state || undefined,
    phone: lead.phone || undefined,
    hours,
    services: lead.services.length > 0 ? lead.services : ["our services"],
    tagline: lead.tagline || undefined,
    tone: "friendly",
  };
}

export function clientVoicePackRequestForLead(lead: Lead): GenerateClientVoiceRequest {
  return {
    leadId: lead.slug,
    scriptTypes: [...CLIENT_VOICE_FAQ_SCRIPT_TYPES],
    business: clientVoiceBusinessContextFromLead(lead),
  };
}
