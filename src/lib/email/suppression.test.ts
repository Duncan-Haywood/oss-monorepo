import { describe, expect, it } from "vitest";
import {
  isBounceOrComplaintSuppression,
  newestBounceOrComplaintSuppressionAgeHours,
  recentBounceOrComplaintSuppressionCount,
  suppressionReasonOrDefault,
  type SuppressionRecord,
} from "./suppression";

describe("suppressionReasonOrDefault", () => {
  it("treats a legacy row with no reason as unsubscribe", () => {
    expect(suppressionReasonOrDefault(undefined)).toBe("unsubscribe");
  });

  it("passes through an explicit reason unchanged", () => {
    expect(suppressionReasonOrDefault("bounce")).toBe("bounce");
    expect(suppressionReasonOrDefault("complaint")).toBe("complaint");
    expect(suppressionReasonOrDefault("unsubscribe")).toBe("unsubscribe");
  });
});

describe("isBounceOrComplaintSuppression", () => {
  it("is false for unsubscribe and legacy (reason-less) rows", () => {
    expect(
      isBounceOrComplaintSuppression({ email: "a@example.com", reason: "unsubscribe", createdAt: 0 }),
    ).toBe(false);
    expect(isBounceOrComplaintSuppression({ email: "a@example.com", createdAt: 0 })).toBe(false);
  });

  it("is true for bounce and complaint", () => {
    expect(
      isBounceOrComplaintSuppression({ email: "a@example.com", reason: "bounce", createdAt: 0 }),
    ).toBe(true);
    expect(
      isBounceOrComplaintSuppression({ email: "a@example.com", reason: "complaint", createdAt: 0 }),
    ).toBe(true);
  });
});

const HOUR_MS = 60 * 60 * 1000;

describe("recentBounceOrComplaintSuppressionCount", () => {
  const nowMs = 1000 * HOUR_MS;

  it("is 0 for an empty list", () => {
    expect(recentBounceOrComplaintSuppressionCount([], nowMs, 24 * 7)).toBe(0);
  });

  it("counts only bounce/complaint rows inside the window, excluding unsubscribes", () => {
    const records: SuppressionRecord[] = [
      { email: "bounce-in@example.com", reason: "bounce", createdAt: nowMs - 2 * HOUR_MS },
      { email: "complaint-in@example.com", reason: "complaint", createdAt: nowMs - 24 * HOUR_MS },
      { email: "unsub-in@example.com", reason: "unsubscribe", createdAt: nowMs - 2 * HOUR_MS },
      {
        email: "bounce-out@example.com",
        reason: "bounce",
        createdAt: nowMs - 24 * 8 * HOUR_MS,
      },
    ];
    expect(recentBounceOrComplaintSuppressionCount(records, nowMs, 24 * 7)).toBe(2);
  });

  it("treats a legacy reason-less row as unsubscribe (never counted)", () => {
    const records: SuppressionRecord[] = [{ email: "legacy@example.com", createdAt: nowMs - HOUR_MS }];
    expect(recentBounceOrComplaintSuppressionCount(records, nowMs, 24 * 7)).toBe(0);
  });
});

describe("newestBounceOrComplaintSuppressionAgeHours", () => {
  const nowMs = 1000 * HOUR_MS;

  it("is null when there has never been a bounce/complaint", () => {
    const records: SuppressionRecord[] = [
      { email: "unsub@example.com", reason: "unsubscribe", createdAt: nowMs - HOUR_MS },
    ];
    expect(newestBounceOrComplaintSuppressionAgeHours(records, nowMs)).toBeNull();
  });

  it("is null for an empty list", () => {
    expect(newestBounceOrComplaintSuppressionAgeHours([], nowMs)).toBeNull();
  });

  it("returns hours since the most recent bounce/complaint, ignoring older ones and unsubscribes", () => {
    const records: SuppressionRecord[] = [
      { email: "old-bounce@example.com", reason: "bounce", createdAt: nowMs - 50 * HOUR_MS },
      { email: "recent-complaint@example.com", reason: "complaint", createdAt: nowMs - 3 * HOUR_MS },
      { email: "unsub-newest@example.com", reason: "unsubscribe", createdAt: nowMs - HOUR_MS },
    ];
    expect(newestBounceOrComplaintSuppressionAgeHours(records, nowMs)).toBe(3);
  });
});
