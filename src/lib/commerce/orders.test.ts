import { describe, expect, it } from "vitest";
import {
  commerceOrderNeedsClawback,
  isCommerceOrderDisputed,
  isCommerceOrderPaidOut,
  isCommerceOrderRefunded,
  newCommerceOrderId,
  sortCommerceOrdersNewestFirst,
  sumCommerceOrdersRevenueUsd,
  summarizeCommerceOrdersByLead,
  type CommerceOrderRecord,
} from "./orders";

function order(
  partial: Partial<CommerceOrderRecord> &
    Pick<CommerceOrderRecord, "leadSlug" | "amountPaidUsd" | "createdAt">,
): CommerceOrderRecord {
  return {
    id: partial.id ?? `ord_${partial.leadSlug}_${partial.createdAt}`,
    leadSlug: partial.leadSlug,
    skuId: partial.skuId ?? "sku_1",
    skuName: partial.skuName ?? "Item",
    amountPaidUsd: partial.amountPaidUsd,
    stripeSessionId: partial.stripeSessionId ?? `cs_${partial.createdAt}`,
    createdAt: partial.createdAt,
    paidOutAt: partial.paidOutAt,
    refundedAt: partial.refundedAt,
    disputedAt: partial.disputedAt,
  };
}

describe("newCommerceOrderId", () => {
  it("returns a non-empty string prefixed with corder_", () => {
    const id = newCommerceOrderId();
    expect(typeof id).toBe("string");
    expect(id.startsWith("corder_")).toBe(true);
    expect(id.length).toBeGreaterThan("corder_".length);
  });

  it("generates distinct ids across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newCommerceOrderId()));
    expect(ids.size).toBe(20);
  });
});

describe("sortCommerceOrdersNewestFirst", () => {
  it("sorts by app createdAt descending (not input order)", () => {
    const sorted = sortCommerceOrdersNewestFirst([
      order({
        leadSlug: "a",
        amountPaidUsd: 10,
        createdAt: "2026-07-12T09:00:00.000Z",
      }),
      order({
        leadSlug: "b",
        amountPaidUsd: 20,
        createdAt: "2026-07-12T11:00:00.000Z",
      }),
      order({
        leadSlug: "c",
        amountPaidUsd: 15,
        createdAt: "2026-07-12T10:00:00.000Z",
      }),
    ]);
    expect(sorted.map((o) => o.leadSlug)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      order({
        leadSlug: "old",
        amountPaidUsd: 1,
        createdAt: "2026-07-12T09:00:00.000Z",
      }),
      order({
        leadSlug: "new",
        amountPaidUsd: 2,
        createdAt: "2026-07-12T11:00:00.000Z",
      }),
    ];
    const before = input.map((o) => o.leadSlug);
    sortCommerceOrdersNewestFirst(input);
    expect(input.map((o) => o.leadSlug)).toEqual(before);
  });

  it("returns a new empty array for empty input", () => {
    const empty: CommerceOrderRecord[] = [];
    const result = sortCommerceOrdersNewestFirst(empty);
    expect(result).toEqual([]);
    expect(result).not.toBe(empty);
  });
});

describe("sumCommerceOrdersRevenueUsd", () => {
  it("sums amountPaidUsd across orders", () => {
    expect(
      sumCommerceOrdersRevenueUsd([
        { amountPaidUsd: 12.5 },
        { amountPaidUsd: 7.25 },
      ]),
    ).toBe(19.75);
  });

  it("returns 0 for an empty list", () => {
    expect(sumCommerceOrdersRevenueUsd([])).toBe(0);
  });

  it("ignores non-finite amounts defensively", () => {
    expect(
      sumCommerceOrdersRevenueUsd([
        { amountPaidUsd: 10 },
        { amountPaidUsd: Number.NaN },
      ]),
    ).toBe(10);
  });
});

