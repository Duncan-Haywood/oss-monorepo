import { describe, expect, it } from "vitest";
import {
  MAX_BUSINESS_NAME_LENGTH,
  MAX_HOURS_SEGMENT_LENGTH,
  MAX_SERVICES,
  MAX_SERVICE_ITEM_LENGTH,
} from "@/lib/leads/create-fields";
import {
  formatPackBusinessHours,
  MAX_MARKETING_CONTENT_TYPES_PER_REQUEST,
  MAX_MARKETING_GENERATE_LEAD_ID_LENGTH,
  MAX_PACK_BUSINESS_HOURS_LENGTH,
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

  it("sizes the joined pack hours ceiling from two create-path segments", () => {
    expect(MAX_PACK_BUSINESS_HOURS_LENGTH).toBe(
      "Weekdays ".length +
        MAX_HOURS_SEGMENT_LENGTH +
        "; Weekends ".length +
        MAX_HOURS_SEGMENT_LENGTH,
    );
  });

  it("soft-caps business strings and services before generate", () => {
    const normalized = normalizeMarketingGenerateBusiness({
      businessName: "A".repeat(MAX_BUSINESS_NAME_LENGTH + 40),
      category: "restaurant",
      city: "Austin",
      state: "TX",
      phone: "1".repeat(80),
      hours: "H".repeat(MAX_PACK_BUSINESS_HOURS_LENGTH + 40),
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
    expect(normalized.hours).toHaveLength(MAX_PACK_BUSINESS_HOURS_LENGTH);
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

describe("formatPackBusinessHours", () => {
  it("returns undefined when both segments are empty", () => {
    expect(formatPackBusinessHours({ weekday: "", weekend: "" })).toBeUndefined();
  });

  it("soft-caps each CRM segment before join so weekend survives", () => {
    const weekday = "W".repeat(MAX_HOURS_SEGMENT_LENGTH + 20);
    const weekend = "E".repeat(MAX_HOURS_SEGMENT_LENGTH + 20);
    const joined = formatPackBusinessHours({ weekday, weekend });
    expect(joined).toBe(
      `Weekdays ${"W".repeat(MAX_HOURS_SEGMENT_LENGTH)}; Weekends ${"E".repeat(MAX_HOURS_SEGMENT_LENGTH)}`,
    );
    expect(joined).toHaveLength(MAX_PACK_BUSINESS_HOURS_LENGTH);
  });

  it("fills by appointment when only one side is set", () => {
    expect(formatPackBusinessHours({ weekday: "9am–5pm", weekend: "" })).toBe(
      "Weekdays 9am–5pm; Weekends by appointment",
    );
    expect(formatPackBusinessHours({ weekday: "", weekend: "10am–2pm" })).toBe(
      "Weekdays by appointment; Weekends 10am–2pm",
    );
  });
});
