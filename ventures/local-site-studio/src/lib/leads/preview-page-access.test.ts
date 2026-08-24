import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import { PREVIEW_PAGE_RATE_LIMIT, planPreviewPageAccess } from "./preview-page-access";

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

describe("planPreviewPageAccess", () => {
  it("checks the rate limit before ever calling loadLead", async () => {
    let loadLeadCalled = false;
    const plan = await planPreviewPageAccess("pine-cafe", "1.2.3.4", {
      loadLead: async () => {
        loadLeadCalled = true;
        return baseLead();
      },
      checkRateLimit: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 30 }),
    });
    expect(plan).toEqual({ kind: "rate_limited" });
    expect(loadLeadCalled).toBe(false);
  });

  it("returns not_found when the rate limit passes but no lead resolves", async () => {
    const plan = await planPreviewPageAccess("missing-slug", "1.2.3.4", {
      loadLead: async () => null,
      checkRateLimit: () => ({ allowed: true, remaining: 39, retryAfterSeconds: 0 }),
    });
    expect(plan).toEqual({ kind: "not_found" });
  });

  it("returns the lead when the rate limit passes and a lead resolves", async () => {
    const lead = baseLead({ slug: "pine-cafe" });
    const plan = await planPreviewPageAccess("pine-cafe", "1.2.3.4", {
      loadLead: async () => lead,
      checkRateLimit: () => ({ allowed: true, remaining: 39, retryAfterSeconds: 0 }),
    });
    expect(plan).toEqual({ kind: "ok", lead });
  });

  it("keys the rate limit bucket by clientIp, not by slug, and uses PREVIEW_PAGE_RATE_LIMIT", async () => {
    const seenArgs: Array<[string, unknown]> = [];
    await planPreviewPageAccess("slug-a", "9.9.9.9", {
      loadLead: async () => null,
      checkRateLimit: (key, config) => {
        seenArgs.push([key, config]);
        return { allowed: true, remaining: 39, retryAfterSeconds: 0 };
      },
    });
    await planPreviewPageAccess("slug-b", "9.9.9.9", {
      loadLead: async () => null,
      checkRateLimit: (key, config) => {
        seenArgs.push([key, config]);
        return { allowed: true, remaining: 39, retryAfterSeconds: 0 };
      },
    });
    expect(seenArgs).toEqual([
      ["preview-page:9.9.9.9", PREVIEW_PAGE_RATE_LIMIT],
      ["preview-page:9.9.9.9", PREVIEW_PAGE_RATE_LIMIT],
    ]);
  });

  it("sets a rate limit double DEFAULT_RATE_LIMIT to absorb the two-invocation-per-view cost", () => {
    expect(PREVIEW_PAGE_RATE_LIMIT).toEqual({ limit: 40, windowMs: 60_000 });
  });
});
