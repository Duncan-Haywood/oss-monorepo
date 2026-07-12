import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import {
  CLIENT_VOICE_FAQ_SCRIPT_TYPES,
  isCompleteBundleTier,
  leadEligibleForClientVoicePack,
  listClientVoicePacksDue,
  scriptTypeLabel,
} from "./faq-pack";
import { clientVoicePackRequestForLead } from "./build-request";
import {
  getClientVoiceGenerator,
  resetClientVoiceGeneratorForTests,
  StubClientVoiceGenerator,
} from "./generators";

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

describe("eligibility", () => {
  it("requires paid/live + complete order", () => {
    expect(
      leadEligibleForClientVoicePack(baseLead({ stage: "paid" }), [{ tier: "complete" }]),
    ).toBe(true);
    expect(
      leadEligibleForClientVoicePack(baseLead({ stage: "live" }), [{ tier: "complete" }]),
    ).toBe(true);
    expect(
      leadEligibleForClientVoicePack(baseLead({ stage: "paid" }), [{ tier: "growth" }]),
    ).toBe(false);
    expect(
      leadEligibleForClientVoicePack(baseLead({ stage: "paid" }), [{ tier: "starter" }]),
    ).toBe(false);
    expect(
      leadEligibleForClientVoicePack(baseLead({ stage: "outreach_sent" }), [
        { tier: "complete" },
      ]),
    ).toBe(false);
  });

  it("isCompleteBundleTier", () => {
    expect(isCompleteBundleTier("complete")).toBe(true);
    expect(isCompleteBundleTier("growth")).toBe(false);
    expect(isCompleteBundleTier("starter")).toBe(false);
  });
});

describe("listClientVoicePacksDue", () => {
  it("includes eligible Complete leads without a pack", () => {
    const paid = baseLead({ slug: "needs-pack", stage: "paid" });
    const live = baseLead({ slug: "has-pack", stage: "live" });
    const growth = baseLead({ slug: "growth-only", stage: "paid" });
    const due = listClientVoicePacksDue(
      [paid, live, growth],
      [
        { leadSlug: "needs-pack", tier: "complete" },
        { leadSlug: "has-pack", tier: "complete" },
        { leadSlug: "growth-only", tier: "growth" },
      ],
      [{ leadSlug: "has-pack" }],
    );
    expect(due.map((l) => l.slug)).toEqual(["needs-pack"]);
  });
});

describe("script pack composition", () => {
  it("has six stable script types", () => {
    expect(CLIENT_VOICE_FAQ_SCRIPT_TYPES).toHaveLength(6);
    expect(CLIENT_VOICE_FAQ_SCRIPT_TYPES[0]).toBe("inbound_greeting");
    expect(CLIENT_VOICE_FAQ_SCRIPT_TYPES[5]).toBe("take_a_message");
  });

  it("labels known script types", () => {
    expect(scriptTypeLabel("inbound_greeting")).toBe("Inbound greeting");
    expect(scriptTypeLabel("booking_cta")).toBe("Booking CTA");
  });

  it("builds a request from lead data", () => {
    const request = clientVoicePackRequestForLead(baseLead());
    expect(request.leadId).toBe("summit-plumbing");
    expect(request.scriptTypes).toEqual([...CLIENT_VOICE_FAQ_SCRIPT_TYPES]);
    expect(request.business.businessName).toBe("Summit Plumbing");
    expect(request.business.services).toContain("drain cleaning");
    expect(request.business.hours).toMatch(/8am–6pm/);
  });
});

describe("StubClientVoiceGenerator", () => {
  it("returns one variant per script type with business name", async () => {
    resetClientVoiceGeneratorForTests();
    const generator = new StubClientVoiceGenerator();
    const request = clientVoicePackRequestForLead(baseLead());
    const result = await generator.generate(request);
    expect(result.variants).toHaveLength(CLIENT_VOICE_FAQ_SCRIPT_TYPES.length);
    expect(result.variants.every((v) => v.body.includes("Summit Plumbing"))).toBe(true);
    expect(result.variants[0]?.scriptType).toBe("inbound_greeting");
    expect(result.variants[0]?.body).toMatch(/automated assistant/i);
  });

  it("default factory returns a generator", async () => {
    resetClientVoiceGeneratorForTests();
    const generator = getClientVoiceGenerator();
    const result = await generator.generate(clientVoicePackRequestForLead(baseLead()));
    expect(result.variants.length).toBe(6);
  });
});
