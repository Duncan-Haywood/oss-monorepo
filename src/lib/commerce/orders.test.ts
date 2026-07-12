import { describe, expect, it } from "vitest";
import {
  newCommerceOrderId,
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
      latestCreatedAt: "2026-07-12T09:00:00.000Z",
    });
    expect(summaries[1]).toMatchObject({
      leadSlug: "salon",
      orderCount: 2,
      totalUsd: 35,
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
});
