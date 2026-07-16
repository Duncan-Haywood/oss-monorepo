import { describe, expect, it, vi } from "vitest";
import type { CommerceCatalog } from "@/lib/commerce/types";
import type { LeadPipelineStage } from "@/lib/leads/types";
import type { OrderRecord } from "@/lib/orders/types";
import { loadPreviewCommerceItems } from "./preview-commerce";

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "ord_1",
    leadSlug: "paid-cafe",
    stripeSessionId: "cs_test_1",
    tier: "starter",
    commerceAddon: true,
    amountPaid: 800,
    status: "paid",
    createdAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function catalog(items: CommerceCatalog["items"] = []): CommerceCatalog {
  return {
    leadSlug: "paid-cafe",
    items,
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

describe("loadPreviewCommerceItems", () => {
  it.each([
    "new",
    "preview_sent",
    "outreach_sent",
    "discovery_call",
    "closed",
  ] as LeadPipelineStage[])(
    "skips orders + catalog deps for ineligible stage %s",
    async (stage) => {
      const listOrdersByLeadSlug = vi.fn(async () => [order()]);
      const getCommerceCatalog = vi.fn(async () =>
        catalog([{ id: "sku_1", name: "Latte", priceCents: 450 }]),
      );

      await expect(
        loadPreviewCommerceItems(
          { stage },
          "cold-lead",
          { listOrdersByLeadSlug, getCommerceCatalog },
        ),
      ).resolves.toEqual([]);
      expect(listOrdersByLeadSlug).not.toHaveBeenCalled();
      expect(getCommerceCatalog).not.toHaveBeenCalled();
    },
  );

  it("uses slug-scoped orders for paid leads and returns catalog items", async () => {
    const listOrdersByLeadSlug = vi.fn(async () => [order()]);
    const items = [{ id: "sku_1", name: "Latte", priceCents: 450 }];
    const getCommerceCatalog = vi.fn(async () => catalog(items));

    await expect(
      loadPreviewCommerceItems(
        { stage: "paid" },
        "paid-cafe",
        { listOrdersByLeadSlug, getCommerceCatalog },
      ),
    ).resolves.toEqual(items);
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("paid-cafe");
    expect(getCommerceCatalog).toHaveBeenCalledWith("paid-cafe");
  });

  it("skips catalog fetch when paid/live but no commerceAddon order", async () => {
    const listOrdersByLeadSlug = vi.fn(async () => [
      order({ commerceAddon: false }),
    ]);
    const getCommerceCatalog = vi.fn(async () =>
      catalog([{ id: "sku_1", name: "Latte", priceCents: 450 }]),
    );

    await expect(
      loadPreviewCommerceItems(
        { stage: "live" },
        "paid-cafe",
        { listOrdersByLeadSlug, getCommerceCatalog },
      ),
    ).resolves.toEqual([]);
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("paid-cafe");
    expect(getCommerceCatalog).not.toHaveBeenCalled();
  });

  it("returns empty items when commerce-eligible but catalog missing", async () => {
    const listOrdersByLeadSlug = vi.fn(async () => [order()]);
    const getCommerceCatalog = vi.fn(async () => null);

    await expect(
      loadPreviewCommerceItems(
        { stage: "paid" },
        "paid-cafe",
        { listOrdersByLeadSlug, getCommerceCatalog },
      ),
    ).resolves.toEqual([]);
    expect(getCommerceCatalog).toHaveBeenCalledWith("paid-cafe");
  });
});
