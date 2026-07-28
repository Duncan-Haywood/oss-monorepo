import { describe, expect, it } from "vitest";
import type { BusinessCategory } from "./types";
import {
  DEMO_LEADS,
  countLeadsByStage,
  getLeadBySlug,
  isCuratedDemoLeadSlug,
  resolvePreviewLead,
} from "./demo-catalog";

/**
 * Direct coverage for demo catalog + resolvePreviewLead slug inference.
 * /preview/[slug] falls back here for not-yet-persisted slugs during operator
 * setup; category inference and recommendedTier must stay locked so a silent
 * drift cannot ship a wrong template or upsell card without failing Vitest.
 */

/**
 * Growing corpus of real-world business-naming patterns that previously
 * mis-resolved because a category keyword matched as a bare substring inside
 * an unrelated word (a surname, a brand name, a compound noun) rather than
 * the intended whole token. Six rounds of manual/agent-assisted audits
 * (category-substring-collision-audit-02 through -06, plus the original
 * legal-category-lawn-substring-collision-fix) each found a fresh batch by
 * hand and wrote a bespoke `it()` block per finding — this table replaces
 * that scattered pattern (process-log-category-collision-corpus-consolidation,
 * 2026-07-27) so a future audit appends ONE row here instead of writing a new
 * test block. `tier` is optional — only assert it when the fixture slug also
 * pins down `recommendedTier` (most collision fixtures only need to prove the
 * category, since recommendedTier is a pure function of category).
 */
