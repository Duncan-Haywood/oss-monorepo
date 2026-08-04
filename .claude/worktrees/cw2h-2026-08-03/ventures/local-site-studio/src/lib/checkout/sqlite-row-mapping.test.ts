import { describe, expect, it } from "vitest";
import { mapCheckoutSessionRow, type SqliteCheckoutSessionRow } from "./sqlite-row-mapping";

const baseRow: SqliteCheckoutSessionRow = {
  id: "cksn_1",
  leadSlug: "acme",
  stripeSessionId: "cs_test_1",
  tier: "starter",
  commerceAddon: 0,
  customerEmail: null,
  status: "open",
  createdAt: "2026-01-01T00:00:00.000Z",
  recoverySentAt: null,
  kind: null,
  skuId: null,
};

describe("mapCheckoutSessionRow", () => {
  it("maps a legacy bundle row (kind=null) to kind='bundle'", () => {
    expect(mapCheckoutSessionRow(baseRow)).toEqual({
      stripeSessionId: "cs_test_1",
      leadSlug: "acme",
      tier: "starter",
      commerceAddon: false,
      customerEmail: undefined,
      status: "open",
      createdAt: "2026-01-01T00:00:00.000Z",
      recoverySentAt: undefined,
      kind: "bundle",
      skuId: undefined,
    });
  });

  it("maps a commerce_sku row and preserves skuId", () => {
    const row: SqliteCheckoutSessionRow = {
      ...baseRow,
      kind: "commerce_sku",
      skuId: "sku_1",
      tier: "",
      commerceAddon: 1,
    };
    const mapped = mapCheckoutSessionRow(row);
    expect(mapped.kind).toBe("commerce_sku");
    expect(mapped.skuId).toBe("sku_1");
    expect(mapped.commerceAddon).toBe(true);
  });

  it("normalizes any status other than 'complete' to 'open'", () => {
    expect(mapCheckoutSessionRow({ ...baseRow, status: "complete" }).status).toBe("complete");
    expect(mapCheckoutSessionRow({ ...baseRow, status: "expired" }).status).toBe("open");
  });

  it("preserves customerEmail and recoverySentAt when set", () => {
    const row: SqliteCheckoutSessionRow = {
      ...baseRow,
      customerEmail: "buyer@example.com",
      recoverySentAt: "2026-01-02T00:00:00.000Z",
    };
    const mapped = mapCheckoutSessionRow(row);
    expect(mapped.customerEmail).toBe("buyer@example.com");
    expect(mapped.recoverySentAt).toBe("2026-01-02T00:00:00.000Z");
  });
});
