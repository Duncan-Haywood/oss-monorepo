import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Lead } from "../leads/types";
import { initializeSqliteSchema } from "./sqlite-schema";
import {
  sqliteListOrders,
  sqliteListOrdersByLeadSlug,
  sqliteUpsertLead,
  sqliteUpdateLeadStage,
  sqliteRecordLeadOutreach,
  sqliteApplyColdLeadDisposition,
  sqliteRecordClientInquiryReply,
  sqliteRecordCheckoutRecoverySent,
  sqliteMarkCommerceOrderPaidOut,
  sqliteMarkCommerceOrderClientReceiptSent,
  sqliteMarkMarketingPackSentToClient,
  sqliteMarkClientVoicePackSentToClient,
  sqliteUpdateDeployHandoffCustomDomain,
  sqliteOrderAlreadyRecorded,
  sqliteRecordLeadPayment,
} from "./sqlite-queries";
import { CustomDomainConflictError } from "../deploy/custom-domain-routing";

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

function insertInquiryDirect(
  db: DatabaseSync,
  id: string,
  leadSlug: string,
  status: string,
): void {
  db.prepare(
    "INSERT INTO client_inquiries (id, leadSlug, businessName, message, status) VALUES (?, ?, ?, ?, ?)",
  ).run(id, leadSlug, "Direct Insert Co", "I'd like a quote", status);
}

function insertCheckoutSessionDirect(
  db: DatabaseSync,
  stripeSessionId: string,
  leadSlug: string,
  status: string,
): void {
  db.prepare(
    "INSERT INTO checkout_sessions (id, leadSlug, stripeSessionId, tier, status) VALUES (?, ?, ?, ?, ?)",
  ).run(`cs_${stripeSessionId}`, leadSlug, stripeSessionId, "starter", status);
}

function insertDeployHandoffDirect(
  db: DatabaseSync,
  leadSlug: string,
  overrides: Partial<{ customDomain: string }> = {},
): void {
  db.prepare(
    `INSERT INTO deploy_handoffs
      (id, leadSlug, businessName, tier, stripeSessionId, customerEmail, previewUrl, suggestedHost, customDomain, contactFormUrl, dnsInstructions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `handoff_${leadSlug}`,
    leadSlug,
    "Direct Insert Co",
    "starter",
    `cs_${leadSlug}`,
    "owner@example.com",
    `https://example.com/preview/${leadSlug}`,
    `${leadSlug}.example.com`,
    overrides.customDomain ?? null,
    `https://example.com/api/contact/${leadSlug}`,
    "[]",
  );
}

