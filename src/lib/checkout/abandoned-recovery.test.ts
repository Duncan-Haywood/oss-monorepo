import { describe, expect, it } from "vitest";
import {
  ABANDONED_AFTER_HOURS,
  RECOVERY_COOLDOWN_DAYS,
  checkoutSessionKind,
  isAbandonedCheckout,
  isBundleCheckoutSession,
  isCommerceSkuCheckoutSession,
  isRecoveryDue,
  leadSlugsEligibleForCommerceAbandonedRecovery,
  listAbandonedCheckoutsDue,
  listCommerceAbandonedCheckoutsDue,
  normalizeCheckoutCustomerEmailForMatch,
  oldestCheckoutSessionAgeHours,
  openBundleCheckoutSessionsToClose,
  openCommerceCheckoutSessionsToClose,
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

describe("checkoutSessionKind", () => {
  it("defaults missing kind to bundle (legacy rows)", () => {
    expect(checkoutSessionKind(makeSession({ kind: undefined }))).toBe("bundle");
    expect(isBundleCheckoutSession(makeSession())).toBe(true);
    expect(isCommerceSkuCheckoutSession(makeSession())).toBe(false);
  });

  it("recognizes commerce_sku", () => {
    const session = makeSession({ kind: "commerce_sku", skuId: "sku_1", tier: "" });
    expect(checkoutSessionKind(session)).toBe("commerce_sku");
    expect(isCommerceSkuCheckoutSession(session)).toBe(true);
    expect(isBundleCheckoutSession(session)).toBe(false);
  });
});

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
  it("filters to due bundle sessions only, oldest createdAt first", () => {
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
    const commerceDue = makeSession({
      stripeSessionId: "e",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      createdAt: new Date(NOW - 10 * HOUR_MS).toISOString(),
    });

    const due = listAbandonedCheckoutsDue(
      [notDue, dueNewer, completed, dueOlder, commerceDue],
      NOW,
    );
    expect(due.map((s) => s.stripeSessionId)).toEqual(["a", "b"]);
  });
});

describe("listCommerceAbandonedCheckoutsDue", () => {
  it("filters to due commerce_sku sessions only, excluding bundles", () => {
    const commerceOlder = makeSession({
      stripeSessionId: "c1",
      kind: "commerce_sku",
      skuId: "sku_a",
      tier: "",
      createdAt: new Date(NOW - 8 * HOUR_MS).toISOString(),
    });
    const commerceNewer = makeSession({
      stripeSessionId: "c2",
      kind: "commerce_sku",
      skuId: "sku_b",
      tier: "",
      createdAt: new Date(NOW - 3 * HOUR_MS).toISOString(),
    });
    const bundleDue = makeSession({
      stripeSessionId: "b1",
      createdAt: new Date(NOW - 10 * HOUR_MS).toISOString(),
    });
    const commerceFresh = makeSession({
      stripeSessionId: "c3",
      kind: "commerce_sku",
      skuId: "sku_c",
      tier: "",
      createdAt: new Date(NOW - 1 * HOUR_MS).toISOString(),
    });

    const due = listCommerceAbandonedCheckoutsDue(
      [commerceNewer, bundleDue, commerceFresh, commerceOlder],
      NOW,
      // Default makeSession leadSlug — entitlement set is required (no omit→allow-all).
      new Set(["blue-river-salon"]),
    );
    expect(due.map((s) => s.stripeSessionId)).toEqual(["c1", "c2"]);
  });

  it("filters out carts for leadSlugs not in the entitlement set", () => {
    const eligible = makeSession({
      stripeSessionId: "c_ok",
      leadSlug: "live-shop",
      kind: "commerce_sku",
      skuId: "sku_a",
      tier: "",
      createdAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
    });
    const paused = makeSession({
      stripeSessionId: "c_paused",
      leadSlug: "paused-shop",
      kind: "commerce_sku",
      skuId: "sku_b",
      tier: "",
      createdAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
    });
    const due = listCommerceAbandonedCheckoutsDue(
      [eligible, paused],
      NOW,
      new Set(["live-shop"]),
    );
    expect(due.map((s) => s.stripeSessionId)).toEqual(["c_ok"]);
  });

  it("returns no carts when the entitlement set is empty (fail closed)", () => {
    const cart = makeSession({
      stripeSessionId: "c_any",
      leadSlug: "any-shop",
      kind: "commerce_sku",
      skuId: "sku_a",
      tier: "",
      createdAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
    });
    expect(listCommerceAbandonedCheckoutsDue([cart], NOW, new Set())).toEqual([]);
  });
});

describe("oldestCheckoutSessionAgeHours", () => {
  it("returns null for an empty list", () => {
    expect(oldestCheckoutSessionAgeHours([], NOW)).toBeNull();
  });

  it("returns the age in hours of the single oldest session, order-agnostic", () => {
    const sessions = [
      { createdAt: new Date(NOW - 3 * HOUR_MS).toISOString() },
      { createdAt: new Date(NOW - 9 * HOUR_MS).toISOString() },
      { createdAt: new Date(NOW - 5 * HOUR_MS).toISOString() },
    ];
    expect(oldestCheckoutSessionAgeHours(sessions, NOW)).toBe(9);
    expect(oldestCheckoutSessionAgeHours([...sessions].reverse(), NOW)).toBe(9);
  });

  it("clamps a future createdAt to 0 rather than a negative age", () => {
    const sessions = [{ createdAt: new Date(NOW + HOUR_MS).toISOString() }];
    expect(oldestCheckoutSessionAgeHours(sessions, NOW)).toBe(0);
  });

  it("skips unparsable createdAt values instead of throwing", () => {
    const sessions = [
      { createdAt: "not-a-date" },
      { createdAt: new Date(NOW - 4 * HOUR_MS).toISOString() },
    ];
    expect(oldestCheckoutSessionAgeHours(sessions, NOW)).toBe(4);
  });
});

