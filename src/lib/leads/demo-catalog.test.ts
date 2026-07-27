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

  it("does not mistake 'attire'/'autograph' retailers for automotive (category-substring-collision-audit-03)", () => {
    // Bare "tire"/"auto" previously matched inside "attire" and "autograph"
    // — real-world clothing-retailer and memorabilia-retailer naming
    // conventions — before ever reaching retail's own keywords.
    expect(resolvePreviewLead("elegant-attire-boutique")).toMatchObject({
      category: "retail",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("autograph-collectibles-store")).toMatchObject({
      category: "retail",
      dataSource: "slug_inference",
    });
    // Neither contains a retail keyword, so — like the lawn/crawlspace
    // false positives before them — these fall through to generic rather
    // than being wrongly typed as automotive.
    expect(resolvePreviewLead("mens-attire-outlet")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake a 'garage sale' business for an auto garage (category-substring-collision-audit-03)", () => {
    // "garage" is a genuine standalone token in both an auto-repair garage
    // and a garage-sale/thrift shop — word-boundary scoping alone can't
    // disambiguate them, so a garage+sale/thrift combination is excluded
    // from automotive and falls through to retail's own keywords instead.
    expect(resolvePreviewLead("vintage-garage-sale-shop")).toMatchObject({
      category: "retail",
      dataSource: "slug_inference",
    });
    // No retail keyword present either, so this falls through to generic
    // rather than being wrongly typed as automotive.
    expect(resolvePreviewLead("garage-sale-treasures")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake 'trademark'/'trade secrets' law firms for trades (category-substring-collision-audit-04)", () => {
    // Bare "trade" previously matched inside "trademark" and "trade-secrets"
    // — real-world IP law firm naming conventions — before ever reaching
    // legal's own keywords.
    expect(resolvePreviewLead("trademark-law-group")).toMatchObject({
      category: "legal",
      recommendedTier: "growth",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("trade-secrets-law-firm")).toMatchObject({
      category: "legal",
      recommendedTier: "growth",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake a 'Maidenhead' business name for a maid service (category-substring-collision-audit-04)", () => {
    // Bare "maid" previously matched inside "Maidenhead" — a real place
    // name/surname a legal or other business could plausibly use — before
    // ever reaching legal's own keywords.
    expect(resolvePreviewLead("maidenhead-legal-attorney")).toMatchObject({
      category: "legal",
      recommendedTier: "growth",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake 'clean eating' nutrition branding for a cleaning service (category-substring-collision-audit-04)", () => {
    // Bare "clean" previously matched the whole-word "clean eating"/"eat
    // clean" nutrition and meal-prep branding pattern — no other branch's
    // keywords apply, so this falls through to generic rather than being
    // wrongly typed as a janitorial cleaning service.
    expect(resolvePreviewLead("clean-eatz-nutrition")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake a 'Gardiner' surname or 'grille' restorations for restaurant keywords (category-substring-collision-audit-05)", () => {
    // Bare "diner" previously matched inside a surname like "Gardiner", and
    // bare "grill" previously matched inside "grille" (a common automotive
    // customization/restoration term) — before ever reaching legal's own
    // keywords / falling through to generic.
    expect(resolvePreviewLead("gardiner-law-group")).toMatchObject({
      category: "legal",
      recommendedTier: "growth",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("chrome-grille-restorations")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake 'mechanical contractors' for automotive (category-substring-collision-audit-05)", () => {
    // Bare "mechanic" previously matched inside "mechanical" — a common
    // real-world HVAC/mechanical-contractor naming convention — before ever
    // reaching trades' own "contractor" keyword.
    expect(resolvePreviewLead("abc-mechanical-contractors")).toMatchObject({
      category: "trades",
      recommendedTier: "starter",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake a 'marketing agency' or a 'Goodson' surname for retail keywords (category-substring-collision-audit-05)", () => {
    // Bare "market" previously matched inside "marketing" — a plausible,
    // common cold-prospect business type — and bare "goods" previously
    // matched inside a surname like "Goodson"; neither has another category
    // keyword, so both must fall through to generic.
    expect(resolvePreviewLead("elevate-marketing-agency")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("goodson-photography-studio")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake 'proofreading' or a 'paintball' arena for trades keywords (category-substring-collision-audit-05)", () => {
    // Bare "roof" previously matched inside "proofreading" (roof preceded by
    // a word char, no boundary), and bare "paint" previously matched the
    // whole-word "paintball" arena naming pattern; neither has another
    // category keyword, so both must fall through to generic.
    expect(resolvePreviewLead("precision-proofreading-services")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("downtown-paintball-arena")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake 'thumbnails' design studios for a nail salon (category-substring-collision-audit-05)", () => {
    // Bare "nails" previously matched inside "thumbnails" — no other
    // category keyword applies, so this must fall through to generic.
    expect(resolvePreviewLead("thumbnails-design-studio")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
  });

  it("routes 'electric bike' shops to retail, not trades (category-substring-collision-audit-05)", () => {
    // "Electric bike"/e-bike retailers are a genuine whole-word ambiguity
    // with electricians — must fall through to retail's own "shop" keyword.
    expect(resolvePreviewLead("electric-bike-shop")).toMatchObject({
      category: "retail",
      recommendedTier: "growth",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake 'kitchenware' retailers or 'KitchenAid' appliance repair for restaurant keywords (category-substring-collision-audit-06)", () => {
    // Bare "kitchen" previously matched inside "kitchenware" and
    // "kitchenaid" — a kitchenware retailer should resolve via retail's own
    // "store" keyword, and a KitchenAid appliance-repair shop should resolve
    // via trades' own "repair" keyword, not restaurant.
    expect(resolvePreviewLead("kitchenware-outlet-store")).toMatchObject({
      category: "retail",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("kitchenaid-appliance-repair")).toMatchObject({
      category: "trades",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake a craft/hobby 'workshop' for a retail shop (category-substring-collision-audit-06)", () => {
    // Bare "shop" previously matched inside "workshop" — a pottery or
    // woodworking workshop teaches or crafts, it doesn't sell off a shelf,
    // and no other category keyword applies, so it must fall through to
    // generic.
    for (const slug of ["pottery-workshop-studio", "woodworking-workshop-classes"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "generic",
        dataSource: "slug_inference",
      });
    }
  });

  it("does not mistake a disaster-restoration contractor for a retail store, but keeps a genuine 'ReStore'-style thrift store as retail (category-substring-collision-audit-06)", () => {
    // Bare "store" previously matched inside "restore" — a storm/flood
    // restoration contractor has no other category keyword, so it must fall
    // through to generic. The exclusion is scoped to a disaster/damage
    // marker specifically so an unrelated, genuine secondhand/thrift store
    // whose name happens to contain "restore" (e.g. the real-world "ReStore"
    // naming convention) still resolves to retail via its own "shop"
    // keyword.
    expect(resolvePreviewLead("storm-restore-services")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("flood-restore-pros")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("habitat-restore-thrift-shop")).toMatchObject({
      category: "retail",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake a general 'trader' for a trades business, but still routes 'tradesman' to trades (category-substring-collision-audit-06)", () => {
    // Bare "trade" previously matched inside "trader" — an antiques/goods
    // trader should resolve to retail via "market", or fall through to
    // generic when no other keyword applies, not trades. "tradesman" (a
    // genuine trades-business naming convention with the same "trade"
    // prefix) must still resolve to trades — the fix is a negative lookahead
    // scoped to just the "r" that makes "trader", not a full word boundary.
    expect(resolvePreviewLead("trader-joes-style-market")).toMatchObject({
      category: "retail",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("downtown-trader-antiques")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
    expect(resolvePreviewLead("tradesman-services-llc")).toMatchObject({
      category: "trades",
      dataSource: "slug_inference",
    });
  });

  it("does not mistake a 'healthy' cleaning service for a health/wellness business (category-substring-collision-audit-06)", () => {
    // Bare "health" previously matched inside "healthy" — an eco-friendly
    // "Healthy Home Cleaning" service (a real-world non-toxic cleaning
    // naming convention) should resolve via cleaning's own "clean"/"maid"/
    // "housekeep" keywords, not health, since the health branch is checked
    // first in the chain.
    for (const slug of ["healthy-home-cleaning", "healthy-maid-service", "eco-healthy-housekeeping"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "cleaning",
        dataSource: "slug_inference",
      });
    }
  });

  it("does not mistake a 'Beautyrest' mattress retailer for salon keywords (category-substring-collision-audit-06)", () => {
    // Bare "beauty" previously matched inside "beautyrest" (a mattress
    // brand) — this slug has no other category keyword ("outlet" is not a
    // retail keyword), so it must fall through to generic rather than salon.
    expect(resolvePreviewLead("beautyrest-mattress-outlet")).toMatchObject({
      category: "generic",
      dataSource: "slug_inference",
    });
  });

  it("still routes plain 'roofing'/'roofer' businesses to trades (category-substring-collision-audit-05 regression)", () => {
    // The roof fix above is left-boundary-only specifically to preserve this
    // suffix-attached match — see hairston-roofing-llc above for the salon
    // side of the same slug.
    for (const slug of ["citywide-roofing-experts", "the-local-roofer"]) {
      expect(resolvePreviewLead(slug)).toMatchObject({
        category: "trades",
        recommendedTier: "starter",
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
