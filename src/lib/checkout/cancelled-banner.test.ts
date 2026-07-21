import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import { cancelledCheckoutBanner } from "./cancelled-banner";

function stubLead(slug: string): Lead {
  return {
    slug,
    businessName: "Stub Biz",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    address: "",
    tagline: "",
    description: "",
    phone: "",
    email: "owner@example.com",
    services: [],
    hours: { weekday: "", weekend: "" },
    stage: "discovered",
    recommendedTier: "growth",
    dataSource: "demo_catalog",
  };
}

describe("cancelledCheckoutBanner", () => {
  it("omits the preview link when no lead resolved (organic / unknown slug)", () => {
    expect(cancelledCheckoutBanner(null)).toEqual({ kind: "no_preview" });
  });

  it("links to the real lead's preview path when a lead resolved", () => {
    expect(cancelledCheckoutBanner(stubLead("serene-salon"))).toEqual({
      kind: "with_preview",
      previewPath: "/preview/serene-salon",
    });
  });

  it("never surfaces a synthetic organic-* slug as a preview link", () => {
    // The organic-<hex> slug minted at Checkout Session create (see
    // organic-attribution.ts) never has a corresponding CRM lead — this
    // asserts the banner can only ever show a preview link when a real
    // lead was resolved, never merely because *some* slug string exists.
    expect(cancelledCheckoutBanner(null)).not.toHaveProperty("previewPath");
  });
});
