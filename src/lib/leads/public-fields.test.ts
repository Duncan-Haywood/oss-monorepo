import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_SERVICE_ITEM_LENGTH,
  MAX_SERVICES,
  MAX_TAGLINE_LENGTH,
} from "@/lib/leads/create-fields";
import {
  softCapLeadDescription,
  softCapLeadForPublicSurface,
} from "@/lib/leads/public-fields";
import type { Lead } from "@/lib/leads/types";

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
    email: "hello@pine.test",
    services: ["Brunch", "Coffee"],
    hours: { weekday: "7am–3pm", weekend: "8am–2pm" },
    stage: "discovered",
    recommendedTier: "starter",
    dataSource: "demo_catalog",
    ...overrides,
  };
}

describe("softCapLeadDescription", () => {
  it("returns short descriptions unchanged", () => {
    expect(softCapLeadDescription("Short")).toBe("Short");
  });

  it("truncates over MAX_DESCRIPTION_LENGTH", () => {
    const oversized = "d".repeat(MAX_DESCRIPTION_LENGTH + 50);
    expect(softCapLeadDescription(oversized)).toHaveLength(MAX_DESCRIPTION_LENGTH);
  });
});

describe("softCapLeadForPublicSurface", () => {
  it("leaves create-path-max fields unchanged", () => {
    const lead = baseLead();
    expect(softCapLeadForPublicSurface(lead)).toEqual(lead);
  });

  it("soft-caps description, tagline, and services for pre-cap rows", () => {
    const capped = softCapLeadForPublicSurface(
      baseLead({
        description: "d".repeat(MAX_DESCRIPTION_LENGTH + 10),
        tagline: "t".repeat(MAX_TAGLINE_LENGTH + 10),
        services: [
          "s".repeat(MAX_SERVICE_ITEM_LENGTH + 5),
          ...Array.from({ length: MAX_SERVICES + 3 }, (_, i) => `svc-${i}`),
        ],
      }),
    );
    expect(capped.description).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(capped.tagline).toHaveLength(MAX_TAGLINE_LENGTH);
    expect(capped.services).toHaveLength(MAX_SERVICES);
    expect(capped.services[0]).toHaveLength(MAX_SERVICE_ITEM_LENGTH);
  });

  it("preserves slug/stage/tier and optional absence of address/email", () => {
    const capped = softCapLeadForPublicSurface(
      baseLead({ address: undefined, email: undefined, stage: "paid" }),
    );
    expect(capped.slug).toBe("pine-cafe");
    expect(capped.stage).toBe("paid");
    expect(capped.address).toBeUndefined();
    expect(capped.email).toBeUndefined();
  });

  it("strips dashboard-only notes and the Stripe Connect account id", () => {
    const capped = softCapLeadForPublicSurface(
      baseLead({
        notes: "Called 2026-07-10, wants a discount — do not lowball.",
        stripeConnectAccountId: "acct_1Example000000",
      }),
    );
    expect(capped).not.toHaveProperty("notes");
    expect(capped).not.toHaveProperty("stripeConnectAccountId");
    expect(JSON.stringify(capped)).not.toContain("acct_1Example000000");
  });
});