type CollisionRegressionCase = {
  slug: string;
  category: BusinessCategory;
  tier?: "starter" | "growth" | "complete";
  note: string;
};
const COLLISION_REGRESSION_CASES: readonly CollisionRegressionCase[] = [
  { slug: "green-lawn-care", category: "generic", note: "lawn, not law" },
  { slug: "lawn-ranger-mowing", category: "generic", note: "lawn, not law" },
  { slug: "illegal-petes-burritos", category: "generic", note: "illegal, not legal" },
  { slug: "auto-spa-car-wash", category: "automotive", note: "auto-spa detailing, not salon" },
  { slug: "the-auto-spa", category: "automotive", note: "auto-spa detailing, not salon" },
  { slug: "crawlspace-solutions", category: "generic", note: "crawlspace, not spa" },
  { slug: "hairston-roofing-llc", category: "trades", note: "Hairston surname, not hair salon" },
  {
    slug: "abc-kitchen-bath-remodeling",
    category: "trades",
    note: "kitchen+bath remodel contractor, not restaurant",
  },
  {
    slug: "valley-kitchen-renovation-co",
    category: "trades",
    note: "kitchen renovation contractor, not restaurant",
  },
  { slug: "elegant-attire-boutique", category: "retail", note: "attire, not tire/automotive" },
  {
    slug: "autograph-collectibles-store",
    category: "retail",
    note: "autograph, not auto/automotive",
  },
  { slug: "mens-attire-outlet", category: "generic", note: "attire, not tire/automotive" },
  {
    slug: "vintage-garage-sale-shop",
    category: "retail",
    note: "garage sale, not auto garage",
  },
  { slug: "garage-sale-treasures", category: "generic", note: "garage sale, not auto garage" },
  {
    slug: "trademark-law-group",
    category: "legal",
    tier: "growth",
    note: "trademark law, not trades",
  },
  {
    slug: "trade-secrets-law-firm",
    category: "legal",
    tier: "growth",
    note: "trade secrets law, not trades",
  },
  {
    slug: "maidenhead-legal-attorney",
    category: "legal",
    tier: "growth",
    note: "Maidenhead place name, not maid service",
  },
  {
    slug: "clean-eatz-nutrition",
    category: "generic",
    note: "clean eating nutrition brand, not cleaning service",
  },
  { slug: "gardiner-law-group", category: "legal", tier: "growth", note: "Gardiner surname, not diner" },
  {
    slug: "chrome-grille-restorations",
    category: "generic",
    note: "grille (auto trim), not restaurant grill",
  },
  {
    slug: "abc-mechanical-contractors",
    category: "trades",
    tier: "starter",
    note: "mechanical contractor, not automotive mechanic",
  },
  { slug: "elevate-marketing-agency", category: "generic", note: "marketing, not retail market" },
  { slug: "goodson-photography-studio", category: "generic", note: "Goodson surname, not retail goods" },
  {
    slug: "precision-proofreading-services",
    category: "generic",
    note: "proofreading, not trades roof",
  },
  { slug: "downtown-paintball-arena", category: "generic", note: "paintball arena, not trades paint" },
  { slug: "thumbnails-design-studio", category: "generic", note: "thumbnails, not nail salon" },
  {
    slug: "electric-bike-shop",
    category: "retail",
    tier: "growth",
    note: "electric bike retailer, not electrician",
  },
  {
    slug: "kitchenware-outlet-store",
    category: "retail",
    note: "kitchenware retailer, not restaurant",
  },
  {
    slug: "kitchenaid-appliance-repair",
    category: "trades",
    note: "KitchenAid appliance repair, not restaurant",
  },
  { slug: "pottery-workshop-studio", category: "generic", note: "workshop, not retail shop" },
  { slug: "woodworking-workshop-classes", category: "generic", note: "workshop, not retail shop" },
  {
    slug: "storm-restore-services",
    category: "generic",
    note: "disaster restoration, not retail store",
  },
  {
    slug: "flood-restore-pros",
    category: "generic",
    note: "disaster restoration, not retail store",
  },
  {
    slug: "habitat-restore-thrift-shop",
    category: "retail",
    note: "genuine ReStore-style thrift store stays retail",
  },
  { slug: "trader-joes-style-market", category: "retail", note: "trader, not trades" },
  { slug: "downtown-trader-antiques", category: "generic", note: "trader, not trades" },
  { slug: "tradesman-services-llc", category: "trades", note: "tradesman suffix still routes to trades" },
  {
    slug: "healthy-home-cleaning",
    category: "cleaning",
    note: "healthy cleaning brand, not health/wellness",
  },
  {
    slug: "healthy-maid-service",
    category: "cleaning",
    note: "healthy cleaning brand, not health/wellness",
  },
  {
    slug: "eco-healthy-housekeeping",
    category: "cleaning",
    note: "healthy cleaning brand, not health/wellness",
  },
  {
    slug: "beautyrest-mattress-outlet",
    category: "generic",
    note: "Beautyrest mattress brand, not salon beauty",
  },
  {
    slug: "citywide-roofing-experts",
    category: "trades",
    tier: "starter",
    note: "roofing suffix regression check",
  },
  {
    slug: "the-local-roofer",
    category: "trades",
    tier: "starter",
    note: "roofer suffix regression check",
  },
  {
    slug: "pizzazz-hair-salon-studio",
    category: "salon",
    tier: "complete",
    note: "pizzazz flourish word, not pizza restaurant",
  },
];

