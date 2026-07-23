/**
 * SQLite fallback schema: table creation, additive column migrations, and
 * demo-lead seeding. Split out of src/lib/db.ts (which imports
 * "server-only" and therefore cannot be exercised by Vitest — see
 * AGENT_PROTOCOL's "server-only lib file cannot be Vitest-tested directly"
 * rule) so the schema itself is exercisable against a real in-memory
 * node:sqlite instance in tests, mirroring the injectable-client pattern in
 * src/lib/commerce/stripe-sync.ts. db.ts's getSqliteDb() calls this against
 * its real on-disk DatabaseSync; tests call it against `:memory:`.
 *
 * Pure code move — no behavior change from the inline version this replaces.
 */

import type { DatabaseSync } from "node:sqlite";
import { DEMO_LEADS } from "../leads/demo-catalog";
import { serializeLeadHours, serializeLeadServices } from "../leads/sqlite-row-mapping";

export function initializeSqliteSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      businessName TEXT NOT NULL,
      category TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      hours TEXT,
      services TEXT, -- JSON array of strings
      tagline TEXT,
      description TEXT,
      recommendedTier TEXT,
      dataSource TEXT,
      status TEXT NOT NULL DEFAULT 'discovered',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      leadId TEXT NOT NULL REFERENCES leads(id),
      stripeSessionId TEXT,
      stripeCustomerId TEXT,
      tier TEXT NOT NULL,
      commerceAddon INTEGER NOT NULL DEFAULT 0,
      amountPaid INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppression_list (
      email TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deploy_handoffs (
      id TEXT PRIMARY KEY,
      leadSlug TEXT UNIQUE NOT NULL,
      businessName TEXT NOT NULL,
      tier TEXT NOT NULL,
      commerceAddon INTEGER NOT NULL DEFAULT 0,
      stripeSessionId TEXT NOT NULL,
      customerEmail TEXT NOT NULL,
      previewUrl TEXT NOT NULL,
      suggestedHost TEXT NOT NULL,
      customDomain TEXT,
      contactFormUrl TEXT NOT NULL,
      dnsInstructions TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      vercelDomainStatus TEXT,
      vercelProjectId TEXT,
      notes TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS client_inquiries (
      id TEXT PRIMARY KEY,
      leadSlug TEXT NOT NULL,
      businessName TEXT NOT NULL,
      name TEXT,
      email TEXT,
      phone TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      source TEXT,
      operatorReply TEXT,
      repliedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_client_inquiries_slug
      ON client_inquiries(leadSlug);
    CREATE INDEX IF NOT EXISTS idx_client_inquiries_status
      ON client_inquiries(status);

    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id TEXT PRIMARY KEY,
      leadSlug TEXT NOT NULL,
      stripeSessionId TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL,
      commerceAddon INTEGER NOT NULL DEFAULT 0,
      customerEmail TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      recoverySentAt TEXT,
      kind TEXT NOT NULL DEFAULT 'bundle',
      skuId TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status
      ON checkout_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_checkout_sessions_leadSlug
      ON checkout_sessions(leadSlug);

    CREATE TABLE IF NOT EXISTS marketing_packs (
      id TEXT PRIMARY KEY,
      leadSlug TEXT NOT NULL,
      yearMonth TEXT NOT NULL,
      variantsJson TEXT NOT NULL,
      generatedAt TEXT NOT NULL,
      generator TEXT NOT NULL,
      packageTier TEXT,
      sentToClientAt TEXT,
      UNIQUE(leadSlug, yearMonth)
    );

    CREATE INDEX IF NOT EXISTS idx_marketing_packs_month
      ON marketing_packs(yearMonth);
    CREATE INDEX IF NOT EXISTS idx_marketing_packs_slug
      ON marketing_packs(leadSlug);

    CREATE TABLE IF NOT EXISTS commerce_catalogs (
      leadSlug TEXT PRIMARY KEY,
      itemsJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS client_voice_packs (
      id TEXT PRIMARY KEY,
      leadSlug TEXT NOT NULL UNIQUE,
      variantsJson TEXT NOT NULL,
      generatedAt TEXT NOT NULL,
      generator TEXT NOT NULL,
      sentToClientAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_client_voice_packs_slug
      ON client_voice_packs(leadSlug);

    CREATE TABLE IF NOT EXISTS commerce_orders (
      id TEXT PRIMARY KEY,
      leadSlug TEXT NOT NULL,
      skuId TEXT NOT NULL,
      skuName TEXT NOT NULL,
      amountPaidUsd REAL NOT NULL,
      stripeSessionId TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      quantity INTEGER,
      customerEmail TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_commerce_orders_slug
      ON commerce_orders(leadSlug);

    CREATE INDEX IF NOT EXISTS idx_deploy_handoffs_customDomain
      ON deploy_handoffs(customDomain);
  `);

  // Migrations for DBs created before email/dataSource columns existed
  const leadCols = (
    db.prepare("PRAGMA table_info(leads)").all() as unknown as Array<{ name: string }>
  ).map((c) => c.name);
  const addLeadCol = (name: string, typeSql: string) => {
    if (!leadCols.includes(name)) {
      db.exec(`ALTER TABLE leads ADD COLUMN ${name} ${typeSql}`);
    }
  };
  addLeadCol("email", "TEXT");
  addLeadCol("address", "TEXT");
  addLeadCol("tagline", "TEXT");
  addLeadCol("description", "TEXT");
  addLeadCol("recommendedTier", "TEXT");
  addLeadCol("dataSource", "TEXT");
  addLeadCol("outreachStep", "INTEGER");
  addLeadCol("lastOutreachAt", "TEXT");
  addLeadCol("lastPreviewOpenAt", "TEXT");
  addLeadCol("notes", "TEXT");
  addLeadCol("snoozedUntil", "TEXT");
  addLeadCol("stripeConnectAccountId", "TEXT");
  addLeadCol("stripeConnectAccountCreatedAt", "TEXT");
  addLeadCol("stripeConnectChargesEnabled", "INTEGER");
  addLeadCol("stripeConnectPayoutsEnabled", "INTEGER");
  addLeadCol("stripeConnectDetailsSubmitted", "INTEGER");
  addLeadCol("stripeConnectStatusCheckedAt", "TEXT");
  addLeadCol("bufferProfileIds", "TEXT");
  addLeadCol("bufferPostedVariantKeys", "TEXT");

  const handoffCols = (
    db.prepare("PRAGMA table_info(deploy_handoffs)").all() as unknown as Array<{ name: string }>
  ).map((c) => c.name);
  if (!handoffCols.includes("vercelProjectId")) {
    db.exec("ALTER TABLE deploy_handoffs ADD COLUMN vercelProjectId TEXT");
  }

  const orderCols = (
    db.prepare("PRAGMA table_info(orders)").all() as unknown as Array<{ name: string }>
  ).map((c) => c.name);
  if (!orderCols.includes("stripeCustomerId")) {
    db.exec("ALTER TABLE orders ADD COLUMN stripeCustomerId TEXT");
  }
  if (!orderCols.includes("recurringCanceledAt")) {
    db.exec("ALTER TABLE orders ADD COLUMN recurringCanceledAt INTEGER");
  }
  if (!orderCols.includes("refundedAt")) {
    db.exec("ALTER TABLE orders ADD COLUMN refundedAt TEXT");
  }
  if (!orderCols.includes("disputedAt")) {
    db.exec("ALTER TABLE orders ADD COLUMN disputedAt TEXT");
  }
  // Stripe redelivers checkout.session.completed on retry/timeout; unlike
  // checkout_sessions/commerce_orders, `orders` had no uniqueness guard, so a
  // retry double-counted revenueTotalUsd and resent receipt/handoff emails.
  // NULLs (pre-webhook manual rows) don't collide under a unique index. Guard
  // against a pre-existing DB that already accumulated a duplicate pair
  // before this fix — don't crash startup over stale data.
  try {
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON orders(stripeSessionId)",
    );
  } catch (e) {
    console.error(
      "Failed to create unique index on orders.stripeSessionId — likely pre-existing duplicate rows from before this fix; new inserts still check-before-insert in application code",
      e,
    );
  }
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_orders_stripe_customer_id ON orders(stripeCustomerId)",
    );
  } catch (e) {
    console.error("Failed to create index on orders.stripeCustomerId", e);
  }

  const inquiryCols = (
    db.prepare("PRAGMA table_info(client_inquiries)").all() as unknown as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!inquiryCols.includes("operatorReply")) {
    db.exec("ALTER TABLE client_inquiries ADD COLUMN operatorReply TEXT");
  }
  if (!inquiryCols.includes("repliedAt")) {
    db.exec("ALTER TABLE client_inquiries ADD COLUMN repliedAt TEXT");
  }

  const checkoutSessionCols = (
    db.prepare("PRAGMA table_info(checkout_sessions)").all() as unknown as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!checkoutSessionCols.includes("kind")) {
    db.exec("ALTER TABLE checkout_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'bundle'");
  }
  if (!checkoutSessionCols.includes("skuId")) {
    db.exec("ALTER TABLE checkout_sessions ADD COLUMN skuId TEXT");
  }

  const commerceOrderCols = (
    db.prepare("PRAGMA table_info(commerce_orders)").all() as unknown as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!commerceOrderCols.includes("paidOutAt")) {
    db.exec("ALTER TABLE commerce_orders ADD COLUMN paidOutAt TEXT");
  }
  if (!commerceOrderCols.includes("clientReceiptEmailSentAt")) {
    db.exec(
      "ALTER TABLE commerce_orders ADD COLUMN clientReceiptEmailSentAt TEXT",
    );
  }
  if (!commerceOrderCols.includes("refundedAt")) {
    db.exec("ALTER TABLE commerce_orders ADD COLUMN refundedAt TEXT");
  }
  if (!commerceOrderCols.includes("disputedAt")) {
    db.exec("ALTER TABLE commerce_orders ADD COLUMN disputedAt TEXT");
  }
  if (!commerceOrderCols.includes("quantity")) {
    db.exec("ALTER TABLE commerce_orders ADD COLUMN quantity INTEGER");
  }
  if (!commerceOrderCols.includes("customerEmail")) {
    db.exec("ALTER TABLE commerce_orders ADD COLUMN customerEmail TEXT");
  }

  const marketingPackCols = (
    db.prepare("PRAGMA table_info(marketing_packs)").all() as unknown as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!marketingPackCols.includes("sentToClientAt")) {
    db.exec("ALTER TABLE marketing_packs ADD COLUMN sentToClientAt TEXT");
  }

  const clientVoicePackCols = (
    db.prepare("PRAGMA table_info(client_voice_packs)").all() as unknown as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!clientVoicePackCols.includes("sentToClientAt")) {
    db.exec("ALTER TABLE client_voice_packs ADD COLUMN sentToClientAt TEXT");
  }

  // Seed SQLite database if empty
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM leads");
  const row = countStmt.get() as { count: number } | undefined;
  if (!row || row.count === 0) {
    const insertStmt = db.prepare(`
      INSERT INTO leads (id, slug, businessName, category, city, state, phone, hours, services, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    DEMO_LEADS.forEach((lead, i) => {
      const id = `lead_demo_${i}`;
      insertStmt.run(
        id,
        lead.slug,
        lead.businessName,
        lead.category,
        lead.city,
        lead.state,
        lead.phone,
        serializeLeadHours(lead.hours),
        serializeLeadServices(lead.services),
        lead.stage,
      );
      db.prepare(`
        UPDATE leads SET email = ?, address = ?, tagline = ?, description = ?, recommendedTier = ?, dataSource = ?
        WHERE id = ?
      `).run(
        lead.email ?? null,
        lead.address ?? null,
        lead.tagline,
        lead.description,
        lead.recommendedTier,
        lead.dataSource ?? "demo_catalog",
        id,
      );
    });
    console.log("Seeded SQLite database with initial demo leads.");
  }
}
