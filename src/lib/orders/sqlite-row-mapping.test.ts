import { describe, expect, it } from "vitest";
import { mapSqliteOrderRow, type SqliteOrderJoinRow } from "./sqlite-row-mapping";

describe("mapSqliteOrderRow", () => {
  it("maps a well-formed row", () => {
    const row: SqliteOrderJoinRow = {
      id: "ord_1",
      leadSlug: "acme",
      stripeSessionId: "cs_test_1",
      stripeCustomerId: "cus_1",
      tier: "growth",
      commerceAddon: 1,
      recurringCanceledAt: null,
      amountPaid: 99,
      status: "paid",
      createdAt: "2026-01-01T00:00:00.000Z",
      refundedAt: null,
      disputedAt: null,
    };
    expect(mapSqliteOrderRow(row)).toEqual({
      id: "ord_1",
      leadSlug: "acme",
      stripeSessionId: "cs_test_1",
      stripeCustomerId: "cus_1",
      tier: "growth",
      commerceAddon: true,
      amountPaid: 99,
      status: "paid",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("defaults a null stripeSessionId to '' and a null stripeCustomerId to undefined", () => {
    const row: SqliteOrderJoinRow = {
      id: "ord_1",
      leadSlug: "acme",
      stripeSessionId: null,
      stripeCustomerId: null,
      tier: "starter",
      commerceAddon: 0,
      recurringCanceledAt: null,
      amountPaid: 500,
      status: "paid",
      createdAt: "2026-01-01T00:00:00.000Z",
      refundedAt: null,
      disputedAt: null,
    };
    const mapped = mapSqliteOrderRow(row);
    expect(mapped.stripeSessionId).toBe("");
    expect(mapped.stripeCustomerId).toBeUndefined();
    expect(mapped.commerceAddon).toBe(false);
  });

  it("maps a refundedAt column value through to refundedAt", () => {
    const row: SqliteOrderJoinRow = {
      id: "ord_1",
      leadSlug: "acme",
      stripeSessionId: "cs_test_1",
      stripeCustomerId: "cus_1",
      tier: "growth",
      commerceAddon: 0,
      recurringCanceledAt: null,
      amountPaid: 99,
      status: "paid",
      createdAt: "2026-01-01T00:00:00.000Z",
      refundedAt: "2026-01-02T00:00:00.000Z",
      disputedAt: null,
    };
    expect(mapSqliteOrderRow(row).refundedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("defaults a null refundedAt to undefined", () => {
    const row: SqliteOrderJoinRow = {
      id: "ord_1",
      leadSlug: "acme",
      stripeSessionId: "cs_test_1",
      stripeCustomerId: "cus_1",
      tier: "growth",
      commerceAddon: 0,
      recurringCanceledAt: null,
      amountPaid: 99,
      status: "paid",
      createdAt: "2026-01-01T00:00:00.000Z",
      refundedAt: null,
      disputedAt: null,
    };
    expect(mapSqliteOrderRow(row).refundedAt).toBeUndefined();
  });

  it("maps a disputedAt column value through to disputedAt", () => {
    const row: SqliteOrderJoinRow = {
      id: "ord_1",
      leadSlug: "acme",
      stripeSessionId: "cs_test_1",
      stripeCustomerId: "cus_1",
      tier: "growth",
      commerceAddon: 0,
      recurringCanceledAt: null,
      amountPaid: 99,
      status: "paid",
      createdAt: "2026-01-01T00:00:00.000Z",
      refundedAt: null,
      disputedAt: "2026-01-03T00:00:00.000Z",
    };
    expect(mapSqliteOrderRow(row).disputedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("defaults a null disputedAt to undefined", () => {
    const row: SqliteOrderJoinRow = {
      id: "ord_1",
      leadSlug: "acme",
      stripeSessionId: "cs_test_1",
      stripeCustomerId: "cus_1",
      tier: "growth",
      commerceAddon: 0,
      recurringCanceledAt: null,
      amountPaid: 99,
      status: "paid",
      createdAt: "2026-01-01T00:00:00.000Z",
      refundedAt: null,
      disputedAt: null,
    };
    expect(mapSqliteOrderRow(row).disputedAt).toBeUndefined();
  });
});
