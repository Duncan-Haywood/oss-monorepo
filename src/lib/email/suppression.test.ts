import { describe, expect, it } from "vitest";
import {
  isBounceOrComplaintSuppression,
  newestBounceOrComplaintSuppressionAgeHours,
  preferSuppressionReason,
  recentBounceOrComplaintSuppressionCount,
  suppressionReasonOrDefault,
  suppressionRecencyMs,
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

describe("preferSuppressionReason", () => {
  it("upgrades a legacy (undefined) or unsubscribe row to a later bounce", () => {
    expect(preferSuppressionReason(undefined, "bounce")).toBe("bounce");
    expect(preferSuppressionReason("unsubscribe", "bounce")).toBe("bounce");
  });

  it("upgrades a legacy or unsubscribe row to a later complaint", () => {
    expect(preferSuppressionReason(undefined, "complaint")).toBe("complaint");
    expect(preferSuppressionReason("unsubscribe", "complaint")).toBe("complaint");
  });

  it("upgrades an existing bounce to a later complaint", () => {
    expect(preferSuppressionReason("bounce", "complaint")).toBe("complaint");
  });

  it("never downgrades an existing bounce/complaint back to unsubscribe", () => {
    expect(preferSuppressionReason("bounce", "unsubscribe")).toBe("bounce");
    expect(preferSuppressionReason("complaint", "unsubscribe")).toBe("complaint");
  });

  it("never downgrades an existing complaint to a later bounce", () => {
    expect(preferSuppressionReason("complaint", "bounce")).toBe("complaint");
  });

  it("no-ops when the reason is unchanged", () => {
    expect(preferSuppressionReason("unsubscribe", "unsubscribe")).toBe("unsubscribe");
    expect(preferSuppressionReason("bounce", "bounce")).toBe("bounce");
    expect(preferSuppressionReason("complaint", "complaint")).toBe("complaint");
  });
});

describe("suppressionRecencyMs", () => {
  it("falls back to createdAt when the reason has never been upgraded", () => {
    expect(suppressionRecencyMs({ email: "a@example.com", createdAt: 100 })).toBe(100);
  });

  it("prefers reasonUpdatedAt when the reason has been upgraded", () => {
    expect(
      suppressionRecencyMs({ email: "a@example.com", createdAt: 100, reasonUpdatedAt: 500 }),
    ).toBe(500);
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

  it("counts a long-ago unsubscribe that only just upgraded to a bounce, using reasonUpdatedAt not createdAt", () => {
    const records: SuppressionRecord[] = [
      {
        email: "old-unsub-new-bounce@example.com",
        reason: "bounce",
        createdAt: nowMs - 24 * 30 * HOUR_MS,
        reasonUpdatedAt: nowMs - HOUR_MS,
      },
    ];
    expect(recentBounceOrComplaintSuppressionCount(records, nowMs, 24 * 7)).toBe(1);
  });

  it("excludes a bounce whose reasonUpdatedAt upgrade happened outside the window, even though it's still the newest signal on the row", () => {
    const records: SuppressionRecord[] = [
      {
        email: "old-upgrade@example.com",
        reason: "bounce",
        createdAt: nowMs - 24 * 20 * HOUR_MS,
        reasonUpdatedAt: nowMs - 24 * 8 * HOUR_MS,
      },
    ];
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

  it("uses reasonUpdatedAt, not createdAt, for a row whose reason was upgraded long after it was first suppressed", () => {
    const records: SuppressionRecord[] = [
      {
        email: "old-unsub-new-bounce@example.com",
        reason: "bounce",
        createdAt: nowMs - 24 * 30 * HOUR_MS,
        reasonUpdatedAt: nowMs - 5 * HOUR_MS,
      },
    ];
    expect(newestBounceOrComplaintSuppressionAgeHours(records, nowMs)).toBe(5);
  });
});
