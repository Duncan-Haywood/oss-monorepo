import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { DEMO_LEADS } from "./leads/demo-catalog";
import type { Lead, LeadPipelineStage, OutreachStep } from "./leads/types";
import { buildPaymentStubLeadFields } from "./leads/payment-stub";
import { normalizeOutreachStep } from "./email/outreach-followups";
import type { DeployHandoff, DeployHandoffStatus } from "./deploy/types";
import type { ClientInquiry, ClientInquiryStatus, CreateClientInquiryInput } from "./inquiries/types";
import { normalizeContactFormFields } from "./inquiries/contact-fields";
import type { OrderRecord } from "./orders/types";
import { sortOrdersNewestFirst } from "./orders/types";
import type { CheckoutSessionRecord } from "./checkout/types";
import type { MarketingPack, UpsertMarketingPackInput } from "./marketing/pack";
import type { CommerceCatalog, UpsertCommerceCatalogInput } from "./commerce/types";
import {
  newCommerceOrderId,
  sortCommerceOrdersNewestFirst,
} from "./commerce/orders";
import type { CommerceOrderRecord, InsertCommerceOrderInput } from "./commerce/orders";
import type { ClientVoicePack, UpsertClientVoicePackInput } from "./voice/pack";
import {
  ConvexPrimaryWriteError,
  shouldFallbackToSqliteOnConvexFailure,
  type ConvexPrimaryWriteOptions,
} from "./payments/convex-primary";
import { resolveConvexDeploymentUrl } from "./convex/convex-url-env-readiness";
import {
  mapSqliteRowToLead,
  serializeLeadHours,
  serializeLeadServices,
  type SqliteLeadRow,
} from "./leads/sqlite-row-mapping";
import { mapSqliteOrderRow, type SqliteOrderJoinRow } from "./orders/sqlite-row-mapping";
import { preferAdvancedHandoffStatus } from "./deploy/handoff-preserve";
import {
  customDomainHostAliases,
  isPlausibleCustomDomainHost,
  normalizeOperatorCustomDomainHost,
} from "./deploy/custom-domain-routing";
import { mapDeployHandoffRow, type SqliteDeployHandoffRow } from "./deploy/sqlite-row-mapping";
import { mapClientInquiryRow, type SqliteClientInquiryRow } from "./inquiries/sqlite-row-mapping";
import { mapCheckoutSessionRow, type SqliteCheckoutSessionRow } from "./checkout/sqlite-row-mapping";
import { mapMarketingPackRow, type SqliteMarketingPackRow } from "./marketing/sqlite-row-mapping";
import {
  mapCommerceCatalogRow,
  mapCommerceOrderRow,
  type SqliteCommerceCatalogRow,
  type SqliteCommerceOrderRow,
} from "./commerce/sqlite-row-mapping";
import { mapClientVoicePackRow, type SqliteClientVoicePackRow } from "./voice/sqlite-row-mapping";

export type { ConvexPrimaryWriteOptions } from "./payments/convex-primary";

/** Trim + placeholder gate — whitespace-only must not construct ConvexHttpClient. */
const convexUrl = resolveConvexDeploymentUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
const convexClient = convexUrl ? new ConvexHttpClient(convexUrl) : null;

// SQLite Database Setup (for local fallback persistence and suppression list)
const dbPath = path.join(process.cwd(), "local.db");
let sqliteDb: DatabaseSync | null = null;

