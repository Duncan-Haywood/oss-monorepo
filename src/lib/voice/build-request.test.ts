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
import { CLIENT_VOICE_FAQ_SCRIPT_TYPES } from "./faq-pack";
import {
  clientVoiceBusinessContextFromLead,
  clientVoicePackRequestForLead,
} from "./build-request";

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "summit-plumbing",
    businessName: "Summit Plumbing",
    category: "trades",
    city: "Denver",
    state: "CO",
    tagline: "Fast local fixes",
    description: "Residential plumbing",
    phone: "303-555-0199",
    email: "hello@summit.example",
    services: ["drain cleaning", "water heaters", "emergency repair"],
    hours: { weekday: "8am–6pm", weekend: "9am–1pm" },
    stage: "paid",
    recommendedTier: "complete",
    ...overrides,
  };
}

describe("clientVoiceBusinessContextFromLead", () => {
  it("maps lead fields into the voice business context", () => {
    const ctx = clientVoiceBusinessContextFromLead(baseLead());
    expect(ctx).toEqual({
      businessName: "Summit Plumbing",
      category: "trades",
      city: "Denver",
      state: "CO",
      phone: "303-555-0199",
      hours: "Weekdays 8am–6pm; Weekends 9am–1pm",
      services: ["drain cleaning", "water heaters", "emergency repair"],
      tagline: "Fast local fixes",
      tone: "friendly",
    });
  });

  it("defaults empty services to our services so generators always have copy fodder", () => {
    const ctx = clientVoiceBusinessContextFromLead(baseLead({ services: [] }));
    expect(ctx.services).toEqual(["our services"]);
  });

  it("omits hours when both weekday and weekend are empty", () => {
    const ctx = clientVoiceBusinessContextFromLead(
      baseLead({ hours: { weekday: "", weekend: "" } }),
    );
    expect(ctx.hours).toBeUndefined();
  });

  it("fills by appointment when only one hours side is set", () => {
    expect(
      clientVoiceBusinessContextFromLead(
        baseLead({ hours: { weekday: "9am–5pm", weekend: "" } }),
      ).hours,
    ).toBe("Weekdays 9am–5pm; Weekends by appointment");
    expect(
      clientVoiceBusinessContextFromLead(
        baseLead({ hours: { weekday: "", weekend: "10am–2pm" } }),
      ).hours,
    ).toBe("Weekdays by appointment; Weekends 10am–2pm");
  });

  it("omits optional empty state, phone, and tagline", () => {
    const ctx = clientVoiceBusinessContextFromLead(
      baseLead({ state: "", phone: "", tagline: "" }),
    );
    expect(ctx.state).toBeUndefined();
    expect(ctx.phone).toBeUndefined();
    expect(ctx.tagline).toBeUndefined();
  });

  it("soft-caps oversize lead fields like normalizeMarketingGenerateBusiness", () => {
    const ctx = clientVoiceBusinessContextFromLead(
      baseLead({
        businessName: "A".repeat(MAX_BUSINESS_NAME_LENGTH + 40),
        city: "C".repeat(MAX_CITY_LENGTH + 10),
        tagline: "T".repeat(MAX_TAGLINE_LENGTH + 10),
        services: [
          "S".repeat(MAX_SERVICE_ITEM_LENGTH + 5),
          ...Array.from({ length: MAX_SERVICES + 3 }, (_, i) => `svc-${i}`),
        ],
        hours: {
          weekday: "W".repeat(MAX_HOURS_SEGMENT_LENGTH),
          weekend: "E".repeat(MAX_HOURS_SEGMENT_LENGTH),
        },
      }),
    );
    expect(ctx.businessName).toHaveLength(MAX_BUSINESS_NAME_LENGTH);
    expect(ctx.city).toHaveLength(MAX_CITY_LENGTH);
    expect(ctx.tagline).toHaveLength(MAX_TAGLINE_LENGTH);
    expect(ctx.services).toHaveLength(MAX_SERVICES);
    expect(ctx.services[0]).toHaveLength(MAX_SERVICE_ITEM_LENGTH);
    expect(ctx.hours).toHaveLength(MAX_HOURS_SEGMENT_LENGTH);
  });
});

describe("clientVoicePackRequestForLead", () => {
  it("builds a GenerateClientVoiceRequest with the stable FAQ script set", () => {
    const request = clientVoicePackRequestForLead(baseLead());
    expect(request.leadId).toBe("summit-plumbing");
    expect(request.scriptTypes).toEqual([...CLIENT_VOICE_FAQ_SCRIPT_TYPES]);
    expect(request.scriptTypes).toHaveLength(6);
    expect(request.business.businessName).toBe("Summit Plumbing");
    expect(request.business.tone).toBe("friendly");
  });

  it("propagates empty-services and empty-hours edge defaults into the request", () => {
    const request = clientVoicePackRequestForLead(
      baseLead({
        services: [],
        hours: { weekday: "", weekend: "" },
        state: "",
      }),
    );
    expect(request.business.services).toEqual(["our services"]);
    expect(request.business.hours).toBeUndefined();
    expect(request.business.state).toBeUndefined();
  });
});