describe("DEMO_LEADS", () => {
  it("ships the nine stable marketing deep-link demos", () => {
    expect(DEMO_LEADS.map((lead) => lead.slug)).toEqual([
      "example-bakery",
      "serene-salon",
      "mountain-plumbing",
      "corner-mercantile",
      "clearview-wellness-clinic",
      "trailhead-auto-repair",
      "brightside-cleaning-co",
      "ironclad-fitness-studio",
      "westbrook-law-group",
    ]);
  });

  it("tags every demo with dataSource=demo_catalog and category-aligned tiers", () => {
    for (const lead of DEMO_LEADS) {
      expect(lead.dataSource).toBe("demo_catalog");
    }
    expect(getLeadBySlug("example-bakery")).toMatchObject({
      category: "restaurant",
      recommendedTier: "growth",
      stage: "site_built",
    });
    expect(getLeadBySlug("serene-salon")).toMatchObject({
      category: "salon",
      recommendedTier: "complete",
      stage: "outreach_sent",
    });
    expect(getLeadBySlug("mountain-plumbing")).toMatchObject({
      category: "trades",
      recommendedTier: "starter",
      stage: "discovered",
    });
    expect(getLeadBySlug("corner-mercantile")).toMatchObject({
      category: "retail",
      recommendedTier: "growth",
      stage: "discovery_call",
    });
    expect(getLeadBySlug("clearview-wellness-clinic")).toMatchObject({
      category: "health",
      recommendedTier: "growth",
      stage: "site_built",
    });
    expect(getLeadBySlug("trailhead-auto-repair")).toMatchObject({
      category: "automotive",
      recommendedTier: "growth",
      stage: "outreach_sent",
    });
    expect(getLeadBySlug("brightside-cleaning-co")).toMatchObject({
      category: "cleaning",
      recommendedTier: "growth",
      stage: "discovered",
    });
    expect(getLeadBySlug("ironclad-fitness-studio")).toMatchObject({
      category: "fitness",
      recommendedTier: "growth",
      stage: "discovered",
    });
    expect(getLeadBySlug("westbrook-law-group")).toMatchObject({
      category: "legal",
      recommendedTier: "growth",
      stage: "discovered",
    });
  });
});

describe("getLeadBySlug", () => {
  it("returns undefined for unknown or empty slugs", () => {
    expect(getLeadBySlug("")).toBeUndefined();
    expect(getLeadBySlug("not-a-real-lead")).toBeUndefined();
  });
});

describe("isCuratedDemoLeadSlug", () => {
  it("is true only for the curated showcase slugs", () => {
    for (const lead of DEMO_LEADS) {
      expect(isCuratedDemoLeadSlug(lead.slug)).toBe(true);
    }
  });

  it("is false for slug-inferred previews and unknown/empty slugs", () => {
    // A real cold-prospected lead or an inferred preview must not be treated as
    // a public showcase for sitemap/robots indexability purposes.
    expect(isCuratedDemoLeadSlug("joes-diner")).toBe(false);
    expect(isCuratedDemoLeadSlug("blue-ridge-cafe")).toBe(false);
    expect(isCuratedDemoLeadSlug("")).toBe(false);
  });
});

