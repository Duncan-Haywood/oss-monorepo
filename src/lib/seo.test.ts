import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import {
  isLeadPreviewIndexable,
  leadLocalBusinessJsonLd,
  leadMetaDescription,
  leadMetaTitle,
  previewUrl,
  safeJsonLdScript,
  siteUrl,
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
});

describe("leadMetaTitle / leadMetaDescription", () => {
  it("formats the title as 'Business — City, State | Tagline'", () => {
    expect(leadMetaTitle(baseLead())).toBe("Pine Cafe — Boulder, CO | Fresh local plates");
  });

  it("returns the lead description verbatim", () => {
    expect(leadMetaDescription(baseLead())).toBe("Neighborhood cafe serving brunch and coffee.");
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
