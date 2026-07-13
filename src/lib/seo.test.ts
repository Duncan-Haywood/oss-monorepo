import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import { leadLocalBusinessJsonLd, leadMetaDescription, leadMetaTitle, safeJsonLdScript } from "./seo";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "pine-cafe",
    businessName: "Pine Cafe",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    address: "123 Main St",
    tagline: "Fresh local plates",
    description: "Neighborhood cafe",
    phone: "303-555-0100",
    email: "hello@pine.example",
    services: ["brunch", "coffee", "catering"],
    hours: { weekday: "7am–3pm", weekend: "8am–2pm" },
    stage: "paid",
    recommendedTier: "growth",
    ...overrides,
  };
}

describe("leadMetaTitle / leadMetaDescription", () => {
  it("composes title from businessName/city/state/tagline", () => {
    expect(leadMetaTitle(baseLead())).toBe("Pine Cafe — Boulder, CO | Fresh local plates");
  });

  it("uses description verbatim", () => {
    expect(leadMetaDescription(baseLead())).toBe("Neighborhood cafe");
  });
});

describe("leadLocalBusinessJsonLd", () => {
  it("maps category to the matching schema.org subtype", () => {
    expect(leadLocalBusinessJsonLd(baseLead({ category: "salon" }))["@type"]).toBe("HairSalon");
    expect(leadLocalBusinessJsonLd(baseLead({ category: "trades" }))["@type"]).toBe(
      "HomeAndConstructionBusiness",
    );
    expect(leadLocalBusinessJsonLd(baseLead({ category: "generic" }))["@type"]).toBe("LocalBusiness");
  });

  it("embeds lead identity and address fields", () => {
    const jsonLd = leadLocalBusinessJsonLd(baseLead());
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      name: "Pine Cafe",
      description: "Neighborhood cafe",
      telephone: "303-555-0100",
      address: {
        "@type": "PostalAddress",
        streetAddress: "123 Main St",
        addressLocality: "Boulder",
        addressRegion: "CO",
      },
    });
  });
});

describe("safeJsonLdScript", () => {
  it("round-trips a clean object unchanged through JSON.parse", () => {
    const jsonLd = leadLocalBusinessJsonLd(baseLead());
    expect(JSON.parse(safeJsonLdScript(jsonLd))).toEqual(jsonLd);
  });

  it("neutralizes a </script> breakout attempt in a free-text lead field", () => {
    const malicious = '</script><script>alert(document.cookie)</script>';
    const jsonLd = leadLocalBusinessJsonLd(baseLead({ businessName: malicious }));
    const serialized = safeJsonLdScript(jsonLd);

    expect(serialized).not.toContain("</script>");
    expect(serialized.toLowerCase()).not.toContain("<script");
    // The escaped payload still decodes back to the exact original string.
    expect(JSON.parse(serialized).name).toBe(malicious);
  });

  it("neutralizes a breakout attempt in a scraped/CSV address field", () => {
    const malicious = '</script><img src=x onerror=alert(1)>';
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
