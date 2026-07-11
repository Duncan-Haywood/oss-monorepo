import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { DEMO_LEADS } from "./leads/demo-catalog";
import type { Lead, LeadHours, LeadPipelineStage } from "./leads/types";
import type { DeployHandoff, DeployHandoffStatus, DnsInstruction } from "./deploy/types";
import type {
  ClientInquiry,
  ClientInquiryStatus,
  CreateClientInquiryInput,
} from "./inquiries/types";

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
  phone?: string;
  email?: string | null;
  hours?: string;
  services?: string;
  status: string;
  tagline?: string | null;
  description?: string | null;
  recommendedTier?: string | null;
  dataSource?: string | null;
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
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_client_inquiries_slug
      ON client_inquiries(leadSlug);
    CREATE INDEX IF NOT EXISTS idx_client_inquiries_status
      ON client_inquiries(status);
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
  addLeadCol("tagline", "TEXT");
  addLeadCol("description", "TEXT");
  addLeadCol("recommendedTier", "TEXT");
  addLeadCol("dataSource", "TEXT");

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
        UPDATE leads SET email = ?, tagline = ?, description = ?, recommendedTier = ?, dataSource = ?
        WHERE id = ?
      `).run(
        lead.email ?? null,
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
  },
  inquiries: {
    create: "inquiries:create",
    list: "inquiries:list",
    listBySlug: "inquiries:listBySlug",
    updateStatus: "inquiries:updateStatus",
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
  if (check) {
    db.prepare(`
      UPDATE leads 
      SET businessName = ?, category = ?, city = ?, state = ?, phone = ?, email = ?, hours = ?, services = ?,
          tagline = ?, description = ?, recommendedTier = ?, dataSource = ?, status = ?, updatedAt = datetime('now')
      WHERE slug = ?
    `).run(
      lead.businessName,
      lead.category,
      lead.city,
      lead.state,
      lead.phone,
      lead.email ?? null,
      hoursStr,
      services,
      lead.tagline,
      lead.description,
      lead.recommendedTier,
      dataSource,
      lead.stage,
      lead.slug,
    );
  } else {
    const id = `lead_${Date.now()}`;
    db.prepare(`
      INSERT INTO leads (id, slug, businessName, category, city, state, phone, email, hours, services, tagline, description, recommendedTier, dataSource, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      lead.slug,
      lead.businessName,
      lead.category,
      lead.city,
      lead.state,
      lead.phone,
      lead.email ?? null,
      hoursStr,
      services,
      lead.tagline,
      lead.description,
      lead.recommendedTier,
      dataSource,
      lead.stage,
    );
  }
}

export async function recordLeadPayment(params: {
  slug: string;
  stripeSessionId: string;
  customerEmail: string;
  tier: string;
  commerceAddon: boolean;
  amountTotal: number;
}): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.markLeadPaid, params);
      return;
    } catch (e) {
      console.warn(`Failed to record lead payment for ${params.slug} on Convex, falling back to SQLite database`, e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
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
    INSERT INTO orders (id, leadId, stripeSessionId, tier, commerceAddon, amountPaid, status)
    VALUES (?, ?, ?, ?, ?, ?, 'paid')
  `).run(
    orderId,
    leadRow.id,
    params.stripeSessionId,
    params.tier,
    params.commerceAddon ? 1 : 0,
    params.amountTotal
  );
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
  };
  for (const lead of leads) {
    if (lead.stage in counts) {
      counts[lead.stage] += 1;
    }
  }
  return counts;
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
      vercelDomainStatus, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
