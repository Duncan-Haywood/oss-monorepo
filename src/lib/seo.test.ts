import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DOCS_PAGES } from "@/lib/docs/routes";
import { CATEGORY_LANDING_PAGES } from "@/lib/marketing/category-landing";
import { BUNDLES, bundlePriceHeadingLabel, minBundleSetupPriceUsd } from "@/lib/pricing/bundles";
import type { CommerceSku } from "@/lib/commerce/types";
import type { Lead } from "@/lib/leads/types";
import {
  categoryLandingPageMetadata,
  categoryLandingServiceJsonLd,
  docPageMetadata,
  homepageMetadata,
  homepageOrganizationJsonLd,
  isLeadPreviewIndexable,
  leadLocalBusinessJsonLd,
  leadMetaDescription,
  leadMetaTitle,
  leadPreviewJsonLdIfIndexable,
  MAX_META_DESCRIPTION_LENGTH,
  MAX_META_TITLE_LENGTH,
  previewUrl,
  safeJsonLdScript,
  siteUrl,
  staticPageMetadata,
} from "./seo";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "pine-cafe",
    businessName: "Pine Cafe",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    address: "123 Main St",
    tagline: "Fresh local plates",
    description: "Neighborhood cafe serving brunch and coffee.",
    phone: "303-555-0100",
    email: "hello@pine.example",
    services: ["brunch", "coffee", "catering"],
    hours: { weekday: "7am–3pm", weekend: "8am–2pm" },
    stage: "paid",
    recommendedTier: "growth",
    ...overrides,
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.VERCEL_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("siteUrl", () => {
  it("falls back to localhost when neither env var is set", () => {
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("prefers NEXT_PUBLIC_APP_URL and strips a trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    expect(siteUrl()).toBe("https://app.example.com");
  });

  it("leaves a NEXT_PUBLIC_APP_URL without a trailing slash untouched", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    expect(siteUrl()).toBe("https://app.example.com");
  });

  it("falls back to VERCEL_URL (https-prefixed) when NEXT_PUBLIC_APP_URL is unset", () => {
    process.env.VERCEL_URL = "my-deployment.vercel.app";
    expect(siteUrl()).toBe("https://my-deployment.vercel.app");
  });

  it("prefers NEXT_PUBLIC_APP_URL over VERCEL_URL when both are set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.VERCEL_URL = "my-deployment.vercel.app";
    expect(siteUrl()).toBe("https://app.example.com");
  });

  it("treats a whitespace-only NEXT_PUBLIC_APP_URL as unset and falls through to VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "   ";
    process.env.VERCEL_URL = "my-deployment.vercel.app";
    expect(siteUrl()).toBe("https://my-deployment.vercel.app");
  });

  it("treats a whitespace-only VERCEL_URL as unset and falls back to localhost", () => {
    process.env.VERCEL_URL = "   ";
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("previewUrl", () => {
  it("builds an absolute preview URL from siteUrl + slug", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    expect(previewUrl("pine-cafe")).toBe("https://app.example.com/preview/pine-cafe");
  });

  it("uses the localhost fallback when no site URL env var is configured", () => {
    expect(previewUrl("pine-cafe")).toBe("http://localhost:3000/preview/pine-cafe");
  });

  it("encodes path-breaking slugs into a single path segment", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    expect(previewUrl("evil/../../dashboard")).toBe(
      "https://app.example.com/preview/evil%2F..%2F..%2Fdashboard",
    );
  });
});

