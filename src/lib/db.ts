import { ConvexHttpClient } from "convex/browser";
import { DEMO_LEADS, resolvePreviewLead } from "./leads/demo-catalog";
import type { Lead, LeadPipelineStage } from "./leads/types";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = convexUrl ? new ConvexHttpClient(convexUrl) : null;

// Statically define Convex function names to prevent Next.js compilation failures 
// when Convex code generation has not been run yet.
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

// In-memory fallback database for when Convex is not configured
// Using a global variable to persist it across hot reloads in Next.js development
const globalForDb = globalThis as unknown as { inMemoryLeads?: Lead[] };
if (!globalForDb.inMemoryLeads) {
  globalForDb.inMemoryLeads = [...DEMO_LEADS];
}
const inMemoryLeads = globalForDb.inMemoryLeads;

let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  await seedLeadsIfEmpty();
}

export async function getLeads(): Promise<Lead[]> {
  await ensureSeeded();
  if (client) {
    try {
      return (await client.query(api.leads.list)) as Lead[];
    } catch (e) {
      console.warn("Failed to fetch leads from Convex, falling back to mock data", e);
    }
  }
  return inMemoryLeads;
}

export async function getLeadBySlug(slug: string): Promise<Lead | null> {
  await ensureSeeded();
  if (client) {
    try {
      const lead = await client.query(api.leads.getBySlug, { slug });
      return (lead as Lead) || null;
    } catch (e) {
      console.warn(`Failed to fetch lead ${slug} from Convex, falling back to mock data`, e);
    }
  }
  return inMemoryLeads.find((l) => l.slug === slug) || null;
}

export async function updateLeadStage(slug: string, stage: LeadPipelineStage): Promise<void> {
  if (client) {
    try {
      await client.mutation(api.leads.updateStage, { slug, stage });
      return;
    } catch (e) {
      console.warn(`Failed to update lead stage for ${slug} on Convex, falling back to in-memory`, e);
    }
  }
  const lead = inMemoryLeads.find((l) => l.slug === slug);
  if (lead) {
    lead.stage = stage;
  } else {
    // If it's a dynamic slug not in the database, we can insert it
    const newLead = resolvePreviewLead(slug);
    newLead.stage = stage;
    inMemoryLeads.push(newLead);
  }
}

export async function upsertLead(lead: Lead): Promise<void> {
  if (client) {
    try {
      await client.mutation(api.leads.upsertLead, lead);
      return;
    } catch (e) {
      console.warn("Failed to upsert lead on Convex, falling back to in-memory", e);
    }
  }
  const idx = inMemoryLeads.findIndex((l) => l.slug === lead.slug);
  if (idx !== -1) {
    inMemoryLeads[idx] = { ...lead };
  } else {
    inMemoryLeads.push({ ...lead });
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
  if (client) {
    try {
      await client.mutation(api.leads.markLeadPaid, params);
      return;
    } catch (e) {
      console.warn(`Failed to record lead payment for ${params.slug} on Convex, falling back to in-memory`, e);
    }
  }
  const idx = inMemoryLeads.findIndex((l) => l.slug === params.slug);
  if (idx !== -1) {
    inMemoryLeads[idx] = { ...inMemoryLeads[idx], stage: "paid" };
  } else {
    // Insert a new lead in memory
    const businessName = params.slug
      .split("-")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    inMemoryLeads.push({
      slug: params.slug,
      businessName: businessName || "Unknown Business",
      category: "generic",
      city: "Colorado",
      state: "CO",
      tagline: "Claimed business website",
      description: "Created upon Stripe checkout.",
      phone: "",
      services: [],
      hours: { weekday: "Mon-Fri 9am-5pm", weekend: "Closed" },
      stage: "paid",
      recommendedTier: params.tier as "starter" | "growth" | "complete",
    });
  }
}

export async function seedLeadsIfEmpty(): Promise<void> {
  if (client) {
    try {
      const existing = await client.query(api.leads.list);
      if (existing.length === 0) {
        await client.mutation(api.leads.seed, { leads: [...DEMO_LEADS] });
        console.log("Seeded Convex database with demo leads");
      }
    } catch (e) {
      console.warn("Failed to seed Convex database", e);
    }
  }
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
