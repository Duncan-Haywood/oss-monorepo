import { afterEach, describe, expect, it } from "vitest";
import { getBundle } from "@/lib/pricing/bundles";
import {
  bundleCatalogPriceIdsFromEnv,
  catalogRecurringPriceIdsFromEnv,
  commerceSkuLineItemQuantity,
  sessionLineItemsIncludeCatalogRecurringPrice,
  sessionLineItemsIncludeMetadataKey,
  sessionLineItemsIncludePriceId,
  sessionLineItemsMatchBundleCatalogPrices,
} from "./checkout-price-line-items";

describe("sessionLineItemsIncludePriceId", () => {
  it("returns true when the Price id is present", () => {
    expect(
      sessionLineItemsIncludePriceId(["price_a", "price_b"], "price_a"),
    ).toBe(true);
  });

  it("returns false when the Price id is missing, blank, or only whitespace", () => {
    expect(sessionLineItemsIncludePriceId(["price_a"], "price_b")).toBe(false);
    expect(sessionLineItemsIncludePriceId(["price_a"], "")).toBe(false);
    expect(sessionLineItemsIncludePriceId(["price_a"], "   ")).toBe(false);
    expect(sessionLineItemsIncludePriceId([null, undefined, ""], "price_a")).toBe(
      false,
    );
  });

  it("trims the wanted Price id but does not soft-match substrings", () => {
    expect(sessionLineItemsIncludePriceId(["price_a"], "  price_a  ")).toBe(true);
    expect(sessionLineItemsIncludePriceId(["price_ab"], "price_a")).toBe(false);
  });
});

describe("sessionLineItemsIncludeMetadataKey", () => {
  it("returns true when a line item's Price metadata carries the wanted key", () => {
    expect(
      sessionLineItemsIncludeMetadataKey(
        [{ price: { metadata: { local_site_studio_key: "commerce_sku_demo-cafe_sku_1" } } }],
        "commerce_sku_demo-cafe_sku_1",
      ),
    ).toBe(true);
  });

  it("never compares a Price id — only the metadata key matters (proves an old, catalog-orphaned Price still matches)", () => {
    // The whole point of this helper: unlike sessionLineItemsIncludePriceId,
    // it never looks at a Price's id at all, only its stable per-SKU
    // metadata key. A line item carrying a Price id that no longer appears
    // anywhere in the catalog (superseded by a resync) still matches, as
    // long as the metadata key is present — this signature intentionally
    // does not even accept a Price id parameter to check against.
    expect(
      sessionLineItemsIncludeMetadataKey(
        [{ price: { metadata: { local_site_studio_key: "commerce_sku_demo-cafe_sku_1" } } }],
        "commerce_sku_demo-cafe_sku_1",
      ),
    ).toBe(true);
  });

  it("returns false when no line item Price carries the wanted key", () => {
    expect(
      sessionLineItemsIncludeMetadataKey(
        [{ price: { metadata: { local_site_studio_key: "commerce_sku_other-lead_sku_9" } } }],
        "commerce_sku_demo-cafe_sku_1",
      ),
    ).toBe(false);
  });

  it("returns false for a Price with no metadata, a string-id line item (not expanded), or an empty list", () => {
    expect(
      sessionLineItemsIncludeMetadataKey([{ price: { metadata: {} } }], "commerce_sku_demo-cafe_sku_1"),
    ).toBe(false);
    expect(
      sessionLineItemsIncludeMetadataKey([{ price: "price_abc" }], "commerce_sku_demo-cafe_sku_1"),
    ).toBe(false);
    expect(sessionLineItemsIncludeMetadataKey([], "commerce_sku_demo-cafe_sku_1")).toBe(false);
  });

  it("returns false when metadataKey is blank or only whitespace", () => {
    expect(
      sessionLineItemsIncludeMetadataKey(
        [{ price: { metadata: { local_site_studio_key: "" } } }],
        "",
      ),
    ).toBe(false);
    expect(
      sessionLineItemsIncludeMetadataKey(
        [{ price: { metadata: { local_site_studio_key: "commerce_sku_demo-cafe_sku_1" } } }],
        "   ",
      ),
    ).toBe(false);
  });

  it("checks every line item, not just the first", () => {
    expect(
      sessionLineItemsIncludeMetadataKey(
        [
          { price: { metadata: { local_site_studio_key: "commerce_sku_other_sku" } } },
          { price: { metadata: { local_site_studio_key: "commerce_sku_demo-cafe_sku_1" } } },
        ],
        "commerce_sku_demo-cafe_sku_1",
      ),
    ).toBe(true);
  });
});

