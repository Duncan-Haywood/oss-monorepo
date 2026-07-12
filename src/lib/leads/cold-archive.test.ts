import { describe, expect, it } from "vitest";
import {
  coldLeadDispositionLabel,
  isColdLeadDisposition,
  planColdLeadDisposition,
} from "./cold-archive";
import type { Lead } from "./types";

const NOW = Date.parse("2026-07-12T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "cold-bakery",
    businessName: "Cold Bakery",
    category: "restaurant",
    city: "Denver",
    state: "CO",
    tagline: "Fresh",
    description: "A bakery",
    phone: "555-0100",
    email: "owner@cold.bakery",
    services: ["Bread"],
    hours: { weekday: "9-5", weekend: "10-2" },
    stage: "outreach_sent",
    recommendedTier: "starter",
    outreachStep: 3,
    lastOutreachAt: new Date(NOW - 30 * DAY_MS).toISOString(),
    ...overrides,
  };
}

describe("isColdLeadDisposition", () => {
  it("accepts reengage and close only", () => {
    expect(isColdLeadDisposition("reengage")).toBe(true);
    expect(isColdLeadDisposition("close")).toBe(true);
    expect(isColdLeadDisposition("archive")).toBe(false);
    expect(isColdLeadDisposition("")).toBe(false);
  });
});

describe("planColdLeadDisposition", () => {
  it("reengage resets cadence to discovered and clears snooze/outreach clock", () => {
    const lead = baseLead({
      snoozedUntil: new Date(NOW + DAY_MS).toISOString(),
    });
    const result = planColdLeadDisposition(lead, "reengage", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch).toEqual({
      stage: "discovered",
      outreachStep: 0,
      lastOutreachAt: undefined,
      snoozedUntil: undefined,
    });
  });

  it("close moves to closed and keeps outreach history", () => {
    const lead = baseLead();
    const result = planColdLeadDisposition(lead, "close", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.stage).toBe("closed");
    expect(result.patch.outreachStep).toBe(3);
    expect(result.patch.lastOutreachAt).toBe(lead.lastOutreachAt);
    expect(result.patch.snoozedUntil).toBeUndefined();
  });

  it("rejects non-cold leads", () => {
    const lead = baseLead({
      lastOutreachAt: new Date(NOW - DAY_MS).toISOString(),
    });
    const result = planColdLeadDisposition(lead, "close", NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not cold/i);
  });

  it("rejects paid, live, and already-closed leads", () => {
    expect(planColdLeadDisposition(baseLead({ stage: "paid" }), "close", NOW).ok).toBe(
      false,
    );
    expect(planColdLeadDisposition(baseLead({ stage: "live" }), "reengage", NOW).ok).toBe(
      false,
    );
    expect(
      planColdLeadDisposition(baseLead({ stage: "closed" }), "close", NOW).ok,
    ).toBe(false);
  });
});

describe("coldLeadDispositionLabel", () => {
  it("labels both dispositions", () => {
    expect(coldLeadDispositionLabel("reengage")).toBe("Re-engage");
    expect(coldLeadDispositionLabel("close")).toBe("Close");
  });
});
