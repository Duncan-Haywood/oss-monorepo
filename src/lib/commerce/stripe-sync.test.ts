import { describe, expect, it } from "vitest";
import {
  archiveOrphanCommerceStripeProducts,
  commerceSkuStripeKey,
  listOrphanCommerceStripeProducts,
  syncCommerceCatalogToStripe,
  type StripeProductsAndPrices,
} from "./stripe-sync";
import type { CommerceSku } from "./types";

function createFakeStripe(): StripeProductsAndPrices & {
  productCount: () => number;
  activeProductCount: () => number;
  priceCount: () => number;
  productCreateCallsByIdempotencyKey: () => Map<string, number>;
  priceCreateCallsByIdempotencyKey: () => Map<string, number>;
} {
  const products: Array<{
    id: string;
    name?: string;
    description?: string;
    active: boolean;
    metadata: Record<string, string>;
  }> = [];
  const prices: Array<{ id: string; product: string; unit_amount: number; active: boolean }> = [];
  let nextId = 1;
  /** Real Stripe returns the SAME object for a replayed Idempotency-Key instead of creating a second one. */
  const productsByIdempotencyKey = new Map<string, (typeof products)[number]>();
  const productCreateCallsByIdempotencyKey = new Map<string, number>();
  const pricesByIdempotencyKey = new Map<string, (typeof prices)[number]>();
  const priceCreateCallsByIdempotencyKey = new Map<string, number>();

  /** Real Stripe list endpoints cap a page at `limit` and set has_more/starting_after. */
  function paginate<T extends { id: string }>(
    all: T[],
    limit: number,
    startingAfter: string | undefined,
  ): { data: T[]; has_more: boolean } {
    const startIndex = startingAfter
      ? all.findIndex((item) => item.id === startingAfter) + 1
      : 0;
    const page = all.slice(startIndex, startIndex + limit);
    return { data: page, has_more: startIndex + page.length < all.length };
  }

  return {
    products: {
      async list({ active, limit, starting_after }) {
        const matching = products.filter((p) => (active ? p.active : true));
        return paginate(matching, limit, starting_after);
      },
      async create({ name, description, metadata }, options) {
        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
          productCreateCallsByIdempotencyKey.set(
            idempotencyKey,
            (productCreateCallsByIdempotencyKey.get(idempotencyKey) ?? 0) + 1,
          );
          const existing = productsByIdempotencyKey.get(idempotencyKey);
          if (existing) return existing;
        }
        const product = { id: `prod_${nextId++}`, name, description, metadata, active: true };
        products.push(product);
        if (idempotencyKey) productsByIdempotencyKey.set(idempotencyKey, product);
        return product;
      },
      async update(id, params) {
        const product = products.find((p) => p.id === id);
        if (!product) throw new Error(`Product ${id} not found`);
        if (params.active !== undefined) product.active = params.active;
        if (params.name !== undefined) product.name = params.name;
        if (params.description !== undefined) product.description = params.description;
        return product;
      },
    },
    prices: {
      async list({ product, active, limit, starting_after }) {
        const matching = prices.filter((p) => p.product === product && (active ? p.active : true));
        return paginate(matching, limit, starting_after);
      },
      async create({ product, unit_amount }, options) {
        const idempotencyKey = options?.idempotencyKey;
        if (idempotencyKey) {
          priceCreateCallsByIdempotencyKey.set(
            idempotencyKey,
            (priceCreateCallsByIdempotencyKey.get(idempotencyKey) ?? 0) + 1,
          );
          const existing = pricesByIdempotencyKey.get(idempotencyKey);
          if (existing) return existing;
        }
        const price = { id: `price_${nextId++}`, product, unit_amount, active: true };
        prices.push(price);
        if (idempotencyKey) pricesByIdempotencyKey.set(idempotencyKey, price);
        return price;
      },
      async update(id, params) {
        const price = prices.find((p) => p.id === id);
        if (!price) throw new Error(`Price ${id} not found`);
        price.active = params.active;
        return price;
      },
    },
    productCount: () => products.length,
    activeProductCount: () => products.filter((p) => p.active).length,
    priceCount: () => prices.length,
    productCreateCallsByIdempotencyKey: () => productCreateCallsByIdempotencyKey,
    priceCreateCallsByIdempotencyKey: () => priceCreateCallsByIdempotencyKey,
  };
}

