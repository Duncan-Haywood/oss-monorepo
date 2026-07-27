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
  it("ships the six stable marketing deep-link demos", () => {
    expect(DEMO_LEADS.map((lead) => lead.slug)).toEqual([
      "example-bakery",
      "serene-salon",
      "mountain-plumbing",
      "corner-mercantile",
      "clearview-wellness-clinic",
      "trailhead-auto-repair",
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
  });
});

describe("countLeadsByStage", () => {
  it("counts every pipeline stage for the demo catalog", () => {
    expect(countLeadsByStage()).toEqual({
      discovered: 1,
      site_built: 2,
      outreach_sent: 2,
      discovery_call: 1,
      paid: 0,
      live: 0,
      closed: 0,
    });
  });
});
