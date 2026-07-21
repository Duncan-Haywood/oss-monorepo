import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Lead } from "../leads/types";
import { initializeSqliteSchema } from "./sqlite-schema";
import { sqliteListOrders, sqliteListOrdersByLeadSlug, sqliteUpsertLead } from "./sqlite-queries";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initializeSqliteSchema(db);
  // Start every test from a clean slate — schema init seeds demo leads,
  // which would otherwise collide with/pad the fixtures below.
  db.exec("DELETE FROM orders; DELETE FROM leads;");
  return db;
}

function testLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "test-lead",
    businessName: "Test Business",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    tagline: "A test business",
    description: "A business used only in tests.",
    phone: "(303) 555-0100",
    services: ["Testing"],
    hours: { weekday: "Mon-Fri 9-5", weekend: "Closed" },
    stage: "discovered",
    recommendedTier: "starter",
    ...overrides,
  };
}

function insertLeadDirect(db: DatabaseSync, slug: string): string {
  const id = `lead_${slug}`;
  db.prepare(
    "INSERT INTO leads (id, slug, businessName, category, city, state, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, slug, "Direct Insert Co", "restaurant", "Boulder", "CO", "(303) 555-0199", "discovered");
  return id;
}

function insertOrderDirect(
  db: DatabaseSync,
  leadId: string,
  stripeSessionId: string,
  createdAt: string,
): void {
  db.prepare(
    "INSERT INTO orders (id, leadId, stripeSessionId, tier, amountPaid, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(`order_${stripeSessionId}`, leadId, stripeSessionId, "starter", 1000, createdAt);
}

describe("sqliteUpsertLead", () => {
  it("inserts a new lead and returns true", () => {
    const db = freshDb();
    const result = sqliteUpsertLead(db, testLead());
    expect(result).toBe(true);

    const row = db.prepare("SELECT slug, businessName FROM leads WHERE slug = ?").get("test-lead") as
      | { slug: string; businessName: string }
      | undefined;
    expect(row?.businessName).toBe("Test Business");
  });

  it("is a create-only atomic guard: a second upsert for the same slug returns false and does not duplicate or throw", () => {
    const db = freshDb();
    expect(sqliteUpsertLead(db, testLead())).toBe(true);
    expect(sqliteUpsertLead(db, testLead({ businessName: "Different Name" }))).toBe(false);

    const rows = db.prepare("SELECT businessName FROM leads WHERE slug = ?").all("test-lead") as Array<{
      businessName: string;
    }>;
    expect(rows).toHaveLength(1);
    // The second (rejected) upsert must not overwrite the first insert.
    expect(rows[0].businessName).toBe("Test Business");
  });

  it("persists optional fields (email, notes, dataSource) when provided", () => {
    const db = freshDb();
    sqliteUpsertLead(
      db,
      testLead({
        email: "owner@example.com",
        notes: "Called once, no answer",
        dataSource: "csv_import",
      }),
    );

    const row = db
      .prepare("SELECT email, notes, dataSource FROM leads WHERE slug = ?")
      .get("test-lead") as { email: string; notes: string; dataSource: string };
    expect(row.email).toBe("owner@example.com");
    expect(row.notes).toBe("Called once, no answer");
    expect(row.dataSource).toBe("csv_import");
  });
});

describe("sqliteListOrders / sqliteListOrdersByLeadSlug", () => {
  it("returns orders newest-first, matching the Convex twin's sort contract", () => {
    const db = freshDb();
    const leadId = insertLeadDirect(db, "sort-test");
    insertOrderDirect(db, leadId, "cs_oldest", "2026-01-01T00:00:00.000Z");
    insertOrderDirect(db, leadId, "cs_newest", "2026-06-01T00:00:00.000Z");
    insertOrderDirect(db, leadId, "cs_middle", "2026-03-01T00:00:00.000Z");

    const orders = sqliteListOrders(db);
    expect(orders.map((o) => o.stripeSessionId)).toEqual(["cs_newest", "cs_middle", "cs_oldest"]);
  });

  it("scopes to a single lead slug and preserves the same newest-first order", () => {
    const db = freshDb();
    const leadA = insertLeadDirect(db, "lead-a");
    const leadB = insertLeadDirect(db, "lead-b");
    insertOrderDirect(db, leadA, "cs_a_old", "2026-01-01T00:00:00.000Z");
    insertOrderDirect(db, leadA, "cs_a_new", "2026-02-01T00:00:00.000Z");
    insertOrderDirect(db, leadB, "cs_b_only", "2026-01-15T00:00:00.000Z");

    const ordersForA = sqliteListOrdersByLeadSlug(db, "lead-a");
    expect(ordersForA.map((o) => o.stripeSessionId)).toEqual(["cs_a_new", "cs_a_old"]);
    expect(ordersForA.every((o) => o.leadSlug === "lead-a")).toBe(true);

    const ordersForB = sqliteListOrdersByLeadSlug(db, "lead-b");
    expect(ordersForB.map((o) => o.stripeSessionId)).toEqual(["cs_b_only"]);
  });

  it("returns an empty array for a lead with no orders", () => {
    const db = freshDb();
    insertLeadDirect(db, "no-orders");
    expect(sqliteListOrdersByLeadSlug(db, "no-orders")).toEqual([]);
  });
});