describe("commerceSkuStripeKey", () => {
  it("is stable and namespaced per lead + sku", () => {
    expect(commerceSkuStripeKey("acme-cafe", "sku_1")).toBe("commerce_sku_acme-cafe_sku_1");
    expect(commerceSkuStripeKey("acme-cafe", "sku_1")).not.toBe(
      commerceSkuStripeKey("other-lead", "sku_1"),
    );
  });
});

describe("syncCommerceCatalogToStripe", () => {
  const items: CommerceSku[] = [
    { id: "sku_1", name: "Latte", priceCents: 499 },
    { id: "sku_2", name: "Croissant", priceCents: 350 },
  ];

  it("creates one Product + Price per SKU and returns the ids", async () => {
    const stripe = createFakeStripe();
    const result = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    expect(result).toHaveLength(2);
    expect(result[0]?.stripeProductId).toMatch(/^prod_/);
    expect(result[0]?.stripePriceId).toMatch(/^price_/);
    expect(stripe.productCount()).toBe(2);
    expect(stripe.priceCount()).toBe(2);
  });

  it("is idempotent on re-run with unchanged prices", async () => {
    const stripe = createFakeStripe();
    const first = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);
    const second = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    expect(second[0]?.stripeProductId).toBe(first[0]?.stripeProductId);
    expect(second[0]?.stripePriceId).toBe(first[0]?.stripePriceId);
    expect(stripe.productCount()).toBe(2);
    expect(stripe.priceCount()).toBe(2);
  });

  it("creates a new Price (keeping the same Product) when priceCents changes", async () => {
    const stripe = createFakeStripe();
    const first = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    const repriced = [{ ...items[0]!, priceCents: 599 }, items[1]!];
    const second = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", repriced);

    expect(second[0]?.stripeProductId).toBe(first[0]?.stripeProductId);
    expect(second[0]?.stripePriceId).not.toBe(first[0]?.stripePriceId);
    expect(stripe.productCount()).toBe(2);
    expect(stripe.priceCount()).toBe(3);
  });

  it("renames the Stripe Product in place when the SKU name changes (keeping the same Product/Price ids)", async () => {
    const stripe = createFakeStripe();
    const first = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    const renamed = [{ ...items[0]!, name: "Oat Milk Latte" }, items[1]!];
    const second = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", renamed);

    expect(second[0]?.stripeProductId).toBe(first[0]?.stripeProductId);
    expect(second[0]?.stripePriceId).toBe(first[0]?.stripePriceId);
    expect(stripe.productCount()).toBe(2); // no duplicate created

    const { data: products } = await stripe.products.list({ limit: 100 });
    const renamedProduct = products.find((p) => p.id === first[0]!.stripeProductId);
    expect(renamedProduct?.name).toBe("Acme Cafe — Oat Milk Latte");
  });

  it("renames the Stripe Product when the lead's businessName changes, even with the SKU name unchanged", async () => {
    const stripe = createFakeStripe();
    const first = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Coffee Roasters", items);

    const { data: products } = await stripe.products.list({ limit: 100 });
    const renamedProduct = products.find((p) => p.id === first[0]!.stripeProductId);
    expect(renamedProduct?.name).toBe("Acme Coffee Roasters — Latte");
  });

  it("includes the SKU description on the Stripe Product when present", async () => {
    const stripe = createFakeStripe();
    const withDescription = [
      { ...items[0]!, description: "60-minute deep tissue, includes hot towel" },
      items[1]!,
    ];
    const result = await syncCommerceCatalogToStripe(
      stripe,
      "acme-cafe",
      "Acme Cafe",
      withDescription,
    );

    const { data: products } = await stripe.products.list({ limit: 100 });
    const product = products.find((p) => p.id === result[0]!.stripeProductId);
    expect(product?.description).toBe("60-minute deep tissue, includes hot towel");
  });

  it("omits description on the Stripe Product when the SKU has none", async () => {
    const stripe = createFakeStripe();
    const result = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    const { data: products } = await stripe.products.list({ limit: 100 });
    const product = products.find((p) => p.id === result[0]!.stripeProductId);
    expect(product?.description).toBeUndefined();
  });

  it("resyncs the Stripe Product description in place when it changes (keeping the same Product/Price ids)", async () => {
    const stripe = createFakeStripe();
    const first = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", [
      { ...items[0]!, description: "Original description" },
      items[1]!,
    ]);

    const redescribed = [
      { ...items[0]!, description: "Updated description" },
      items[1]!,
    ];
    const second = await syncCommerceCatalogToStripe(
      stripe,
      "acme-cafe",
      "Acme Cafe",
      redescribed,
    );

    expect(second[0]?.stripeProductId).toBe(first[0]?.stripeProductId);
    expect(second[0]?.stripePriceId).toBe(first[0]?.stripePriceId);
    expect(stripe.productCount()).toBe(2); // no duplicate created

    const { data: products } = await stripe.products.list({ limit: 100 });
    const redescribedProduct = products.find((p) => p.id === first[0]!.stripeProductId);
    expect(redescribedProduct?.description).toBe("Updated description");
  });

  it("does not call products.update when neither name nor description changed on re-sync", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    let updateCalls = 0;
    const originalUpdate = stripe.products.update.bind(stripe.products);
    stripe.products.update = async (id, params) => {
      updateCalls++;
      return originalUpdate(id, params);
    };

    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);
    expect(updateCalls).toBe(0);
  });

  it("scopes Products per lead so two leads never collide on the same SKU id", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "lead-a", "Lead A", items);
    await syncCommerceCatalogToStripe(stripe, "lead-b", "Lead B", items);

    expect(stripe.productCount()).toBe(4);
  });

  it("finds an existing Product/Price past Stripe's 100-item list page on re-sync", async () => {
    const stripe = createFakeStripe();
    // Fill the account with >100 active Products for other leads so the target
    // SKU's Product/Price fall past the first page.
    for (let i = 0; i < 60; i++) {
      await syncCommerceCatalogToStripe(stripe, `filler-lead-${i}`, "Filler", [
        { id: "sku_a", name: "A", priceCents: 100 },
        { id: "sku_b", name: "B", priceCents: 200 },
      ]);
    }
    const first = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);
    expect(stripe.activeProductCount()).toBeGreaterThan(100);

    const second = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    // Without pagination, findProductByKey/findMatchingPrice only scan page 1
    // (limit 100) and would wrongly create duplicate Products/Prices here.
    expect(second[0]?.stripeProductId).toBe(first[0]?.stripeProductId);
    expect(second[0]?.stripePriceId).toBe(first[0]?.stripePriceId);
    expect(stripe.productCount()).toBe(122);
    expect(stripe.priceCount()).toBe(122);
  });

  it("reactivates a Product deactivated outside this module instead of duplicating it", async () => {
    const stripe = createFakeStripe();
    const first = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    // Simulate an operator deactivating the Product directly in the Stripe
    // Dashboard (or via this app's own Archive orphan Stripe products action,
    // if the same skuId is ever reintroduced) while the SKU stays in the
    // catalog — re-syncing must reactivate, not mint a duplicate under the
    // same idempotency key.
    await stripe.products.update(first[0]!.stripeProductId, { active: false });
    expect(stripe.activeProductCount()).toBe(1);

    const second = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    expect(second[0]?.stripeProductId).toBe(first[0]?.stripeProductId);
    expect(second[0]?.stripePriceId).toBe(first[0]?.stripePriceId);
    expect(stripe.productCount()).toBe(2); // no duplicate created
    expect(stripe.activeProductCount()).toBe(2); // deactivated one is active again
  });

  it("reactivates a Price deactivated outside this module instead of duplicating it", async () => {
    const stripe = createFakeStripe();
    const first = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    await stripe.prices.update(first[0]!.stripePriceId, { active: false });

    const second = await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    expect(second[0]?.stripePriceId).toBe(first[0]?.stripePriceId);
    expect(stripe.priceCount()).toBe(2); // no duplicate created
  });

  it("passes a stable per-lead-per-SKU Idempotency-Key on the product.create and price.create calls", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", [items[0]!]);

    const productKeys = stripe.productCreateCallsByIdempotencyKey();
    expect(productKeys.size).toBe(1);
    expect([...productKeys.keys()][0]).toBe("local_site_studio_commerce_sku_acme-cafe_sku_1_product");

    const priceKeys = stripe.priceCreateCallsByIdempotencyKey();
    expect(priceKeys.size).toBe(1);
    expect([...priceKeys.keys()][0]).toBe(
      "local_site_studio_commerce_sku_acme-cafe_sku_1_price_499",
    );
  });

  it("never mints two Products when two concurrent syncs race past the list-based precheck for the same SKU", async () => {
    // Simulates the exact race findProductByKey cannot close by itself: both
    // calls see no existing Product (list runs before either create lands)
    // and both call products.create — Stripe's Idempotency-Key guarantee is
    // what actually collapses them to one Product, verified here by calling
    // the fake client's create directly with the same key the module
    // derives, twice, "concurrently".
    const stripe = createFakeStripe();
    const key = "local_site_studio_commerce_sku_acme-cafe_sku_1_product";
    const metadata = { local_site_studio_key: "commerce_sku_acme-cafe_sku_1", leadSlug: "acme-cafe", skuId: "sku_1" };

    const [first, second] = await Promise.all([
      stripe.products.create({ name: "Acme Cafe — Latte", metadata }, { idempotencyKey: key }),
      stripe.products.create({ name: "Acme Cafe — Latte", metadata }, { idempotencyKey: key }),
    ]);

    expect(first.id).toBe(second.id);
    expect(stripe.productCount()).toBe(1);
  });
});

