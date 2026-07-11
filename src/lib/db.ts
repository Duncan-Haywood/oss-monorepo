import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { DEMO_LEADS } from "./leads/demo-catalog";
import type { Lead, LeadHours, LeadPipelineStage } from "./leads/types";

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
  hours?: string;
  services?: string;
  status: string;
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
      hours TEXT,
      services TEXT, -- JSON array of strings
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
  `);

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
  }
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

  return {
    slug: row.slug,
    businessName: row.businessName,
    category,
    city: row.city,
    state: row.state || "CO",
    tagline: category === "trades" ? "Professional services you can count on" : category === "salon" ? "Tailored styling and care" : "Local favorites made fresh daily",
    description: `This is a preview page generated for ${row.businessName}. Claim it to connect your domain, contact form, and marketing dashboard.`,
    phone: row.phone || "(555) 000-0000",
    services,
    hours,
    stage: row.status as LeadPipelineStage,
    recommendedTier: category === "trades" ? "starter" : category === "salon" ? "complete" : "growth",
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

  const check = db.prepare("SELECT id FROM leads WHERE slug = ?").get(lead.slug) as { id: string } | undefined;
  if (check) {
    db.prepare(`
      UPDATE leads 
      SET businessName = ?, category = ?, city = ?, state = ?, phone = ?, hours = ?, services = ?, status = ?, updatedAt = datetime('now')
      WHERE slug = ?
    `).run(lead.businessName, lead.category, lead.city, lead.state, lead.phone, hoursStr, services, lead.stage, lead.slug);
  } else {
    const id = `lead_${Date.now()}`;
    db.prepare(`
      INSERT INTO leads (id, slug, businessName, category, city, state, phone, hours, services, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, lead.slug, lead.businessName, lead.category, lead.city, lead.state, lead.phone, hoursStr, services, lead.stage);
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
