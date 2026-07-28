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
  {
    slug: "westbrook-law-group",
    businessName: "Westbrook Law Group",
    category: "legal",
    city: "Broomfield",
    state: "CO",
    address: "70 Century Dr",
    tagline: "Trusted counsel when it matters most",
    description:
      "Small family-law and estate-planning firm offering free 20-minute consultations, transparent flat-fee packages for wills and simple divorces, and same-week appointments for urgent matters.",
    phone: "(303) 555-0161",
    email: "intake@westbrooklawgroup.example",
    services: ["Family law", "Estate planning & wills", "Free consultations", "Divorce mediation"],
    hours: { weekday: "Mon–Fri 8:30am–5:30pm", weekend: "Closed Sat–Sun" },
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
  // "Kitchen and bath remodeling" is a common real-world contractor naming
  // convention (e.g. "ABC Kitchen Bath Remodeling") — bare "kitchen" would
  // otherwise misroute it into restaurant before trades' own keywords ever
  // run (category-substring-collision-audit-02). Scope restaurant's kitchen
  // match out when a remodeling-contractor marker is also present, and route
  // it to trades via the "remodel"/"renovat" keywords added there instead.
  const isKitchenRemodelingContractor =
    /\bkitchen\b/.test(lower) && /bath|remodel|renovat/.test(lower);
  // A "workshop" (pottery/woodworking/art-class venue, e.g.
  // "pottery-workshop-studio") is a genuine whole-word ambiguity with a
  // retail "shop" — the business teaches or crafts, it doesn't sell off a
  // shelf, and no other category fits it either. Word-boundary scoping alone
  // can't help (workshop's "shop" suffix has a real word boundary on both
  // sides), so exclude the compound outright and let it fall through to
  // generic (category-substring-collision-audit-06).
  const isCraftOrHobbyWorkshop = /workshop/.test(lower);
  // Disaster-restoration/cleanup contractors ("storm-restore-services",
  // "flood-restore-pros") are a real trades-adjacent naming convention whose
  // bare "restor(e)" embeds retail's bare "store" substring with no word
  // boundary in between ("re[store]") — word-boundary scoping "store" alone
  // would also silently exclude the unrelated, well-known "ReStore"
  // secondhand/home-improvement thrift store naming convention (a real
  // retail business), so scope the exclusion to only when a
  // disaster/damage marker is also present, not "restor(e)" in general
  // (category-substring-collision-audit-06).
  const isDisasterRestorationService =
    /restor/.test(lower) && /storm|flood|water|fire|disaster|mold/.test(lower);
  // A "garage sale"/thrift-shop business name (e.g. "garage-sale-treasures")
  // is a whole-word ambiguity, not a substring-embedding one — word-boundary
  // scoping "garage" wouldn't help, since it's a genuine standalone token in
  // both an auto-repair garage and a garage sale. Exclude it from automotive
  // and let it fall through to retail's own "shop"/"store" keywords when
  // present (category-substring-collision-audit-03).
  const isGarageSaleOrThriftShop = /garage/.test(lower) && /sale|thrift/.test(lower);
  // "Trademark"/"trade secrets" law firms are a common, plausible real
  // business name — trades' own bare "trade" keyword would otherwise
  // misroute them before legal's keywords ever run (word-boundary scoping
  // "trade" alone wouldn't help, since "trademark" embeds it with no
  // boundary, and "trade-secrets" is a genuine standalone token). Exclude
  // this compound from trades so it falls through to legal's own
  // law/attorney/legal/lawyer keywords instead (category-substring-collision-audit-04).
  const isTrademarkOrTradeSecretsLaw =
    /trademark|trade-secrets|trade secrets/.test(lower) &&
    /\blaw\b|attorney|\blegal\b|lawyer/.test(lower);
  // "Clean eating"/"eat clean" nutrition and meal-prep branding (e.g.
  // "clean-eatz-nutrition") is a genuine standalone use of "clean" that has
  // nothing to do with janitorial services — word-boundary scoping wouldn't
  // help here either, since it's a real whole token. Exclude it from
  // cleaning and let it fall through (no other branch's keywords apply, so
  // it lands on generic, same as an unmatched slug) rather than
  // miscategorizing a nutrition business as a cleaning service
  // (category-substring-collision-audit-04).
  const isCleanEatingNutrition = /clean/.test(lower) && /eat|nutrition|food|meal|diet/.test(lower);
  // A "paintball arena"/"laser tag" business name is a whole-word ambiguity
  // like garage-sale/electric-bike below — bare "paint" would otherwise
  // misroute it into trades before this branch's own keywords ever run.
  // Exclude the compound and let it fall through (no other branch's
  // keywords apply, so it lands on generic) rather than miscategorizing an
  // entertainment venue as a painting contractor
  // (category-substring-collision-audit-05).
  const isPaintballArena = /paint/.test(lower) && /ball/.test(lower);
  // "Electric bike"/"e-bike" retailers are a genuine whole-word ambiguity
  // with electricians, mirroring garage-sale/kitchen-bath above — exclude
  // from trades so it falls through to retail's own "shop"/"store" keywords
  // instead (category-substring-collision-audit-05).
  const isElectricBikeShop = /electric/.test(lower) && /\bbike\b|bicycle/.test(lower);
  let category: Lead["category"] = "generic";
  if (
    !isKitchenRemodelingContractor &&
    /bakery|bistro|cafe|restaurant|\bpizza\b|\bgrill\b|\bdiner\b|\bkitchen\b/.test(lower)
  ) {
    // "grill" and "diner" are word-boundary scoped (\b) — a bare "grill"
    // matches inside "grille" (e.g. "chrome-grille-restorations", an
    // automotive customization/restoration business) and a bare "diner"
    // matches inside a surname like "Gardiner" (e.g. "gardiner-law-group",
    // which should resolve to legal instead) — category-substring-collision-audit-05.
    // "kitchen" is also word-boundary scoped — a bare "kitchen" matches
    // inside "kitchenware" (e.g. "kitchenware-outlet-store", a retailer) and
    // inside "kitchenaid" (e.g. "kitchenaid-appliance-repair", an appliance
    // repair business that should resolve to trades via its own "repair"
    // keyword) — category-substring-collision-audit-06.
    // "pizza" is also word-boundary scoped — a bare "pizza" matches inside
    // "pizzazz" (e.g. "pizzazz-hair-salon-studio", a common real-world
    // salon/boutique flourish word with no restaurant meaning at all), which
    // would misclassify it as restaurant before the salon branch below ever
    // runs — category-substring-collision-audit-07.
    category = "restaurant";
  } else if (
    !isGarageSaleOrThriftShop &&
    /\bauto\b|\bmechanic\b|garage|\btire\b|transmission|collision|motor/.test(lower)
  ) {
    // "mechanic" is word-boundary scoped (\b) — a bare "mechanic" matches
    // inside "mechanical" (e.g. "abc-mechanical-contractors", which should
    // resolve to trades instead via its own "contractor" keyword) —
    // category-substring-collision-audit-05.
    // Checked before both "salon" and "trades" — salon's own bare "spa"
    // keyword and trades' own bare "repair" keyword would otherwise swallow
    // two dominant real-world automotive naming conventions ("auto-spa"
    // detailing shops, "joes-auto-repair") before this branch ever runs
    // (category-substring-collision-audit-02 extended this precedent, first
    // established against trades alone, to salon too). "auto" and "tire" are
    // word-boundary scoped (\b) — a bare "auto" matches inside "autograph"
    // (e.g. "autograph-collectibles-store", a memorabilia retailer) and a
    // bare "tire" matches inside "attire" (e.g. "elegant-attire-boutique", a
    // clothing retailer) — mirroring the word-boundary fix already applied
    // to legal's/salon's own bare keywords (category-substring-collision-audit-03).
    category = "automotive";
  } else if (/salon|\bspa\b|barber|\bnails\b|\bbeauty\b|\bhair\b/.test(lower)) {
    // "spa", "hair", and "nails" are word-boundary scoped (\b) rather than
    // bare substrings — a bare "spa" matches inside "crawlspace" (a
    // home-services business name with no other category keyword), a bare
    // "hair" matches inside a surname like "Hairston" (e.g.
    // "hairston-roofing-llc", which should resolve to trades via "roof"
    // instead), and a bare "nails" matches inside "thumbnails" (e.g.
    // "thumbnails-design-studio", which has no other category keyword).
    // Mirrors the word-boundary fix already applied to legal's "law"/"legal"
    // keywords (legal-category-lawn-substring-collision-fix) — see
    // category-substring-collision-audit-02 / -05. "beauty" is also
    // word-boundary scoped — a bare "beauty" matches inside a mattress brand
    // like "beautyrest" (e.g. "beautyrest-mattress-outlet", a retailer with
    // no other salon-adjacent keyword) — category-substring-collision-audit-06.
    category = "salon";
  } else if (
    !isTrademarkOrTradeSecretsLaw &&
    !isPaintballArena &&
    !isElectricBikeShop &&
    /plumb|hvac|electric|\broof|paint|landscap|contractor|trade(?!r)|repair|remodel|renovat/.test(
      lower,
    )
  ) {
    // "roof" is left-word-boundary scoped (\b before, no \b after) rather
    // than a bare substring or a fully-scoped one: a bare "roof" matches
    // inside "proofreading"/"waterproof" (roof preceded by a word char, no
    // legitimate trades business), but a full \broof\b would also break the
    // genuine "roofing"/"roofer" suffix forms this keyword exists to catch
    // (e.g. "hairston-roofing-llc", already covered by a regression test).
    // Left-boundary-only blocks the prefix-embedded false positive while
    // preserving every suffix-attached real match — category-substring-collision-audit-05.
    // "trade" excludes only a trailing "r" via negative lookahead — a bare
    // "trade" matches inside "trader" (e.g. "trader-joes-style-market",
    // which should resolve to retail via "market" instead, and
    // "downtown-trader-antiques", which has no other category keyword and
    // should fall through to generic) — but a full \btrade\b boundary would
    // also break the genuine "tradesman" suffix form (a real trades-business
    // naming convention with no analogous false-positive risk), so the
    // lookahead targets only the "trader" false friend, mirroring "roof"'s
    // own suffix-preserving precedent above (category-substring-collision-audit-06).
    category = "trades";
  } else if (
    !isDisasterRestorationService &&
    !isCraftOrHobbyWorkshop &&
    /\bshop\b|store|boutique|mercantile|\bmarket\b|retail|\bgoods\b/.test(lower)
  ) {
    // "market" and "goods" are word-boundary scoped (\b) — a bare "market"
    // matches inside "marketing" (e.g. "elevate-marketing-agency", a
    // plausible and common cold-prospect business type with no other
    // category keyword) and a bare "goods" matches inside a surname like
    // "Goodson" (e.g. "goodson-photography-studio") —
    // category-substring-collision-audit-05. isDisasterRestorationService and
    // isCraftOrHobbyWorkshop (defined above) exclude "store"/"shop" whole-word
    // ambiguities that word-boundary scoping alone can't fix —
    // category-substring-collision-audit-06. "shop" is also word-boundary
    // scoped — a bare "shop" matches inside a surname/title like "Bishop"
    // (e.g. "bishop-family-law", which should resolve to legal instead via
    // its own "law" keyword; retail runs before legal in this chain, so the
    // false match swallows several later branches, not just legal) —
    // category-substring-collision-audit-08.
    category = "retail";
  } else if (/dental|dentist|chiro|clinic|wellness|therapy|medical|\bhealth\b|physio/.test(lower)) {
    // "health" is word-boundary scoped (\b) — a bare "health" matches inside
    // "healthy" (e.g. "healthy-home-cleaning", which should resolve to
    // cleaning via its own "clean" keyword instead — this branch runs before
    // cleaning's) — category-substring-collision-audit-06.
    category = "health";
  } else if (
    !isCleanEatingNutrition &&
    /clean|\bmaid\b|janitorial|housekeep|spotless/.test(lower)
  ) {
    // "maid" is word-boundary scoped (\b) — a bare "maid" matches inside a
    // town/surname like "Maidenhead" (e.g. "maidenhead-legal-attorney"),
    // which should resolve to legal via its own \blegal\b keyword instead.
    // Mirrors the word-boundary fix already applied to salon's/legal's own
    // bare keywords (category-substring-collision-audit-04).
    category = "cleaning";
  } else if (/gym|fitness|yoga|pilates|crossfit|martial-arts|personal-train/.test(lower)) {
    // Mechanically verified to share no keyword substring with any of the
    // seven branches above (checked in both directions: none of their
    // keyword lists contain gym/fitness/yoga/pilates/crossfit/martial-arts/
    // personal-train, and none of these fitness keywords match an earlier
    // branch's regex) — see automotive-repair-keyword-priority-fix for why
    // a one-directional check alone isn't sufficient.
    category = "fitness";
  } else if (/\blaw\b|attorney|\blegal\b|lawyer/.test(lower)) {
    // Mechanically verified to share no keyword substring with any of the
    // eight branches above in either direction — none of their keyword
    // lists contain law/attorney/legal/lawyer, and none of these legal
    // keywords match an earlier branch's regex (see
    // automotive-repair-keyword-priority-fix for why a one-directional
    // check alone isn't sufficient). "law" and "legal" are word-boundary
    // scoped (\b) rather than bare substrings — a bare "law" matches inside
    // "lawn" (a real-world lawn-care/landscaping business name, this app's
    // own trades-adjacent target market — "green-lawn-care" incorrectly
    // resolved to "legal" before this fix) and a bare "legal" matches
    // inside "illegal" (e.g. a Colorado business literally named "Illegal
    // Pete's" — plausible given every demo lead in this catalog is
    // Colorado-based). "attorney" and "lawyer" are long/distinctive enough
    // that no equivalent false-positive substring risk exists, so they stay
    // bare. See legal-category-lawn-substring-collision-fix.
    category = "legal";
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