describe("listOrphanCommerceStripeProducts / archiveOrphanCommerceStripeProducts", () => {
  const items: CommerceSku[] = [
    { id: "sku_1", name: "Latte", priceCents: 499 },
    { id: "sku_2", name: "Croissant", priceCents: 350 },
  ];

  it("lists Products for removed SKUs on this lead only", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);
    await syncCommerceCatalogToStripe(stripe, "other-lead", "Other", items);

    const orphans = await listOrphanCommerceStripeProducts(stripe, "acme-cafe", [items[0]!]);

    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.skuId).toBe("sku_2");
    expect(orphans[0]?.key).toBe(commerceSkuStripeKey("acme-cafe", "sku_2"));
  });

  it("returns empty when every synced SKU is still in the catalog", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    const orphans = await listOrphanCommerceStripeProducts(stripe, "acme-cafe", items);
    expect(orphans).toHaveLength(0);
  });

  it("archives orphans (active=false) without touching kept or other-lead Products", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);
    await syncCommerceCatalogToStripe(stripe, "other-lead", "Other", items);

    const { archived } = await archiveOrphanCommerceStripeProducts(stripe, "acme-cafe", [
      items[0]!,
    ]);

    expect(archived).toHaveLength(1);
    expect(archived[0]?.skuId).toBe("sku_2");
    expect(stripe.activeProductCount()).toBe(3);

    const again = await listOrphanCommerceStripeProducts(stripe, "acme-cafe", [items[0]!]);
    expect(again).toHaveLength(0);
  });

  it("archives every Product for the lead when the catalog is empty", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);

    const { archived } = await archiveOrphanCommerceStripeProducts(stripe, "acme-cafe", []);
    expect(archived).toHaveLength(2);
    expect(stripe.activeProductCount()).toBe(0);
  });

  it("finds an orphan Product past Stripe's 100-item list page", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "acme-cafe", "Acme Cafe", items);
    for (let i = 0; i < 60; i++) {
      await syncCommerceCatalogToStripe(stripe, `filler-lead-${i}`, "Filler", [
        { id: "sku_a", name: "A", priceCents: 100 },
        { id: "sku_b", name: "B", priceCents: 200 },
      ]);
    }
    expect(stripe.activeProductCount()).toBeGreaterThan(100);

    // Without pagination, listOrphanCommerceStripeProducts only scans page 1
    // (limit 100) and would wrongly report acme-cafe's removed sku_2 as clean.
    const orphans = await listOrphanCommerceStripeProducts(stripe, "acme-cafe", [items[0]!]);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]?.skuId).toBe("sku_2");

    const { archived } = await archiveOrphanCommerceStripeProducts(stripe, "acme-cafe", [
      items[0]!,
    ]);
    expect(archived).toHaveLength(1);
    expect(archived[0]?.skuId).toBe("sku_2");
  });
});