function getSqliteDb(): DatabaseSync {
  if (sqliteDb) return sqliteDb;
  sqliteDb = new DatabaseSync(dbPath);

  // Initialize SQLite schema
  sqliteDb.exec(`
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
      status TEXT NOT NULL DEFAULT 'paid',
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
      generator TEXT NOT NULL
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
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_commerce_orders_slug
      ON commerce_orders(leadSlug);

    CREATE INDEX IF NOT EXISTS idx_deploy_handoffs_customDomain
      ON deploy_handoffs(customDomain);
  `);

  // Migrations for DBs created before email/dataSource columns existed
  const leadCols = (
    sqliteDb.prepare("PRAGMA table_info(leads)").all() as unknown as Array<{ name: string }>
  ).map((c) => c.name);
  const addLeadCol = (name: string, typeSql: string) => {
    if (!leadCols.includes(name)) {
      sqliteDb!.exec(`ALTER TABLE leads ADD COLUMN ${name} ${typeSql}`);
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

  const handoffCols = (
    sqliteDb.prepare("PRAGMA table_info(deploy_handoffs)").all() as unknown as Array<{ name: string }>
  ).map((c) => c.name);
  if (!handoffCols.includes("vercelProjectId")) {
    sqliteDb.exec("ALTER TABLE deploy_handoffs ADD COLUMN vercelProjectId TEXT");
  }

  const orderCols = (
    sqliteDb.prepare("PRAGMA table_info(orders)").all() as unknown as Array<{ name: string }>
  ).map((c) => c.name);
  if (!orderCols.includes("stripeCustomerId")) {
    sqliteDb.exec("ALTER TABLE orders ADD COLUMN stripeCustomerId TEXT");
  }
  // Stripe redelivers checkout.session.completed on retry/timeout; unlike
  // checkout_sessions/commerce_orders, `orders` had no uniqueness guard, so a
  // retry double-counted revenueTotalUsd and resent receipt/handoff emails.
  // NULLs (pre-webhook manual rows) don't collide under a unique index. Guard
  // against a pre-existing DB that already accumulated a duplicate pair
  // before this fix — don't crash startup over stale data.
  try {
    sqliteDb.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session_id ON orders(stripeSessionId)",
    );
  } catch (e) {
    console.error(
      "Failed to create unique index on orders.stripeSessionId — likely pre-existing duplicate rows from before this fix; new inserts still check-before-insert in application code",
      e,
    );
  }

  const inquiryCols = (
    sqliteDb.prepare("PRAGMA table_info(client_inquiries)").all() as unknown as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!inquiryCols.includes("operatorReply")) {
    sqliteDb.exec("ALTER TABLE client_inquiries ADD COLUMN operatorReply TEXT");
  }
  if (!inquiryCols.includes("repliedAt")) {
    sqliteDb.exec("ALTER TABLE client_inquiries ADD COLUMN repliedAt TEXT");
  }

  const checkoutSessionCols = (
    sqliteDb.prepare("PRAGMA table_info(checkout_sessions)").all() as unknown as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!checkoutSessionCols.includes("kind")) {
    sqliteDb.exec("ALTER TABLE checkout_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'bundle'");
  }
  if (!checkoutSessionCols.includes("skuId")) {
    sqliteDb.exec("ALTER TABLE checkout_sessions ADD COLUMN skuId TEXT");
  }

  const commerceOrderCols = (
    sqliteDb.prepare("PRAGMA table_info(commerce_orders)").all() as unknown as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (!commerceOrderCols.includes("paidOutAt")) {
    sqliteDb.exec("ALTER TABLE commerce_orders ADD COLUMN paidOutAt TEXT");
  }
  if (!commerceOrderCols.includes("clientReceiptEmailSentAt")) {
    sqliteDb.exec(
      "ALTER TABLE commerce_orders ADD COLUMN clientReceiptEmailSentAt TEXT",
    );
  }

  // Seed SQLite database if empty
  const countStmt = sqliteDb.prepare("SELECT COUNT(*) as count FROM leads");
  const row = countStmt.get() as { count: number } | undefined;
  if (!row || row.count === 0) {
    const insertStmt = sqliteDb.prepare(`
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
        lead.stage
      );
      sqliteDb!.prepare(`
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

  return sqliteDb;
}

// Statically define Convex function names to prevent compilation failures
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = {
  leads: {
    list: "leads:list",
    getBySlug: "leads:getBySlug",
    updateStage: "leads:updateStage",
    upsertLead: "leads:upsertLead",
    seed: "leads:seed",
    markLeadPaid: "leads:markLeadPaid",
    recordOutreach: "leads:recordOutreach",
    recordPreviewOpen: "leads:recordPreviewOpen",
    updateNotes: "leads:updateNotes",
    updateSnooze: "leads:updateSnooze",
    applyColdDisposition: "leads:applyColdDisposition",
  },
  inquiries: {
    create: "inquiries:create",
    list: "inquiries:list",
    listUnreplied: "inquiries:listUnreplied",
    listBySlug: "inquiries:listBySlug",
    listCommerceCheckoutBySlug: "inquiries:listCommerceCheckoutBySlug",
    getById: "inquiries:getById",
    updateStatus: "inquiries:updateStatus",
    recordReply: "inquiries:recordReply",
  },
  orders: {
    list: "orders:list",
    listByLeadSlug: "orders:listByLeadSlug",
  },
  checkoutSessions: {
    create: "checkoutSessions:create",
    markComplete: "checkoutSessions:markComplete",
    recordRecoverySent: "checkoutSessions:recordRecoverySent",
    listOpen: "checkoutSessions:listOpen",
  },
  marketingPacks: {
    upsert: "marketingPacks:upsert",
    getByLeadMonth: "marketingPacks:getByLeadMonth",
    listByMonth: "marketingPacks:listByMonth",
  },
  commerceCatalogs: {
    upsert: "commerceCatalogs:upsert",
    getByLeadSlug: "commerceCatalogs:getByLeadSlug",
    list: "commerceCatalogs:list",
  },
  clientVoicePacks: {
    upsert: "clientVoicePacks:upsert",
    getByLeadSlug: "clientVoicePacks:getByLeadSlug",
    list: "clientVoicePacks:list",
  },
  commerceOrders: {
    insert: "commerceOrders:insert",
    list: "commerceOrders:list",
    listUnpaid: "commerceOrders:listUnpaid",
    getByStripeSessionId: "commerceOrders:getByStripeSessionId",
    markPaidOut: "commerceOrders:markPaidOut",
    markClientReceiptSent: "commerceOrders:markClientReceiptSent",
  },
  suppressions: {
    isSuppressed: "suppressions:isSuppressed",
    suppress: "suppressions:suppress",
    list: "suppressions:list",
  },
  deployHandoffs: {
    upsert: "deployHandoffs:upsert",
    getByLeadSlug: "deployHandoffs:getByLeadSlug",
    getByCustomDomain: "deployHandoffs:getByCustomDomain",
    list: "deployHandoffs:list",
    updateStatus: "deployHandoffs:updateStatus",
    updateVercelProject: "deployHandoffs:updateVercelProject",
    updateCustomDomain: "deployHandoffs:updateCustomDomain",
  },
};

export async function getLeads(): Promise<Lead[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.leads.list)) as Lead[];
    } catch (e) {
      console.warn("Failed to fetch leads from Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const rows = db.prepare("SELECT * FROM leads ORDER BY createdAt DESC").all() as unknown as SqliteLeadRow[];
  return rows.map(mapSqliteRowToLead);
}

export async function getLeadBySlug(slug: string): Promise<Lead | null> {
  if (convexClient) {
    try {
      const lead = await convexClient.query(api.leads.getBySlug, { slug });
      return (lead as Lead) || null;
    } catch (e) {
      console.warn(`Failed to fetch lead ${slug} from Convex, falling back to SQLite database`, e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM leads WHERE slug = ?").get(slug) as SqliteLeadRow | undefined;
  if (!row) return null;
  return mapSqliteRowToLead(row);
}

/**
 * Move a lead's pipeline stage.
 *
 * Pass { requireConvex: true } (LEAD_STAGE_CONVEX_PRIMARY) from
 * updateLeadStageAction so a Convex mutation failure does not silently leave
 * stage only in instance-local SQLite while Convex-first readers (getLeads /
 * pipeline-health / stage funnel) never see the move. Mark live already passes
 * DEPLOY_HANDOFF_CONVEX_PRIMARY through this helper.
 */
export async function updateLeadStage(
  slug: string,
  stage: LeadPipelineStage,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  // Pass { requireConvex: true } (LEAD_STAGE_CONVEX_PRIMARY) from
  // updateLeadStageAction so a Convex mutation failure does not silently leave
  // stage only in instance-local SQLite while Convex-first readers (getLeads /
  // pipeline-health / stage funnel) never see it. Mark live already passes
  // DEPLOY_HANDOFF_CONVEX_PRIMARY through this same helper.
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateStage, { slug, stage });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadStage", e);
      }
      console.warn(`Failed to update lead stage for ${slug} on Convex, falling back to SQLite database`, e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const stmt = db.prepare("UPDATE leads SET status = ?, updatedAt = datetime('now') WHERE slug = ?");
  stmt.run(stage, slug);
}

export async function upsertLead(
  lead: Lead,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.upsertLead, lead);
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("upsertLead", e);
      }
      console.warn("Failed to upsert lead on Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const services = serializeLeadServices(lead.services);
  const hoursStr = serializeLeadHours(lead.hours);
  const dataSource = lead.dataSource ?? "manual_entry";

  const check = db.prepare("SELECT id FROM leads WHERE slug = ?").get(lead.slug) as { id: string } | undefined;
  const outreachStep = normalizeOutreachStep(lead.outreachStep);
  const lastOutreachAt = lead.lastOutreachAt ?? null;
  const lastPreviewOpenAt = lead.lastPreviewOpenAt ?? null;
  const notes = lead.notes ?? null;
  const snoozedUntil = lead.snoozedUntil ?? null;

  if (check) {
    db.prepare(`
      UPDATE leads
      SET businessName = ?, category = ?, city = ?, state = ?, address = ?, phone = ?, email = ?, hours = ?, services = ?,
          tagline = ?, description = ?, recommendedTier = ?, dataSource = ?, status = ?,
          outreachStep = ?, lastOutreachAt = ?, lastPreviewOpenAt = ?, notes = ?, snoozedUntil = ?, updatedAt = datetime('now')
      WHERE slug = ?
    `).run(
      lead.businessName,
      lead.category,
      lead.city,
      lead.state,
      lead.address ?? null,
      lead.phone,
      lead.email ?? null,
      hoursStr,
      services,
      lead.tagline,
      lead.description,
      lead.recommendedTier,
      dataSource,
      lead.stage,
      outreachStep,
      lastOutreachAt,
      lastPreviewOpenAt,
      notes,
      snoozedUntil,
      lead.slug,
    );
  } else {
    const id = `lead_${Date.now()}`;
    db.prepare(`
      INSERT INTO leads (id, slug, businessName, category, city, state, address, phone, email, hours, services, tagline, description, recommendedTier, dataSource, status, outreachStep, lastOutreachAt, lastPreviewOpenAt, notes, snoozedUntil)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      lead.slug,
      lead.businessName,
      lead.category,
      lead.city,
      lead.state,
      lead.address ?? null,
      lead.phone,
      lead.email ?? null,
      hoursStr,
      services,
      lead.tagline,
      lead.description,
      lead.recommendedTier,
      dataSource,
      lead.stage,
      outreachStep,
      lastOutreachAt,
      lastPreviewOpenAt,
      notes,
      snoozedUntil,
    );
  }
}

/**
 * Persist outreach sequence progress after Email 1/2/3 sends successfully.
 */
export async function recordLeadOutreach(
  slug: string,
  outreachStep: OutreachStep,
  lastOutreachAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (outreachStep < 1 || outreachStep > 3) {
    throw new Error("outreachStep must be 1, 2, or 3");
  }

  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.recordOutreach, {
        slug,
        outreachStep,
        lastOutreachAt,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordLeadOutreach", e);
      }
      console.warn(
        `Failed to record outreach for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    UPDATE leads
    SET outreachStep = ?, lastOutreachAt = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(outreachStep, lastOutreachAt, slug);
}

/**
 * Record an attributed preview open (outreach link or in-pipeline revisit).
 * No-ops when the lead row does not exist yet (slug-inferred demos).
 * Pass { requireConvex: true } from the public beacon route so a Convex
 * failure does not silently leave lastPreviewOpenAt only in instance-local
 * SQLite while Convex-first readers (Work next / Opened badge) never see it.
 */
export async function recordLeadPreviewOpen(
  slug: string,
  openedAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<{ recorded: boolean }> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.recordPreviewOpen, {
        slug,
        openedAt,
      });
      return { recorded: true };
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordLeadPreviewOpen", e);
      }
      console.warn(
        `Failed to record preview open for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    return { recorded: false };
  }
  db.prepare(`
    UPDATE leads
    SET lastPreviewOpenAt = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(openedAt, slug);
  return { recorded: true };
}

/**
 * Persist free-text operator notes on a lead (call outcomes, next steps).
 * Pass undefined/empty to clear. Caller should normalize via normalizeOperatorNotes.
 * Pass { requireConvex: true } (LEAD_NOTES_CONVEX_PRIMARY) from
 * updateLeadNotesAction so a Convex mutation failure does not silently leave
 * notes only in instance-local SQLite while Convex-first readers (getLeads)
 * never see discovery-call / Email 3 outcomes.
 */
export async function updateLeadNotes(
  slug: string,
  notes: string | undefined,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateNotes, {
        slug,
        notes: notes ?? "",
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadNotes", e);
      }
      console.warn(
        `Failed to update notes for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET notes = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(notes ?? null, slug);
}

/**
 * Persist Work next snooze until (ISO) or clear with undefined.
 * Caller should normalize via normalizeSnoozedUntil / snoozedUntilFromPreset.
 * Pass { requireConvex: true } (LEAD_SNOOZE_CONVEX_PRIMARY) from
 * snoozeLeadAction so a Convex mutation failure does not silently leave
 * snoozedUntil only in instance-local SQLite while Convex-first readers
 * (isFollowUpDue, pipeline-health, the daily digest) never see it.
 */
export async function updateLeadSnooze(
  slug: string,
  snoozedUntil: string | undefined,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateSnooze, {
        slug,
        snoozedUntil: snoozedUntil ?? "",
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadSnooze", e);
      }
      console.warn(
        `Failed to update snooze for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET snoozedUntil = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(snoozedUntil ?? null, slug);
}

/**
 * Persist a cold-lead disposition patch (re-engage or close) in one write.
 * Caller must validate via planColdLeadDisposition first.
 * Pass { requireConvex: true } (COLD_DISPOSITION_CONVEX_PRIMARY) from
 * disposeColdLeadAction so a Convex mutation failure does not silently leave
 * stage/outreach only in instance-local SQLite while Convex-first readers
 * (getLeads, cold badges, pipeline-health) never see the Re-engage/Close.
 */
export async function applyColdLeadDisposition(
  slug: string,
  patch: {
    stage: LeadPipelineStage;
    outreachStep: OutreachStep;
    lastOutreachAt: string | undefined;
    snoozedUntil: string | undefined;
  },
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.applyColdDisposition, {
        slug,
        stage: patch.stage,
        outreachStep: patch.outreachStep,
        lastOutreachAt: patch.lastOutreachAt ?? "",
        snoozedUntil: patch.snoozedUntil ?? "",
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("applyColdLeadDisposition", e);
      }
      console.warn(
        `Failed to apply cold disposition for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET status = ?, outreachStep = ?, lastOutreachAt = ?, snoozedUntil = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(
    patch.stage,
    patch.outreachStep,
    patch.lastOutreachAt ?? null,
    patch.snoozedUntil ?? null,
    slug,
  );
}

/**
 * Records a bundle payment (Starter/Growth/Complete checkout) exactly once
 * per Stripe session. Returns alreadyRecorded=true when this stripeSessionId
 * was already recorded — Stripe redelivers checkout.session.completed on
 * retry/timeout, and the caller must not resend receipt/handoff emails or
 * count the sale twice in revenueTotalUsd for a redelivery.
 */
export async function recordLeadPayment(
  params: {
    slug: string;
    stripeSessionId: string;
    customerEmail: string;
    tier: string;
    commerceAddon: boolean;
    amountTotal: number;
    stripeCustomerId?: string;
  },
  options?: ConvexPrimaryWriteOptions,
): Promise<{ alreadyRecorded: boolean }> {
  if (convexClient) {
    try {
      return await convexClient.mutation(api.leads.markLeadPaid, params);
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordLeadPayment", e);
      }
      console.warn(`Failed to record lead payment for ${params.slug} on Convex, falling back to SQLite database`, e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const existingOrder = db
    .prepare("SELECT id FROM orders WHERE stripeSessionId = ?")
    .get(params.stripeSessionId) as { id: string } | undefined;
  if (existingOrder) {
    return { alreadyRecorded: true };
  }

  const lead = await getLeadBySlug(params.slug);
  if (!lead) {
    // Keep field defaults aligned with Convex markLeadPaid stub + payment-stub.ts.
    const stub = buildPaymentStubLeadFields(params.slug);
    const id = `lead_${Date.now()}`;

    db.prepare(`
      INSERT INTO leads (id, slug, businessName, category, city, state, phone, tagline, description, recommendedTier, dataSource, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')
    `).run(
      id,
      stub.slug,
      stub.businessName,
      stub.category,
      stub.city,
      stub.state,
      stub.phone,
      stub.tagline,
      stub.description,
      stub.recommendedTier,
      stub.dataSource,
    );
  } else {
    const stmt = db.prepare("UPDATE leads SET status = 'paid', updatedAt = datetime('now') WHERE slug = ?");
    stmt.run(params.slug);
  }

  // Get lead ID
  const leadRow = db.prepare("SELECT id FROM leads WHERE slug = ?").get(params.slug) as { id: string };

  // Insert order
  const orderId = `order_${Date.now()}`;
  db.prepare(`
    INSERT INTO orders (id, leadId, stripeSessionId, stripeCustomerId, tier, commerceAddon, amountPaid, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'paid')
  `).run(
    orderId,
    leadRow.id,
    params.stripeSessionId,
    params.stripeCustomerId ?? null,
    params.tier,
    params.commerceAddon ? 1 : 0,
    params.amountTotal
  );
  return { alreadyRecorded: false };
}

export async function countLeadsByStage(): Promise<Record<LeadPipelineStage, number>> {
  const leads = await getLeads();
  const counts: Record<LeadPipelineStage, number> = {
    discovered: 0,
    site_built: 0,
    outreach_sent: 0,
    discovery_call: 0,
    paid: 0,
    live: 0,
    closed: 0,
  };
  for (const lead of leads) {
    if (lead.stage in counts) {
      counts[lead.stage] += 1;
    }
  }
  return counts;
}

/**
 * List paid orders for operator pipeline health (revenue totals).
 * Convex when configured; SQLite join otherwise.
 *
 * Newest-first: convex/orders.list sorts by createdAt desc at the source;
 * sortOrdersNewestFirst here stays as belt-and-suspenders so Billing Portal
 * latestEligibleOrder cannot regress if a future caller bypasses that query
 * shape or the Convex sort is accidentally removed.
 */
function mapConvexOrderRow(row: {
  _id: string;
  leadSlug: string;
  stripeSessionId: string;
  stripeCustomerId?: string;
  tier: string;
  commerceAddon: boolean;
  amountTotal: number;
  createdAt: number;
}): OrderRecord {
  return {
    id: row._id,
    leadSlug: row.leadSlug,
    stripeSessionId: row.stripeSessionId,
    stripeCustomerId: row.stripeCustomerId,
    tier: row.tier,
    commerceAddon: row.commerceAddon,
    amountPaid: row.amountTotal,
    status: "paid",
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export async function listOrders(): Promise<OrderRecord[]> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(api.orders.list)) as Array<{
        _id: string;
        leadSlug: string;
        stripeSessionId: string;
        stripeCustomerId?: string;
        tier: string;
        commerceAddon: boolean;
        amountTotal: number;
        createdAt: number;
      }>;
      return sortOrdersNewestFirst(rows.map(mapConvexOrderRow));
    } catch (e) {
      console.warn("Failed to fetch orders from Convex, falling back to SQLite", e);
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT o.id, l.slug as leadSlug, o.stripeSessionId, o.stripeCustomerId, o.tier, o.commerceAddon,
              o.amountPaid, o.status, o.createdAt
       FROM orders o
       LEFT JOIN leads l ON l.id = o.leadId
       ORDER BY o.createdAt DESC`,
    )
    .all() as unknown as SqliteOrderJoinRow[];

  return rows.map((row) =>
    mapSqliteOrderRow({
      ...row,
      leadSlug: row.leadSlug || "unknown",
    }),
  );
}

/**
 * Slug-scoped orders for preview commerce eligibility, Manage billing, and
 * per-lead dashboard sold-capability gates (upsell / packs / catalog).
 * Prefer over listOrders() whenever the caller already has a lead slug —
 * never full-ledger collect then filter. Newest-first on both backends
 * (matches listOrders). Keep listOrders() for digest + dashboard aggregates.
 */
export async function listOrdersByLeadSlug(
  leadSlug: string,
): Promise<OrderRecord[]> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(api.orders.listByLeadSlug, {
        leadSlug,
      })) as Array<{
        _id: string;
        leadSlug: string;
        stripeSessionId: string;
        stripeCustomerId?: string;
        tier: string;
        commerceAddon: boolean;
        amountTotal: number;
        createdAt: number;
      }>;
      return sortOrdersNewestFirst(rows.map(mapConvexOrderRow));
    } catch (e) {
      console.warn(
        `Failed to fetch orders for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT o.id, l.slug as leadSlug, o.stripeSessionId, o.stripeCustomerId, o.tier, o.commerceAddon,
              o.amountPaid, o.status, o.createdAt
       FROM orders o
       LEFT JOIN leads l ON l.id = o.leadId
       WHERE l.slug = ?
       ORDER BY o.createdAt DESC`,
    )
    .all(leadSlug) as unknown as SqliteOrderJoinRow[];

  return rows.map((row) =>
    mapSqliteOrderRow({
      ...row,
      leadSlug: row.leadSlug || leadSlug,
    }),
  );
}

// --- Suppression List Functions ---

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (convexClient) {
    try {
      return (await convexClient.query(api.suppressions.isSuppressed, {
        email: normalized,
      })) as boolean;
    } catch (e) {
      console.warn("Failed to check suppression on Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const row = db.prepare("SELECT email FROM suppression_list WHERE email = ?").get(normalized) as { email: string } | undefined;
  return !!row;
}

export async function suppressEmail(
  email: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (convexClient) {
    try {
      await convexClient.mutation(api.suppressions.suppress, { email: normalized });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("suppressEmail", e);
      }
      console.warn("Failed to record suppression on Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  db.prepare("INSERT OR IGNORE INTO suppression_list (email) VALUES (?)").run(normalized);
}

export async function getSuppressedEmails(): Promise<string[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.suppressions.list)) as string[];
    } catch (e) {
      console.warn("Failed to list suppressions from Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const rows = db.prepare("SELECT email FROM suppression_list").all() as { email: string }[];
  return rows.map((r) => r.email);
}

// --- Production deploy handoffs (Phase 5) ---

export async function insertDeployHandoff(
  handoff: DeployHandoff,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.deployHandoffs.upsert, {
        handoffId: handoff.id,
        leadSlug: handoff.leadSlug,
        businessName: handoff.businessName,
        tier: handoff.tier,
        commerceAddon: handoff.commerceAddon,
        stripeSessionId: handoff.stripeSessionId,
        customerEmail: handoff.customerEmail,
        previewUrl: handoff.previewUrl,
        suggestedHost: handoff.suggestedHost,
        customDomain: handoff.customDomain,
        contactFormUrl: handoff.contactFormUrl,
        dnsInstructions: handoff.dnsInstructions,
        status: handoff.status,
        vercelDomainStatus: handoff.vercelDomainStatus,
        vercelProjectId: handoff.vercelProjectId,
        notes: handoff.notes,
        createdAt: handoff.createdAt,
        updatedAt: handoff.updatedAt,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("insertDeployHandoff", e);
      }
      console.warn(
        "Failed to upsert deploy handoff on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO deploy_handoffs (
      id, leadSlug, businessName, tier, commerceAddon, stripeSessionId, customerEmail,
      previewUrl, suggestedHost, customDomain, contactFormUrl, dnsInstructions, status,
      vercelDomainStatus, vercelProjectId, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(leadSlug) DO UPDATE SET
      businessName = excluded.businessName,
      tier = excluded.tier,
      commerceAddon = excluded.commerceAddon,
      stripeSessionId = excluded.stripeSessionId,
      customerEmail = excluded.customerEmail,
      previewUrl = excluded.previewUrl,
      suggestedHost = excluded.suggestedHost,
      customDomain = excluded.customDomain,
      contactFormUrl = excluded.contactFormUrl,
      dnsInstructions = excluded.dnsInstructions,
      status = excluded.status,
      vercelDomainStatus = excluded.vercelDomainStatus,
      vercelProjectId = excluded.vercelProjectId,
      notes = excluded.notes,
      updatedAt = excluded.updatedAt
  `).run(
    handoff.id,
    handoff.leadSlug,
    handoff.businessName,
    handoff.tier,
    handoff.commerceAddon ? 1 : 0,
    handoff.stripeSessionId,
    handoff.customerEmail,
    handoff.previewUrl,
    handoff.suggestedHost,
    handoff.customDomain ?? null,
    handoff.contactFormUrl,
    JSON.stringify(handoff.dnsInstructions),
    handoff.status,
    handoff.vercelDomainStatus ?? null,
    handoff.vercelProjectId ?? null,
    JSON.stringify(handoff.notes),
    handoff.createdAt,
    handoff.updatedAt,
  );
}

export async function getDeployHandoffBySlug(slug: string): Promise<DeployHandoff | null> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.deployHandoffs.getByLeadSlug, {
        leadSlug: slug,
      })) as DeployHandoff | null;
    } catch (e) {
      console.warn(
        "Failed to get deploy handoff from Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(slug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;
  return mapDeployHandoffRow(row);
}

export async function listDeployHandoffs(): Promise<DeployHandoff[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.deployHandoffs.list)) as DeployHandoff[];
    } catch (e) {
      console.warn(
        "Failed to list deploy handoffs from Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM deploy_handoffs ORDER BY createdAt DESC")
    .all() as unknown as SqliteDeployHandoffRow[];
  return rows.map(mapDeployHandoffRow);
}

export async function updateDeployHandoffStatus(
  leadSlug: string,
  status: DeployHandoffStatus,
  extraNotes: string[] = [],
  options?: ConvexPrimaryWriteOptions,
): Promise<DeployHandoff | null> {
  const updatedAt = new Date().toISOString();

  if (convexClient) {
    try {
      return (await convexClient.mutation(api.deployHandoffs.updateStatus, {
        leadSlug,
        status,
        extraNotes,
        updatedAt,
      })) as DeployHandoff | null;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateDeployHandoffStatus", e);
      }
      console.warn(
        "Failed to update deploy handoff status on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  // SQLite-only path (also used when Convex mutation failed — read SQLite
  // directly so we don't re-fetch a Convex row and write a divergent copy).
  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;

  const existing = mapDeployHandoffRow(row);
  // Never downgrade status on note append (bundle receipt/DNS markers pass a
  // possibly-stale handoff.status from before Resend). Mirror Convex
  // deployHandoffs.updateStatus — see preferAdvancedHandoffStatus.
  const nextStatus = preferAdvancedHandoffStatus(existing.status, status);
  const notes = [...existing.notes, ...extraNotes];
  db.prepare(`
    UPDATE deploy_handoffs
    SET status = ?, notes = ?, updatedAt = ?
    WHERE leadSlug = ?
  `).run(nextStatus, JSON.stringify(notes), updatedAt, leadSlug);

  return {
    ...existing,
    status: nextStatus,
    notes,
    updatedAt,
  };
}

/** Set (or clear) the dedicated Vercel project isolating this client's deploy. */
export async function updateDeployHandoffVercelProject(
  leadSlug: string,
  vercelProjectId: string | null,
  options?: ConvexPrimaryWriteOptions,
): Promise<DeployHandoff | null> {
  const updatedAt = new Date().toISOString();

  if (convexClient) {
    try {
      return (await convexClient.mutation(api.deployHandoffs.updateVercelProject, {
        leadSlug,
        vercelProjectId: vercelProjectId ?? "",
        updatedAt,
      })) as DeployHandoff | null;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateDeployHandoffVercelProject", e);
      }
      console.warn(
        "Failed to update deploy handoff Vercel project on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;

  const existing = mapDeployHandoffRow(row);
  db.prepare(`
    UPDATE deploy_handoffs
    SET vercelProjectId = ?, updatedAt = ?
    WHERE leadSlug = ?
  `).run(vercelProjectId, updatedAt, leadSlug);

  return {
    ...existing,
    vercelProjectId: vercelProjectId || undefined,
    updatedAt,
  };
}

/** Set (or clear) the client's own domain, used for host-based routing (proxy.ts). */
export async function updateDeployHandoffCustomDomain(
  leadSlug: string,
  customDomain: string | null,
  options?: ConvexPrimaryWriteOptions,
): Promise<DeployHandoff | null> {
  const updatedAt = new Date().toISOString();
  // Bare hostname only (strip scheme/path/port) so stored values match
  // normalizeRequestHost(Host) and Vercel Domains API — see
  // normalizeOperatorCustomDomainHost / custom-domain-host-normalize.
  const normalized = normalizeOperatorCustomDomainHost(customDomain);

  if (convexClient) {
    try {
      return (await convexClient.mutation(api.deployHandoffs.updateCustomDomain, {
        leadSlug,
        customDomain: normalized ?? "",
        updatedAt,
      })) as DeployHandoff | null;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateDeployHandoffCustomDomain", e);
      }
      console.warn(
        "Failed to update deploy handoff custom domain on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;

  const existing = mapDeployHandoffRow(row);
  db.prepare(`
    UPDATE deploy_handoffs
    SET customDomain = ?, updatedAt = ?
    WHERE leadSlug = ?
  `).run(normalized, updatedAt, leadSlug);

  return {
    ...existing,
    customDomain: normalized || undefined,
    updatedAt,
  };
}

/**
 * Host-based routing lookup (proxy.ts) — given an inbound request Host
 * header, find which lead's preview to serve. Returns null for hosts with
 * no matching handoff (caller falls through to normal routing).
 *
 * Tries www↔apex aliases (exact first) so Save www.client.com still matches
 * Host client.com and uniqueness rejects the twin on another lead
 * (custom-domain-www-apex-alias).
 */
export async function getLeadSlugByCustomDomain(customDomain: string): Promise<string | null> {
  // Same bare-host normalize as write path so a mis-pasted lookup still matches.
  const normalized = normalizeOperatorCustomDomainHost(customDomain);
  if (!normalized) return null;
  // Read-path twin of Save domain: reject over-long / implausible hosts before
  // Convex/SQLite work (proxy-host-lookup-field-length-cap). Spoofed Host is
  // not DNS-bounded; write path already uses isPlausibleCustomDomainHost.
  if (!isPlausibleCustomDomainHost(normalized)) return null;

  const aliases = customDomainHostAliases(normalized);

  if (convexClient) {
    try {
      for (const alias of aliases) {
        const result = (await convexClient.query(api.deployHandoffs.getByCustomDomain, {
          customDomain: alias,
        })) as { leadSlug: string } | null;
        if (result?.leadSlug) return result.leadSlug;
      }
      return null;
    } catch (e) {
      console.warn(
        "Failed to look up deploy handoff by custom domain on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  for (const alias of aliases) {
    const row = db
      .prepare("SELECT leadSlug FROM deploy_handoffs WHERE customDomain = ? LIMIT 1")
      .get(alias) as { leadSlug: string } | undefined;
    if (row?.leadSlug) return row.leadSlug;
  }
  return null;
}

// --- Client inquiries (contact form CRM) ---

export async function insertClientInquiry(
  input: CreateClientInquiryInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<ClientInquiry> {
  const now = new Date().toISOString();
  // Defense in depth: same soft-caps the contact route applies before notify
  // (contact-form-notify-field-length-caps). Webhook commerce_checkout inquiries
  // and any future writer share these bounds.
  const capped = normalizeContactFormFields({
    name: input.name,
    email: input.email,
    phone: input.phone,
    message: input.message,
    source: input.source,
  });
  const inquiry: ClientInquiry = {
    id: `inq_${input.leadSlug}_${Date.now()}`,
    leadSlug: input.leadSlug,
    businessName: input.businessName,
    name: capped.name || undefined,
    email: capped.email || undefined,
    phone: capped.phone || undefined,
    message: capped.message,
    status: "new",
    source: capped.source || undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (convexClient) {
    try {
      await convexClient.mutation(api.inquiries.create, {
        inquiryId: inquiry.id,
        leadSlug: inquiry.leadSlug,
        businessName: inquiry.businessName,
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        message: inquiry.message,
        source: inquiry.source,
      });
      return inquiry;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("insertClientInquiry", e);
      }
      console.warn("Failed to insert client inquiry on Convex, falling back to SQLite", e);
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO client_inquiries (
      id, leadSlug, businessName, name, email, phone, message, status, source, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    inquiry.id,
    inquiry.leadSlug,
    inquiry.businessName,
    inquiry.name ?? null,
    inquiry.email ?? null,
    inquiry.phone ?? null,
    inquiry.message,
    inquiry.status,
    inquiry.source ?? null,
    inquiry.createdAt,
    inquiry.updatedAt,
  );

  return inquiry;
}

export async function listClientInquiries(limit = 100): Promise<ClientInquiry[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (convexClient) {
    try {
      return (await convexClient.query(api.inquiries.list, {
        limit: safeLimit,
      })) as ClientInquiry[];
    } catch (e) {
      console.warn("Failed to list client inquiries from Convex, falling back to SQLite", e);
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM client_inquiries ORDER BY createdAt DESC LIMIT ?",
    )
    .all(safeLimit) as unknown as SqliteClientInquiryRow[];
  return rows.map(mapClientInquiryRow);
}

/**
 * Every inquiry still awaiting an operator reply (status "new" or "read"),
 * uncapped — feeds pipeline-health unrepliedInquiryCount /
 * oldestUnrepliedInquiryAgeHours and the daily digest Unreplied inquiries
 * section, both of which must never miss an inquiry older than the newest N
 * total inquiries. `listClientInquiries`'s capped page stays for inbox UI.
 */
export async function listUnrepliedInquiries(): Promise<ClientInquiry[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.inquiries.listUnreplied, {})) as ClientInquiry[];
    } catch (e) {
      console.warn(
        "Failed to list unreplied client inquiries from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM client_inquiries WHERE status IN ('new', 'read') ORDER BY createdAt DESC",
    )
    .all() as unknown as SqliteClientInquiryRow[];
  return rows.map(mapClientInquiryRow);
}

export async function listClientInquiriesBySlug(
  leadSlug: string,
  limit = 50,
): Promise<ClientInquiry[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (convexClient) {
    try {
      return (await convexClient.query(api.inquiries.listBySlug, {
        leadSlug,
        limit: safeLimit,
      })) as ClientInquiry[];
    } catch (e) {
      console.warn(
        `Failed to list client inquiries for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM client_inquiries WHERE leadSlug = ? ORDER BY createdAt DESC LIMIT ?",
    )
    .all(leadSlug, safeLimit) as unknown as SqliteClientInquiryRow[];
  return rows.map(mapClientInquiryRow);
}

/**
 * Every commerce_checkout inquiry for a lead (uncapped) — feeds Commerce Buy
 * now webhook session dedup via planCommerceWebhookSideEffects. Prefer this
 * over listClientInquiriesBySlug's newest 50/200 page: once contact /
 * Request-order / Buy now volume exceeds that window, an older
 * commerce_checkout row embedding stripeSessionId falls off the page and
 * Stripe redelivery falsely recovers (duplicate inbox + client receipt).
 */
export async function listCommerceCheckoutInquiriesBySlug(
  leadSlug: string,
): Promise<ClientInquiry[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(
        api.inquiries.listCommerceCheckoutBySlug,
        { leadSlug },
      )) as ClientInquiry[];
    } catch (e) {
      console.warn(
        `Failed to list commerce_checkout inquiries for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT * FROM client_inquiries
       WHERE leadSlug = ? AND source = 'commerce_checkout'
       ORDER BY createdAt DESC`,
    )
    .all(leadSlug) as unknown as SqliteClientInquiryRow[];
  return rows.map(mapClientInquiryRow);
}

/**
 * Update an inquiry's status (new / read / replied / archived).
 * Pass { requireConvex: true } (INQUIRY_REPLY_CONVEX_PRIMARY) from
 * updateInquiryStatusAction so a Convex mutation failure does not silently
 * leave status only in instance-local SQLite while unrepliedInquiryCount /
 * mark-read metrics read Convex-first.
 */
export async function updateClientInquiryStatus(
  inquiryId: string,
  status: ClientInquiryStatus,
  options?: ConvexPrimaryWriteOptions,
): Promise<ClientInquiry | null> {
  if (convexClient) {
    try {
      const updated = (await convexClient.mutation(api.inquiries.updateStatus, {
        inquiryId,
        status,
      })) as ClientInquiry | null;
      if (updated) return updated;
      // Shared store is authoritative when requireConvex — do not invent from SQLite.
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        return null;
      }
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateClientInquiryStatus", e);
      }
      console.warn(
        `Failed to update inquiry ${inquiryId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db
    .prepare("SELECT * FROM client_inquiries WHERE id = ?")
    .get(inquiryId) as SqliteClientInquiryRow | undefined;
  if (!existing) return null;

  const updatedAt = new Date().toISOString();
  db.prepare(
    "UPDATE client_inquiries SET status = ?, updatedAt = ? WHERE id = ?",
  ).run(status, updatedAt, inquiryId);

  return mapClientInquiryRow({ ...existing, status, updatedAt });
}

export async function getClientInquiryById(
  inquiryId: string,
): Promise<ClientInquiry | null> {
  if (convexClient) {
    try {
      const inquiry = (await convexClient.query(api.inquiries.getById, {
        inquiryId,
      })) as ClientInquiry | null;
      if (inquiry) return inquiry;
    } catch (e) {
      console.warn(
        `Failed to get inquiry ${inquiryId} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM client_inquiries WHERE id = ?")
    .get(inquiryId) as SqliteClientInquiryRow | undefined;
  return row ? mapClientInquiryRow(row) : null;
}

/**
 * Persist a successful operator reply: status=replied + body + repliedAt.
 * Pass { requireConvex: true } (INQUIRY_REPLY_CONVEX_PRIMARY) from
 * replyToInquiryAction so a Convex mutation failure does not silently leave
 * the replied mark only in instance-local SQLite while unrepliedInquiryCount
 * reads Convex-first (duplicate-reply risk). Callers must mark BEFORE Resend.
 */
export async function recordClientInquiryReply(
  inquiryId: string,
  operatorReply: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<ClientInquiry | null> {
  if (convexClient) {
    try {
      const updated = (await convexClient.mutation(api.inquiries.recordReply, {
        inquiryId,
        operatorReply,
      })) as ClientInquiry | null;
      if (updated) return updated;
      // Shared store is authoritative when requireConvex — do not invent from SQLite.
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        return null;
      }
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordClientInquiryReply", e);
      }
      console.warn(
        `Failed to record inquiry reply ${inquiryId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db
    .prepare("SELECT * FROM client_inquiries WHERE id = ?")
    .get(inquiryId) as SqliteClientInquiryRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE client_inquiries
     SET status = ?, operatorReply = ?, repliedAt = ?, updatedAt = ?
     WHERE id = ?`,
  ).run("replied", operatorReply, now, now, inquiryId);

  return mapClientInquiryRow({
    ...existing,
    status: "replied",
    operatorReply,
    repliedAt: now,
    updatedAt: now,
  });
}

// --- Checkout sessions (abandoned-checkout recovery, Phase 3) ---

/**
 * Records a newly-created Stripe Checkout Session for abandoned-checkout
 * tracking. Pass { requireConvex: true } from checkout API routes so a
 * Convex failure does not silently leave the open session only in
 * instance-local SQLite while Convex-first readers
 * (listAbandonedCheckoutsDue / listCommerceAbandonedCheckoutsDue) never see
 * it — the create-side twin of markCheckoutSessionComplete.
 */
export async function recordCheckoutSessionCreated(
  params: {
    leadSlug: string;
    stripeSessionId: string;
    tier: string;
    commerceAddon: boolean;
    customerEmail?: string;
    kind?: "bundle" | "commerce_sku";
    skuId?: string;
  },
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  const createdAt = new Date().toISOString();
  const kind = params.kind ?? "bundle";

  if (convexClient) {
    try {
      await convexClient.mutation(api.checkoutSessions.create, {
        ...params,
        kind,
        createdAt,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordCheckoutSessionCreated", e);
      }
      console.warn(
        `Failed to record checkout session ${params.stripeSessionId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO checkout_sessions (id, leadSlug, stripeSessionId, tier, commerceAddon, customerEmail, status, createdAt, kind, skuId)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    ON CONFLICT(stripeSessionId) DO NOTHING
  `).run(
    `chk_${Date.now()}`,
    params.leadSlug,
    params.stripeSessionId,
    params.tier,
    params.commerceAddon ? 1 : 0,
    params.customerEmail ?? null,
    createdAt,
    kind,
    params.skuId ?? null,
  );
}

/**
 * Flips a checkout session to "complete" — called from the
 * checkout.session.completed webhook. Pass { requireConvex: true } (the
 * webhook does) so a Convex failure does not silently leave the session
 * "open" only in instance-local SQLite while Convex-first readers
 * (listAbandonedCheckoutsDue / listCommerceAbandonedCheckoutsDue) still see
 * it as open and email a Finish-checkout nudge to someone who already paid.
 */
export async function markCheckoutSessionComplete(
  stripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.checkoutSessions.markComplete, { stripeSessionId });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCheckoutSessionComplete", e);
      }
      console.warn(
        `Failed to mark checkout session ${stripeSessionId} complete on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare("UPDATE checkout_sessions SET status = 'complete' WHERE stripeSessionId = ?").run(
    stripeSessionId,
  );
}

/** Records that an operator sent an abandoned-checkout recovery email for this session. */
export async function recordCheckoutRecoverySent(
  stripeSessionId: string,
  sentAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.checkoutSessions.recordRecoverySent, {
        stripeSessionId,
        sentAt,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordCheckoutRecoverySent", e);
      }
      console.warn(
        `Failed to record recovery send for ${stripeSessionId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare("UPDATE checkout_sessions SET recoverySentAt = ? WHERE stripeSessionId = ?").run(
    sentAt,
    stripeSessionId,
  );
}

/** All checkout sessions still "open" (not yet completed) — the abandoned-recovery due queue's input. */
export async function listOpenCheckoutSessions(): Promise<CheckoutSessionRecord[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.checkoutSessions.listOpen)) as CheckoutSessionRecord[];
    } catch (e) {
      console.warn(
        "Failed to list open checkout sessions from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM checkout_sessions WHERE status = 'open' ORDER BY createdAt ASC")
    .all() as unknown as SqliteCheckoutSessionRow[];
  return rows.map(mapCheckoutSessionRow);
}

// --- Marketing packs (Growth/Complete monthly content) ---

export async function upsertMarketingPack(
  input: UpsertMarketingPackInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<MarketingPack> {
  const pack: MarketingPack = {
    id: `mp_${input.leadSlug}_${input.yearMonth}`,
    leadSlug: input.leadSlug,
    yearMonth: input.yearMonth,
    variants: input.variants,
    generatedAt: input.generatedAt,
    generator: input.generator,
    packageTier: input.packageTier,
  };

  if (convexClient) {
    try {
      await convexClient.mutation(api.marketingPacks.upsert, {
        packId: pack.id,
        leadSlug: pack.leadSlug,
        yearMonth: pack.yearMonth,
        variants: pack.variants,
        generatedAt: pack.generatedAt,
        generator: pack.generator,
        packageTier: pack.packageTier,
      });
      return pack;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("upsertMarketingPack", e);
      }
      console.warn(
        `Failed to upsert marketing pack for ${pack.leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO marketing_packs (
      id, leadSlug, yearMonth, variantsJson, generatedAt, generator, packageTier
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(leadSlug, yearMonth) DO UPDATE SET
      id = excluded.id,
      variantsJson = excluded.variantsJson,
      generatedAt = excluded.generatedAt,
      generator = excluded.generator,
      packageTier = excluded.packageTier
  `).run(
    pack.id,
    pack.leadSlug,
    pack.yearMonth,
    JSON.stringify(pack.variants),
    pack.generatedAt,
    pack.generator,
    pack.packageTier ?? null,
  );

  return pack;
}

export async function getMarketingPack(
  leadSlug: string,
  yearMonth: string,
): Promise<MarketingPack | null> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.marketingPacks.getByLeadMonth, {
        leadSlug,
        yearMonth,
      })) as MarketingPack | null;
    } catch (e) {
      console.warn(
        `Failed to get marketing pack for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM marketing_packs WHERE leadSlug = ? AND yearMonth = ?")
    .get(leadSlug, yearMonth) as SqliteMarketingPackRow | undefined;
  return row ? mapMarketingPackRow(row) : null;
}

/**
 * Every marketing pack for a UTC month — feeds listMarketingPacksDue /
 * pipeline-health / digest. Uncapped: a newest-page slice undercounts
 * fulfillment (false "packs due" once volume exceeds the window).
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export async function listMarketingPacksForMonth(
  yearMonth: string,
  _limit?: number,
): Promise<MarketingPack[]> {
  void _limit;

  if (convexClient) {
    try {
      return (await convexClient.query(api.marketingPacks.listByMonth, {
        yearMonth,
      })) as MarketingPack[];
    } catch (e) {
      console.warn(
        "Failed to list marketing packs from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM marketing_packs WHERE yearMonth = ? ORDER BY generatedAt DESC",
    )
    .all(yearMonth) as unknown as SqliteMarketingPackRow[];
  return rows.map(mapMarketingPackRow);
}

// --- Commerce catalogs (≤50 SKUs for commerceAddon leads) ---

/**
 * Persist (or replace) a Commerce catalog row.
 *
 * Pass { requireConvex: true } from saveCommerceCatalogAction /
 * syncCommerceCatalogToStripeAction so a Convex mutation failure surfaces
 * instead of SQLite-only success while Convex-first Buy now / unsynced
 * readers still miss stripePriceId on other instances.
 */
export async function upsertCommerceCatalog(
  input: UpsertCommerceCatalogInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<CommerceCatalog> {
  const catalog: CommerceCatalog = {
    leadSlug: input.leadSlug,
    items: input.items,
    updatedAt: input.updatedAt,
  };

  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceCatalogs.upsert, {
        leadSlug: catalog.leadSlug,
        items: catalog.items,
        updatedAt: catalog.updatedAt,
      });
      return catalog;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("upsertCommerceCatalog", e);
      }
      console.warn(
        `Failed to upsert commerce catalog for ${catalog.leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO commerce_catalogs (leadSlug, itemsJson, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(leadSlug) DO UPDATE SET
      itemsJson = excluded.itemsJson,
      updatedAt = excluded.updatedAt
  `).run(catalog.leadSlug, JSON.stringify(catalog.items), catalog.updatedAt);

  return catalog;
}

export async function getCommerceCatalog(
  leadSlug: string,
): Promise<CommerceCatalog | null> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.commerceCatalogs.getByLeadSlug, {
        leadSlug,
      })) as CommerceCatalog | null;
    } catch (e) {
      console.warn(
        `Failed to get commerce catalog for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM commerce_catalogs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteCommerceCatalogRow | undefined;
  return row ? mapCommerceCatalogRow(row) : null;
}

/**
 * Every commerce catalog — feeds listCommerceCatalogsMissing /
 * listCommerceCatalogsUnsynced / pipeline-health / digest. Uncapped: a
 * newest-page slice invents false "missing" debt and can hide unsynced SKUs
 * (Buy now blocked while Sync due looks clean).
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export async function listCommerceCatalogs(
  _limit?: number,
): Promise<CommerceCatalog[]> {
  void _limit;

  if (convexClient) {
    try {
      return (await convexClient.query(
        api.commerceCatalogs.list,
        {},
      )) as CommerceCatalog[];
    } catch (e) {
      console.warn(
        "Failed to list commerce catalogs from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM commerce_catalogs ORDER BY updatedAt DESC")
    .all() as unknown as SqliteCommerceCatalogRow[];
  return rows.map(mapCommerceCatalogRow);
}

// --- Commerce orders (end-customer Buy now purchases — see commerce/orders.ts) ---

/**
 * Idempotent on stripeSessionId — the Stripe webhook may see the same
 * checkout.session.completed event more than once and must never double-count
 * pass-through commerce revenue. Returns alreadyRecorded=true when this
 * session was already ledgered so callers can skip non-idempotent side
 * effects (operator inquiry + client receipt email).
 */
export async function insertCommerceOrder(
  input: InsertCommerceOrderInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<{ alreadyRecorded: boolean }> {
  const createdAt = new Date().toISOString();
  // Generated once up front (not inside the SQLite-only branch) so both
  // backends persist and return the same app-owned id — the Convex
  // commerceOrders table previously had no id column at all, so every row
  // came back with `id: undefined` once Convex was configured.
  const id = newCommerceOrderId();

  if (convexClient) {
    try {
      const result = await convexClient.mutation(api.commerceOrders.insert, {
        ...input,
        orderId: id,
        createdAt,
      });
      // Convex insert returns null when by_stripeSessionId already exists.
      return { alreadyRecorded: result === null };
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("insertCommerceOrder", e);
      }
      console.warn(
        "Failed to insert commerce order on Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db
    .prepare("SELECT id FROM commerce_orders WHERE stripeSessionId = ?")
    .get(input.stripeSessionId) as { id: string } | undefined;
  if (existing) {
    return { alreadyRecorded: true };
  }

  db.prepare(
    `INSERT OR IGNORE INTO commerce_orders (
      id, leadSlug, skuId, skuName, amountPaidUsd, stripeSessionId, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.leadSlug,
    input.skuId,
    input.skuName,
    input.amountPaidUsd,
    input.stripeSessionId,
    createdAt,
  );
  return { alreadyRecorded: false };
}

/**
 * Newest-first by app createdAt. convex/commerceOrders.list sorts at the
 * source; sortCommerceOrdersNewestFirst here stays as belt-and-suspenders so
 * the Commerce payouts panel cannot regress if a future caller bypasses that
 * query shape (same pattern as listOrders + sortOrdersNewestFirst).
 */
export async function listCommerceOrders(
  limit = 200,
): Promise<CommerceOrderRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  if (convexClient) {
    try {
      const rows = (await convexClient.query(api.commerceOrders.list, {
        limit: safeLimit,
      })) as CommerceOrderRecord[];
      return sortCommerceOrdersNewestFirst(rows);
    } catch (e) {
      console.warn(
        "Failed to list commerce orders from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM commerce_orders ORDER BY createdAt DESC LIMIT ?",
    )
    .all(safeLimit) as unknown as SqliteCommerceOrderRow[];
  return rows.map(mapCommerceOrderRow);
}

/**
 * Every unpaid commerce order for manual payout reconciliation / owed totals.
 * Prefer this over listCommerceOrders() for pipeline-health, digest, and the
 * Commerce payouts panel — list()'s newest-page cap undercounts liability.
 *
 * Newest-first by app createdAt on both backends (Convex sorts at source;
 * belt-and-suspenders re-sort here matches listCommerceOrders / listOrders).
 */
export async function listUnpaidCommerceOrders(): Promise<CommerceOrderRecord[]> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(
        api.commerceOrders.listUnpaid,
        {},
      )) as CommerceOrderRecord[];
      return sortCommerceOrdersNewestFirst(rows);
    } catch (e) {
      console.warn(
        "Failed to list unpaid commerce orders from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT * FROM commerce_orders
       WHERE paidOutAt IS NULL OR paidOutAt = ''
       ORDER BY createdAt DESC`,
    )
    .all() as unknown as SqliteCommerceOrderRow[];
  return rows.map(mapCommerceOrderRow);
}

/** Single commerce order by Stripe Checkout Session id (Mark paid out lookup). */
export async function getCommerceOrderByStripeSessionId(
  stripeSessionId: string,
): Promise<CommerceOrderRecord | null> {
  if (convexClient) {
    try {
      const row = (await convexClient.query(
        api.commerceOrders.getByStripeSessionId,
        { stripeSessionId },
      )) as CommerceOrderRecord | null;
      return row;
    } catch (e) {
      console.warn(
        `Failed to get commerce order ${stripeSessionId} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM commerce_orders WHERE stripeSessionId = ?")
    .get(stripeSessionId) as SqliteCommerceOrderRow | undefined;
  return row ? mapCommerceOrderRow(row) : null;
}

/**
 * Marks a commerce order as manually paid out to the client — reduces
 * double-pay risk on the payout panel until Stripe Connect ships. Keyed on
 * stripeSessionId (unique, always present), matching recordCheckoutRecoverySent.
 *
 * Pass { requireConvex: true } from markCommerceOrderPaidOutAction so a
 * Convex mutation failure surfaces instead of SQLite-only success while
 * Convex-first unpaid owed readers still show the order as owed.
 */
export async function markCommerceOrderPaidOut(
  stripeSessionId: string,
  paidOutAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceOrders.markPaidOut, {
        stripeSessionId,
        paidOutAt,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCommerceOrderPaidOut", e);
      }
      console.warn(
        `Failed to mark commerce order ${stripeSessionId} paid out on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare("UPDATE commerce_orders SET paidOutAt = ? WHERE stripeSessionId = ?").run(
    paidOutAt,
    stripeSessionId,
  );
}

/**
 * Durable client-receipt sent-marker after sendCommerceBuyNowClientReceipt
 * resolves { success: true }. Keyed on stripeSessionId — Stripe redelivery
 * recovers the client order notification while this field is unset.
 *
 * Pass { requireConvex: true } from the Stripe webhook so a Convex mutation
 * failure surfaces (5xx → Stripe retry) instead of SQLite-only success while
 * Convex-first getCommerceOrderByStripeSessionId still looks unmarked.
 */
export async function markCommerceOrderClientReceiptSent(
  stripeSessionId: string,
  clientReceiptEmailSentAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceOrders.markClientReceiptSent, {
        stripeSessionId,
        clientReceiptEmailSentAt,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCommerceOrderClientReceiptSent", e);
      }
      console.warn(
        `Failed to mark commerce client receipt sent for ${stripeSessionId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE commerce_orders SET clientReceiptEmailSentAt = ? WHERE stripeSessionId = ?",
  ).run(clientReceiptEmailSentAt, stripeSessionId);
}

// --- Client voice FAQ packs (Complete receptionist scripts) ---

export async function upsertClientVoicePack(
  input: UpsertClientVoicePackInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<ClientVoicePack> {
  const pack: ClientVoicePack = {
    id: `cv_${input.leadSlug}`,
    leadSlug: input.leadSlug,
    variants: input.variants,
    generatedAt: input.generatedAt,
    generator: input.generator,
  };

  if (convexClient) {
    try {
      await convexClient.mutation(api.clientVoicePacks.upsert, {
        packId: pack.id,
        leadSlug: pack.leadSlug,
        variants: pack.variants,
        generatedAt: pack.generatedAt,
        generator: pack.generator,
      });
      return pack;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("upsertClientVoicePack", e);
      }
      console.warn(
        `Failed to upsert client voice pack for ${pack.leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO client_voice_packs (
      id, leadSlug, variantsJson, generatedAt, generator
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(leadSlug) DO UPDATE SET
      id = excluded.id,
      variantsJson = excluded.variantsJson,
      generatedAt = excluded.generatedAt,
      generator = excluded.generator
  `).run(
    pack.id,
    pack.leadSlug,
    JSON.stringify(pack.variants),
    pack.generatedAt,
    pack.generator,
  );
  return pack;
}

export async function getClientVoicePackByLeadSlug(
  leadSlug: string,
): Promise<ClientVoicePack | null> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.clientVoicePacks.getByLeadSlug, {
        leadSlug,
      })) as ClientVoicePack | null;
    } catch (e) {
      console.warn(
        `Failed to get client voice pack for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM client_voice_packs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteClientVoicePackRow | undefined;
  return row ? mapClientVoicePackRow(row) : null;
}

/**
 * Every client voice pack — feeds listClientVoicePacksDue / pipeline-health /
 * digest. Uncapped: a newest-page slice undercounts Complete fulfillment
 * (false "voice packs due" once volume exceeds the window).
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export async function listClientVoicePacks(
  _limit?: number,
): Promise<ClientVoicePack[]> {
  void _limit;

  if (convexClient) {
    try {
      return (await convexClient.query(
        api.clientVoicePacks.list,
        {},
      )) as ClientVoicePack[];
    } catch (e) {
      console.warn(
        "Failed to list client voice packs from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM client_voice_packs ORDER BY generatedAt DESC")
    .all() as unknown as SqliteClientVoicePackRow[];
  return rows.map(mapClientVoicePackRow);
}
