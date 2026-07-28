import { describe, expect, it } from "vitest";
import {
  COLD_AFTER_DAYS,
  FOLLOW_UP_2_AFTER_DAYS,
  FOLLOW_UP_3_AFTER_DAYS,
  isColdLead,
  isFollowUpDue,
  listColdLeads,
  listFollowUpsDue,
  nextFollowUpStep,
  normalizeOutreachStep,
} from "./outreach-followups";
import type { Lead } from "../leads/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-11T00:00:00.000Z");

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "blue-river-salon",
    businessName: "Blue River Salon",
    category: "salon",
    city: "Denver",
    state: "CO",
    tagline: "Tailored styling and care",
    description: "desc",
    phone: "(555) 000-0000",
    email: "owner@example.com",
    services: ["Haircuts"],
    hours: { weekday: "Mon-Fri", weekend: "Sat" },
    stage: "outreach_sent",
    recommendedTier: "growth",
    outreachStep: 1,
    lastOutreachAt: new Date(NOW - 1 * DAY_MS).toISOString(),
    ...overrides,
  };
}

describe("normalizeOutreachStep", () => {
  it("passes through valid steps", () => {
    expect(normalizeOutreachStep(1)).toBe(1);
    expect(normalizeOutreachStep(2)).toBe(2);
    expect(normalizeOutreachStep(3)).toBe(3);
  });

  it("defaults invalid/missing values to 0", () => {
    expect(normalizeOutreachStep(undefined)).toBe(0);
    expect(normalizeOutreachStep(null)).toBe(0);
    expect(normalizeOutreachStep(4 as unknown as number)).toBe(0);
    expect(normalizeOutreachStep(0)).toBe(0);
  });
});

describe("nextFollowUpStep", () => {
  it("returns 2 after step 1, 3 after step 2", () => {
    expect(nextFollowUpStep(1)).toBe(2);
    expect(nextFollowUpStep(2)).toBe(3);
  });

  it("returns null when sequence hasn't started or is finished", () => {
    expect(nextFollowUpStep(0)).toBeNull();
    expect(nextFollowUpStep(undefined)).toBeNull();
    expect(nextFollowUpStep(3)).toBeNull();
  });
});

describe("isFollowUpDue", () => {
  it("is false without an email", () => {
    expect(isFollowUpDue(makeLead({ email: undefined }), NOW)).toBe(false);
  });

  it("is false outside outreach_sent/discovery_call stages", () => {
    expect(isFollowUpDue(makeLead({ stage: "paid" }), NOW)).toBe(false);
    expect(isFollowUpDue(makeLead({ stage: "discovered" }), NOW)).toBe(false);
  });

  it("is false when the sequence hasn't started or already finished", () => {
    expect(isFollowUpDue(makeLead({ outreachStep: 0 }), NOW)).toBe(false);
    expect(isFollowUpDue(makeLead({ outreachStep: 3 }), NOW)).toBe(false);
  });

  it("is due when lastOutreachAt is missing (legacy row)", () => {
    expect(
      isFollowUpDue(makeLead({ outreachStep: 1, lastOutreachAt: undefined }), NOW),
    ).toBe(true);
  });

  it("is due when unparsable lastOutreachAt is present", () => {
    expect(
      isFollowUpDue(makeLead({ outreachStep: 1, lastOutreachAt: "not-a-date" }), NOW),
    ).toBe(true);
  });

  it("is not due before the Email 2 gap elapses", () => {
    const lead = makeLead({
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - (FOLLOW_UP_2_AFTER_DAYS * DAY_MS - 1)).toISOString(),
    });
    expect(isFollowUpDue(lead, NOW)).toBe(false);
  });

  it("is due once the Email 2 gap has elapsed", () => {
    const lead = makeLead({
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - FOLLOW_UP_2_AFTER_DAYS * DAY_MS).toISOString(),
    });
    expect(isFollowUpDue(lead, NOW)).toBe(true);
  });

  it("uses the longer Email 3 gap after step 2", () => {
    const justUnderGap2 = makeLead({
      outreachStep: 2,
      lastOutreachAt: new Date(NOW - (FOLLOW_UP_2_AFTER_DAYS * DAY_MS)).toISOString(),
    });
    // Would be due under the (shorter) Email 2 gap, but step 2 uses the Email 3 gap.
    expect(isFollowUpDue(justUnderGap2, NOW)).toBe(false);

    const pastGap3 = makeLead({
      outreachStep: 2,
      lastOutreachAt: new Date(NOW - FOLLOW_UP_3_AFTER_DAYS * DAY_MS).toISOString(),
    });
    expect(isFollowUpDue(pastGap3, NOW)).toBe(true);
  });

  it("is false while snoozed, even past the cadence gap", () => {
    const lead = makeLead({
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - FOLLOW_UP_2_AFTER_DAYS * DAY_MS).toISOString(),
      snoozedUntil: new Date(NOW + 3 * DAY_MS).toISOString(),
    });
    expect(isFollowUpDue(lead, NOW)).toBe(false);
  });

  it("is due again once a past snooze has elapsed", () => {
    const lead = makeLead({
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - FOLLOW_UP_2_AFTER_DAYS * DAY_MS).toISOString(),
      snoozedUntil: new Date(NOW - DAY_MS).toISOString(),
    });
    expect(isFollowUpDue(lead, NOW)).toBe(true);
  });
});

