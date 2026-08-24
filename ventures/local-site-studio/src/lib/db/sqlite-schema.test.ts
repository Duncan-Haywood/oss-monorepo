import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeSqliteSchema } from "./sqlite-schema";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initializeSqliteSchema(db);
  return db;
}

describe("initializeSqliteSchema", () => {
  it("creates every table this app reads/writes without throwing", () => {
    const db = freshDb();
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((t) => t.name);

    for (const expected of [
      "leads",
      "orders",
      "suppression_list",
      "deploy_handoffs",
      "client_inquiries",
      "checkout_sessions",
      "marketing_packs",
      "commerce_catalogs",
      "client_voice_packs",
      "commerce_orders",
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it("seeds demo leads on a fresh (empty) database", () => {
    const db = freshDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number };
    expect(row.count).toBeGreaterThan(0);
  });

  it("does not re-seed or throw on a second initialize call against the same db (idempotent)", () => {
    const db = new DatabaseSync(":memory:");
    initializeSqliteSchema(db);
    const first = (db.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number })
      .count;

    initializeSqliteSchema(db);
    const second = (db.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number })
      .count;

    expect(second).toBe(first);
  });

  it("adds every additive migration column this app depends on", () => {
    const db = freshDb();
    const leadCols = (
      db.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>
    ).map((c) => c.name);
    for (const col of [
      "email",
      "dataSource",
      "outreachStep",
      "notes",
      "snoozedUntil",
      "stripeConnectAccountId",
    ]) {
      expect(leadCols).toContain(col);
    }

    const orderCols = (
      db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>
    ).map((c) => c.name);
    for (const col of [
      "stripeCustomerId",
      "recurringCanceledAt",
      "refundedAt",
      "disputedAt",
      "lifetimeRevenueUsd",
      "lastRenewalInvoiceId",
    ]) {
      expect(orderCols).toContain(col);
    }

    const checkoutSessionCols = (
      db.prepare("PRAGMA table_info(checkout_sessions)").all() as Array<{ name: string }>
    ).map((c) => c.name);
    for (const col of ["kind", "skuId", "recoverySentCount", "billingInterval"]) {
      expect(checkoutSessionCols).toContain(col);
    }
  });

  it("enforces a unique index on orders.stripeSessionId (redelivery idempotency)", () => {
    const db = freshDb();
    const lead = db.prepare("SELECT id FROM leads LIMIT 1").get() as { id: string };
    db.prepare(
      "INSERT INTO orders (id, leadId, stripeSessionId, tier, amountPaid) VALUES (?, ?, ?, ?, ?)",
    ).run("order_1", lead.id, "cs_test_dup", "starter", 1000);

    expect(() =>
      db
        .prepare(
          "INSERT INTO orders (id, leadId, stripeSessionId, tier, amountPaid) VALUES (?, ?, ?, ?, ?)",
        )
        .run("order_2", lead.id, "cs_test_dup", "starter", 1000),
    ).toThrow();
  });
});
