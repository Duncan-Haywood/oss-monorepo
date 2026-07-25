import { describe, expect, it } from "vitest";
import {
  isOrderDisputed,
  isOrderRefunded,
  newOrderId,
  orderCountsTowardRevenue,
  orderLifetimeRevenueUsd,
  sortOrdersNewestFirst,
} from "./types";

describe("isOrderRefunded", () => {
  it("is false when refundedAt is absent", () => {
    expect(isOrderRefunded({})).toBe(false);
  });

  it("is true when refundedAt is set", () => {
    expect(isOrderRefunded({ refundedAt: "2026-01-01T00:00:00.000Z" })).toBe(true);
  });
});

describe("isOrderDisputed", () => {
  it("is false when disputedAt is absent", () => {
    expect(isOrderDisputed({})).toBe(false);
  });

  it("is true when disputedAt is set", () => {
    expect(isOrderDisputed({ disputedAt: "2026-01-01T00:00:00.000Z" })).toBe(true);
  });
});

describe("orderCountsTowardRevenue", () => {
  it("is true when neither refunded nor disputed", () => {
    expect(orderCountsTowardRevenue({})).toBe(true);
  });

  it("is false when refunded", () => {
    expect(orderCountsTowardRevenue({ refundedAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
  });

  it("is false when disputed", () => {
    expect(orderCountsTowardRevenue({ disputedAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
  });
});

describe("orderLifetimeRevenueUsd", () => {
  it("falls back to amountPaid when lifetimeRevenueUsd is absent", () => {
    expect(orderLifetimeRevenueUsd({ amountPaid: 49 })).toBe(49);
  });

  it("prefers lifetimeRevenueUsd once a renewal has been recorded", () => {
    // Regression for revenue-total-usd-renewal-gap: pipeline-health must count
    // every recorded renewal, not just the first billing period.
    expect(orderLifetimeRevenueUsd({ amountPaid: 49, lifetimeRevenueUsd: 147 })).toBe(147);
  });

  it("falls back to amountPaid when lifetimeRevenueUsd is not a finite number", () => {
    expect(
      orderLifetimeRevenueUsd({ amountPaid: 49, lifetimeRevenueUsd: Number.NaN }),
    ).toBe(49);
  });
});

describe("sortOrdersNewestFirst", () => {
  it("orders by createdAt descending without mutating input", () => {
    const input = [
      { id: "old", createdAt: "2026-07-01T00:00:00.000Z" },
      { id: "new", createdAt: "2026-07-12T00:00:00.000Z" },
      { id: "mid", createdAt: "2026-07-06T00:00:00.000Z" },
    ];
    const sorted = sortOrdersNewestFirst(input);
    expect(sorted.map((o) => o.id)).toEqual(["new", "mid", "old"]);
    expect(input[0]?.id).toBe("old");
  });
});

describe("newOrderId", () => {
  it("returns a non-empty string prefixed with order_", () => {
    const id = newOrderId();
    expect(typeof id).toBe("string");
    expect(id.startsWith("order_")).toBe(true);
  });

  it("generates distinct ids across same-millisecond calls (collision guard)", () => {
    // Regression for leads-sqlite-id-collision-guard: the pre-fix generator
    // was `order_${Date.now()}` with no random component, so two orders
    // inserted in the same millisecond (e.g. two Stripe webhook deliveries
    // processed back-to-back) produced an identical id — orders.id is a
    // SQLite PRIMARY KEY, so the second INSERT throws a constraint-violation
    // error instead of the row landing safely.
    const ids = new Set(Array.from({ length: 50 }, () => newOrderId()));
    expect(ids.size).toBe(50);
  });
});
