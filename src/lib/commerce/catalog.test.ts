import { describe, expect, it } from "vitest";
import {
  commerceBuyNowAriaLabel,
  commerceCatalogIntroCopy,
  commerceDraftItemsAfterSync,
  commerceOrderPaidInquiryMessage,
  commerceOrderRequestMessage,
  commerceRequestOrderAriaLabel,
  formatPriceUsd,
  leadEligibleForCommerceCatalog,
  leadStageEligibleForCommerceCatalog,
  listCommerceCatalogsMissing,
  listCommerceCatalogsUnsynced,
  normalizeCommerceItems,
  oldestCommerceCatalogCandidateAgeHours,
  preserveCommerceStripeIds,
} from "./catalog";
import {
  MAX_COMMERCE_SKU_ID_LENGTH,
  MAX_COMMERCE_SKUS,
  MIN_SKU_PRICE_CENTS,
} from "./types";

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

  it("rejects commerceAddon orders after recurringCanceledAt", () => {
    expect(
      leadEligibleForCommerceCatalog({ stage: "paid" }, [
        { commerceAddon: true, recurringCanceledAt: 1_720_000_000_000 },
      ]),
    ).toBe(false);
    expect(
      leadEligibleForCommerceCatalog({ stage: "paid" }, [
        { commerceAddon: true, recurringCanceledAt: 1_720_000_000_000 },
        { commerceAddon: true },
      ]),
    ).toBe(true);
  });

  it("rejects commerceAddon orders that were refunded or disputed", () => {
    expect(
      leadEligibleForCommerceCatalog({ stage: "paid" }, [
        { commerceAddon: true, refundedAt: "2026-07-01T00:00:00.000Z" },
      ]),
    ).toBe(false);
    expect(
      leadEligibleForCommerceCatalog({ stage: "paid" }, [
        { commerceAddon: true, disputedAt: "2026-07-01T00:00:00.000Z" },
      ]),
    ).toBe(false);
    expect(
      leadEligibleForCommerceCatalog({ stage: "paid" }, [
        { commerceAddon: true, refundedAt: "2026-07-01T00:00:00.000Z" },
        { commerceAddon: true },
      ]),
    ).toBe(true);
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

  it("excludes unsynced catalogs when the only commerceAddon order is recurringCanceledAt", () => {
    const leads = [
      { slug: "paused-unsynced", stage: "paid" as const },
      { slug: "active-unsynced", stage: "paid" as const },
    ];
    const orders = [
      {
        leadSlug: "paused-unsynced",
        commerceAddon: true,
        recurringCanceledAt: 1_720_000_000_000,
      },
      { leadSlug: "active-unsynced", commerceAddon: true },
    ];
    const catalogs = [
      {
        leadSlug: "paused-unsynced",
        items: [{ id: "a", name: "A", priceCents: 100, stripePriceId: undefined }],
      },
      {
        leadSlug: "active-unsynced",
        items: [{ id: "b", name: "B", priceCents: 200, stripePriceId: undefined }],
      },
    ];
    expect(
      listCommerceCatalogsUnsynced(leads, orders, catalogs).map((l) => l.slug),
    ).toEqual(["active-unsynced"]);
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
        items: [{ id: "a", name: "A", priceCents: 100, stripePriceId: undefined }],
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

describe("oldestCommerceCatalogCandidateAgeHours", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const NOW = Date.parse("2026-07-17T12:00:00.000Z");

  it("returns null for no candidates", () => {
    expect(oldestCommerceCatalogCandidateAgeHours([], [], NOW)).toBeNull();
  });

  it("returns hours since the oldest candidate's commerceAddon order, ignoring non-candidates", () => {
    const candidates = [{ slug: "alpha" }, { slug: "beta" }];
    const orders = [
      {
        leadSlug: "alpha",
        commerceAddon: true,
        createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "beta",
        commerceAddon: true,
        createdAt: new Date(NOW - 30 * HOUR_MS).toISOString(),
      },
      // Not a candidate — must not affect the oldest-age scan.
      {
        leadSlug: "gamma",
        commerceAddon: true,
        createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
      },
      // Candidate but not a commerceAddon order — must be ignored.
      {
        leadSlug: "alpha",
        commerceAddon: false,
        createdAt: new Date(NOW - 500 * HOUR_MS).toISOString(),
      },
      // Candidate but paused — must be ignored.
      {
        leadSlug: "beta",
        commerceAddon: true,
        recurringCanceledAt: NOW - 100 * HOUR_MS,
        createdAt: new Date(NOW - 700 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestCommerceCatalogCandidateAgeHours(candidates, orders, NOW)).toBe(30);
  });

  it("skips orders with a missing or unparseable createdAt", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [{ leadSlug: "alpha", commerceAddon: true, createdAt: "not-a-date" }];
    expect(oldestCommerceCatalogCandidateAgeHours(candidates, orders, NOW)).toBeNull();
  });

  it("clamps to 0 when nowMs is before the order's createdAt", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        leadSlug: "alpha",
        commerceAddon: true,
        createdAt: new Date(NOW + HOUR_MS).toISOString(),
      },
    ];
    expect(oldestCommerceCatalogCandidateAgeHours(candidates, orders, NOW)).toBe(0);
  });

  it("ignores an older refunded/disputed commerceAddon order — only the active entitlement anchors the age", () => {
    const candidates = [{ slug: "alpha" }];
    const orders = [
      {
        // Older order refunded mid-cycle without a recurringCanceledAt —
        // a raw recurringCanceledAt check alone would wrongly anchor here.
        leadSlug: "alpha",
        commerceAddon: true,
        createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
        refundedAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "alpha",
        commerceAddon: true,
        createdAt: new Date(NOW - 30 * HOUR_MS).toISOString(),
        disputedAt: new Date(NOW - 900 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "alpha",
        commerceAddon: true,
        createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestCommerceCatalogCandidateAgeHours(candidates, orders, NOW)).toBe(4);
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

  it("rejects a price under Stripe's real USD minimum charge (0.50), including 0", () => {
    // Sync to Stripe has no price floor of its own — a SKU under this amount
    // would save/sync successfully but 502 for every real shopper the moment
    // they click Buy now (Stripe rejects the Checkout Session at create time).
    const zero = normalizeCommerceItems([{ name: "Free sample", priceCents: 0 }]);
    expect(zero.ok).toBe(false);
    if (!zero.ok) {
      expect(zero.error).toMatch(/\$0\.50/);
    }

    const under = normalizeCommerceItems([{ name: "Napkin fee", priceCents: 25 }]);
    expect(under.ok).toBe(false);

    const atFloor = normalizeCommerceItems([
      { name: "Extra shot", priceCents: MIN_SKU_PRICE_CENTS },
    ]);
    expect(atFloor.ok).toBe(true);
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

describe("commerceDraftItemsAfterSync", () => {
  const syncedItems = [
    { id: "sku_1", name: "Synced item", priceCents: 500, stripePriceId: "price_1" },
  ];

  it("applies the synced items when the editing lead matches the synced lead", () => {
    const draft = [{ id: "sku_0", name: "Draft item", priceCents: 100 }];
    const result = commerceDraftItemsAfterSync(
      "lead-a",
      "lead-a",
      draft,
      syncedItems,
    );
    expect(result).toEqual(syncedItems);
    // Defensive copy, not the same array/object references.
    expect(result).not.toBe(syncedItems);
    expect(result[0]).not.toBe(syncedItems[0]);
  });

  it("leaves the draft untouched when a different lead's catalog was synced (cross-lead clobber guard)", () => {
    const draft = [{ id: "sku_0", name: "Lead A's unsaved draft", priceCents: 100 }];
    const result = commerceDraftItemsAfterSync(
      "lead-a",
      "lead-b",
      draft,
      syncedItems,
    );
    expect(result).toBe(draft);
  });

  it("leaves the draft untouched when no editor is open", () => {
    const draft: typeof syncedItems = [];
    const result = commerceDraftItemsAfterSync(null, "lead-b", draft, syncedItems);
    expect(result).toBe(draft);
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

describe("commerceCatalogIntroCopy", () => {
  it("promises a manual request when every SKU is unsynced", () => {
    const copy = commerceCatalogIntroCopy([{}, { stripePriceId: undefined }]);
    expect(copy).toContain("Request an item below");
    expect(copy).toContain("email or phone");
  });

  it("promises instant Stripe checkout when every SKU is synced", () => {
    const copy = commerceCatalogIntroCopy([
      { stripePriceId: "price_a" },
      { stripePriceId: "price_b" },
    ]);
    expect(copy).toContain("Buy now to pay securely through Stripe");
    expect(copy).not.toContain("email or phone");
  });

  it("describes both paths for a partially-synced catalog (the common steady state)", () => {
    const copy = commerceCatalogIntroCopy([
      { stripePriceId: "price_a" },
      {},
    ]);
    expect(copy).toContain("Buy now items charge securely through Stripe");
    expect(copy).toContain("email or phone");
  });

  it("treats an empty catalog like all-unsynced (no direct-checkout SKU exists)", () => {
    expect(commerceCatalogIntroCopy([])).toBe(
      "Request an item below — we'll confirm availability and payment by email or phone.",
    );
  });
});

describe("commerceBuyNowAriaLabel + commerceRequestOrderAriaLabel", () => {
  it("names each catalog item uniquely so a screen-reader list of buttons/links is distinguishable", () => {
    // Without a per-item accessible name, every SKU on a multi-item catalog
    // renders a "Buy now" button (or "Request order" link) with the exact
    // same accessible name — a screen-reader user browsing by a
    // controls-list shortcut (NVDA/JAWS "list all buttons") sees N identical
    // entries with no way to tell which item each one acts on. Same bug
    // class as list-row-action-button-aria-label, on the public storefront
    // instead of an operator dashboard panel.
    const giftCard = { id: "1", name: "Gift card", priceCents: 5000 };
    const candle = { id: "2", name: "Soy candle", priceCents: 1899 };

    expect(commerceBuyNowAriaLabel(giftCard)).toBe("Buy now — Gift card ($50.00)");
    expect(commerceBuyNowAriaLabel(candle)).toBe("Buy now — Soy candle ($18.99)");
    expect(commerceBuyNowAriaLabel(giftCard)).not.toBe(commerceBuyNowAriaLabel(candle));

    expect(commerceRequestOrderAriaLabel(giftCard)).toBe("Request order — Gift card");
    expect(commerceRequestOrderAriaLabel(candle)).toBe("Request order — Soy candle");
    expect(commerceRequestOrderAriaLabel(giftCard)).not.toBe(
      commerceRequestOrderAriaLabel(candle),
    );
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
