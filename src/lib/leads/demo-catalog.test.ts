import { describe, expect, it } from "vitest";
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

  it("does not mistake a lawn-care/landscaping business for a law firm (legal-category-lawn-substring-collision-fix)", () => {
    // Bare "law"/"legal" substrings previously matched inside "lawn" and
    // "illegal" — these slugs have no earlier-branch keyword either, so they
    // must fall through to generic rather than being miscategorized as legal.
    for (const slug of ["green-lawn-care", "lawn-ranger-mowing", "illegal-petes-burritos"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "generic",
        dataSource: "slug_inference",
      });
    }
  });

  it("routes 'auto-spa' detailing shops to automotive, not salon (category-substring-collision-audit-02)", () => {
    // Bare "spa" previously matched before automotive's own "auto" keyword
    // ever ran, misrouting the dominant real-world auto-detailing naming
    // convention ("auto-spa") into salon.
    for (const slug of ["auto-spa-car-wash", "the-auto-spa"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "automotive",
        dataSource: "slug_inference",
      });
    }
  });

  it("does not mistake 'crawlspace' or a 'Hairston' surname for salon keywords (category-substring-collision-audit-02)", () => {
    // Bare "spa"/"hair" previously matched inside "crawlspace" and
    // "Hairston" — these must fall through past salon (to trades' "roof"
    // keyword for the roofing business, and to generic for crawlspace,
    // which has no other category keyword).
    expect(resolvePreviewLead("crawlspace-solutions")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("hairston-roofing-llc")).toMatchObject({
      category: "trades",
      dataSource: "slug_inference",
    });
  });

  it("routes kitchen-and-bath remodeling contractors to trades, not restaurant (category-substring-collision-audit-02)", () => {
    // Bare "kitchen" previously matched restaurant before trades' keywords
    // ever ran, misrouting the common real-world "kitchen and bath
    // remodeling" contractor naming convention into restaurant.
    for (const slug of ["abc-kitchen-bath-remodeling", "valley-kitchen-renovation-co"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "trades",
        dataSource: "slug_inference",
      });
    }
  });

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
