import { describe, expect, it } from "vitest";
import {
  commerceOrderPaidInquiryMessage,
  commerceOrderRequestMessage,
  formatPriceUsd,
  leadEligibleForCommerceCatalog,
  leadStageEligibleForCommerceCatalog,
  listCommerceCatalogsMissing,
  listCommerceCatalogsUnsynced,
  normalizeCommerceItems,
  preserveCommerceStripeIds,
} from "./catalog";
import { MAX_COMMERCE_SKU_ID_LENGTH, MAX_COMMERCE_SKUS } from "./types";

describe("leadEligibleForCommerceCatalog", () => {
  it("requires paid/live stage and a commerceAddon order", () => {
    expect(leadStageEligibleForCommerceCatalog("paid")).toBe(true);
    expect(leadStageEligibleForCommerceCatalog("live")).toBe(true);
    expect(leadStageEligibleForCommerceCatalog("outreach_sent")).toBe(false);

    expect(
      leadEligibleForCommerceCatalog({ stage: "paid" }, [{ commerceAddon: true }]),
    ).toBe(true);
    expect(
      leadEligibleForCommerceCatalog({ stage: "live" }, [
        { commerceAddon: false },
        { commerceAddon: true },
      ]),
    ).toBe(true);
    expect(
      leadEligibleForCommerceCatalog({ stage: "paid" }, [{ commerceAddon: false }]),
    ).toBe(false);
    expect(
      leadEligibleForCommerceCatalog({ stage: "discovered" }, [
        { commerceAddon: true },
      ]),
    ).toBe(false);
  });
});

describe("listCommerceCatalogsMissing", () => {
  it("returns paid commerce leads without a catalog row, slug-sorted", () => {
    const leads = [
      { slug: "zeta", stage: "paid" as const },
      { slug: "alpha", stage: "live" as const },
      { slug: "beta", stage: "paid" as const },
      { slug: "gamma", stage: "outreach_sent" as const },
    ];
    const orders = [
      { leadSlug: "zeta", commerceAddon: true },
      { leadSlug: "alpha", commerceAddon: true },
      { leadSlug: "beta", commerceAddon: false },
      { leadSlug: "gamma", commerceAddon: true },
    ];
    const missing = listCommerceCatalogsMissing(
      leads,
      orders,
      [{ leadSlug: "alpha" }],
    );
    expect(missing.map((l) => l.slug)).toEqual(["zeta"]);
  });

  it("truncating catalogs to newest N invents false missing for an older fulfilled lead", () => {
    const fulfilledOld = { slug: "old-fulfilled", stage: "paid" as const };
    const filler = Array.from({ length: 5 }, (_, i) => ({
      slug: `filler-${i}`,
      stage: "paid" as const,
    }));
    const orders = [
      { leadSlug: "old-fulfilled", commerceAddon: true },
      ...filler.map((l) => ({ leadSlug: l.slug, commerceAddon: true })),
    ];
    const fullCatalogs = [
      { leadSlug: "old-fulfilled" },
      ...filler.map((l) => ({ leadSlug: l.slug })),
    ];
    const truncatedCatalogs = fullCatalogs.filter(
      (c) => c.leadSlug !== "old-fulfilled",
    );

    expect(
      listCommerceCatalogsMissing(
        [fulfilledOld, ...filler],
        orders,
        fullCatalogs,
      ).map((l) => l.slug),
    ).toEqual([]);
    expect(
      listCommerceCatalogsMissing(
        [fulfilledOld, ...filler],
        orders,
        truncatedCatalogs,
      ).map((l) => l.slug),
    ).toEqual(["old-fulfilled"]);
  });
});