describe("leadSlugsEligibleForCommerceAbandonedRecovery", () => {
  it("includes paid commerceAddon leads and excludes paused recurring", () => {
    const eligible = leadSlugsEligibleForCommerceAbandonedRecovery(
      [
        { slug: "live-shop", stage: "live" },
        { slug: "paused-shop", stage: "paid" },
        { slug: "outreach", stage: "outreach_sent" },
      ],
      [
        { leadSlug: "live-shop", commerceAddon: true },
        {
          leadSlug: "paused-shop",
          commerceAddon: true,
          recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z"),
        },
      ],
    );
    expect([...eligible].sort()).toEqual(["live-shop"]);
  });
});

describe("openBundleCheckoutSessionsToClose", () => {
  it("closes other open bundle rows for the lead, keeps the paid session and commerce_sku", () => {
    const paid = makeSession({ stripeSessionId: "cs_paid", status: "open" });
    const orphan = makeSession({
      stripeSessionId: "cs_orphan",
      createdAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
    });
    const legacy = makeSession({
      stripeSessionId: "cs_legacy",
      kind: undefined,
    });
    const otherLead = makeSession({
      stripeSessionId: "cs_other",
      leadSlug: "other-biz",
    });
    const commerce = makeSession({
      stripeSessionId: "cs_sku",
      kind: "commerce_sku",
      skuId: "sku_1",
      tier: "",
    });
    const alreadyComplete = makeSession({
      stripeSessionId: "cs_done",
      status: "complete",
    });

    const toClose = openBundleCheckoutSessionsToClose(
      [paid, orphan, legacy, otherLead, commerce, alreadyComplete],
      { leadSlug: "blue-river-salon", exceptStripeSessionId: "cs_paid" },
    );
    expect(toClose.map((s) => s.stripeSessionId).sort()).toEqual([
      "cs_legacy",
      "cs_orphan",
    ]);
  });

  it("returns empty when leadSlug or except id is blank", () => {
    expect(
      openBundleCheckoutSessionsToClose([makeSession()], {
        leadSlug: "  ",
        exceptStripeSessionId: "cs_paid",
      }),
    ).toEqual([]);
    expect(
      openBundleCheckoutSessionsToClose([makeSession()], {
        leadSlug: "blue-river-salon",
        exceptStripeSessionId: "",
      }),
    ).toEqual([]);
  });
});

describe("normalizeCheckoutCustomerEmailForMatch", () => {
  it("trims and lowercases", () => {
    expect(normalizeCheckoutCustomerEmailForMatch("  Shopper@Example.COM ")).toBe(
      "shopper@example.com",
    );
  });

  it("maps blank/nullish to empty string", () => {
    expect(normalizeCheckoutCustomerEmailForMatch(undefined)).toBe("");
    expect(normalizeCheckoutCustomerEmailForMatch(null)).toBe("");
    expect(normalizeCheckoutCustomerEmailForMatch("   ")).toBe("");
  });
});

describe("openCommerceCheckoutSessionsToClose", () => {
  it("closes matching open commerce_sku rows for lead+sku+email", () => {
    const paid = makeSession({
      stripeSessionId: "cs_paid",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      customerEmail: "shopper@example.com",
    });
    const orphan = makeSession({
      stripeSessionId: "cs_orphan",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      customerEmail: "  Shopper@Example.COM ",
    });
    const otherSku = makeSession({
      stripeSessionId: "cs_other_sku",
      kind: "commerce_sku",
      skuId: "sku_muffin",
      tier: "",
      customerEmail: "shopper@example.com",
    });
    const otherEmail = makeSession({
      stripeSessionId: "cs_other_email",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      customerEmail: "other@example.com",
    });
    const blankEmail = makeSession({
      stripeSessionId: "cs_blank",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      customerEmail: undefined,
    });
    const bundle = makeSession({ stripeSessionId: "cs_bundle" });
    const alreadyComplete = makeSession({
      stripeSessionId: "cs_done",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      customerEmail: "shopper@example.com",
      status: "complete",
    });

    const toClose = openCommerceCheckoutSessionsToClose(
      [paid, orphan, otherSku, otherEmail, blankEmail, bundle, alreadyComplete],
      {
        leadSlug: "blue-river-salon",
        skuId: "sku_latte",
        customerEmail: "shopper@example.com",
        exceptStripeSessionId: "cs_paid",
      },
    );
    expect(toClose.map((s) => s.stripeSessionId)).toEqual(["cs_orphan"]);
  });

  it("returns empty when email/sku/lead/except is blank (never close by lead+sku alone)", () => {
    const orphan = makeSession({
      stripeSessionId: "cs_orphan",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      customerEmail: "shopper@example.com",
    });
    expect(
      openCommerceCheckoutSessionsToClose([orphan], {
        leadSlug: "blue-river-salon",
        skuId: "sku_latte",
        customerEmail: "  ",
        exceptStripeSessionId: "cs_paid",
      }),
    ).toEqual([]);
    expect(
      openCommerceCheckoutSessionsToClose([orphan], {
        leadSlug: "blue-river-salon",
        skuId: "",
        customerEmail: "shopper@example.com",
        exceptStripeSessionId: "cs_paid",
      }),
    ).toEqual([]);
  });
});
