import { describe, expect, it } from "vitest";
import type { Lead } from "@/lib/leads/types";
import {
  CLIENT_VOICE_FAQ_SCRIPT_TYPES,
  isCompleteBundleTier,
  leadEligibleForClientVoicePack,
  listClientVoicePacksDue,
  listClientVoicePacksMissingClientSend,
  oldestClientVoicePacksDueAgeHours,
  oldestClientVoicePackMissingClientSendAgeHours,
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
      leadEligibleForClientVoicePack(baseLead({ stage: "paid" }), [
        { tier: "complete", recurringCanceledAt: 1_720_000_000_000 },
      ]),
    ).toBe(false);
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

  it("rejects a Complete order that was refunded or disputed", () => {
    expect(
      leadEligibleForClientVoicePack(baseLead({ stage: "paid" }), [
        { tier: "complete", refundedAt: "2026-07-01T00:00:00.000Z" },
      ]),
    ).toBe(false);
    expect(
      leadEligibleForClientVoicePack(baseLead({ stage: "paid" }), [
        { tier: "complete", disputedAt: "2026-07-01T00:00:00.000Z" },
      ]),
    ).toBe(false);
    expect(
      leadEligibleForClientVoicePack(baseLead({ stage: "paid" }), [
        { tier: "complete", refundedAt: "2026-07-01T00:00:00.000Z" },
        { tier: "complete" },
      ]),
    ).toBe(true);
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

  it("truncating packs to newest N invents false due for an older fulfilled lead", () => {
    const fulfilledOld = baseLead({ slug: "old-fulfilled", stage: "paid" });
    const filler = Array.from({ length: 5 }, (_, i) =>
      baseLead({ slug: `filler-${i}`, stage: "paid" }),
    );
    const orders = [
      { leadSlug: "old-fulfilled", tier: "complete" as const },
      ...filler.map((l) => ({ leadSlug: l.slug, tier: "complete" as const })),
    ];
    const fullPacks = [
      { leadSlug: "old-fulfilled" },
      ...filler.map((l) => ({ leadSlug: l.slug })),
    ];
    const truncatedPacks = fullPacks.filter((p) => p.leadSlug !== "old-fulfilled");

    expect(
      listClientVoicePacksDue([fulfilledOld, ...filler], orders, fullPacks).map(
        (l) => l.slug,
      ),
    ).toEqual([]);
    expect(
      listClientVoicePacksDue(
        [fulfilledOld, ...filler],
        orders,
        truncatedPacks,
      ).map((l) => l.slug),
    ).toEqual(["old-fulfilled"]);
  });
});

describe("oldestClientVoicePacksDueAgeHours", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const NOW = Date.parse("2026-07-17T12:00:00.000Z");

  it("returns null for no candidates", () => {
    expect(oldestClientVoicePacksDueAgeHours([], [], NOW)).toBeNull();
  });

  it("returns hours since the oldest candidate's Complete order, ignoring non-candidates", () => {
    const candidates = [{ slug: "alpha" }, { slug: "beta" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "complete",
        createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "beta",
        tier: "complete",
        createdAt: new Date(NOW - 30 * HOUR_MS).toISOString(),
      },
      // Not a candidate — must not affect the oldest-age scan.
      {
        leadSlug: "gamma",
        tier: "complete",
        createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
      },
      // Candidate but Growth (not Complete) — must be ignored.
      {
        leadSlug: "alpha",
        tier: "growth",
        createdAt: new Date(NOW - 500 * HOUR_MS).toISOString(),
      },
      // Candidate but paused — must be ignored.
      {
        leadSlug: "beta",
        tier: "complete",
        recurringCanceledAt: NOW - 100 * HOUR_MS,
        createdAt: new Date(NOW - 700 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestClientVoicePacksDueAgeHours(candidates, orders, NOW)).toBe(30);
  });

  it("clamps to 0 when nowMs is before the order's createdAt", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        leadSlug: "alpha",
        tier: "complete",
        createdAt: new Date(NOW + HOUR_MS).toISOString(),
      },
    ];
    expect(oldestClientVoicePacksDueAgeHours(candidates, orders, NOW)).toBe(0);
  });

  it("ignores an older refunded/disputed Complete order — only the active entitlement anchors the age", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        // Older order refunded mid-cycle without a recurringCanceledAt —
        // a raw recurringCanceledAt check alone would wrongly anchor here.
        leadSlug: "alpha",
        tier: "complete",
        createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
        refundedAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "alpha",
        tier: "complete",
        createdAt: new Date(NOW - 900 * HOUR_MS).toISOString(),
        disputedAt: new Date(NOW - 900 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "alpha",
        tier: "complete",
        createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestClientVoicePacksDueAgeHours(candidates, orders, NOW)).toBe(4);
  });
});