describe("listCommerceCatalogsUnsynced", () => {
  it("returns eligible leads whose catalog still has SKUs without stripePriceId", () => {
    const leads = [
      { slug: "unsynced", stage: "paid" as const },
      { slug: "partial", stage: "live" as const },
      { slug: "synced", stage: "paid" as const },
      { slug: "empty", stage: "paid" as const },
      { slug: "ineligible", stage: "outreach_sent" as const },
    ];
    const orders = [
      { leadSlug: "unsynced", commerceAddon: true },
      { leadSlug: "partial", commerceAddon: true },
      { leadSlug: "synced", commerceAddon: true },
      { leadSlug: "empty", commerceAddon: true },
      { leadSlug: "ineligible", commerceAddon: true },
    ];
    const catalogs = [
      {
        leadSlug: "unsynced",
        items: [{ id: "a", name: "A", priceCents: 100 }],
      },
      {
        leadSlug: "partial",
        items: [
          { id: "b", name: "B", priceCents: 200, stripePriceId: "price_b" },
          { id: "c", name: "C", priceCents: 300 },
        ],
      },
      {
        leadSlug: "synced",
        items: [
          { id: "d", name: "D", priceCents: 400, stripePriceId: "price_d" },
        ],
      },
      { leadSlug: "empty", items: [] },
      {
        leadSlug: "ineligible",
        items: [{ id: "e", name: "E", priceCents: 500 }],
      },
    ];
    expect(
      listCommerceCatalogsUnsynced(leads, orders, catalogs).map((l) => l.slug),
    ).toEqual(["partial", "unsynced"]);
  });

  it("truncating catalogs to newest N hides an older unsynced catalog (false all-synced)", () => {
    const unsyncedOld = { slug: "old-unsynced", stage: "paid" as const };
    const filler = Array.from({ length: 5 }, (_, i) => ({
      slug: `filler-${i}`,
      stage: "paid" as const,
    }));
    const orders = [
      { leadSlug: "old-unsynced", commerceAddon: true },
      ...filler.map((l) => ({ leadSlug: l.slug, commerceAddon: true })),
    ];
    const fullCatalogs = [
      {
        leadSlug: "old-unsynced",
        items: [{ id: "a", name: "A", priceCents: 100 }],
      },
      ...filler.map((l) => ({
        leadSlug: l.slug,
        items: [{ id: "x", name: "X", priceCents: 200, stripePriceId: "price_x" }],
      })),
    ];
    const truncatedCatalogs = fullCatalogs.filter(
      (c) => c.leadSlug !== "old-unsynced",
    );

    expect(
      listCommerceCatalogsUnsynced(
        [unsyncedOld, ...filler],
        orders,
        fullCatalogs,
      ).map((l) => l.slug),
    ).toEqual(["old-unsynced"]);
    expect(
      listCommerceCatalogsUnsynced(
        [unsyncedOld, ...filler],
        orders,
        truncatedCatalogs,
      ).map((l) => l.slug),
    ).toEqual([]);
  });
});

describe("preserveCommerceStripeIds", () => {
  it("keeps product + price ids when the SKU id and priceCents match", () => {
    const previous = [
      {
        id: "sku_a",
        name: "Latte",
        priceCents: 450,
        stripeProductId: "prod_a",
        stripePriceId: "price_a",
      },
    ];
    expect(
      preserveCommerceStripeIds(
        [{ id: "sku_a", name: "Latte (hot)", description: "12oz", priceCents: 450 }],
        previous,
      ),
    ).toEqual([
      {
        id: "sku_a",
        name: "Latte (hot)",
        description: "12oz",
        priceCents: 450,
        stripeProductId: "prod_a",
        stripePriceId: "price_a",
      },
    ]);
  });

  it("keeps product id but drops price id when priceCents changes", () => {
    const previous = [
      {
        id: "sku_a",
        name: "Latte",
        priceCents: 450,
        stripeProductId: "prod_a",
        stripePriceId: "price_a",
      },
    ];
    expect(
      preserveCommerceStripeIds(
        [{ id: "sku_a", name: "Latte", priceCents: 500 }],
        previous,
      ),
    ).toEqual([
      {
        id: "sku_a",
        name: "Latte",
        priceCents: 500,
        stripeProductId: "prod_a",
      },
    ]);
  });

  it("does not invent Stripe ids for new SKU ids", () => {
    expect(
      preserveCommerceStripeIds(
        [{ id: "sku_new", name: "Mocha", priceCents: 550 }],
        [
          {
            id: "sku_old",
            name: "Latte",
            priceCents: 450,
            stripeProductId: "prod_a",
            stripePriceId: "price_a",
          },
        ],
      ),
    ).toEqual([{ id: "sku_new", name: "Mocha", priceCents: 550 }]);
  });
});