describe("homepageMetadata", () => {
  it("sets canonical + openGraph + twitter using the configured site URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const metadata = homepageMetadata();
    expect(metadata.alternates).toEqual({ canonical: "https://app.example.com" });
    expect(metadata.openGraph).toMatchObject({
      title: metadata.title,
      description: metadata.description,
      url: "https://app.example.com",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary",
      title: metadata.title,
      description: metadata.description,
    });
  });

  it("falls back to the localhost site URL when no env var is configured", () => {
    const metadata = homepageMetadata();
    expect(metadata.alternates).toEqual({ canonical: "http://localhost:3000" });
    expect(metadata.openGraph).toMatchObject({ url: "http://localhost:3000" });
  });

  it("uses the brand name in title, description, and openGraph siteName", () => {
    process.env.NEXT_PUBLIC_BRAND_NAME = "Acme Sites";
    const metadata = homepageMetadata();
    expect(metadata.title).toContain("Acme Sites");
    expect(metadata.description).toContain("Acme Sites");
    expect(metadata.openGraph).toMatchObject({ siteName: "Acme Sites" });
  });

  it("quotes minBundleSetupPriceUsd(), not a hardcoded figure, so a bundle price change can't leave this Google-snippet/social-unfurl description advertising a stale number", () => {
    const metadata = homepageMetadata();
    expect(metadata.description).toContain(`pay $${minBundleSetupPriceUsd()}, go live`);
  });

  it("sets metadataBase from the configured site URL, required for opengraph-image/twitter-image file-convention images to resolve to an absolute URL instead of a hardcoded localhost fallback", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const metadata = homepageMetadata();
    expect(metadata.metadataBase).toEqual(new URL("https://app.example.com"));
  });

  it("falls back metadataBase to localhost when no env var is configured", () => {
    const metadata = homepageMetadata();
    expect(metadata.metadataBase).toEqual(new URL("http://localhost:3000"));
  });

  it("falls back metadataBase to localhost instead of throwing when NEXT_PUBLIC_APP_URL is set but not a parseable URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not-a-valid-url no scheme";
    expect(() => homepageMetadata()).not.toThrow();
    const metadata = homepageMetadata();
    expect(metadata.metadataBase).toEqual(new URL("http://localhost:3000"));
  });

  it("caps the description at MAX_META_DESCRIPTION_LENGTH even with a realistic long operator-set brand name/legal entity/location — the description is built from unbounded env vars, not hardcoded copy, so it has no length guarantee upstream", () => {
    process.env.NEXT_PUBLIC_BRAND_NAME = "Rocky Mountain Web Design & Digital Marketing Studio";
    process.env.NEXT_PUBLIC_LEGAL_ENTITY = "Rocky Mountain Web Design and Digital Marketing Studio LLC";
    process.env.NEXT_PUBLIC_LEGAL_LOCATION = "Denver, Colorado, USA";
    const metadata = homepageMetadata();
    expect(metadata.description?.length).toBeLessThanOrEqual(MAX_META_DESCRIPTION_LENGTH);
    expect(metadata.description).toContain("Rocky Mountain Web Design");
  });

  it("caps the title at MAX_META_TITLE_LENGTH with a realistic long operator-set brand name — brand.name is unbounded, so a real long business name can push the title past Google's SERP-truncation width", () => {
    process.env.NEXT_PUBLIC_BRAND_NAME = "Rocky Mountain Web Design & Digital Marketing Studio";
    const untitled = `Rocky Mountain Web Design & Digital Marketing Studio — Pre-built websites for local businesses`;
    expect(untitled.length).toBeGreaterThan(MAX_META_TITLE_LENGTH);
    const metadata = homepageMetadata();
    expect(metadata.title?.toString().length).toBeLessThanOrEqual(MAX_META_TITLE_LENGTH);
    expect(metadata.title?.toString().endsWith("…")).toBe(true);
  });
});

describe("homepageOrganizationJsonLd", () => {
  it("builds a schema.org Organization object from brand + siteUrl", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.NEXT_PUBLIC_BRAND_NAME = "Acme Sites";
    process.env.NEXT_PUBLIC_LEGAL_ENTITY = "Acme Labs LLC";
    const jsonLd = homepageOrganizationJsonLd();
    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Acme Sites",
      legalName: "Acme Labs LLC",
      url: "https://app.example.com",
      email: jsonLd.email,
      makesOffer: jsonLd.makesOffer,
    });
  });

  it("includes a makesOffer entry per bundle tier, sourced from BUNDLES", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const jsonLd = homepageOrganizationJsonLd();
    expect(jsonLd.makesOffer).toEqual(
      BUNDLES.map((bundle) => ({
        "@type": "Offer",
        name: `${bundle.name} website package`,
        description: bundlePriceHeadingLabel(bundle),
        price: bundle.setupPriceUsd.toFixed(2),
        priceCurrency: "USD",
        url: "https://app.example.com/#pricing",
      })),
    );
  });

  it("falls back to brand defaults when no env vars are configured", () => {
    const jsonLd = homepageOrganizationJsonLd();
    expect(jsonLd.url).toBe("http://localhost:3000");
    expect(jsonLd.name).toBeTruthy();
    expect(jsonLd.legalName).toBeTruthy();
    expect(jsonLd.email).toBeTruthy();
  });

  it("omits postalAddress — its unset-env fallback is a bracketed placeholder, not real data", () => {
    const jsonLd = homepageOrganizationJsonLd();
    expect(jsonLd).not.toHaveProperty("address");
  });

  it("round-trips through safeJsonLdScript unescaped for non-malicious input", () => {
    const jsonLd = homepageOrganizationJsonLd();
    expect(JSON.parse(safeJsonLdScript(jsonLd))).toEqual(jsonLd);
  });
});