describe("listFollowUpsDue", () => {
  it("filters to due leads only, oldest lastOutreachAt first among same open state", () => {
    const dueOlder = makeLead({
      slug: "a",
      lastOutreachAt: new Date(NOW - 10 * DAY_MS).toISOString(),
    });
    const dueNewer = makeLead({
      slug: "b",
      lastOutreachAt: new Date(NOW - 4 * DAY_MS).toISOString(),
    });
    const notDue = makeLead({
      slug: "c",
      lastOutreachAt: new Date(NOW - 1 * DAY_MS).toISOString(),
    });
    const noEmail = makeLead({ slug: "d", email: undefined });

    const due = listFollowUpsDue([notDue, dueNewer, noEmail, dueOlder], NOW);
    expect(due.map((l) => l.slug)).toEqual(["a", "b"]);
  });

  it("ranks preview-openers ahead of silent due leads", () => {
    const silent = makeLead({
      slug: "silent",
      lastOutreachAt: new Date(NOW - 10 * DAY_MS).toISOString(),
    });
    const opened = makeLead({
      slug: "opened",
      lastOutreachAt: new Date(NOW - 4 * DAY_MS).toISOString(),
      lastPreviewOpenAt: new Date(NOW - 2 * DAY_MS).toISOString(),
    });
    const due = listFollowUpsDue([silent, opened], NOW);
    expect(due.map((l) => l.slug)).toEqual(["opened", "silent"]);
  });
});

describe("isColdLead", () => {
  it("is false before the sequence is finished", () => {
    expect(
      isColdLead(
        makeLead({
          outreachStep: 2,
          lastOutreachAt: new Date(NOW - 30 * DAY_MS).toISOString(),
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("is false right after Email 3 sends, before the cold gap elapses", () => {
    const lead = makeLead({
      outreachStep: 3,
      lastOutreachAt: new Date(NOW - (COLD_AFTER_DAYS * DAY_MS - 1)).toISOString(),
    });
    expect(isColdLead(lead, NOW)).toBe(false);
  });

  it("is true once the cold gap elapses past Email 3 with no reply", () => {
    const lead = makeLead({
      outreachStep: 3,
      lastOutreachAt: new Date(NOW - COLD_AFTER_DAYS * DAY_MS).toISOString(),
    });
    expect(isColdLead(lead, NOW)).toBe(true);
  });

  it("is false without an email, outside outreach stages, or without lastOutreachAt", () => {
    const old3 = { outreachStep: 3 as const, lastOutreachAt: new Date(NOW - 30 * DAY_MS).toISOString() };
    expect(isColdLead(makeLead({ ...old3, email: undefined }), NOW)).toBe(false);
    expect(isColdLead(makeLead({ ...old3, stage: "paid" }), NOW)).toBe(false);
    expect(isColdLead(makeLead({ ...old3, lastOutreachAt: undefined }), NOW)).toBe(false);
  });

  it("stays true while snoozed — Re-engage/Close must remain available as an explicit override (see cold-archive.test.ts)", () => {
    const lead = makeLead({
      outreachStep: 3,
      lastOutreachAt: new Date(NOW - COLD_AFTER_DAYS * DAY_MS).toISOString(),
      snoozedUntil: new Date(NOW + 3 * DAY_MS).toISOString(),
    });
    expect(isColdLead(lead, NOW)).toBe(true);
  });
});

describe("listColdLeads", () => {
  it("filters to cold leads only, oldest lastOutreachAt first", () => {
    const coldOlder = makeLead({
      slug: "cold-a",
      outreachStep: 3,
      lastOutreachAt: new Date(NOW - 30 * DAY_MS).toISOString(),
    });
    const coldNewer = makeLead({
      slug: "cold-b",
      outreachStep: 3,
      lastOutreachAt: new Date(NOW - COLD_AFTER_DAYS * DAY_MS).toISOString(),
    });
    const stillDue = makeLead({
      slug: "due",
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - 10 * DAY_MS).toISOString(),
    });

    const cold = listColdLeads([stillDue, coldNewer, coldOlder], NOW);
    expect(cold.map((l) => l.slug)).toEqual(["cold-a", "cold-b"]);
  });
});
