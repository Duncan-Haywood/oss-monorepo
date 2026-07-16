import { describe, expect, it } from "vitest";
import {
  MAX_BUSINESS_NAME_LENGTH,
  MAX_SERVICES,
  MAX_SERVICE_ITEM_LENGTH,
} from "@/lib/leads/create-fields";
import {
  MAX_MARKETING_CONTENT_TYPES_PER_REQUEST,
  MAX_MARKETING_GENERATE_LEAD_ID_LENGTH,
  normalizeMarketingGenerateBusiness,
} from "./generate-limits";
import { MONTHLY_MARKETING_PACK_TYPES } from "./monthly-pack";

describe("marketing generate limits", () => {
  it("caps contentTypes at the sold monthly pack length", () => {
    expect(MAX_MARKETING_CONTENT_TYPES_PER_REQUEST).toBe(
      MONTHLY_MARKETING_PACK_TYPES.length,
    );
    expect(MAX_MARKETING_CONTENT_TYPES_PER_REQUEST).toBe(10);
  });

  it("keeps a finite leadId bound for the ad-hoc route", () => {
    expect(MAX_MARKETING_GENERATE_LEAD_ID_LENGTH).toBe(120);
  });

  it("soft-caps business strings and services before generate", () => {
    const normalized = normalizeMarketingGenerateBusiness({
      businessName: "A".repeat(MAX_BUSINESS_NAME_LENGTH + 40),
      category: "restaurant",
      city: "Austin",
      state: "TX",
      phone: "1".repeat(80),
      hours: "Mon–Fri 9–5 · Sat 10–2 with extra detail that should truncate",
      services: Array.from({ length: MAX_SERVICES + 12 }, (_, i) =>
        `service-${i}-${"x".repeat(MAX_SERVICE_ITEM_LENGTH)}`,
      ),
      tagline: "T".repeat(500),
      websiteUrl: `https://example.com/${"p".repeat(600)}`,
      tone: "friendly",
    });

    expect(normalized.businessName).toHaveLength(MAX_BUSINESS_NAME_LENGTH);
    expect(normalized.services).toHaveLength(MAX_SERVICES);
    expect(
      normalized.services.every((s) => s.length <= MAX_SERVICE_ITEM_LENGTH),
    ).toBe(true);
    expect(normalized.tagline?.length).toBeLessThanOrEqual(200);
    expect(normalized.websiteUrl?.length).toBeLessThanOrEqual(500);
    expect(normalized.tone).toBe("friendly");
  });

  it("falls back to a default service when all services trim empty", () => {
    const normalized = normalizeMarketingGenerateBusiness({
      businessName: "Demo Cafe",
      category: "restaurant",
      city: "Austin",
      services: ["  ", ""],
    });
    expect(normalized.services).toEqual(["our services"]);
  });
});