describe("staticPageMetadata", () => {
  it("builds a self-referential canonical/openGraph.url from siteUrl + path", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const metadata = staticPageMetadata({
      title: "Checkout — Acme",
      description: "Complete your purchase.",
      path: "/checkout",
    });
    expect(metadata.alternates).toEqual({ canonical: "https://app.example.com/checkout" });
    expect(metadata.openGraph).toMatchObject({
      title: "Checkout — Acme",
      description: "Complete your purchase.",
      url: "https://app.example.com/checkout",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary",
      title: "Checkout — Acme",
      description: "Complete your purchase.",
    });
  });

  it("never falls back to the bare site root for a non-empty path", () => {
    const metadata = staticPageMetadata({
      title: "T",
      description: "D",
      path: "/docs/legal",
    });
    expect(metadata.alternates).toEqual({
      canonical: "http://localhost:3000/docs/legal",
    });
  });

  it("passes a description at or under MAX_META_DESCRIPTION_LENGTH through unchanged", () => {
    const description = "Short and well under the SERP-truncation width.";
    const metadata = staticPageMetadata({ title: "T", description, path: "/x" });
    expect(metadata.description).toBe(description);
  });

  it("truncates an over-length description at a word boundary with an ellipsis, applied consistently to description/openGraph/twitter", () => {
    const description =
      "This description is deliberately long enough to exceed Google's SERP-truncation width so the cap must kick in and trim it back down to size before it reaches search results.";
    expect(description.length).toBeGreaterThan(MAX_META_DESCRIPTION_LENGTH);
    const metadata = staticPageMetadata({ title: "T", description, path: "/x" });
    expect(metadata.description?.length).toBeLessThanOrEqual(MAX_META_DESCRIPTION_LENGTH);
    expect(metadata.description?.endsWith("…")).toBe(true);
    expect(metadata.description?.endsWith(" …")).toBe(false);
    expect(description.startsWith(metadata.description?.slice(0, -1) ?? "")).toBe(true);
    expect(metadata.openGraph).toMatchObject({ description: metadata.description });
    expect(metadata.twitter).toMatchObject({ description: metadata.description });
  });

  it("passes a title at or under MAX_META_TITLE_LENGTH through unchanged", () => {
    const title = "Short title";
    const metadata = staticPageMetadata({ title, description: "D", path: "/x" });
    expect(metadata.title).toBe(title);
  });

  it("truncates an over-length title at a word boundary with an ellipsis, applied consistently to title/openGraph/twitter", () => {
    const title = "This title is deliberately long enough to exceed Google's SERP title-truncation width";
    expect(title.length).toBeGreaterThan(MAX_META_TITLE_LENGTH);
    const metadata = staticPageMetadata({ title, description: "D", path: "/x" });
    expect(metadata.title?.toString().length).toBeLessThanOrEqual(MAX_META_TITLE_LENGTH);
    expect(metadata.title?.toString().endsWith("…")).toBe(true);
    expect(metadata.openGraph).toMatchObject({ title: metadata.title });
    expect(metadata.twitter).toMatchObject({ title: metadata.title });
  });
});

describe("docPageMetadata", () => {
  it("sources title/description/canonical from the matching DOCS_PAGES entry", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const metadata = docPageMetadata("/docs/architecture");
    expect(metadata.title).toContain("Architecture");
    expect(metadata.description).toBe(
      "Automated funnel, voice agents, preview hosting, payments.",
    );
    expect(metadata.alternates).toEqual({
      canonical: "https://app.example.com/docs/architecture",
    });
    expect(metadata.openGraph).toMatchObject({
      url: "https://app.example.com/docs/architecture",
    });
  });

  it("throws on an href with no DOCS_PAGES entry rather than silently reusing the homepage identity", () => {
    expect(() => docPageMetadata("/docs/does-not-exist")).toThrow(
      /no DOCS_PAGES entry/,
    );
  });

  it("never falls back to the bare site root canonical for any docs page — a docs page's canonical must not point at the homepage (docs-canonical-self-reference-fix)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    for (const doc of DOCS_PAGES) {
      const metadata = docPageMetadata(doc.href);
      expect(metadata.alternates).toEqual({
        canonical: `https://app.example.com${doc.href}`,
      });
      expect(metadata.alternates).not.toEqual({ canonical: "https://app.example.com" });
    }
  });
});