describe("resolvePreviewLead", () => {
  it("returns the catalog lead unchanged when the slug is known", () => {
    const bakery = resolvePreviewLead("example-bakery");
    expect(bakery).toEqual(getLeadBySlug("example-bakery"));
    expect(bakery.dataSource).toBe("demo_catalog");
  });

  it("title-cases hyphenated slugs into businessName", () => {
    const lead = resolvePreviewLead("blue-ridge-cafe");
    expect(lead.businessName).toBe("Blue Ridge Cafe");
    expect(lead.slug).toBe("blue-ridge-cafe");
  });

  it("falls back to Local Business when the slug has no words", () => {
    expect(resolvePreviewLead("").businessName).toBe("Local Business");
    expect(resolvePreviewLead("---").businessName).toBe("Local Business");
  });

  it("infers restaurant category and growth tier from food keywords", () => {
    for (const slug of ["hearth-bakery", "pearl-bistro", "downtown-pizza", "grill-house"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "restaurant",
        recommendedTier: "growth",
        dataSource: "slug_inference",
        stage: "site_built",
      });
    }
  });

  it("infers salon category and complete tier from beauty keywords", () => {
    for (const slug of ["luxe-salon", "calm-spa", "barber-shop", "nails-studio"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "salon",
        recommendedTier: "complete",
        dataSource: "slug_inference",
      });
    }
  });

  it("infers trades category and starter tier from home-service keywords", () => {
    for (const slug of [
      "peak-plumbing",
      "front-range-hvac",
      "local-electric",
      "roof-repair-co",
    ]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "trades",
        recommendedTier: "starter",
        dataSource: "slug_inference",
      });
    }
  });

  it("infers retail category and growth tier from shop keywords", () => {
    for (const slug of ["riverside-boutique", "downtown-store", "gift-shop", "trailhead-goods"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "retail",
        recommendedTier: "growth",
        dataSource: "slug_inference",
      });
    }
  });

  it("infers health category and growth tier from clinic/wellness keywords", () => {
    for (const slug of ["riverside-dental", "downtown-chiropractic", "family-wellness-clinic", "physio-therapy-co"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "health",
        recommendedTier: "growth",
        dataSource: "slug_inference",
      });
    }
  });

  it("infers automotive category and growth tier from auto-repair keywords", () => {
    for (const slug of ["riverside-auto-center", "downtown-mechanic", "trailhead-garage", "peak-tire-co"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "automotive",
        recommendedTier: "growth",
        dataSource: "slug_inference",
      });
    }
  });

  it("prefers automotive over trades' generic 'repair' keyword for auto-repair slugs", () => {
    // "repair" alone is one of trades' own keywords — the dominant
    // real-world auto-repair business naming convention ("joes-auto-repair")
    // must still resolve to automotive, not fall into trades first.
    for (const slug of ["joes-auto-repair", "smiths-auto-repair-shop", "quick-fix-auto-repair-center"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "automotive",
        recommendedTier: "growth",
        dataSource: "slug_inference",
      });
    }
  });

  it("infers cleaning category and growth tier from cleaning-service keywords", () => {
    for (const slug of [
      "brightside-cleaning",
      "shine-maid-service",
      "downtown-janitorial",
      "spotless-housekeeping-co",
    ]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "cleaning",
        recommendedTier: "growth",
        dataSource: "slug_inference",
      });
    }
  });

  it("infers fitness category and growth tier from gym/studio keywords", () => {
    for (const slug of [
      "riverside-fitness-studio",
      "downtown-gym",
      "elite-personal-training",
      "sunrise-yoga-studio",
      "crossfit-summit",
      "west-end-martial-arts-academy",
    ]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "fitness",
        recommendedTier: "growth",
        dataSource: "slug_inference",
      });
    }
  });

  it("infers legal category and growth tier from law-firm keywords", () => {
    for (const slug of [
      "eastview-law-group",
      "downtown-attorney",
      "summit-legal-services",
      "jane-doe-lawyer",
    ]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "legal",
        recommendedTier: "growth",
        dataSource: "slug_inference",
      });
    }
  });

  it.each(COLLISION_REGRESSION_CASES)(
    "$slug -> $category ($note)",
    ({ slug, category, tier }) => {
      expect(resolvePreviewLead(slug)).toMatchObject(
        tier
          ? { category, recommendedTier: tier, dataSource: "slug_inference" }
          : { category, dataSource: "slug_inference" },
      );
    },
  );

  it("defaults to generic + growth when no category keyword matches", () => {
    expect(resolvePreviewLead("acme-services")).toMatchObject({
      category: "generic",
      recommendedTier: "growth",
      dataSource: "slug_inference",
      city: "Colorado",
      state: "CO",
    });
  });

  it("is case-insensitive for category keyword matching", () => {
    expect(resolvePreviewLead("Downtown-BAKERY").category).toBe("restaurant");
    expect(resolvePreviewLead("Luxe-SALON").category).toBe("salon");
    expect(resolvePreviewLead("Peak-PLUMB").category).toBe("trades");
    expect(resolvePreviewLead("Corner-BOUTIQUE").category).toBe("retail");
    expect(resolvePreviewLead("Family-CLINIC").category).toBe("health");
    expect(resolvePreviewLead("Downtown-GARAGE").category).toBe("automotive");
    expect(resolvePreviewLead("Shine-MAID-Service").category).toBe("cleaning");
    expect(resolvePreviewLead("Peak-CROSSFIT").category).toBe("fitness");
    expect(resolvePreviewLead("Downtown-ATTORNEY").category).toBe("legal");
  });
});

describe("countLeadsByStage", () => {
  it("counts every pipeline stage for the demo catalog", () => {
    expect(countLeadsByStage()).toEqual({
      discovered: 4,
      site_built: 2,
      outreach_sent: 2,
      discovery_call: 1,
      paid: 0,
      live: 0,
      closed: 0,
    });
  });
});