describe("commerceSkuLineItemQuantity", () => {
  it("returns the matched line item's quantity (adjustable_quantity Buy now purchase)", () => {
    expect(
      commerceSkuLineItemQuantity(
        [
          {
            price: { metadata: { local_site_studio_key: "commerce_sku_demo-cafe_sku_1" } },
            quantity: 3,
          },
        ],
        "commerce_sku_demo-cafe_sku_1",
      ),
    ).toBe(3);
  });

  it("returns undefined when no line item carries the metadata key", () => {
    expect(
      commerceSkuLineItemQuantity(
        [
          {
            price: { metadata: { local_site_studio_key: "commerce_sku_other_sku" } },
            quantity: 5,
          },
        ],
        "commerce_sku_demo-cafe_sku_1",
      ),
    ).toBeUndefined();
  });

  it("returns undefined when the matched line item's quantity is missing, zero, negative, or non-integer — never falls back to a bogus value", () => {
    const key = "commerce_sku_demo-cafe_sku_1";
    expect(
      commerceSkuLineItemQuantity(
        [{ price: { metadata: { local_site_studio_key: key } } }],
        key,
      ),
    ).toBeUndefined();
    expect(
      commerceSkuLineItemQuantity(
        [{ price: { metadata: { local_site_studio_key: key } }, quantity: 0 }],
        key,
      ),
    ).toBeUndefined();
    expect(
      commerceSkuLineItemQuantity(
        [{ price: { metadata: { local_site_studio_key: key } }, quantity: -1 }],
        key,
      ),
    ).toBeUndefined();
    expect(
      commerceSkuLineItemQuantity(
        [{ price: { metadata: { local_site_studio_key: key } }, quantity: 1.5 }],
        key,
      ),
    ).toBeUndefined();
    expect(
      commerceSkuLineItemQuantity(
        [{ price: { metadata: { local_site_studio_key: key } }, quantity: null }],
        key,
      ),
    ).toBeUndefined();
  });

  it("returns undefined when metadataKey is blank/whitespace, or the list is empty", () => {
    expect(commerceSkuLineItemQuantity([], "commerce_sku_demo-cafe_sku_1")).toBeUndefined();
    expect(
      commerceSkuLineItemQuantity(
        [{ price: { metadata: { local_site_studio_key: "commerce_sku_demo-cafe_sku_1" } }, quantity: 3 }],
        "   ",
      ),
    ).toBeUndefined();
  });
});

describe("bundleCatalogPriceIdsFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns setup-only for Starter when setup env is set (interval irrelevant)", () => {
    process.env.STRIPE_PRICE_ID_STARTER_SETUP = "price_starter";
    const starter = getBundle("starter");
    expect(starter).toBeDefined();
    expect(bundleCatalogPriceIdsFromEnv(starter!)).toEqual({
      setupId: "price_starter",
      recurringId: null,
    });
    expect(bundleCatalogPriceIdsFromEnv(starter!, "annual")).toEqual({
      setupId: "price_starter",
      recurringId: null,
    });
  });

  it("returns null when Growth monthly env is missing (defaults to monthly)", () => {
    process.env.STRIPE_PRICE_ID_GROWTH_SETUP = "price_growth_setup";
    delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    const growth = getBundle("growth");
    expect(bundleCatalogPriceIdsFromEnv(growth!)).toBeNull();
  });

  it("returns setup+monthly for Growth when both envs are set", () => {
    process.env.STRIPE_PRICE_ID_GROWTH_SETUP = " price_growth_setup ";
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    const growth = getBundle("growth");
    expect(bundleCatalogPriceIdsFromEnv(growth!)).toEqual({
      setupId: "price_growth_setup",
      recurringId: "price_growth_monthly",
    });
    expect(bundleCatalogPriceIdsFromEnv(growth!, "monthly")).toEqual({
      setupId: "price_growth_setup",
      recurringId: "price_growth_monthly",
    });
  });

  it("returns setup+annual for Growth when billingInterval is annual and both envs are set", () => {
    process.env.STRIPE_PRICE_ID_GROWTH_SETUP = "price_growth_setup";
    process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL = " price_growth_annual ";
    const growth = getBundle("growth");
    expect(bundleCatalogPriceIdsFromEnv(growth!, "annual")).toEqual({
      setupId: "price_growth_setup",
      recurringId: "price_growth_annual",
    });
  });

  it("returns null when billingInterval is annual but the annual env is missing", () => {
    process.env.STRIPE_PRICE_ID_GROWTH_SETUP = "price_growth_setup";
    delete process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL;
    const growth = getBundle("growth");
    expect(bundleCatalogPriceIdsFromEnv(growth!, "annual")).toBeNull();
  });
});