describe("categoryLandingPageMetadata", () => {
  it("sources title/description/canonical from the page's own CATEGORY_LANDING_PAGES entry", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    for (const page of CATEGORY_LANDING_PAGES) {
      const metadata = categoryLandingPageMetadata(page);
      expect(metadata.title).toBe(page.seoTitle);
      expect(metadata.description).toBe(page.metaDescription);
      expect(metadata.alternates).toEqual({
        canonical: `https://app.example.com${page.href}`,
      });
    }
  });
});

describe("categoryLandingServiceJsonLd", () => {
  it("emits a Service schema naming the platform as provider, distinct from a client's LocalBusiness JSON-LD", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    for (const page of CATEGORY_LANDING_PAGES) {
      const jsonLd = categoryLandingServiceJsonLd(page);
      expect(jsonLd["@type"]).toBe("Service");
      expect(jsonLd.url).toBe(`https://app.example.com${page.href}`);
      expect(jsonLd.provider).toMatchObject({ "@type": "Organization" });
      // Round-trips through the same escaping helper every other JSON-LD site uses.
      expect(() => JSON.parse(safeJsonLdScript(jsonLd).replace(/\\u003c/g, "<"))).not.toThrow();
    }
  });
});

describe("leadMetaTitle / leadMetaDescription", () => {
  it("formats the title as 'Business — City, State | Tagline'", () => {
    expect(leadMetaTitle(baseLead())).toBe("Pine Cafe — Boulder, CO | Fresh local plates");
  });

  it("caps at MAX_META_TITLE_LENGTH (not the far longer create-path max) for a real client's long business name/tagline", () => {
    // businessName/tagline soft-cap at create-path max (200 chars each) for
    // on-page rendering, but the SERP title width is much narrower — this
    // must not leak an uncapped title into generateMetadata/openGraph/
    // twitter on a real customer's live preview page.
    const lead = baseLead({
      businessName: "The Rocky Mountain Neighborhood Bakery and Coffee House",
      tagline: "Serving fresh bread, pastries, and specialty coffee every day of the week",
    });
    const title = leadMetaTitle(lead);
    expect(title.length).toBeLessThanOrEqual(MAX_META_TITLE_LENGTH);
    expect(title.endsWith("…")).toBe(true);

    const oversized = baseLead({ businessName: "b".repeat(200), tagline: "t".repeat(200) });
    expect(leadMetaTitle(oversized)).toHaveLength(MAX_META_TITLE_LENGTH);
  });

  it("returns the lead description unchanged when it's already under the SERP-truncation width", () => {
    expect(leadMetaDescription(baseLead())).toBe("Neighborhood cafe serving brunch and coffee.");
  });

  it("caps at MAX_META_DESCRIPTION_LENGTH (not the far longer create-path max) for a real client's own long business description", () => {
    // A real client's stored description soft-caps at create-path max
    // (2000 chars) for on-page body rendering, but the SERP snippet width
    // is much narrower — this must not leak the full 2000 chars into
    // generateMetadata's description/openGraph/twitter on a real customer's
    // live preview page.
    const longDescription =
      "We are a family-owned neighborhood restaurant serving fresh, locally-sourced brunch and dinner every day of the week, with a full bar, patio seating, and weekly live music on Friday nights.";
    expect(longDescription.length).toBeGreaterThan(MAX_META_DESCRIPTION_LENGTH);
    const description = leadMetaDescription(baseLead({ description: longDescription }));
    expect(description.length).toBeLessThanOrEqual(MAX_META_DESCRIPTION_LENGTH);
    expect(description.endsWith("…")).toBe(true);

    const oversized = "d".repeat(2500);
    expect(leadMetaDescription(baseLead({ description: oversized }))).toHaveLength(
      MAX_META_DESCRIPTION_LENGTH,
    );
  });
});

