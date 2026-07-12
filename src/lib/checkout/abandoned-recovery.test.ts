import { describe, expect, it } from "vitest";
import {
  ABANDONED_AFTER_HOURS,
  RECOVERY_COOLDOWN_DAYS,
  isAbandonedCheckout,
  isRecoveryDue,
  listAbandonedCheckoutsDue,
} from "./abandoned-recovery";
import type { CheckoutSessionRecord } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.parse("2026-07-12T00:00:00.000Z");

function makeSession(overrides: Partial<CheckoutSessionRecord> = {}): CheckoutSessionRecord {
  return {
    stripeSessionId: "cs_test_123",
    leadSlug: "blue-river-salon",
    tier: "growth",
    commerceAddon: false,
    customerEmail: "owner@example.com",
    status: "open",
    createdAt: new Date(NOW - 3 * HOUR_MS).toISOString(),
    ...overrides,
  };
}

describe("isAbandonedCheckout", () => {
  it("is false once the session has completed", () => {
    expect(isAbandonedCheckout(makeSession({ status: "complete" }), NOW)).toBe(false);
  });

  it("is false before the abandoned threshold elapses", () => {
    const session = makeSession({
      createdAt: new Date(NOW - (ABANDONED_AFTER_HOURS * HOUR_MS - 1)).toISOString(),
    });
    expect(isAbandonedCheckout(session, NOW)).toBe(false);
  });

  it("is true once the abandoned threshold has elapsed", () => {
    const session = makeSession({
      createdAt: new Date(NOW - ABANDONED_AFTER_HOURS * HOUR_MS).toISOString(),
    });
    expect(isAbandonedCheckout(session, NOW)).toBe(true);
  });

  it("is false for an unparsable createdAt", () => {
    expect(isAbandonedCheckout(makeSession({ createdAt: "not-a-date" }), NOW)).toBe(false);
  });
});

describe("isRecoveryDue", () => {
  it("is true for an abandoned session with no prior recovery send", () => {
    expect(isRecoveryDue(makeSession({ recoverySentAt: undefined }), NOW)).toBe(true);
  });

  it("is false before the cooldown elapses since the last recovery send", () => {
    const session = makeSession({
      recoverySentAt: new Date(NOW - (RECOVERY_COOLDOWN_DAYS * DAY_MS - 1)).toISOString(),
    });
    expect(isRecoveryDue(session, NOW)).toBe(false);
  });

  it("is true once the cooldown has elapsed since the last recovery send", () => {
    const session = makeSession({
      recoverySentAt: new Date(NOW - RECOVERY_COOLDOWN_DAYS * DAY_MS).toISOString(),
    });
    expect(isRecoveryDue(session, NOW)).toBe(true);
  });

  it("is false when the session isn't abandoned yet, regardless of recoverySentAt", () => {
    const session = makeSession({
      createdAt: new Date(NOW - HOUR_MS).toISOString(),
      recoverySentAt: undefined,
    });
    expect(isRecoveryDue(session, NOW)).toBe(false);
  });
});

describe("listAbandonedCheckoutsDue", () => {
  it("filters to due sessions only, oldest createdAt first", () => {
    const dueOlder = makeSession({
      stripeSessionId: "a",
      createdAt: new Date(NOW - 10 * HOUR_MS).toISOString(),
    });
    const dueNewer = makeSession({
      stripeSessionId: "b",
      createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
    });
    const notDue = makeSession({
      stripeSessionId: "c",
      createdAt: new Date(NOW - 1 * HOUR_MS).toISOString(),
    });
    const completed = makeSession({
      stripeSessionId: "d",
      status: "complete",
      createdAt: new Date(NOW - 10 * HOUR_MS).toISOString(),
    });

    const due = listAbandonedCheckoutsDue([notDue, dueNewer, completed, dueOlder], NOW);
    expect(due.map((s) => s.stripeSessionId)).toEqual(["a", "b"]);
  });
});
