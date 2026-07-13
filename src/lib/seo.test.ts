import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import {
  leadLocalBusinessJsonLd,
  leadMetaDescription,
  leadMetaTitle,
  previewUrl,
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
    services: ["brunch", "coffee"],
    hours: { weekday: "7am–3pm", weekend: "8am–2pm" },
    stage: "paid",
    recommendedTier: "starter",
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
    expect(leadMetaDescription(baseLead())).toBe(
      "Neighborhood cafe serving brunch and coffee.",
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
    expect(
      (jsonLd.address as Record<string, unknown>).streetAddress,
    ).toBeUndefined();
  });
});
