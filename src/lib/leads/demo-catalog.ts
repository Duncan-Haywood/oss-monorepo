import { defaultTierForCategory } from "./category-normalize";
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
    address: "1837 Pearl St",
    tagline: "Sourdough, pastry, and weekend brunch",
    description:
      "Neighborhood bakery known for same-day sourdough, seasonal pastries, and a calm weekend brunch counter. Pickup and limited seating.",
    phone: "(303) 555-0142",
    email: "hello@hearthcrumb.example",
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
    address: "2144 Larimer St",
    tagline: "Color, cuts, and calm appointments",
    description:
      "Appointment-only salon focused on lived-in color, precision cuts, and a quiet chair experience. Ideal for clients who book ahead.",
    phone: "(720) 555-0198",
    email: "book@serenestudio.example",
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
    address: "301 S College Ave",
    tagline: "Emergency and scheduled plumbing for Front Range homes",
    description:
      "Licensed residential plumbers covering Fort Collins and nearby towns. Clear estimates, same-day emergency slots when available.",
    phone: "(970) 555-0166",
    email: "dispatch@mountainpeak.example",
    services: ["Emergency repairs", "Water heaters", "Drain clearing", "Fixture installs"],
    hours: { weekday: "Mon–Fri 7am–6pm", weekend: "Sat emergency on-call" },
    stage: "discovered",
    recommendedTier: "starter",
    dataSource: "demo_catalog",
  },
  {
    slug: "corner-mercantile",
    businessName: "Corner Mercantile",
    category: "retail",
    city: "Longmont",
    state: "CO",
    address: "412 Main St",
    tagline: "Curated goods, picked with care",
    description:
      "Independent shop carrying curated home goods, local artisan gifts, and everyday essentials, with in-store personal shopping and gift wrapping.",
    phone: "(303) 555-0177",
    email: "hello@cornermercantile.example",
    services: ["Curated home goods", "Local artisan gifts", "Gift wrapping", "Personal shopping"],
    hours: { weekday: "Tue–Sat 10am–6pm", weekend: "Sun 11am–4pm · Closed Mon" },
    stage: "discovery_call",
    recommendedTier: "growth",
    dataSource: "demo_catalog",
  },
  {
    slug: "clearview-wellness-clinic",
    businessName: "Clearview Wellness Clinic",
    category: "health",
    city: "Lafayette",
    state: "CO",
    address: "955 S Public Rd",
    tagline: "Care your patients can count on",
    description:
      "Chiropractic and physical therapy clinic offering same-week appointments, insurance-friendly billing, and a calm, welcoming office for patients of all ages.",
    phone: "(303) 555-0184",
    email: "front-desk@clearviewwellness.example",
    services: ["Chiropractic adjustments", "Physical therapy", "Sports injury care", "Wellness consultations"],
    hours: { weekday: "Mon–Fri 8am–5pm", weekend: "Closed Sat–Sun" },
    stage: "site_built",
    recommendedTier: "growth",
    dataSource: "demo_catalog",
  },
  {
    slug: "trailhead-auto-repair",
    businessName: "Trailhead Auto Repair",
    category: "automotive",
    city: "Golden",
    state: "CO",
    address: "620 Ford St",
    tagline: "Honest repairs, done right the first time",
    description:
      "Family-owned auto repair shop offering diagnostics, brakes, and routine maintenance for domestic and import vehicles, with free loaner cars for same-day service.",
    phone: "(303) 555-0155",
    email: "service@trailheadauto.example",
    services: ["Brakes & suspension", "Check-engine diagnostics", "Oil changes", "Pre-purchase inspections"],
    hours: { weekday: "Mon–Fri 7:30am–5:30pm", weekend: "Sat 8am–1pm · Closed Sun" },
    stage: "outreach_sent",
    recommendedTier: "growth",
    dataSource: "demo_catalog",
  },
  {
    slug: "brightside-cleaning-co",
    businessName: "Brightside Cleaning Co.",
    category: "cleaning",
    city: "Louisville",
    state: "CO",
    address: "88 S McCaslin Blvd",
    tagline: "A spotless space, every visit",
    description:
      "Bonded and insured residential and commercial cleaning crew serving the Denver-Boulder corridor, with recurring weekly/biweekly plans and one-time deep cleans.",
    phone: "(303) 555-0193",
    email: "hello@brightsidecleaning.example",
    services: ["Recurring house cleaning", "Move-in/move-out deep clean", "Office & commercial cleaning", "Post-construction cleanup"],
    hours: { weekday: "Mon–Fri 8am–6pm", weekend: "Sat 9am–2pm · Closed Sun" },
    stage: "discovered",
    recommendedTier: "growth",
    dataSource: "demo_catalog",
  },
  {
    slug: "ironclad-fitness-studio",
    businessName: "Ironclad Fitness Studio",
    category: "fitness",
    city: "Erie",
    state: "CO",
    address: "1450 Co Rd 5",
    tagline: "Strength, conditioning, and coaching that keeps you coming back",
    description:
      "Locally owned strength and conditioning gym offering personal training, small-group classes, and open gym access for members of every fitness level, with a member portal for booking and class schedules.",
    phone: "(303) 555-0179",
    email: "hello@ironcladfitness.example",
    services: ["Personal training", "Small-group classes", "Open gym access", "Nutrition coaching"],
    hours: { weekday: "Mon–Fri 5am–9pm", weekend: "Sat–Sun 7am–2pm" },
    stage: "discovered",
    recommendedTier: "growth",
    dataSource: "demo_catalog",
  },
] as const;

export function getLeadBySlug(slug: string): Lead | undefined {
  return DEMO_LEADS.find((lead) => lead.slug === slug);
}

/**
 * True only for the curated marketing showcase slugs (DEMO_LEADS) — the
 * intentional public product samples. Used to decide preview-page/sitemap
 * indexability (see isLeadPreviewIndexable in @/lib/seo): a slug-inferred
 * preview or a cold-prospected real lead is NOT a curated demo.
 */
export function isCuratedDemoLeadSlug(slug: string): boolean {
  return DEMO_LEADS.some((lead) => lead.slug === slug);
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
  } else if (/auto|mechanic|garage|tire|transmission|collision|motor/.test(lower)) {
    // Checked before "trades" — trades' own bare "repair" keyword would
    // otherwise swallow the dominant real-world auto-repair naming
    // convention ("joes-auto-repair") before this branch ever runs.
    category = "automotive";
  } else if (/plumb|hvac|electric|roof|paint|landscap|contractor|trade|repair/.test(lower)) {
    category = "trades";
  } else if (/shop|store|boutique|mercantile|market|retail|goods/.test(lower)) {
    category = "retail";
  } else if (/dental|dentist|chiro|clinic|wellness|therapy|medical|health|physio/.test(lower)) {
    category = "health";
  } else if (/clean|maid|janitorial|housekeep|spotless/.test(lower)) {
    category = "cleaning";
  } else if (/gym|fitness|yoga|pilates|crossfit|martial-arts|personal-train/.test(lower)) {
    // Mechanically verified to share no keyword substring with any of the
    // seven branches above (checked in both directions: none of their
    // keyword lists contain gym/fitness/yoga/pilates/crossfit/martial-arts/
    // personal-train, and none of these fitness keywords match an earlier
    // branch's regex) — see automotive-repair-keyword-priority-fix for why
    // a one-directional check alone isn't sufficient.
    category = "fitness";
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
    recommendedTier: defaultTierForCategory(category),
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
    closed: 0,
  };
  for (const lead of DEMO_LEADS) {
    counts[lead.stage] += 1;
  }
  return counts;
}
