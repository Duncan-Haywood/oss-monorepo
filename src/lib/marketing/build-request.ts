/**
 * Build a GenerateMarketingRequest from a Lead for the monthly pack.
 */

import type { Lead } from "@/lib/leads/types";
import {
  MONTHLY_MARKETING_PACK_TYPES,
  packageTierForOrderTier,
} from "./monthly-pack";
import type {
  AutomationLevel,
  BusinessContext,
  GenerateMarketingRequest,
  MarketingPackageTier,
} from "./types";

export function businessContextFromLead(lead: Lead): BusinessContext {
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
    websiteUrl: undefined,
    tone: "friendly",
  };
}

export function monthlyPackRequestForLead(
  lead: Lead,
  options: {
    orderTier: "growth" | "complete";
    automationLevel?: AutomationLevel;
  },
): { request: GenerateMarketingRequest; packageTier: MarketingPackageTier } {
  const packageTier = packageTierForOrderTier(options.orderTier);
  const automationLevel: AutomationLevel =
    options.automationLevel ??
    (options.orderTier === "complete"
      ? "generate_schedule_optimize"
      : "generate_schedule");

  return {
    packageTier,
    request: {
      leadId: lead.slug,
      contentTypes: [...MONTHLY_MARKETING_PACK_TYPES],
      automationLevel,
      approvalMode: "optional",
      business: businessContextFromLead(lead),
    },
  };
}