describe("listClientVoicePacksMissingClientSend", () => {
  const paidLead = baseLead({ slug: "sent-pending", stage: "paid" });
  const orders = [{ leadSlug: "sent-pending", tier: "complete" }];

  it("flags a generated pack with no sentToClientAt", () => {
    const packs = [
      { leadSlug: "sent-pending", generatedAt: "2026-07-01T00:00:00.000Z" },
    ];
    expect(
      listClientVoicePacksMissingClientSend(packs, [paidLead], orders).map((p) => p.leadSlug),
    ).toEqual(["sent-pending"]);
  });

  it("excludes a pack that already has sentToClientAt", () => {
    const packs = [
      {
        leadSlug: "sent-pending",
        generatedAt: "2026-07-01T00:00:00.000Z",
        sentToClientAt: "2026-07-02T00:00:00.000Z",
      },
    ];
    expect(listClientVoicePacksMissingClientSend(packs, [paidLead], orders)).toEqual([]);
  });

  it("excludes a pack whose lead is no longer eligible (e.g. Growth-only)", () => {
    const growthOnly = baseLead({ slug: "growth-only", stage: "paid" });
    const packs = [
      { leadSlug: "growth-only", generatedAt: "2026-07-01T00:00:00.000Z" },
    ];
    expect(
      listClientVoicePacksMissingClientSend(
        packs,
        [growthOnly],
        [{ leadSlug: "growth-only", tier: "growth" }],
      ),
    ).toEqual([]);
  });
});

describe("oldestClientVoicePackMissingClientSendAgeHours", () => {
  it("returns null when there are no candidates", () => {
    expect(oldestClientVoicePackMissingClientSendAgeHours([], 0)).toBeNull();
  });

  it("computes hours since the oldest candidate's generatedAt", () => {
    const nowMs = Date.parse("2026-07-10T00:00:00.000Z");
    const candidates = [
      { generatedAt: "2026-07-05T00:00:00.000Z" },
      { generatedAt: "2026-07-08T00:00:00.000Z" },
    ];
    expect(oldestClientVoicePackMissingClientSendAgeHours(candidates, nowMs)).toBe(5 * 24);
  });

  it("skips a candidate with no parseable generatedAt", () => {
    const nowMs = Date.parse("2026-07-10T00:00:00.000Z");
    expect(
      oldestClientVoicePackMissingClientSendAgeHours(
        [{ generatedAt: undefined }, { generatedAt: "not-a-date" }],
        nowMs,
      ),
    ).toBeNull();
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
    // Isolate from process.env: getClientVoiceGenerator prefers Anthropic when
    // ANTHROPIC_API_KEY is set (scheduled-agent / CI secrets). Sibling
    // generators.test.ts clears the key in afterEach; this file must too
    // before calling .generate(), or the test hits the live Messages API
    // (or a flaky network fallback) instead of StubClientVoiceGenerator.
    // See client-voice-factory-test-env-isolation in /docs/process.
    resetClientVoiceGeneratorForTests();
    const prevKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const generator = getClientVoiceGenerator();
      expect(generator).toBeInstanceOf(StubClientVoiceGenerator);
      const result = await generator.generate(clientVoicePackRequestForLead(baseLead()));
      expect(result.variants).toHaveLength(CLIENT_VOICE_FAQ_SCRIPT_TYPES.length);
    } finally {
      if (prevKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = prevKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
      resetClientVoiceGeneratorForTests();
    }
  });
});
