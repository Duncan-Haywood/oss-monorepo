import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { DEMO_LEADS } from "./leads/demo-catalog";
import type { Lead, LeadHours, LeadPipelineStage, OutreachStep } from "./leads/types";
import { normalizeOutreachStep } from "./email/outreach-followups";
import type { DeployHandoff, DeployHandoffStatus, DnsInstruction } from "./deploy/types";
import type {
  ClientInquiry,
  ClientInquiryStatus,
  CreateClientInquiryInput,
} from "./inquiries/types";
import type { OrderRecord } from "./orders/types";
import type { CheckoutSessionRecord } from "./checkout/types";
import type { MarketingPack, UpsertMarketingPackInput } from "./marketing/pack";
import type { MarketingContentVariant } from "./marketing/types";
import type {
  CommerceCatalog,
  CommerceSku,
  UpsertCommerceCatalogInput,
} from "./commerce/types";
import { newCommerceOrderId } from "./commerce/orders";
import type { CommerceOrderRecord, InsertCommerceOrderInput } from "./commerce/orders";
import type { ClientVoicePack, UpsertClientVoicePackInput } from "./voice/pack";
import type { ClientVoiceScriptVariant } from "./voice/types";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexClient = convexUrl ? new ConvexHttpClient(convexUrl) : null;

// Local SQLite Lead Row structure
interface SqliteLeadRow {
  id: string;
  slug: string;
  businessName: string;
  category: string;
  city: string;
  state?: string;
  address?: string | null;
  phone?: string;
  email?: string | null;
  hours?: string;
  services?: string;
  status: string;
  tagline?: string | null;
  description?: string | null;
  recommendedTier?: string | null;
  dataSource?: string | null;
  outreachStep?: number | null;
  lastOutreachAt?: string | null;
  lastPreviewOpenAt?: string | null;
  notes?: string | null;
  snoozedUntil?: string | null;
}

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
      const weekday = lead.hours.weekday;
      const weekend = lead.hours.weekend;
      const hoursStr = weekend ? `${weekday} · ${weekend}` : weekday;
      insertStmt.run(
        id,
        lead.slug,
        lead.businessName,
        lead.category,
        lead.city,
        lead.state,
        lead.phone,
        hoursStr,
        JSON.stringify(lead.services),
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
    listBySlug: "inquiries:listBySlug",
    getById: "inquiries:getById",
    updateStatus: "inquiries:updateStatus",
    recordReply: "inquiries:recordReply",
  },
  orders: {
    list: "orders:list",
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
    markPaidOut: "commerceOrders:markPaidOut",
  },
};

// Map SQLite row to Lead object
function mapSqliteRowToLead(row: SqliteLeadRow): Lead {
  let services: string[] = [];
  try {
    services = row.services ? JSON.parse(row.services) : [];
  } catch {}

  let hours: LeadHours = {
    weekday: "Mon–Fri 9am–5pm",
    weekend: "Sat–Sun Closed",
  };
  if (row.hours) {
    if (row.hours.includes("·")) {
      const parts = row.hours.split("·").map((p) => p.trim());
      hours = { weekday: parts[0], weekend: parts[1] || "" };
    } else {
      hours = { weekday: row.hours, weekend: "" };
    }
  }

  const category = (row.category === "restaurant" || row.category === "salon" || row.category === "trades" || row.category === "generic")
    ? row.category
    : "generic";

  const recommendedTier =
    row.recommendedTier === "starter" ||
    row.recommendedTier === "growth" ||
    row.recommendedTier === "complete"
      ? row.recommendedTier
      : category === "trades"
        ? "starter"
        : category === "salon"
          ? "complete"
          : "growth";

  return {
    slug: row.slug,
    businessName: row.businessName,
    category,
    city: row.city,
    state: row.state || "CO",
    address: row.address || undefined,
    tagline:
      row.tagline ||
      (category === "trades"
        ? "Professional services you can count on"
        : category === "salon"
          ? "Tailored styling and care"
          : "Local favorites made fresh daily"),
    description:
      row.description ||
      `This is a preview page generated for ${row.businessName}. Claim it to connect your domain, contact form, and marketing dashboard.`,
    phone: row.phone || "(555) 000-0000",
    email: row.email || undefined,
    services,
    hours,
    stage: row.status as LeadPipelineStage,
    recommendedTier,
    dataSource: row.dataSource || undefined,
    outreachStep: normalizeOutreachStep(row.outreachStep ?? undefined),
    lastOutreachAt: row.lastOutreachAt || undefined,
    lastPreviewOpenAt: row.lastPreviewOpenAt || undefined,
    notes: row.notes || undefined,
    snoozedUntil: row.snoozedUntil || undefined,
  };
}

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

