import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import {
  MAX_BUSINESS_NAME_LENGTH,
  MAX_CITY_LENGTH,
  MAX_HOURS_SEGMENT_LENGTH,
  MAX_SERVICE_ITEM_LENGTH,
  MAX_SERVICES,
  MAX_TAGLINE_LENGTH,
} from "@/lib/leads/create-fields";
import { MAX_PACK_BUSINESS_HOURS_LENGTH } from "./generate-limits";
import { MONTHLY_MARKETING_PACK_TYPES } from "./monthly-pack";
import {
  businessContextFromLead,
  monthlyPackRequestForLead,
} from "./build-request";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "pine-cafe",
    businessName: "Pine Cafe",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
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

describe("businessContextFromLead", () => {
  it("maps lead identity and services into BusinessContext", () => {
    const ctx = businessContextFromLead(baseLead());
    expect(ctx).toEqual({
      businessName: "Pine Cafe",
      category: "restaurant",
      city: "Boulder",
      state: "CO",
      phone: "303-555-0100",
      hours: "Weekdays 7am–3pm; Weekends 8am–2pm",
      services: ["brunch", "coffee", "catering"],
      tagline: "Fresh local plates",
      websiteUrl: undefined,
      tone: "friendly",
    });
  });

  it("falls back to our services when the lead has no services", () => {
    const ctx = businessContextFromLead(baseLead({ services: [] }));
    expect(ctx.services).toEqual(["our services"]);
  });

  it("omits hours when weekday and weekend are both empty", () => {
    const ctx = businessContextFromLead(
      baseLead({ hours: { weekday: "", weekend: "" } }),
    );
    expect(ctx.hours).toBeUndefined();
  });

  it("uses by appointment when only one hours side is set", () => {
    expect(
      businessContextFromLead(
        baseLead({ hours: { weekday: "9am–5pm", weekend: "" } }),
      ).hours,
    ).toBe("Weekdays 9am–5pm; Weekends by appointment");
    expect(
      businessContextFromLead(
        baseLead({ hours: { weekday: "", weekend: "10am–2pm" } }),
      ).hours,
    ).toBe("Weekdays by appointment; Weekends 10am–2pm");
  });

  it("omits empty optional state, phone, and tagline", () => {
    const ctx = businessContextFromLead(
      baseLead({ state: "", phone: "", tagline: "" }),
    );
    expect(ctx.state).toBeUndefined();
    expect(ctx.phone).toBeUndefined();
    expect(ctx.tagline).toBeUndefined();
  });

  it("soft-caps oversize lead fields like normalizeMarketingGenerateBusiness", () => {
    const weekday = "W".repeat(MAX_HOURS_SEGMENT_LENGTH);
    const weekend = "E".repeat(MAX_HOURS_SEGMENT_LENGTH);
    const ctx = businessContextFromLead(
      baseLead({
        businessName: "A".repeat(MAX_BUSINESS_NAME_LENGTH + 40),
        city: "C".repeat(MAX_CITY_LENGTH + 10),
        tagline: "T".repeat(MAX_TAGLINE_LENGTH + 10),
        services: [
          "S".repeat(MAX_SERVICE_ITEM_LENGTH + 5),
          ...Array.from({ length: MAX_SERVICES + 3 }, (_, i) => `svc-${i}`),
        ],
        hours: { weekday, weekend },
      }),
    );
    expect(ctx.businessName).toHaveLength(MAX_BUSINESS_NAME_LENGTH);
    expect(ctx.city).toHaveLength(MAX_CITY_LENGTH);
    expect(ctx.tagline).toHaveLength(MAX_TAGLINE_LENGTH);
    expect(ctx.services).toHaveLength(MAX_SERVICES);
    expect(ctx.services[0]).toHaveLength(MAX_SERVICE_ITEM_LENGTH);
    expect(ctx.hours).toBe(`Weekdays ${weekday}; Weekends ${weekend}`);
    expect(ctx.hours).toHaveLength(MAX_PACK_BUSINESS_HOURS_LENGTH);
  });

  it("retains weekend hours when both CRM segments are at create-path max", () => {
    const weekday = "W".repeat(MAX_HOURS_SEGMENT_LENGTH);
    const weekend = "E".repeat(MAX_HOURS_SEGMENT_LENGTH);
    const ctx = businessContextFromLead(
      baseLead({ hours: { weekday, weekend } }),
    );
    expect(ctx.hours).toContain(`Weekends ${weekend}`);
    expect(ctx.hours?.endsWith(weekend)).toBe(true);
  });
});

describe("monthlyPackRequestForLead", () => {
  it("builds a growth request with social_email + generate_schedule", () => {
    const { request, packageTier } = monthlyPackRequestForLead(baseLead(), {
      orderTier: "growth",
    });
    expect(packageTier).toBe("social_email");
    expect(request.leadId).toBe("pine-cafe");
    expect(request.contentTypes).toEqual([...MONTHLY_MARKETING_PACK_TYPES]);
    expect(request.automationLevel).toBe("generate_schedule");
    expect(request.approvalMode).toBe("optional");
    expect(request.business.businessName).toBe("Pine Cafe");
  });

  it("builds a complete request with full_marketing + generate_schedule_optimize", () => {
    const { request, packageTier } = monthlyPackRequestForLead(baseLead(), {
      orderTier: "complete",
    });
    expect(packageTier).toBe("full_marketing");
    expect(request.automationLevel).toBe("generate_schedule_optimize");
  });

  it("honors an explicit automationLevel override", () => {
    const { request, packageTier } = monthlyPackRequestForLead(baseLead(), {
      orderTier: "complete",
      automationLevel: "generate_only",
    });
    expect(packageTier).toBe("full_marketing");
    expect(request.automationLevel).toBe("generate_only");
  });

  it("copies MONTHLY_MARKETING_PACK_TYPES without sharing the readonly array", () => {
    const { request } = monthlyPackRequestForLead(baseLead(), {
      orderTier: "growth",
    });
    expect(request.contentTypes).toEqual([...MONTHLY_MARKETING_PACK_TYPES]);
    expect(request.contentTypes).not.toBe(MONTHLY_MARKETING_PACK_TYPES);
  });
});
