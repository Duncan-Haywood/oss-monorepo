// Offline demo seed: a FICTIONAL sample org ("Example Valley Trades Collective") owned by the caller,
// with documents (ingested + fact-extracted inline in demo/test), a few confirmed facts, two projects,
// the sample opportunity catalog and a match scoring run. Idempotent per user.
//
// Gate (demoSeedAllowed): allowed with FAKE_EXTERNALS=true, DEMO_MODE=true, or APP_ENV != production.
import { POLICY_VERSION } from "@shared/legal";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { facts, member, organization } from "../../db/schema";
import type { Env } from "../../env";
import { grantComp } from "../billing";
import { seedSampleOpportunities } from "../discovery/sample-opportunities";
import { createDocument, createDocumentFromText } from "../ingestion";
import { bulkConfirmFacts } from "../knowledge/facts";
import { createProject, listProjects } from "../knowledge/projects";
import { requestScoreOrg } from "../matching";
import { type ActorMeta, createOrg, updateOrgProfile } from "../orgs";
import { audit } from "../privacy/audit";
import {
  DEMO_CONFIRM_CATEGORIES,
  DEMO_CONFIRM_MAX,
  DEMO_DOCUMENTS,
  DEMO_ORG,
  DEMO_PROJECTS,
  DEMO_SEED_KEY,
  DEMO_SEED_VERSION,
  type DemoDocument,
} from "./content";

export { DEMO_ORG } from "./content";

/** /api/demo is available in fake/offline mode, on the demo deployment, and outside production. */
export function demoSeedAllowed(env: Pick<Env, "APP_ENV" | "FAKE_EXTERNALS" | "DEMO_MODE">) {
  return env.FAKE_EXTERNALS === "true" || env.DEMO_MODE === "true" || env.APP_ENV !== "production";
}

interface DemoMarker {
  seed: string;
  version: number;
  complete: boolean;
}

function readMarker(metadata: string | null): DemoMarker | null {
  if (!metadata) return null;
  try {
    const demo = (JSON.parse(metadata) as { demo?: Partial<DemoMarker> } | null)?.demo;
    return demo?.seed === DEMO_SEED_KEY
      ? { seed: demo.seed, version: Number(demo.version ?? 0), complete: demo.complete === true }
      : null;
  } catch {
    return null;
  }
}

async function writeMarker(ctx: AppContext, orgId: string, complete: boolean) {
  const marker: DemoMarker = { seed: DEMO_SEED_KEY, version: DEMO_SEED_VERSION, complete };
  await ctx.db
    .update(organization)
    .set({ metadata: JSON.stringify({ demo: marker }) })
    .where(eq(organization.id, orgId));
}

/** The caller's demo org (owner membership + seed marker), if any. */
async function findDemoOrg(
  ctx: AppContext,
  userId: string,
): Promise<{ orgId: string; complete: boolean } | null> {
  const rows = await ctx.db
    .select({ id: organization.id, metadata: organization.metadata })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.role, "owner")))
    .orderBy(asc(organization.createdAt))
    .all();
  for (const r of rows) {
    const marker = readMarker(r.metadata);
    if (marker) return { orgId: r.id, complete: marker.complete };
  }
  return null;
}

async function addDocument(ctx: AppContext, orgId: string, userId: string, doc: DemoDocument) {
  const common = {
    title: doc.title,
    kind: doc.kind,
    uploadedBy: userId,
    consent: { userId },
    onDuplicate: "reuse" as const,
    notes: "Fictional sample document created by the demo seed.",
  };
  if (!doc.past) {
    return (await createDocumentFromText(ctx, orgId, { ...common, text: doc.text })).documentId;
  }
  // Same pipeline as createDocumentFromText, plus the past-application outcome metadata
  // (set before processing so fact extraction and retrieval see it as an awarded application).
  const { document } = await createDocument(ctx, orgId, {
    ...common,
    mimeType: "text/markdown",
    bytes: new TextEncoder().encode(doc.text),
    filename: `${doc.key}.md`,
    pastOutcome: doc.past.outcome,
    pastFunder: doc.past.funder,
    pastAmountCents: doc.past.amountCents,
    pastYear: doc.past.year,
  });
  return document.id;
}