describe("summarizeCommerceOrdersByLead", () => {
  it("returns empty for no orders", () => {
    expect(summarizeCommerceOrdersByLead([])).toEqual([]);
  });

  it("groups by lead, sums totals, and sorts highest owed first", () => {
    const summaries = summarizeCommerceOrdersByLead([
      order({
        leadSlug: "salon",
        amountPaidUsd: 20,
        createdAt: "2026-07-12T10:00:00.000Z",
        skuName: "Cut",
      }),
      order({
        leadSlug: "bakery",
        amountPaidUsd: 50,
        createdAt: "2026-07-12T09:00:00.000Z",
        skuName: "Cake",
      }),
      order({
        leadSlug: "salon",
        amountPaidUsd: 15,
        createdAt: "2026-07-12T11:00:00.000Z",
        skuName: "Color",
      }),
    ]);

    expect(summaries.map((s) => s.leadSlug)).toEqual(["bakery", "salon"]);
    expect(summaries[0]).toMatchObject({
      leadSlug: "bakery",
      orderCount: 1,
      totalUsd: 50,
      unpaidTotalUsd: 50,
      unpaidCount: 1,
      latestCreatedAt: "2026-07-12T09:00:00.000Z",
    });
    expect(summaries[1]).toMatchObject({
      leadSlug: "salon",
      orderCount: 2,
      totalUsd: 35,
      unpaidTotalUsd: 35,
      unpaidCount: 2,
      latestCreatedAt: "2026-07-12T11:00:00.000Z",
    });
    expect(summaries[1]?.orders.map((o) => o.skuName)).toEqual(["Color", "Cut"]);
  });

  it("breaks total ties by most-recent order, then slug", () => {
    const summaries = summarizeCommerceOrdersByLead([
      order({
        leadSlug: "zeta",
        amountPaidUsd: 10,
        createdAt: "2026-07-12T08:00:00.000Z",
      }),
      order({
        leadSlug: "alpha",
        amountPaidUsd: 10,
        createdAt: "2026-07-12T12:00:00.000Z",
      }),
    ]);
    expect(summaries.map((s) => s.leadSlug)).toEqual(["alpha", "zeta"]);
  });

  it("excludes paid-out orders from unpaidTotalUsd/unpaidCount and sorts by amount still owed", () => {
    const summaries = summarizeCommerceOrdersByLead([
      order({
        leadSlug: "fully-paid",
        amountPaidUsd: 100,
        createdAt: "2026-07-12T09:00:00.000Z",
        paidOutAt: "2026-07-12T10:00:00.000Z",
      }),
      order({
        leadSlug: "partially-paid",
        amountPaidUsd: 30,
        createdAt: "2026-07-12T08:00:00.000Z",
        paidOutAt: "2026-07-12T09:00:00.000Z",
      }),
      order({
        leadSlug: "partially-paid",
        amountPaidUsd: 20,
        createdAt: "2026-07-12T09:30:00.000Z",
      }),
    ]);

    expect(summaries.map((s) => s.leadSlug)).toEqual(["partially-paid", "fully-paid"]);
    expect(summaries[0]).toMatchObject({
      leadSlug: "partially-paid",
      orderCount: 2,
      totalUsd: 50,
      unpaidTotalUsd: 20,
      unpaidCount: 1,
    });
    expect(summaries[1]).toMatchObject({
      leadSlug: "fully-paid",
      orderCount: 1,
      totalUsd: 100,
      unpaidTotalUsd: 0,
      unpaidCount: 0,
    });
  });
});

describe("summarizeCommerceOrdersByLead excludes refunded orders from owed totals", () => {
  it("drops a refunded, never-paid-out order from unpaidTotalUsd/unpaidCount", () => {
    const summaries = summarizeCommerceOrdersByLead([
      order({
        leadSlug: "cafe",
        amountPaidUsd: 40,
        createdAt: "2026-07-12T09:00:00.000Z",
        refundedAt: "2026-07-13T09:00:00.000Z",
      }),
      order({
        leadSlug: "cafe",
        amountPaidUsd: 10,
        createdAt: "2026-07-12T10:00:00.000Z",
      }),
    ]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      leadSlug: "cafe",
      orderCount: 2,
      totalUsd: 50,
      unpaidTotalUsd: 10,
      unpaidCount: 1,
    });
  });
});

describe("summarizeCommerceOrdersByLead excludes disputed orders from owed totals", () => {
  it("drops a disputed, never-paid-out order from unpaidTotalUsd/unpaidCount", () => {
    const summaries = summarizeCommerceOrdersByLead([
      order({
        leadSlug: "cafe",
        amountPaidUsd: 40,
        createdAt: "2026-07-12T09:00:00.000Z",
        disputedAt: "2026-07-13T09:00:00.000Z",
      }),
      order({
        leadSlug: "cafe",
        amountPaidUsd: 10,
        createdAt: "2026-07-12T10:00:00.000Z",
      }),
    ]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      leadSlug: "cafe",
      orderCount: 2,
      totalUsd: 50,
      unpaidTotalUsd: 10,
      unpaidCount: 1,
    });
  });
});