describe("leadLocalBusinessJsonLd", () => {
  it("maps each BusinessCategory to its schema.org @type", () => {
    expect(leadLocalBusinessJsonLd(baseLead({ category: "restaurant" }))["@type"]).toBe(
      "Restaurant",
    );
    expect(leadLocalBusinessJsonLd(baseLead({ category: "salon" }))["@type"]).toBe("HairSalon");
    expect(leadLocalBusinessJsonLd(baseLead({ category: "trades" }))["@type"]).toBe(
      "HomeAndConstructionBusiness",
    );
    expect(leadLocalBusinessJsonLd(baseLead({ category: "retail" }))["@type"]).toBe("Store");
    expect(leadLocalBusinessJsonLd(baseLead({ category: "generic" }))["@type"]).toBe(
      "LocalBusiness",
    );
  });

  it("builds the full JSON-LD object with nested PostalAddress", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    expect(leadLocalBusinessJsonLd(baseLead())).toEqual({
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: "Pine Cafe",
      description: "Neighborhood cafe serving brunch and coffee.",
      url: "https://app.example.com/preview/pine-cafe",
      telephone: "303-555-0100",
      address: {
        "@type": "PostalAddress",
        streetAddress: "123 Main St",
        addressLocality: "Boulder",
        addressRegion: "CO",
      },
    });
  });

  it("passes an undefined streetAddress through when the lead has no address", () => {
    const jsonLd = leadLocalBusinessJsonLd(baseLead({ address: undefined }));
    expect((jsonLd.address as Record<string, unknown>).streetAddress).toBeUndefined();
  });

  it("omits hasOfferCatalog entirely when there are no Commerce catalog items", () => {
    const jsonLd = leadLocalBusinessJsonLd(baseLead());
    expect(jsonLd.hasOfferCatalog).toBeUndefined();
    expect(leadLocalBusinessJsonLd(baseLead(), { commerceItems: [] }).hasOfferCatalog).toBeUndefined();
  });

  it("attaches a schema.org OfferCatalog with one Offer per Commerce SKU", () => {
    const skus: CommerceSku[] = [
      { id: "sku-1", name: "Cold brew", description: "12oz can", priceCents: 499 },
      {
        id: "sku-2",
        name: "Loaf of bread",
        priceCents: 1250,
        stripeProductId: "prod_123",
        stripePriceId: "price_123",
      },
    ];
    const jsonLd = leadLocalBusinessJsonLd(baseLead(), { commerceItems: skus });
    expect(jsonLd.hasOfferCatalog).toEqual({
      "@type": "OfferCatalog",
      name: "Products",
      itemListElement: [
        {
          "@type": "Offer",
          itemOffered: { "@type": "Product", name: "Cold brew", description: "12oz can" },
          price: "4.99",
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          itemOffered: { "@type": "Product", name: "Loaf of bread", description: undefined },
          price: "12.50",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
      ],
    });
  });

  it("omits openingHoursSpecification when hours don't contain a recognizable day+time-range segment", () => {
    const jsonLd = leadLocalBusinessJsonLd(baseLead());
    expect(jsonLd.openingHoursSpecification).toBeUndefined();
  });

  it("attaches schema.org OpeningHoursSpecification entries parsed from hours", () => {
    const jsonLd = leadLocalBusinessJsonLd(
      baseLead({ hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat–Sun 8am–2pm" } }),
    );
    expect(jsonLd.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "https://schema.org/Monday",
          "https://schema.org/Tuesday",
          "https://schema.org/Wednesday",
          "https://schema.org/Thursday",
          "https://schema.org/Friday",
        ],
        opens: "07:00",
        closes: "15:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["https://schema.org/Saturday", "https://schema.org/Sunday"],
        opens: "08:00",
        closes: "14:00",
      },
    ]);
  });
});

