import type { Lead, LeadPipelineStage } from "./types";

/**
 * Demo / seed leads used for preview templates and dashboard pipeline counts
 * until Convex persistence lands. Slugs are stable for marketing deep-links.
 */
export const DEMO_LEADS: readonly Lead[] = [
  {
    slug: "example-bakery",
    businessName: "Hearth & Crumb Bakery",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    tagline: "Sourdough, pastry, and weekend brunch",
    description:
      "Neighborhood bakery known for same-day sourdough, seasonal pastries, and a calm weekend brunch counter. Pickup and limited seating.",
    phone: "(303) 555-0142",
    services: ["Fresh bread daily", "Custom cakes", "Weekend brunch", "Coffee & espresso"],
    hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat–Sun 8am–2pm" },
    stage: "site_built",
    recommendedTier: "growth",
    dataSource: "demo_catalog",
  },
  {
    slug: "serene-salon",
    businessName: "Serene Studio Salon",
    category: "salon",
    city: "Denver",
    state: "CO",
    tagline: "Color, cuts, and calm appointments",
    description:
      "Appointment-only salon focused on lived-in color, precision cuts, and a quiet chair experience. Ideal for clients who book ahead.",
    phone: "(720) 555-0198",
    services: ["Haircuts", "Color & highlights", "Blowouts", "Bridal styling"],
    hours: { weekday: "Tue–Fri 9am–6pm", weekend: "Sat 9am–4pm · Closed Sun–Mon" },
    stage: "outreach_sent",
    recommendedTier: "complete",
    dataSource: "demo_catalog",
  },
  {
    slug: "mountain-plumbing",
    businessName: "Mountain Peak Plumbing",
    category: "trades",
    city: "Fort Collins",
    state: "CO",
    tagline: "Emergency and scheduled plumbing for Front Range homes",
    description:
      "Licensed residential plumbers covering Fort Collins and nearby towns. Clear estimates, same-day emergency slots when available.",
    phone: "(970) 555-0166",
    services: ["Emergency repairs", "Water heaters", "Drain clearing", "Fixture installs"],
    hours: { weekday: "Mon–Fri 7am–6pm", weekend: "Sat emergency on-call" },
    stage: "discovered",
    recommendedTier: "starter",
    dataSource: "demo_catalog",
  },
] as const;

export function getLeadBySlug(slug: string): Lead | undefined {
  return DEMO_LEADS.find((lead) => lead.slug === slug);
}

/** Infer a demo lead from slug keywords when not in the catalog. */
export function resolvePreviewLead(slug: string): Lead {
  const existing = getLeadBySlug(slug);
  if (existing) return existing;

  const businessName = slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const lower = slug.toLowerCase();
  let category: Lead["category"] = "generic";
  if (/bakery|bistro|cafe|restaurant|pizza|grill|diner|kitchen/.test(lower)) {
    category = "restaurant";
  } else if (/salon|spa|barber|nails|beauty|hair/.test(lower)) {
    category = "salon";
  } else if (/plumb|hvac|electric|roof|paint|landscap|contractor|trade|repair/.test(lower)) {
    category = "trades";
  }

  return {
    slug,
    businessName: businessName || "Local Business",
    category,
    city: "Colorado",
    state: "CO",
    tagline: "A preview site tailored to your business",
    description:
      "This preview was generated from your public business listing. Claim it to connect your domain, contact form, and optional marketing or AI phone add-ons.",
    phone: "(555) 000-0000",
    services: ["Core services", "Local service area", "Contact for a quote"],
    hours: { weekday: "Mon–Fri by appointment", weekend: "Weekend by request" },
    stage: "site_built",
    recommendedTier: category === "trades" ? "starter" : category === "salon" ? "complete" : "growth",
    dataSource: "slug_inference",
  };
}

export function countLeadsByStage(): Record<LeadPipelineStage, number> {
  const counts: Record<LeadPipelineStage, number> = {
    discovered: 0,
    site_built: 0,
    outreach_sent: 0,
    discovery_call: 0,
    paid: 0,
    live: 0,
  };
  for (const lead of DEMO_LEADS) {
    counts[lead.stage] += 1;
  }
  return counts;
}