export async function updateLeadStage(slug: string, stage: LeadPipelineStage): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateStage, { slug, stage });
      return;
    } catch (e) {
      console.warn(`Failed to update lead stage for ${slug} on Convex, falling back to SQLite database`, e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const stmt = db.prepare("UPDATE leads SET status = ?, updatedAt = datetime('now') WHERE slug = ?");
  stmt.run(stage, slug);
}

export async function upsertLead(lead: Lead): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.upsertLead, lead);
      return;
    } catch (e) {
      console.warn("Failed to upsert lead on Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const services = JSON.stringify(lead.services);
  const hoursStr = `${lead.hours.weekday} · ${lead.hours.weekend}`;
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
 */
export async function recordLeadPreviewOpen(
  slug: string,
  openedAt: string = new Date().toISOString(),
): Promise<{ recorded: boolean }> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.recordPreviewOpen, {
        slug,
        openedAt,
      });
      return { recorded: true };
    } catch (e) {
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
 */
export async function updateLeadNotes(
  slug: string,
  notes: string | undefined,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateNotes, {
        slug,
        notes: notes ?? "",
      });
      return;
    } catch (e) {
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
 */
export async function updateLeadSnooze(
  slug: string,
  snoozedUntil: string | undefined,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateSnooze, {
        slug,
        snoozedUntil: snoozedUntil ?? "",
      });
      return;
    } catch (e) {
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
 */
export async function applyColdLeadDisposition(
  slug: string,
  patch: {
    stage: LeadPipelineStage;
    outreachStep: OutreachStep;
    lastOutreachAt: string | undefined;
    snoozedUntil: string | undefined;
  },
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
export async function recordLeadPayment(params: {
  slug: string;
  stripeSessionId: string;
  customerEmail: string;
  tier: string;
  commerceAddon: boolean;
  amountTotal: number;
  stripeCustomerId?: string;
}): Promise<{ alreadyRecorded: boolean }> {
  if (convexClient) {
    try {
      return await convexClient.mutation(api.leads.markLeadPaid, params);
    } catch (e) {
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
    const id = `lead_${Date.now()}`;
    const businessName = params.slug
      .split("-")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    db.prepare(`
      INSERT INTO leads (id, slug, businessName, category, city, state, status)
      VALUES (?, ?, ?, ?, ?, ?, 'paid')
    `).run(id, params.slug, businessName || "Unknown", "generic", "Colorado", "CO");
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

interface SqliteOrderJoinRow {
  id: string;
  leadSlug: string;
  stripeSessionId: string | null;
  stripeCustomerId: string | null;
  tier: string;
  commerceAddon: number;
  amountPaid: number;
  status: string;
  createdAt: string;
}

function mapSqliteOrderRow(row: SqliteOrderJoinRow): OrderRecord {
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    stripeSessionId: row.stripeSessionId || "",
    stripeCustomerId: row.stripeCustomerId || undefined,
    tier: row.tier,
    commerceAddon: row.commerceAddon === 1,
    amountPaid: row.amountPaid,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/**
 * List paid orders for operator pipeline health (revenue totals).
 * Convex when configured; SQLite join otherwise.
 */
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
      return rows.map((row) => ({
        id: row._id,
        leadSlug: row.leadSlug,
        stripeSessionId: row.stripeSessionId,
        stripeCustomerId: row.stripeCustomerId,
        tier: row.tier,
        commerceAddon: row.commerceAddon,
        amountPaid: row.amountTotal,
        status: "paid",
        createdAt: new Date(row.createdAt).toISOString(),
      }));
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

// --- Suppression List Functions ---

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const db = getSqliteDb();
  const row = db.prepare("SELECT email FROM suppression_list WHERE email = ?").get(email.toLowerCase().trim()) as { email: string } | undefined;
  return !!row;
}

export async function suppressEmail(email: string): Promise<void> {
  const db = getSqliteDb();
  db.prepare("INSERT OR IGNORE INTO suppression_list (email) VALUES (?)").run(email.toLowerCase().trim());
}

export async function getSuppressedEmails(): Promise<string[]> {
  const db = getSqliteDb();
  const rows = db.prepare("SELECT email FROM suppression_list").all() as { email: string }[];
  return rows.map((r) => r.email);
}

// --- Production deploy handoffs (Phase 5) ---

interface SqliteDeployHandoffRow {
  id: string;
  leadSlug: string;
  businessName: string;
  tier: string;
  commerceAddon: number;
  stripeSessionId: string;
  customerEmail: string;
  previewUrl: string;
  suggestedHost: string;
  customDomain: string | null;
  contactFormUrl: string;
  dnsInstructions: string;
  status: string;
  vercelDomainStatus: string | null;
  vercelProjectId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

function mapDeployHandoffRow(row: SqliteDeployHandoffRow): DeployHandoff {
  let dnsInstructions: DnsInstruction[] = [];
  let notes: string[] = [];
  try {
    dnsInstructions = JSON.parse(row.dnsInstructions) as DnsInstruction[];
  } catch {
    dnsInstructions = [];
  }
  try {
    notes = JSON.parse(row.notes) as string[];
  } catch {
    notes = [];
  }

  return {
    id: row.id,
    leadSlug: row.leadSlug,
    businessName: row.businessName,
    tier: row.tier,
    commerceAddon: row.commerceAddon === 1,
    stripeSessionId: row.stripeSessionId,
    customerEmail: row.customerEmail,
    previewUrl: row.previewUrl,
    suggestedHost: row.suggestedHost,
    customDomain: row.customDomain || undefined,
    contactFormUrl: row.contactFormUrl,
    dnsInstructions,
    status: row.status as DeployHandoffStatus,
    vercelDomainStatus: row.vercelDomainStatus || undefined,
    vercelProjectId: row.vercelProjectId || undefined,
    notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertDeployHandoff(handoff: DeployHandoff): Promise<void> {
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
  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(slug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;
  return mapDeployHandoffRow(row);
}

export async function listDeployHandoffs(): Promise<DeployHandoff[]> {
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
): Promise<DeployHandoff | null> {
  const existing = await getDeployHandoffBySlug(leadSlug);
  if (!existing) return null;

  const notes = [...existing.notes, ...extraNotes];
  const updatedAt = new Date().toISOString();
  const db = getSqliteDb();
  db.prepare(`
    UPDATE deploy_handoffs
    SET status = ?, notes = ?, updatedAt = ?
    WHERE leadSlug = ?
  `).run(status, JSON.stringify(notes), updatedAt, leadSlug);

  return {
    ...existing,
    status,
    notes,
    updatedAt,
  };
}

/** Set (or clear) the dedicated Vercel project isolating this client's deploy. */
export async function updateDeployHandoffVercelProject(
  leadSlug: string,
  vercelProjectId: string | null,
): Promise<DeployHandoff | null> {
  const existing = await getDeployHandoffBySlug(leadSlug);
  if (!existing) return null;

  const updatedAt = new Date().toISOString();
  const db = getSqliteDb();
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

// --- Client inquiries (contact form CRM) ---

interface SqliteClientInquiryRow {
  id: string;
  leadSlug: string;
  businessName: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string;
  status: string;
  source: string | null;
  operatorReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapClientInquiryRow(row: SqliteClientInquiryRow): ClientInquiry {
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    businessName: row.businessName,
    name: row.name || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    message: row.message,
    status: row.status as ClientInquiryStatus,
    source: row.source || undefined,
    operatorReply: row.operatorReply || undefined,
    repliedAt: row.repliedAt || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertClientInquiry(
  input: CreateClientInquiryInput,
): Promise<ClientInquiry> {
  const now = new Date().toISOString();
  const inquiry: ClientInquiry = {
    id: `inq_${input.leadSlug}_${Date.now()}`,
    leadSlug: input.leadSlug,
    businessName: input.businessName,
    name: input.name,
    email: input.email,
    phone: input.phone,
    message: input.message.slice(0, 5000),
    status: "new",
    source: input.source,
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

export async function updateClientInquiryStatus(
  inquiryId: string,
  status: ClientInquiryStatus,
): Promise<ClientInquiry | null> {
  if (convexClient) {
    try {
      const updated = (await convexClient.mutation(api.inquiries.updateStatus, {
        inquiryId,
        status,
      })) as ClientInquiry | null;
      if (updated) return updated;
    } catch (e) {
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
 */
export async function recordClientInquiryReply(
  inquiryId: string,
  operatorReply: string,
): Promise<ClientInquiry | null> {
  if (convexClient) {
    try {
      const updated = (await convexClient.mutation(api.inquiries.recordReply, {
        inquiryId,
        operatorReply,
      })) as ClientInquiry | null;
      if (updated) return updated;
    } catch (e) {
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

interface SqliteCheckoutSessionRow {
  id: string;
  leadSlug: string;
  stripeSessionId: string;
  tier: string;
  commerceAddon: number;
  customerEmail: string | null;
  status: string;
  createdAt: string;
  recoverySentAt: string | null;
  kind: string | null;
  skuId: string | null;
}

function mapCheckoutSessionRow(row: SqliteCheckoutSessionRow): CheckoutSessionRecord {
  const kind =
    row.kind === "commerce_sku" ? ("commerce_sku" as const) : ("bundle" as const);
  return {
    stripeSessionId: row.stripeSessionId,
    leadSlug: row.leadSlug,
    tier: row.tier,
    commerceAddon: row.commerceAddon === 1,
    customerEmail: row.customerEmail || undefined,
    status: row.status === "complete" ? "complete" : "open",
    createdAt: row.createdAt,
    recoverySentAt: row.recoverySentAt || undefined,
    kind,
    skuId: row.skuId || undefined,
  };
}

/** Records a newly-created Stripe Checkout Session for abandoned-checkout tracking. No-ops without a lead slug — there's nothing to attribute a recovery email to. */
export async function recordCheckoutSessionCreated(params: {
  leadSlug: string;
  stripeSessionId: string;
  tier: string;
  commerceAddon: boolean;
  customerEmail?: string;
  kind?: "bundle" | "commerce_sku";
  skuId?: string;
}): Promise<void> {
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

/** Flips a checkout session to "complete" — called from the checkout.session.completed webhook. */
export async function markCheckoutSessionComplete(stripeSessionId: string): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.checkoutSessions.markComplete, { stripeSessionId });
      return;
    } catch (e) {
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
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.checkoutSessions.recordRecoverySent, {
        stripeSessionId,
        sentAt,
      });
      return;
    } catch (e) {
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

interface SqliteMarketingPackRow {
  id: string;
  leadSlug: string;
  yearMonth: string;
  variantsJson: string;
  generatedAt: string;
  generator: string;
  packageTier: string | null;
}

function parsePackVariants(json: string): MarketingContentVariant[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MarketingContentVariant => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return typeof row.contentType === "string" && typeof row.body === "string";
    });
  } catch {
    return [];
  }
}

function mapMarketingPackRow(row: SqliteMarketingPackRow): MarketingPack {
  const tier =
    row.packageTier === "copy_pack" ||
    row.packageTier === "social_email" ||
    row.packageTier === "full_marketing"
      ? row.packageTier
      : undefined;
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    yearMonth: row.yearMonth,
    variants: parsePackVariants(row.variantsJson),
    generatedAt: row.generatedAt,
    generator: row.generator === "anthropic" ? "anthropic" : "stub",
    packageTier: tier,
  };
}

export async function upsertMarketingPack(
  input: UpsertMarketingPackInput,
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

export async function listMarketingPacksForMonth(
  yearMonth: string,
  limit = 100,
): Promise<MarketingPack[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (convexClient) {
    try {
      return (await convexClient.query(api.marketingPacks.listByMonth, {
        yearMonth,
        limit: safeLimit,
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
      "SELECT * FROM marketing_packs WHERE yearMonth = ? ORDER BY generatedAt DESC LIMIT ?",
    )
    .all(yearMonth, safeLimit) as unknown as SqliteMarketingPackRow[];
  return rows.map(mapMarketingPackRow);
}

// --- Commerce catalogs (≤50 SKUs for commerceAddon leads) ---

interface SqliteCommerceCatalogRow {
  leadSlug: string;
  itemsJson: string;
  updatedAt: string;
}

function parseCommerceItems(json: string): CommerceSku[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CommerceSku => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return (
        typeof row.id === "string" &&
        typeof row.name === "string" &&
        typeof row.priceCents === "number"
      );
    });
  } catch {
    return [];
  }
}

function mapCommerceCatalogRow(row: SqliteCommerceCatalogRow): CommerceCatalog {
  return {
    leadSlug: row.leadSlug,
    items: parseCommerceItems(row.itemsJson),
    updatedAt: row.updatedAt,
  };
}

export async function upsertCommerceCatalog(
  input: UpsertCommerceCatalogInput,
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

export async function listCommerceCatalogs(
  limit = 100,
): Promise<CommerceCatalog[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (convexClient) {
    try {
      return (await convexClient.query(api.commerceCatalogs.list, {
        limit: safeLimit,
      })) as CommerceCatalog[];
    } catch (e) {
      console.warn(
        "Failed to list commerce catalogs from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM commerce_catalogs ORDER BY updatedAt DESC LIMIT ?",
    )
    .all(safeLimit) as unknown as SqliteCommerceCatalogRow[];
  return rows.map(mapCommerceCatalogRow);
}

// --- Commerce orders (end-customer Buy now purchases — see commerce/orders.ts) ---

interface SqliteCommerceOrderRow {
  id: string;
  leadSlug: string;
  skuId: string;
  skuName: string;
  amountPaidUsd: number;
  stripeSessionId: string;
  createdAt: string;
  paidOutAt: string | null;
}

function mapCommerceOrderRow(row: SqliteCommerceOrderRow): CommerceOrderRecord {
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    skuId: row.skuId,
    skuName: row.skuName,
    amountPaidUsd: row.amountPaidUsd,
    stripeSessionId: row.stripeSessionId,
    createdAt: row.createdAt,
    paidOutAt: row.paidOutAt ?? undefined,
  };
}

/**
 * Idempotent on stripeSessionId — the Stripe webhook may see the same
 * checkout.session.completed event more than once and must never double-count
 * pass-through commerce revenue. Returns alreadyRecorded=true when this
 * session was already ledgered so callers can skip non-idempotent side
 * effects (operator inquiry + client receipt email).
 */
export async function insertCommerceOrder(
  input: InsertCommerceOrderInput,
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

export async function listCommerceOrders(
  limit = 200,
): Promise<CommerceOrderRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  if (convexClient) {
    try {
      return (await convexClient.query(api.commerceOrders.list, {
        limit: safeLimit,
      })) as CommerceOrderRecord[];
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
 * Marks a commerce order as manually paid out to the client — reduces
 * double-pay risk on the payout panel until Stripe Connect ships. Keyed on
 * stripeSessionId (unique, always present), matching recordCheckoutRecoverySent.
 */
export async function markCommerceOrderPaidOut(
  stripeSessionId: string,
  paidOutAt: string = new Date().toISOString(),
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceOrders.markPaidOut, {
        stripeSessionId,
        paidOutAt,
      });
      return;
    } catch (e) {
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

// --- Client voice FAQ packs (Complete receptionist scripts) ---

interface SqliteClientVoicePackRow {
  id: string;
  leadSlug: string;
  variantsJson: string;
  generatedAt: string;
  generator: string;
}

function parseClientVoiceVariants(json: string): ClientVoiceScriptVariant[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ClientVoiceScriptVariant => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return (
        typeof row.scriptType === "string" &&
        typeof row.title === "string" &&
        typeof row.body === "string"
      );
    });
  } catch {
    return [];
  }
}

function mapClientVoicePackRow(row: SqliteClientVoicePackRow): ClientVoicePack {
  const generator =
    row.generator === "anthropic" || row.generator === "stub" ? row.generator : "stub";
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    variants: parseClientVoiceVariants(row.variantsJson),
    generatedAt: row.generatedAt,
    generator,
  };
}

export async function upsertClientVoicePack(
  input: UpsertClientVoicePackInput,
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

export async function listClientVoicePacks(limit = 100): Promise<ClientVoicePack[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (convexClient) {
    try {
      return (await convexClient.query(api.clientVoicePacks.list, {
        limit: safeLimit,
      })) as ClientVoicePack[];
    } catch (e) {
      console.warn(
        "Failed to list client voice packs from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM client_voice_packs ORDER BY generatedAt DESC LIMIT ?",
    )
    .all(safeLimit) as unknown as SqliteClientVoicePackRow[];
  return rows.map(mapClientVoicePackRow);
}