describe("safeJsonLdScript", () => {
  it("round-trips a clean object unchanged through JSON.parse", () => {
    const jsonLd = leadLocalBusinessJsonLd(baseLead());
    expect(JSON.parse(safeJsonLdScript(jsonLd))).toEqual(jsonLd);
  });

  it("neutralizes a </script> breakout attempt in a free-text lead field", () => {
    const malicious = "</script><script>alert(document.cookie)</script>";
    const jsonLd = leadLocalBusinessJsonLd(baseLead({ businessName: malicious }));
    const serialized = safeJsonLdScript(jsonLd);

    expect(serialized).not.toContain("</script>");
    expect(serialized.toLowerCase()).not.toContain("<script");
    // The escaped payload still decodes back to the exact original string.
    expect(JSON.parse(serialized).name).toBe(malicious);
  });

  it("neutralizes a breakout attempt in a scraped/CSV address field", () => {
    const malicious = "</script><img src=x onerror=alert(1)>";
    const jsonLd = leadLocalBusinessJsonLd(baseLead({ address: malicious }));
    const serialized = safeJsonLdScript(jsonLd);

    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized).address.streetAddress).toBe(malicious);
  });

  it("leaves ordinary punctuation (apostrophes, ampersands) untouched aside from JSON escaping", () => {
    const jsonLd = leadLocalBusinessJsonLd(baseLead({ businessName: "Joe's Café & Grill" }));
    const serialized = safeJsonLdScript(jsonLd);
    expect(JSON.parse(serialized).name).toBe("Joe's Café & Grill");
  });

  it("neutralizes a breakout attempt in an operator-entered Commerce SKU name/description", () => {
    const malicious = "</script><script>alert(document.cookie)</script>";
    const skus: CommerceSku[] = [{ id: "sku-1", name: malicious, description: malicious, priceCents: 100 }];
    const jsonLd = leadLocalBusinessJsonLd(baseLead(), { commerceItems: skus });
    const serialized = safeJsonLdScript(jsonLd);

    expect(serialized).not.toContain("</script>");
    const parsed = JSON.parse(serialized);
    expect(parsed.hasOfferCatalog.itemListElement[0].itemOffered.name).toBe(malicious);
    expect(parsed.hasOfferCatalog.itemListElement[0].itemOffered.description).toBe(malicious);
  });
});

describe("isLeadPreviewIndexable", () => {
  it("always indexes curated demo showcases regardless of stage", () => {
    // A demo showcase deep-linked from marketing carries a prospect-y stage but
    // is still an intentional public sample.
    expect(
      isLeadPreviewIndexable(baseLead({ stage: "site_built" }), {
        isCuratedDemo: true,
      }),
    ).toBe(true);
  });

  it("indexes real customers who consented by buying or going live", () => {
    for (const stage of ["paid", "live"] as const) {
      expect(
        isLeadPreviewIndexable(baseLead({ stage }), { isCuratedDemo: false }),
      ).toBe(true);
    }
  });

  it("does NOT index cold-prospected / closed real leads (no consent)", () => {
    for (const stage of [
      "discovered",
      "site_built",
      "outreach_sent",
      "discovery_call",
      "closed",
    ] as const) {
      expect(
        isLeadPreviewIndexable(baseLead({ stage }), { isCuratedDemo: false }),
      ).toBe(false);
    }
  });
});

describe("leadPreviewJsonLdIfIndexable", () => {
  it("emits LocalBusiness JSON-LD for paid/live customers", () => {
    const lead = baseLead({ stage: "paid" });
    expect(leadPreviewJsonLdIfIndexable(lead, { isCuratedDemo: false })).toEqual(
      leadLocalBusinessJsonLd(lead),
    );
  });

  it("emits JSON-LD for curated demo showcases even at prospect stages", () => {
    const lead = baseLead({ stage: "site_built" });
    expect(leadPreviewJsonLdIfIndexable(lead, { isCuratedDemo: true })).toEqual(
      leadLocalBusinessJsonLd(lead),
    );
  });

  it("returns null for cold-prospected / closed leads (noindex twin)", () => {
    for (const stage of [
      "discovered",
      "site_built",
      "outreach_sent",
      "discovery_call",
      "closed",
    ] as const) {
      expect(
        leadPreviewJsonLdIfIndexable(baseLead({ stage }), { isCuratedDemo: false }),
      ).toBeNull();
    }
  });

  it("threads commerceItems through into hasOfferCatalog for an indexable lead", () => {
    const skus: CommerceSku[] = [{ id: "sku-1", name: "Cold brew", priceCents: 499 }];
    const lead = baseLead({ stage: "paid" });
    const jsonLd = leadPreviewJsonLdIfIndexable(lead, {
      isCuratedDemo: false,
      commerceItems: skus,
    });
    expect(jsonLd).toEqual(leadLocalBusinessJsonLd(lead, { commerceItems: skus }));
    expect(
      ((jsonLd as Record<string, unknown>).hasOfferCatalog as Record<string, unknown>)
        .itemListElement,
    ).toHaveLength(1);
  });
});
