import { describe, expect, it } from "vitest";
import {
  commerceOrderNeedsClawback,
  commerceOrdersByLeadSummaryNeedsAttention,
  isCommerceOrderDisputed,
  isCommerceOrderPaidOut,
  isCommerceOrderRefunded,
  mergeCommerceOrdersForReview,
  newCommerceOrderId,
  sortCommerceOrdersNewestFirst,
  sumCommerceOrdersByLeadOrderCount,
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

describe("mergeCommerceOrdersForReview", () => {
  it("dedupes an order present in more than one source list by id", () => {
    const refundedNeverPaid = order({
      id: "corder_1",
      leadSlug: "cafe",
      amountPaidUsd: 20,
      createdAt: "2026-07-01T00:00:00.000Z",
      refundedAt: "2026-07-02T00:00:00.000Z",
    });
    // Same order appears in both the "unpaid" feed (paidOutAt unset) and the
    // "refunded" feed (refundedAt set) — a raw concat would double-count it.
    const merged = mergeCommerceOrdersForReview([refundedNeverPaid], [refundedNeverPaid], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("corder_1");
  });

  it("unions distinct orders across sources and sorts newest-first", () => {
    const unpaid = order({
      id: "corder_unpaid",
      leadSlug: "cafe",
      amountPaidUsd: 10,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const clawback = order({
      id: "corder_clawback",
      leadSlug: "salon",
      amountPaidUsd: 30,
      createdAt: "2026-07-03T00:00:00.000Z",
      paidOutAt: "2026-07-04T00:00:00.000Z",
      disputedAt: "2026-07-05T00:00:00.000Z",
    });
    const merged = mergeCommerceOrdersForReview([unpaid], [], [clawback]);
    expect(merged.map((o) => o.id)).toEqual(["corder_clawback", "corder_unpaid"]);
  });

  it("returns an empty array when every source is empty", () => {
    expect(mergeCommerceOrdersForReview([], [], [])).toEqual([]);
  });

  it("last source wins when the same id appears with different field values", () => {
    const stale = order({
      id: "corder_1",
      leadSlug: "cafe",
      amountPaidUsd: 20,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const fresh = { ...stale, disputedAt: "2026-07-02T00:00:00.000Z" };
    const merged = mergeCommerceOrdersForReview([stale], [fresh]);
    expect(merged).toEqual([fresh]);
  });
});

describe("commerceOrdersByLeadSummaryNeedsAttention", () => {
  it("is true when unpaidCount is positive", () => {
    expect(
      commerceOrdersByLeadSummaryNeedsAttention({ unpaidCount: 1, orders: [] }),
    ).toBe(true);
  });

  it("is false when unpaidCount is zero and no order needs clawback", () => {
    const paidClean = order({
      leadSlug: "cafe",
      amountPaidUsd: 20,
      createdAt: "2026-07-01T00:00:00.000Z",
      paidOutAt: "2026-07-02T00:00:00.000Z",
    });
    expect(
      commerceOrdersByLeadSummaryNeedsAttention({
        unpaidCount: 0,
        orders: [paidClean],
      }),
    ).toBe(false);
  });

  it("is true when unpaidCount is zero but a clawback-needed order is present (the bug this fixes)", () => {
    const clawback = order({
      leadSlug: "cafe",
      amountPaidUsd: 20,
      createdAt: "2026-07-01T00:00:00.000Z",
      paidOutAt: "2026-07-02T00:00:00.000Z",
      refundedAt: "2026-07-03T00:00:00.000Z",
    });
    expect(
      commerceOrdersByLeadSummaryNeedsAttention({
        unpaidCount: 0,
        orders: [clawback],
      }),
    ).toBe(true);
  });
});

describe("sumCommerceOrdersByLeadOrderCount", () => {
  it("returns 0 for an empty summary list", () => {
    expect(sumCommerceOrdersByLeadOrderCount([])).toBe(0);
  });

  it("sums orderCount across every summary, not just unpaidCount", () => {
    expect(
      sumCommerceOrdersByLeadOrderCount([
        { orderCount: 3 },
        { orderCount: 2 },
      ]),
    ).toBe(5);
  });

  it("matches only the leads the payouts panel actually renders (the bug this fixes)", () => {
    // A lead whose only order was refunded before ever being paid out owes
    // nothing and correctly drops out of commerceOrdersByLeadSummaryNeedsAttention,
    // but it still arrives in the merged review feed passed into
    // summarizeCommerceOrdersByLead (mergeCommerceOrdersForReview includes every
    // refunded/disputed order regardless of payout status) — so a naive
    // "count every order in the merged feed" header would keep growing from
    // this fully-resolved, nothing-owed order forever, while the visible list
    // below never shows it. The panel must instead sum orderCount only across
    // the summaries that survive the needsAttention filter.
    const resolvedRefund = order({
      leadSlug: "resolved-cafe",
      amountPaidUsd: 15,
      createdAt: "2026-07-01T00:00:00.000Z",
      refundedAt: "2026-07-02T00:00:00.000Z",
    });
    const owedOrder = order({
      leadSlug: "owed-cafe",
      amountPaidUsd: 30,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const allSummaries = summarizeCommerceOrdersByLead([resolvedRefund, owedOrder]);
    const rendered = allSummaries.filter(commerceOrdersByLeadSummaryNeedsAttention);

    // Only owed-cafe's 1 order needs attention — resolved-cafe's refunded
    // order must not inflate the header count even though it's in the input.
    expect(sumCommerceOrdersByLeadOrderCount(rendered)).toBe(1);
    // Sanity check: summing across every summary (the old, buggy behavior)
    // would have counted both orders (2), not just the rendered one (1).
    expect(sumCommerceOrdersByLeadOrderCount(allSummaries)).toBe(2);
  });
});