describe("normalizeCommerceItems", () => {
  it("accepts trimmed valid SKUs", () => {
    const result = normalizeCommerceItems([
      { id: "sku_a", name: "  Latte  ", description: " 12oz ", priceCents: 450 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toEqual([
        { id: "sku_a", name: "Latte", description: "12oz", priceCents: 450 },
      ]);
    }
  });

  it("rejects over the 50-SKU cap and empty names", () => {
    const tooMany = Array.from({ length: MAX_COMMERCE_SKUS + 1 }, (_, i) => ({
      name: `Item ${i}`,
      priceCents: 100,
    }));
    expect(normalizeCommerceItems(tooMany).ok).toBe(false);
    expect(normalizeCommerceItems([{ name: "  ", priceCents: 100 }]).ok).toBe(
      false,
    );
  });

  it("rejects non-integer or negative prices", () => {
    expect(
      normalizeCommerceItems([{ name: "X", priceCents: 1.5 }]).ok,
    ).toBe(false);
    expect(
      normalizeCommerceItems([{ name: "X", priceCents: -1 }]).ok,
    ).toBe(false);
  });

  it("hard-rejects over-long opaque SKU ids (never truncates)", () => {
    const exact = "s".repeat(MAX_COMMERCE_SKU_ID_LENGTH);
    const exactOk = normalizeCommerceItems([
      { id: exact, name: "Exact", priceCents: 100 },
    ]);
    expect(exactOk.ok).toBe(true);
    if (exactOk.ok) {
      expect(exactOk.items[0]?.id).toBe(exact);
    }

    const over = "s".repeat(MAX_COMMERCE_SKU_ID_LENGTH + 1);
    const overResult = normalizeCommerceItems([
      { id: over, name: "Over", priceCents: 100 },
    ]);
    expect(overResult.ok).toBe(false);
    if (!overResult.ok) {
      expect(overResult.error).toMatch(/id must be ≤64/);
      expect(overResult.error).not.toContain(over.slice(0, 20));
    }
  });

  it("mints a new id when blank/missing (under the opaque ceiling)", () => {
    const result = normalizeCommerceItems([
      { id: "   ", name: "Minted", priceCents: 200 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0]?.id.startsWith("sku_")).toBe(true);
      expect(result.items[0]!.id.length).toBeLessThanOrEqual(
        MAX_COMMERCE_SKU_ID_LENGTH,
      );
    }
  });
});

describe("formatPriceUsd + commerceOrderRequestMessage", () => {
  it("formats cents and builds an order-request message", () => {
    expect(formatPriceUsd(1299)).toBe("$12.99");
    expect(
      commerceOrderRequestMessage({
        id: "1",
        name: "Gift card",
        priceCents: 5000,
      }),
    ).toBe("I'd like to order: Gift card ($50.00).");
  });
});

describe("commerceOrderPaidInquiryMessage", () => {
  it("formats a paid Buy now order note with the SKU and session id", () => {
    expect(
      commerceOrderPaidInquiryMessage({
        skuName: "Gift card",
        amountTotalUsd: 50,
        stripeSessionId: "cs_test_123",
        skuId: "sku_a",
      }),
    ).toBe(
      "Paid order via Buy now: Gift card ($50.00) — Stripe session cs_test_123, SKU sku_a.",
    );
  });

  it("omits the SKU note when skuId is not provided", () => {
    expect(
      commerceOrderPaidInquiryMessage({
        skuName: "Gift card",
        amountTotalUsd: 50,
        stripeSessionId: "cs_test_123",
      }),
    ).toBe("Paid order via Buy now: Gift card ($50.00) — Stripe session cs_test_123.");
  });
});