function insertCommerceOrderDirect(
  db: DatabaseSync,
  stripeSessionId: string,
  leadSlug: string,
  overrides: Partial<{ paidOutAt: string; refundedAt: string; disputedAt: string; clientReceiptEmailSentAt: string }> = {},
): void {
  db.prepare(
    `INSERT INTO commerce_orders
       (id, leadSlug, skuId, skuName, amountPaidUsd, stripeSessionId, paidOutAt, refundedAt, disputedAt, clientReceiptEmailSentAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `co_${stripeSessionId}`,
    leadSlug,
    "sku_1",
    "Test SKU",
    50,
    stripeSessionId,
    overrides.paidOutAt ?? null,
    overrides.refundedAt ?? null,
    overrides.disputedAt ?? null,
    overrides.clientReceiptEmailSentAt ?? null,
  );
}

function insertMarketingPackDirect(
  db: DatabaseSync,
  leadSlug: string,
  yearMonth: string,
  sentToClientAt?: string,
): void {
  db.prepare(
    `INSERT INTO marketing_packs (id, leadSlug, yearMonth, variantsJson, generatedAt, generator, sentToClientAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `mp_${leadSlug}_${yearMonth}`,
    leadSlug,
    yearMonth,
    "[]",
    "2026-07-01T00:00:00.000Z",
    "stub",
    sentToClientAt ?? null,
  );
}

function insertClientVoicePackDirect(
  db: DatabaseSync,
  leadSlug: string,
  sentToClientAt?: string,
): void {
  db.prepare(
    `INSERT INTO client_voice_packs (id, leadSlug, variantsJson, generatedAt, generator, sentToClientAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`cv_${leadSlug}`, leadSlug, "[]", "2026-07-01T00:00:00.000Z", "stub", sentToClientAt ?? null);
}

describe("sqliteMarkMarketingPackSentToClient", () => {
  it("marks an unsent pack and returns true", () => {
    const db = freshDb();
    insertMarketingPackDirect(db, "test-lead", "2026-07");
    expect(
      sqliteMarkMarketingPackSentToClient(db, "test-lead", "2026-07", "2026-07-05T00:00:00.000Z"),
    ).toBe(true);
    const row = db
      .prepare("SELECT sentToClientAt FROM marketing_packs WHERE leadSlug = ? AND yearMonth = ?")
      .get("test-lead", "2026-07") as { sentToClientAt: string };
    expect(row.sentToClientAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("is a no-op once already marked sent (race guard)", () => {
    const db = freshDb();
    insertMarketingPackDirect(db, "test-lead", "2026-07", "2026-07-05T00:00:00.000Z");
    expect(
      sqliteMarkMarketingPackSentToClient(db, "test-lead", "2026-07", "2026-07-06T00:00:00.000Z"),
    ).toBe(false);
    const row = db
      .prepare("SELECT sentToClientAt FROM marketing_packs WHERE leadSlug = ? AND yearMonth = ?")
      .get("test-lead", "2026-07") as { sentToClientAt: string };
    expect(row.sentToClientAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("returns false for an unknown leadSlug/yearMonth pair", () => {
    const db = freshDb();
    expect(
      sqliteMarkMarketingPackSentToClient(db, "missing", "2026-07", "2026-07-05T00:00:00.000Z"),
    ).toBe(false);
  });
});

describe("sqliteMarkClientVoicePackSentToClient", () => {
  it("marks an unsent pack and returns true", () => {
    const db = freshDb();
    insertClientVoicePackDirect(db, "test-lead");
    expect(
      sqliteMarkClientVoicePackSentToClient(db, "test-lead", "2026-07-05T00:00:00.000Z"),
    ).toBe(true);
    const row = db
      .prepare("SELECT sentToClientAt FROM client_voice_packs WHERE leadSlug = ?")
      .get("test-lead") as { sentToClientAt: string };
    expect(row.sentToClientAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("is a no-op once already marked sent (race guard)", () => {
    const db = freshDb();
    insertClientVoicePackDirect(db, "test-lead", "2026-07-05T00:00:00.000Z");
    expect(
      sqliteMarkClientVoicePackSentToClient(db, "test-lead", "2026-07-06T00:00:00.000Z"),
    ).toBe(false);
    const row = db
      .prepare("SELECT sentToClientAt FROM client_voice_packs WHERE leadSlug = ?")
      .get("test-lead") as { sentToClientAt: string };
    expect(row.sentToClientAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("returns false for an unknown leadSlug", () => {
    const db = freshDb();
    expect(
      sqliteMarkClientVoicePackSentToClient(db, "missing", "2026-07-05T00:00:00.000Z"),
    ).toBe(false);
  });
});

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

describe("sqliteUpdateLeadStage", () => {
  it("throws when the slug does not exist (db-convex-sqlite-not-found-parity)", () => {
    const db = freshDb();
    expect(() => sqliteUpdateLeadStage(db, "missing", "site_built")).toThrow(
      "Lead with slug missing not found",
    );
  });

  it("updates a non-terminal lead's stage and returns true", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    expect(sqliteUpdateLeadStage(db, "test-lead", "outreach_sent")).toBe(true);
    const row = db.prepare("SELECT status FROM leads WHERE slug = ?").get("test-lead") as {
      status: string;
    };
    expect(row.status).toBe("outreach_sent");
  });

  it("rejects reverting an already-paid lead to an earlier stage (update-lead-stage-action-paid-live-revert-guard)", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    db.prepare("UPDATE leads SET status = 'paid' WHERE slug = ?").run("test-lead");

    expect(sqliteUpdateLeadStage(db, "test-lead", "discovery_call")).toBe(false);
    const row = db.prepare("SELECT status FROM leads WHERE slug = ?").get("test-lead") as {
      status: string;
    };
    expect(row.status).toBe("paid");
  });

  it("still allows the paid -> live Mark-live transition", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    db.prepare("UPDATE leads SET status = 'paid' WHERE slug = ?").run("test-lead");

    expect(sqliteUpdateLeadStage(db, "test-lead", "live")).toBe(true);
    const row = db.prepare("SELECT status FROM leads WHERE slug = ?").get("test-lead") as {
      status: string;
    };
    expect(row.status).toBe("live");
  });
});

describe("sqliteRecordLeadOutreach", () => {
  it("throws when the slug does not exist", () => {
    const db = freshDb();
    expect(() => sqliteRecordLeadOutreach(db, "missing", 1, "2026-01-01T00:00:00.000Z")).toThrow(
      "Lead with slug missing not found",
    );
  });

  it("records the outreach step and timestamp on a discovered lead", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    expect(sqliteRecordLeadOutreach(db, "test-lead", 1, "2026-01-01T00:00:00.000Z")).toBe(true);
    const row = db
      .prepare("SELECT outreachStep, lastOutreachAt FROM leads WHERE slug = ?")
      .get("test-lead") as { outreachStep: number; lastOutreachAt: string };
    expect(row.outreachStep).toBe(1);
    expect(row.lastOutreachAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects sending to an already-converted or closed lead (sendfollowup-action-paid-live-closed-race-guard)", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    db.prepare("UPDATE leads SET status = 'paid' WHERE slug = ?").run("test-lead");
    expect(sqliteRecordLeadOutreach(db, "test-lead", 1, "2026-01-01T00:00:00.000Z")).toBe(false);
  });

  it("rejects a duplicate/stale step that does not advance outreachStep (outreach-step-duplicate-send-guard)", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    expect(sqliteRecordLeadOutreach(db, "test-lead", 2, "2026-01-01T00:00:00.000Z")).toBe(true);
    // A second, concurrent call targeting the same or an earlier step must not re-send.
    expect(sqliteRecordLeadOutreach(db, "test-lead", 2, "2026-01-02T00:00:00.000Z")).toBe(false);
    const row = db.prepare("SELECT lastOutreachAt FROM leads WHERE slug = ?").get("test-lead") as {
      lastOutreachAt: string;
    };
    expect(row.lastOutreachAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("sqliteApplyColdLeadDisposition", () => {
  const patch = {
    stage: "discovered" as const,
    outreachStep: 0 as const,
    lastOutreachAt: undefined,
    snoozedUntil: undefined,
  };

  it("throws when the slug does not exist", () => {
    const db = freshDb();
    expect(() => sqliteApplyColdLeadDisposition(db, "missing", patch)).toThrow(
      "Lead with slug missing not found",
    );
  });

  it("applies a re-engage disposition patch and returns true", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    expect(sqliteApplyColdLeadDisposition(db, "test-lead", patch)).toBe(true);
    const row = db.prepare("SELECT status, outreachStep FROM leads WHERE slug = ?").get(
      "test-lead",
    ) as { status: string; outreachStep: number };
    expect(row.status).toBe("discovered");
    expect(row.outreachStep).toBe(0);
  });

  it("rejects a disposition once the lead has converted to paid/live (commerce-order-paid-out-refund-race-guard-class TOCTOU)", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    db.prepare("UPDATE leads SET status = 'live' WHERE slug = ?").run("test-lead");
    expect(sqliteApplyColdLeadDisposition(db, "test-lead", { ...patch, stage: "closed" })).toBe(
      false,
    );
    const row = db.prepare("SELECT status FROM leads WHERE slug = ?").get("test-lead") as {
      status: string;
    };
    expect(row.status).toBe("live");
  });
});

describe("sqliteRecordClientInquiryReply", () => {
  it("returns null when the inquiry does not exist", () => {
    const db = freshDb();
    expect(sqliteRecordClientInquiryReply(db, "missing", "Thanks for reaching out!")).toBeNull();
  });

  it("marks a new inquiry replied and returns the updated record", () => {
    const db = freshDb();
    insertInquiryDirect(db, "inq_1", "test-lead", "new");
    const result = sqliteRecordClientInquiryReply(db, "inq_1", "Thanks for reaching out!");
    expect(result?.status).toBe("replied");
    expect(result?.operatorReply).toBe("Thanks for reaching out!");
    expect(result?.repliedAt).toBeTruthy();

    const row = db.prepare("SELECT status, operatorReply FROM client_inquiries WHERE id = ?").get(
      "inq_1",
    ) as { status: string; operatorReply: string };
    expect(row.status).toBe("replied");
    expect(row.operatorReply).toBe("Thanks for reaching out!");
  });

  it("rejects replying to an already-archived inquiry (inquiry-reply-archive-race-guard)", () => {
    const db = freshDb();
    insertInquiryDirect(db, "inq_1", "test-lead", "archived");
    expect(sqliteRecordClientInquiryReply(db, "inq_1", "Too late")).toBeNull();
    const row = db.prepare("SELECT status, operatorReply FROM client_inquiries WHERE id = ?").get(
      "inq_1",
    ) as { status: string; operatorReply: string | null };
    expect(row.status).toBe("archived");
    expect(row.operatorReply).toBeNull();
  });
});

describe("sqliteRecordCheckoutRecoverySent", () => {
  it("marks an open session's recoverySentAt and returns true when expectedRecoverySentCount matches (0 on first send)", () => {
    const db = freshDb();
    insertCheckoutSessionDirect(db, "cs_open", "test-lead", "open");
    expect(sqliteRecordCheckoutRecoverySent(db, "cs_open", "2026-01-01T00:00:00.000Z", 0)).toBe(
      true,
    );
    const row = db.prepare("SELECT recoverySentAt FROM checkout_sessions WHERE stripeSessionId = ?").get(
      "cs_open",
    ) as { recoverySentAt: string };
    expect(row.recoverySentAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns false for a missing session", () => {
    const db = freshDb();
    expect(sqliteRecordCheckoutRecoverySent(db, "missing", "2026-01-01T00:00:00.000Z", 0)).toBe(
      false,
    );
  });

  it("increments recoverySentCount from unset on first nudge, then again on repeat nudges when each call passes the current count (recovery-email-escalating-cadence)", () => {
    const db = freshDb();
    insertCheckoutSessionDirect(db, "cs_open", "test-lead", "open");
    sqliteRecordCheckoutRecoverySent(db, "cs_open", "2026-01-01T00:00:00.000Z", 0);
    let row = db
      .prepare("SELECT recoverySentCount FROM checkout_sessions WHERE stripeSessionId = ?")
      .get("cs_open") as { recoverySentCount: number };
    expect(row.recoverySentCount).toBe(1);

    sqliteRecordCheckoutRecoverySent(db, "cs_open", "2026-01-03T00:00:00.000Z", 1);
    row = db
      .prepare("SELECT recoverySentCount FROM checkout_sessions WHERE stripeSessionId = ?")
      .get("cs_open") as { recoverySentCount: number };
    expect(row.recoverySentCount).toBe(2);
  });

  it("rejects a session that already completed via a concurrent webhook (checkout-session-recovery-race-guard)", () => {
    const db = freshDb();
    insertCheckoutSessionDirect(db, "cs_complete", "test-lead", "complete");
    expect(
      sqliteRecordCheckoutRecoverySent(db, "cs_complete", "2026-01-01T00:00:00.000Z", 0),
    ).toBe(false);
    const row = db
      .prepare("SELECT recoverySentAt FROM checkout_sessions WHERE stripeSessionId = ?")
      .get("cs_complete") as { recoverySentAt: string | null };
    expect(row.recoverySentAt).toBeNull();
  });

  it("rejects a second concurrent call whose expectedRecoverySentCount is stale, leaving the row exactly as the winning call left it (checkout-recovery-send-race-guard)", () => {
    const db = freshDb();
    insertCheckoutSessionDirect(db, "cs_dup", "test-lead", "open");

    // First call (e.g. tab A) wins the race.
    expect(sqliteRecordCheckoutRecoverySent(db, "cs_dup", "2026-01-01T00:00:00.000Z", 0)).toBe(
      true,
    );

    // Second concurrent call (e.g. tab B) read the same pre-write snapshot
    // (expectedRecoverySentCount: 0) before tab A's write landed — must be
    // rejected, not silently apply a second increment that would send a
    // real duplicate email with stale nudge-tier copy.
    expect(sqliteRecordCheckoutRecoverySent(db, "cs_dup", "2026-01-01T00:00:01.000Z", 0)).toBe(
      false,
    );

    const row = db
      .prepare(
        "SELECT recoverySentAt, recoverySentCount FROM checkout_sessions WHERE stripeSessionId = ?",
      )
      .get("cs_dup") as { recoverySentAt: string; recoverySentCount: number };
    // Still reflects only tab A's write.
    expect(row.recoverySentAt).toBe("2026-01-01T00:00:00.000Z");
    expect(row.recoverySentCount).toBe(1);

    // A genuine next nudge (correctly reading the now-current count) still
    // succeeds — the guard only rejects a stale snapshot, not legitimate
    // re-nudges across cadence tiers.
    expect(sqliteRecordCheckoutRecoverySent(db, "cs_dup", "2026-01-02T00:00:00.000Z", 1)).toBe(
      true,
    );
  });
});

describe("sqliteMarkCommerceOrderPaidOut", () => {
  it("marks an eligible order paid out and returns true", () => {
    const db = freshDb();
    insertCommerceOrderDirect(db, "cs_eligible", "test-lead");
    expect(sqliteMarkCommerceOrderPaidOut(db, "cs_eligible", "2026-01-01T00:00:00.000Z")).toBe(true);
    const row = db.prepare("SELECT paidOutAt FROM commerce_orders WHERE stripeSessionId = ?").get(
      "cs_eligible",
    ) as { paidOutAt: string };
    expect(row.paidOutAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects an order refunded by a concurrent webhook since the caller's read (commerce-order-paid-out-refund-race-guard)", () => {
    const db = freshDb();
    insertCommerceOrderDirect(db, "cs_refunded", "test-lead", {
      refundedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(sqliteMarkCommerceOrderPaidOut(db, "cs_refunded", "2026-01-02T00:00:00.000Z")).toBe(
      false,
    );
  });

  it("rejects an order disputed by a concurrent webhook", () => {
    const db = freshDb();
    insertCommerceOrderDirect(db, "cs_disputed", "test-lead", {
      disputedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(sqliteMarkCommerceOrderPaidOut(db, "cs_disputed", "2026-01-02T00:00:00.000Z")).toBe(
      false,
    );
  });

  it("rejects an order already marked paid out (no double-pay)", () => {
    const db = freshDb();
    insertCommerceOrderDirect(db, "cs_already", "test-lead", {
      paidOutAt: "2026-01-01T00:00:00.000Z",
    });
    expect(sqliteMarkCommerceOrderPaidOut(db, "cs_already", "2026-01-02T00:00:00.000Z")).toBe(
      false,
    );
    const row = db.prepare("SELECT paidOutAt FROM commerce_orders WHERE stripeSessionId = ?").get(
      "cs_already",
    ) as { paidOutAt: string };
    expect(row.paidOutAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("sqliteMarkCommerceOrderClientReceiptSent", () => {
  it("marks an unsent order's receipt and returns true", () => {
    const db = freshDb();
    insertCommerceOrderDirect(db, "cs_unsent", "test-lead");
    expect(
      sqliteMarkCommerceOrderClientReceiptSent(db, "cs_unsent", "2026-01-01T00:00:00.000Z"),
    ).toBe(true);
    const row = db
      .prepare("SELECT clientReceiptEmailSentAt FROM commerce_orders WHERE stripeSessionId = ?")
      .get("cs_unsent") as { clientReceiptEmailSentAt: string };
    expect(row.clientReceiptEmailSentAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects a redelivered webhook once the receipt marker is already set (commerce-client-receipt-marker-race-guard)", () => {
    const db = freshDb();
    insertCommerceOrderDirect(db, "cs_sent", "test-lead", {
      clientReceiptEmailSentAt: "2026-01-01T00:00:00.000Z",
    });
    expect(
      sqliteMarkCommerceOrderClientReceiptSent(db, "cs_sent", "2026-01-02T00:00:00.000Z"),
    ).toBe(false);
    const row = db
      .prepare("SELECT clientReceiptEmailSentAt FROM commerce_orders WHERE stripeSessionId = ?")
      .get("cs_sent") as { clientReceiptEmailSentAt: string };
    expect(row.clientReceiptEmailSentAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("sqliteUpdateDeployHandoffCustomDomain", () => {
  it("returns null for an unknown leadSlug", () => {
    const db = freshDb();
    expect(
      sqliteUpdateDeployHandoffCustomDomain(db, "missing", "client.example.com", "2026-01-01T00:00:00.000Z"),
    ).toBeNull();
  });

  it("sets the domain and returns the updated handoff", () => {
    const db = freshDb();
    insertDeployHandoffDirect(db, "test-lead");
    const result = sqliteUpdateDeployHandoffCustomDomain(
      db,
      "test-lead",
      "client.example.com",
      "2026-01-02T00:00:00.000Z",
    );
    expect(result?.customDomain).toBe("client.example.com");
    expect(result?.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    const row = db
      .prepare("SELECT customDomain FROM deploy_handoffs WHERE leadSlug = ?")
      .get("test-lead") as { customDomain: string };
    expect(row.customDomain).toBe("client.example.com");
  });

  it("clears the domain on null", () => {
    const db = freshDb();
    insertDeployHandoffDirect(db, "test-lead", { customDomain: "client.example.com" });
    const result = sqliteUpdateDeployHandoffCustomDomain(db, "test-lead", null, "2026-01-02T00:00:00.000Z");
    expect(result?.customDomain).toBeUndefined();
    const row = db
      .prepare("SELECT customDomain FROM deploy_handoffs WHERE leadSlug = ?")
      .get("test-lead") as { customDomain: string | null };
    expect(row.customDomain).toBeNull();
  });

  it("rejects when a different lead already owns the exact host, and leaves that lead's domain unchanged (custom-domain-assign-race-guard)", () => {
    const db = freshDb();
    insertDeployHandoffDirect(db, "demo-cafe", { customDomain: "client.example.com" });
    insertDeployHandoffDirect(db, "other-lead");
    expect(() =>
      sqliteUpdateDeployHandoffCustomDomain(db, "other-lead", "client.example.com", "2026-01-02T00:00:00.000Z"),
    ).toThrow(CustomDomainConflictError);
    const row = db
      .prepare("SELECT customDomain FROM deploy_handoffs WHERE leadSlug = ?")
      .get("other-lead") as { customDomain: string | null };
    expect(row.customDomain).toBeNull();
  });

  it("rejects the www twin of a domain another lead already owns", () => {
    const db = freshDb();
    insertDeployHandoffDirect(db, "demo-cafe", { customDomain: "www.client.example.com" });
    insertDeployHandoffDirect(db, "other-lead");
    expect(() =>
      sqliteUpdateDeployHandoffCustomDomain(db, "other-lead", "client.example.com", "2026-01-02T00:00:00.000Z"),
    ).toThrow(CustomDomainConflictError);
  });

  it("allows the same lead to re-save its own already-owned domain (not a conflict with itself)", () => {
    const db = freshDb();
    insertDeployHandoffDirect(db, "test-lead", { customDomain: "client.example.com" });
    const result = sqliteUpdateDeployHandoffCustomDomain(
      db,
      "test-lead",
      "client.example.com",
      "2026-01-02T00:00:00.000Z",
    );
    expect(result?.customDomain).toBe("client.example.com");
  });
});

describe("sqliteOrderAlreadyRecorded", () => {
  it("returns false when no order exists for this stripeSessionId", () => {
    const db = freshDb();
    expect(sqliteOrderAlreadyRecorded(db, "cs_new")).toBe(false);
  });

  it("returns true once an order for this stripeSessionId exists (webhook redelivery guard)", () => {
    const db = freshDb();
    const leadId = insertLeadDirect(db, "test-lead");
    insertOrderDirect(db, leadId, "cs_recorded", "2026-01-01T00:00:00.000Z");
    expect(sqliteOrderAlreadyRecorded(db, "cs_recorded")).toBe(true);
  });
});

describe("sqliteRecordLeadPayment", () => {
  function paymentParams(overrides: Partial<{
    slug: string;
    stripeSessionId: string;
    tier: string;
    commerceAddon: boolean;
    amountTotal: number;
    stripeCustomerId?: string;
  }> = {}) {
    return {
      slug: "organic-new-buyer",
      stripeSessionId: "cs_test_1",
      tier: "starter",
      commerceAddon: false,
      amountTotal: 29900,
      ...overrides,
    };
  }

  it("creates a payment-stub lead and an order when the slug has no existing CRM row", () => {
    const db = freshDb();
    sqliteRecordLeadPayment(db, paymentParams(), false);

    const lead = db
      .prepare("SELECT slug, status, dataSource, businessName FROM leads WHERE slug = ?")
      .get("organic-new-buyer") as
      | { slug: string; status: string; dataSource: string; businessName: string }
      | undefined;
    expect(lead?.status).toBe("paid");
    expect(lead?.dataSource).toBe("payment_stub");
    expect(lead?.businessName).toBe("Organic New Buyer");

    const order = db
      .prepare("SELECT stripeSessionId, tier, amountPaid, commerceAddon FROM orders WHERE stripeSessionId = ?")
      .get("cs_test_1") as
      | { stripeSessionId: string; tier: string; amountPaid: number; commerceAddon: number }
      | undefined;
    expect(order?.tier).toBe("starter");
    expect(order?.amountPaid).toBe(29900);
    expect(order?.commerceAddon).toBe(0);
  });

  it("marks an existing discovered lead paid and still inserts the order", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");

    sqliteRecordLeadPayment(db, paymentParams({ slug: "test-lead", stripeSessionId: "cs_test_2" }), true);

    const lead = db.prepare("SELECT status FROM leads WHERE slug = ?").get("test-lead") as {
      status: string;
    };
    expect(lead.status).toBe("paid");
    const order = db
      .prepare("SELECT id FROM orders WHERE stripeSessionId = ?")
      .get("cs_test_2") as { id: string } | undefined;
    expect(order).toBeDefined();
  });

  it("never regresses an already-live lead back to paid on a repurchase (Starter -> Growth upsell), but still inserts the order", () => {
    const db = freshDb();
    insertLeadDirect(db, "test-lead");
    db.prepare("UPDATE leads SET status = 'live' WHERE slug = ?").run("test-lead");

    sqliteRecordLeadPayment(
      db,
      paymentParams({ slug: "test-lead", stripeSessionId: "cs_upsell", tier: "growth" }),
      true,
    );

    const lead = db.prepare("SELECT status FROM leads WHERE slug = ?").get("test-lead") as {
      status: string;
    };
    expect(lead.status).toBe("live");
    const order = db
      .prepare("SELECT tier FROM orders WHERE stripeSessionId = ?")
      .get("cs_upsell") as { tier: string } | undefined;
    expect(order?.tier).toBe("growth");
  });

  it("stores a null stripeCustomerId as NULL, not the string \"undefined\"", () => {
    const db = freshDb();
    sqliteRecordLeadPayment(db, paymentParams({ stripeSessionId: "cs_test_3" }), false);
    const order = db
      .prepare("SELECT stripeCustomerId FROM orders WHERE stripeSessionId = ?")
      .get("cs_test_3") as { stripeCustomerId: string | null };
    expect(order.stripeCustomerId).toBeNull();
  });
});
