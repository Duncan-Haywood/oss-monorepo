import { describe, expect, it } from "vitest";
import {
  mapCommerceCatalogRow,
  mapCommerceOrderRow,
  parseCommerceItems,
  type SqliteCommerceCatalogRow,
  type SqliteCommerceOrderRow,
} from "./sqlite-row-mapping";

describe("parseCommerceItems", () => {
  it("round-trips well-formed items", () => {
    const json = JSON.stringify([{ id: "sku_1", name: "Widget", priceCents: 1299 }]);
    expect(parseCommerceItems(json)).toEqual([{ id: "sku_1", name: "Widget", priceCents: 1299 }]);
  });

  it("degrades malformed JSON to []", () => {
    expect(parseCommerceItems("not json")).toEqual([]);
  });

  it("degrades a non-array JSON value to []", () => {
    expect(parseCommerceItems(JSON.stringify({ id: "sku_1" }))).toEqual([]);
  });

  it("filters out elements missing id, name, or a numeric priceCents", () => {
    const json = JSON.stringify([
      { id: "sku_1", name: "Widget", priceCents: 1299 },
      { id: "sku_2", name: "Missing price" },
      { id: "sku_3", name: "Bad price", priceCents: "1299" },
      "not-an-object",
    ]);
    expect(parseCommerceItems(json)).toEqual([{ id: "sku_1", name: "Widget", priceCents: 1299 }]);
  });
});

describe("mapCommerceCatalogRow", () => {
  it("maps a well-formed row", () => {
    const row: SqliteCommerceCatalogRow = {
      leadSlug: "acme",
      itemsJson: JSON.stringify([{ id: "sku_1", name: "Widget", priceCents: 1299 }]),
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(mapCommerceCatalogRow(row)).toEqual({
      leadSlug: "acme",
      items: [{ id: "sku_1", name: "Widget", priceCents: 1299 }],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("survives a corrupted itemsJson column without throwing", () => {
    const row: SqliteCommerceCatalogRow = {
      leadSlug: "acme",
      itemsJson: "{corrupt",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(() => mapCommerceCatalogRow(row)).not.toThrow();
    expect(mapCommerceCatalogRow(row).items).toEqual([]);
  });
});

describe("mapCommerceOrderRow", () => {
  const baseRow: SqliteCommerceOrderRow = {
    id: "co_1",
    leadSlug: "acme",
    skuId: "sku_1",
    skuName: "Widget",
    amountPaidUsd: 12.99,
    stripeSessionId: "cs_test_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    paidOutAt: null,
    clientReceiptEmailSentAt: null,
    refundedAt: null,
    disputedAt: null,
  };

  it("maps a well-formed row and converts null optionals to undefined", () => {
    expect(mapCommerceOrderRow(baseRow)).toEqual({
      id: "co_1",
      leadSlug: "acme",
      skuId: "sku_1",
      skuName: "Widget",
      amountPaidUsd: 12.99,
      stripeSessionId: "cs_test_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      paidOutAt: undefined,
      clientReceiptEmailSentAt: undefined,
      refundedAt: undefined,
      disputedAt: undefined,
    });
  });

  it("preserves set paidOutAt/clientReceiptEmailSentAt/refundedAt/disputedAt timestamps", () => {
    const row: SqliteCommerceOrderRow = {
      ...baseRow,
      paidOutAt: "2026-01-02T00:00:00.000Z",
      clientReceiptEmailSentAt: "2026-01-01T01:00:00.000Z",
      refundedAt: "2026-01-03T00:00:00.000Z",
      disputedAt: "2026-01-04T00:00:00.000Z",
    };
    const mapped = mapCommerceOrderRow(row);
    expect(mapped.paidOutAt).toBe("2026-01-02T00:00:00.000Z");
    expect(mapped.clientReceiptEmailSentAt).toBe("2026-01-01T01:00:00.000Z");
    expect(mapped.refundedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(mapped.disputedAt).toBe("2026-01-04T00:00:00.000Z");
  });

  it("normalizes empty-string paidOutAt/clientReceiptEmailSentAt/refundedAt/disputedAt to undefined (unpaid/unrefunded/undisputed)", () => {
    const row: SqliteCommerceOrderRow = {
      ...baseRow,
      paidOutAt: "",
      clientReceiptEmailSentAt: "",
      refundedAt: "",
      disputedAt: "",
    };
    const mapped = mapCommerceOrderRow(row);
    expect(mapped.paidOutAt).toBeUndefined();
    expect(mapped.clientReceiptEmailSentAt).toBeUndefined();
    expect(mapped.refundedAt).toBeUndefined();
    expect(mapped.disputedAt).toBeUndefined();
  });
});