describe("sessionLineItemsMatchBundleCatalogPrices", () => {
  it("requires setup for Starter and setup+recurring for Growth", () => {
    expect(
      sessionLineItemsMatchBundleCatalogPrices(["price_starter"], {
        setupId: "price_starter",
        recurringId: null,
      }),
    ).toBe(true);
    expect(
      sessionLineItemsMatchBundleCatalogPrices(
        ["price_growth_setup", "price_growth_monthly"],
        { setupId: "price_growth_setup", recurringId: "price_growth_monthly" },
      ),
    ).toBe(true);
    expect(
      sessionLineItemsMatchBundleCatalogPrices(["price_growth_setup"], {
        setupId: "price_growth_setup",
        recurringId: "price_growth_monthly",
      }),
    ).toBe(false);
  });

  it("matches an annual recurringId the same way as monthly", () => {
    expect(
      sessionLineItemsMatchBundleCatalogPrices(
        ["price_growth_setup", "price_growth_annual"],
        { setupId: "price_growth_setup", recurringId: "price_growth_annual" },
      ),
    ).toBe(true);
  });

  describe("requireSetupFee: false (tier-upgrade setup-fee skip)", () => {
    it("still matches when the setup Price is absent but recurring is present", () => {
      expect(
        sessionLineItemsMatchBundleCatalogPrices(
          ["price_growth_monthly"],
          { setupId: "price_growth_setup", recurringId: "price_growth_monthly" },
          { requireSetupFee: false },
        ),
      ).toBe(true);
    });

    it("still requires the recurring Price when the tier has one", () => {
      expect(
        sessionLineItemsMatchBundleCatalogPrices(
          [],
          { setupId: "price_growth_setup", recurringId: "price_growth_monthly" },
          { requireSetupFee: false },
        ),
      ).toBe(false);
    });

    it("still matches when the setup Price is present anyway (charged despite being optional)", () => {
      expect(
        sessionLineItemsMatchBundleCatalogPrices(
          ["price_growth_setup", "price_growth_monthly"],
          { setupId: "price_growth_setup", recurringId: "price_growth_monthly" },
          { requireSetupFee: false },
        ),
      ).toBe(true);
    });

    it("defaults requireSetupFee to true when options is omitted", () => {
      expect(
        sessionLineItemsMatchBundleCatalogPrices(["price_growth_monthly"], {
          setupId: "price_growth_setup",
          recurringId: "price_growth_monthly",
        }),
      ).toBe(false);
    });
  });
});

describe("catalogRecurringPriceIdsFromEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("collects Growth/Complete/Commerce monthly Price ids when set", () => {
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = " price_growth_m ";
    process.env.STRIPE_PRICE_ID_COMPLETE_MONTHLY = "price_complete_m";
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_m";
    delete process.env.STRIPE_PRICE_ID_STARTER_SETUP;
    delete process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL;
    delete process.env.STRIPE_PRICE_ID_COMPLETE_ANNUAL;
    expect(catalogRecurringPriceIdsFromEnv()).toEqual([
      "price_growth_m",
      "price_complete_m",
      "price_commerce_m",
    ]);
  });

  it("also collects Growth/Complete annual Price ids when set — either cadence is a recognized recurring Price for Billing Portal/success eligibility", () => {
    delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_COMPLETE_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL = "price_growth_a";
    process.env.STRIPE_PRICE_ID_COMPLETE_ANNUAL = "price_complete_a";
    expect(catalogRecurringPriceIdsFromEnv()).toEqual([
      "price_growth_a",
      "price_complete_a",
    ]);
  });

  it("returns empty when no recurring Price envs are configured", () => {
    delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_COMPLETE_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL;
    delete process.env.STRIPE_PRICE_ID_COMPLETE_ANNUAL;
    expect(catalogRecurringPriceIdsFromEnv()).toEqual([]);
  });
});

describe("sessionLineItemsIncludeCatalogRecurringPrice", () => {
  it("returns true when any catalog recurring Price is present", () => {
    expect(
      sessionLineItemsIncludeCatalogRecurringPrice(
        ["price_setup", "price_growth_m"],
        ["price_growth_m", "price_complete_m"],
      ),
    ).toBe(true);
  });

  it("fails closed when recurringPriceIds is empty or none match", () => {
    expect(
      sessionLineItemsIncludeCatalogRecurringPrice(["price_foreign"], []),
    ).toBe(false);
    expect(
      sessionLineItemsIncludeCatalogRecurringPrice(
        ["price_foreign"],
        ["price_growth_m"],
      ),
    ).toBe(false);
  });
});
