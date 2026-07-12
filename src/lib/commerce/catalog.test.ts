import { describe, expect, it } from "vitest";
import {
  commerceOrderPaidInquiryMessage,
  commerceOrderRequestMessage,
  formatPriceUsd,
  leadEligibleForCommerceCatalog,
  leadStageEligibleForCommerceCatalog,
  listCommerceCatalogsMissing,
  normalizeCommerceItems,
} from "./catalog";
import { MAX_COMMERCE_SKUS } from "./types";

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
