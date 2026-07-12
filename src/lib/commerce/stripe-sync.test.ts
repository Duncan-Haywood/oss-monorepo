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
} {
  const products: Array<{
    id: string;
    name?: string;
    active: boolean;
    metadata: Record<string, string>;
  }> = [];
  const prices: Array<{ id: string; product: string; unit_amount: number; active: boolean }> = [];
  let nextId = 1;

  return {
    products: {
      async list({ active }) {
        return {
          data: products.filter((p) => (active ? p.active : true)),
        };
      },
      async create({ name, metadata }) {
        const product = { id: `prod_${nextId++}`, name, metadata, active: true };
        products.push(product);
        return product;
      },
      async update(id, params) {
        const product = products.find((p) => p.id === id);
        if (!product) throw new Error(`Product ${id} not found`);
        product.active = params.active;
        return product;
      },
    },
    prices: {
      async list({ product, active }) {
        return {
          data: prices.filter((p) => p.product === product && (active ? p.active : true)),
        };
      },
      async create({ product, unit_amount }) {
        const price = { id: `price_${nextId++}`, product, unit_amount, active: true };
        prices.push(price);
        return price;
      },
    },
    productCount: () => products.length,
    activeProductCount: () => products.filter((p) => p.active).length,
    priceCount: () => prices.length,
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

  it("scopes Products per lead so two leads never collide on the same SKU id", async () => {
    const stripe = createFakeStripe();
    await syncCommerceCatalogToStripe(stripe, "lead-a", "Lead A", items);
    await syncCommerceCatalogToStripe(stripe, "lead-b", "Lead B", items);

    expect(stripe.productCount()).toBe(4);
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
});
