import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import {
  leadOgImageAccentHex,
  planLeadOgImageResponse,
  truncateForOgImage,
} from "./lead-preview-image";

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

describe("truncateForOgImage", () => {
  it("returns the value unchanged when within the limit", () => {
    expect(truncateForOgImage("Pine Cafe", 48)).toBe("Pine Cafe");
  });

  it("truncates and appends an ellipsis when over the limit", () => {
    const result = truncateForOgImage(
      "A Very Long Business Name That Would Never Fit On A Card",
      20,
    );
    expect(result.length).toBe(20);
    expect(result.endsWith("…")).toBe(true);
    expect(result).toBe("A Very Long Busines…");
  });

  it("trims trailing whitespace before the ellipsis", () => {
    expect(truncateForOgImage("Word boundary cut here", 14)).toBe(
      "Word boundary…",
    );
  });

  it("handles a limit of zero without throwing", () => {
    expect(truncateForOgImage("anything", 0)).toBe("…");
  });
});

describe("leadOgImageAccentHex", () => {
  it("returns a distinct hex color per category", () => {
    const restaurant = leadOgImageAccentHex("restaurant");
    const salon = leadOgImageAccentHex("salon");
    const trades = leadOgImageAccentHex("trades");
    const retail = leadOgImageAccentHex("retail");
    const health = leadOgImageAccentHex("health");
    const automotive = leadOgImageAccentHex("automotive");
    const cleaning = leadOgImageAccentHex("cleaning");
    const fitness = leadOgImageAccentHex("fitness");
    const legal = leadOgImageAccentHex("legal");
    const generic = leadOgImageAccentHex("generic");
    const values = new Set([restaurant, salon, trades, retail, health, automotive, cleaning, fitness, legal, generic]);
    expect(values.size).toBe(10);
    for (const hex of values) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("planLeadOgImageResponse", () => {
  it("checks the rate limit before ever calling loadLead", async () => {
    let loadLeadCalled = false;
    const plan = await planLeadOgImageResponse("pine-cafe", "1.2.3.4", {
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
    const plan = await planLeadOgImageResponse("missing-slug", "1.2.3.4", {
      loadLead: async () => null,
      checkRateLimit: () => ({ allowed: true, remaining: 19, retryAfterSeconds: 0 }),
    });
    expect(plan).toEqual({ kind: "not_found" });
  });

  it("returns the lead when the rate limit passes and a lead resolves", async () => {
    const lead = baseLead({ slug: "pine-cafe" });
    const plan = await planLeadOgImageResponse("pine-cafe", "1.2.3.4", {
      loadLead: async () => lead,
      checkRateLimit: () => ({ allowed: true, remaining: 19, retryAfterSeconds: 0 }),
    });
    expect(plan).toEqual({ kind: "lead", lead });
  });

  it("keys the rate limit bucket by clientIp, not by slug", async () => {
    const seenKeys: string[] = [];
    await planLeadOgImageResponse("slug-a", "9.9.9.9", {
      loadLead: async () => null,
      checkRateLimit: (key) => {
        seenKeys.push(key);
        return { allowed: true, remaining: 19, retryAfterSeconds: 0 };
      },
    });
    await planLeadOgImageResponse("slug-b", "9.9.9.9", {
      loadLead: async () => null,
      checkRateLimit: (key) => {
        seenKeys.push(key);
        return { allowed: true, remaining: 19, retryAfterSeconds: 0 };
      },
    });
    expect(seenKeys).toEqual(["preview-og-image:9.9.9.9", "preview-og-image:9.9.9.9"]);
  });
});