/** Confirm a few proposed facts from the seeded documents (a human reviewer would do this). */
async function confirmSomeFacts(
  ctx: AppContext,
  orgId: string,
  documentIds: string[],
  userId: string,
) {
  if (documentIds.length === 0) return 0;
  const proposed = await ctx.db
    .select({ id: facts.id, category: facts.category })
    .from(facts)
    .where(
      and(
        eq(facts.orgId, orgId),
        eq(facts.status, "proposed"),
        inArray(facts.sourceDocumentId, documentIds),
      ),
    )
    .orderBy(asc(facts.createdAt))
    .all();
  const ids = proposed
    .filter((f) => DEMO_CONFIRM_CATEGORIES.has(f.category))
    .slice(0, DEMO_CONFIRM_MAX)
    .map((f) => f.id);
  if (ids.length === 0) return 0;
  return (await bulkConfirmFacts(ctx, orgId, ids, { userId })).confirmed;
}

async function addProjects(ctx: AppContext, orgId: string, userId: string) {
  const existing = new Set((await listProjects(ctx, orgId)).map((p) => p.title));
  for (const p of DEMO_PROJECTS) {
    if (!existing.has(p.title)) await createProject(ctx, orgId, p, { userId });
  }
}

export interface SeedDemoResult {
  orgId: string;
  created: boolean;
}

/**
 * Create (or return) the caller's fictional demo org. Every step is idempotent, so a seed that was
 * interrupted part-way is completed by the next call instead of creating a second org.
 */
export async function seedDemoOrg(ctx: AppContext, meta: ActorMeta): Promise<SeedDemoResult> {
  const { userId } = meta;
  const found = await findDemoOrg(ctx, userId);
  if (found?.complete) return { orgId: found.orgId, created: false };

  let orgId = found?.orgId;
  if (!orgId) {
    ({ orgId } = await createOrg(
      ctx,
      {
        name: DEMO_ORG.name,
        legalName: DEMO_ORG.legalName,
        orgType: DEMO_ORG.orgType,
        city: DEMO_ORG.city,
        state: DEMO_ORG.state,
        websiteUrl: DEMO_ORG.websiteUrl,
        focusAreas: [...DEMO_ORG.focusAreas],
        serviceAreas: [...DEMO_ORG.serviceAreas],
        acceptTerms: true,
        policyVersion: POLICY_VERSION,
      },
      meta,
    ));
    await writeMarker(ctx, orgId, false);
  }

  await updateOrgProfile(
    ctx,
    orgId,
    {
      foundedYear: DEMO_ORG.foundedYear,
      contactName: DEMO_ORG.contactName,
      contactEmail: DEMO_ORG.contactEmail,
      onboardingCompleted: true,
    },
    meta,
  );

  // Comp plan first so matching/drafting quotas apply as for a pilot partner.
  try {
    await grantComp(ctx, orgId, "Demo seed: fictional sample organization", {
      type: "user",
      id: userId,
    });
  } catch (e) {
    ctx.logger.warn("demo.seed.comp_failed", { orgId, error: String(e).slice(0, 200) });
  }

  const documentIds: string[] = [];
  for (const doc of DEMO_DOCUMENTS) documentIds.push(await addDocument(ctx, orgId, userId, doc));
  const confirmed = await confirmSomeFacts(ctx, orgId, documentIds, userId);
  await addProjects(ctx, orgId, userId);

  const catalog = await seedSampleOpportunities(ctx);
  await requestScoreOrg(ctx, orgId);

  await writeMarker(ctx, orgId, true);
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: userId,
    action: "demo.seeded",
    targetType: "organization",
    targetId: orgId,
    metadata: { documents: documentIds.length, confirmedFacts: confirmed, catalog },
    requestId: meta.requestId,
  });
  ctx.logger.info("demo.seeded", { orgId, documents: documentIds.length, confirmed });
  return { orgId, created: !found };
}