describe("isCommerceOrderPaidOut", () => {
  it("is false when paidOutAt is unset", () => {
    expect(isCommerceOrderPaidOut({ paidOutAt: undefined })).toBe(false);
  });

  it("is false when paidOutAt is an empty string (SQLite/Convex parity)", () => {
    expect(isCommerceOrderPaidOut({ paidOutAt: "" })).toBe(false);
  });

  it("is true once paidOutAt is set", () => {
    expect(isCommerceOrderPaidOut({ paidOutAt: "2026-07-12T10:00:00.000Z" })).toBe(true);
  });
});

describe("isCommerceOrderRefunded", () => {
  it("is false when refundedAt is unset", () => {
    expect(isCommerceOrderRefunded({ refundedAt: undefined })).toBe(false);
  });

  it("is false when refundedAt is an empty string (SQLite/Convex parity)", () => {
    expect(isCommerceOrderRefunded({ refundedAt: "" })).toBe(false);
  });

  it("is true once refundedAt is set", () => {
    expect(isCommerceOrderRefunded({ refundedAt: "2026-07-17T10:00:00.000Z" })).toBe(true);
  });
});

describe("isCommerceOrderDisputed", () => {
  it("is false when disputedAt is unset", () => {
    expect(isCommerceOrderDisputed({ disputedAt: undefined })).toBe(false);
  });

  it("is false when disputedAt is an empty string (SQLite/Convex parity)", () => {
    expect(isCommerceOrderDisputed({ disputedAt: "" })).toBe(false);
  });

  it("is true once disputedAt is set", () => {
    expect(isCommerceOrderDisputed({ disputedAt: "2026-07-17T10:00:00.000Z" })).toBe(true);
  });
});

describe("commerceOrderNeedsClawback", () => {
  it("is false when never paid out, even if refunded", () => {
    expect(
      commerceOrderNeedsClawback({
        paidOutAt: undefined,
        refundedAt: "2026-07-17T10:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("is false when paid out but not refunded", () => {
    expect(
      commerceOrderNeedsClawback({
        paidOutAt: "2026-07-10T10:00:00.000Z",
        refundedAt: undefined,
      }),
    ).toBe(false);
  });

  it("is true once an order is both paid out and refunded, regardless of order", () => {
    expect(
      commerceOrderNeedsClawback({
        paidOutAt: "2026-07-10T10:00:00.000Z",
        refundedAt: "2026-07-17T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("is false when paid out but not disputed", () => {
    expect(
      commerceOrderNeedsClawback({
        paidOutAt: "2026-07-10T10:00:00.000Z",
        disputedAt: undefined,
      }),
    ).toBe(false);
  });

  it("is true once an order is both paid out and disputed, regardless of order", () => {
    expect(
      commerceOrderNeedsClawback({
        paidOutAt: "2026-07-10T10:00:00.000Z",
        disputedAt: "2026-07-17T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("is true when paid out and BOTH refunded and disputed", () => {
    expect(
      commerceOrderNeedsClawback({
        paidOutAt: "2026-07-10T10:00:00.000Z",
        refundedAt: "2026-07-16T10:00:00.000Z",
        disputedAt: "2026-07-17T10:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("treats empty-string fields as unset (SQLite/Convex parity)", () => {
    expect(
      commerceOrderNeedsClawback({ paidOutAt: "", refundedAt: "", disputedAt: "" }),
    ).toBe(false);
  });
});

describe("owed totals need unpaid completeness", () => {
  it("truncating to newest N undercounts older unpaid liability", () => {
    const olderUnpaid = order({
      leadSlug: "old-client",
      amountPaidUsd: 40,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const recentPaid = Array.from({ length: 5 }, (_, i) =>
      order({
        leadSlug: "new-client",
        amountPaidUsd: 10,
        createdAt: `2026-06-0${i + 1}T00:00:00.000Z`,
        paidOutAt: "2026-06-10T00:00:00.000Z",
      }),
    );
    const full = [olderUnpaid, ...recentPaid];
    const newestOnly = [...full]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
    const fullUnpaid = sumCommerceOrdersRevenueUsd(
      full.filter((row) => !isCommerceOrderPaidOut(row)),
    );
    const truncatedUnpaid = sumCommerceOrdersRevenueUsd(
      newestOnly.filter((row) => !isCommerceOrderPaidOut(row)),
    );
    expect(fullUnpaid).toBe(40);
    expect(truncatedUnpaid).toBe(0);
    expect(
      summarizeCommerceOrdersByLead(full).find((row) => row.leadSlug === "old-client")
        ?.unpaidTotalUsd,
    ).toBe(40);
    expect(
      summarizeCommerceOrdersByLead(newestOnly).find(
        (row) => row.leadSlug === "old-client",
      ),
    ).toBeUndefined();
  });
});
