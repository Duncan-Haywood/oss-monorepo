// Integration: draftApplication in workerd with local D1 and the FakeLlm (FAKE_EXTERNALS=true).
// Real cross-module deps (org prompt profile, fact formatting, style retrieval, feedback/projects).
import { env } from "cloudflare:workers";
import { ApplicationContent, OpportunityRequirements } from "@shared/content";
import { createAppContext } from "@worker/context";
import {
  applications,
  documentChunks,
  documents,
  facts,
  feedback,
  opportunities,
  projects,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import type { FakeLlm } from "@worker/ports/fake-llm";
import { describe, expect, it } from "vitest";
import { setupTenant, testDb } from "../../../../test/worker/helpers";
import { draftApplication, renderPlainText } from "./index";
import type { DraftingFact } from "./types";

async function seedOrg(orgId: string, label: string) {
  const db = testDb();
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Example Workforce Fund",
    title: "Rural Trades Training Grant",
    summary: "Supports job training in the building trades for rural communities.",
  });
  const appId = newId("app");
  await db
    .insert(applications)
    .values({ id: appId, orgId, opportunityId: oppId, title: "Trades application" });
  const projectId = newId("prj");
  await db.insert(projects).values({
    id: projectId,
    orgId,
    title: `${label} Trades Academy`,
    summary: `${label} carpentry training`,
  });
  await db.insert(feedback).values([
    {
      id: newId("fbk"),
      orgId,
      applicationId: appId,
      rating: 5,
      comment: `${label}: lead with employment outcomes`,
    },
    {
      id: newId("fbk"),
      orgId,
      applicationId: appId,
      rating: 1,
      comment: `${label}: too much jargon`,
    },
    { id: newId("fbk"), orgId, applicationId: appId, rating: 3, comment: `${label}: neutral note` },
  ]);
  const docId = newId("doc");
  await db.insert(documents).values({
    id: docId,
    orgId,
    title: `${label} 2024 proposal`,
    kind: "past_application",
    mimeType: "text/plain",
    sizeBytes: 10,
    sha256: docId,
    r2Key: `orgs/${orgId}/documents/${docId}/original`,
    status: "ready",
    pastOutcome: "awarded",
  });
  await db.insert(documentChunks).values({
    id: newId("chk"),
    orgId,
    documentId: docId,
    ordinal: 0,
    text: `${label} style sample: our apprentices build homes for families across the region. `.repeat(
      6,
    ),
    tokenEstimate: 80,
    charStart: 0,
    charEnd: 400,
  });
  const rows = [
    {
      category: "program",
      statement: "Our trades program trains adults in carpentry, plumbing and electrical work.",
    },
    {
      category: "outcome",
      statement: "In 2025, 38 trainees completed the trades training program.",
    },
    {
      category: "outcome",
      statement: "Of the 2025 trades graduates, 30 were employed within six months.",
    },
    {
      category: "population_served",
      statement: "Many families in our service area lack access to job training.",
    },
  ] as const;
  const factRows = rows.map((r) => ({
    id: newId("fct"),
    orgId,
    category: r.category,
    statement: r.statement,
    status: "confirmed" as const,
    sourceType: "user_entered" as const,
    projectId,
  }));
  await db.insert(facts).values(factRows);
  return { appId, projectId, factRows };
}

const requirements = OpportunityRequirements.parse({
  complete: true,
  sections: [
    {
      key: "need",
      title: "Statement of Need",
      prompt: "Describe the need for job training in the community you serve.",
      wordLimit: 250,
    },
    {
      key: "program",
      title: "Program Design",
      prompt: "Describe your trades training program and its outcomes.",
      wordLimit: 400,
    },
    {
      key: "evaluator",
      title: "External Evaluator",
      prompt: "Name the independent evaluator and their qualifications.",
    },
    {
      key: "budget",
      title: "Budget Narrative",
      kind: "budget",
      prompt: "Explain each budget line.",
    },
  ],
});

describe("draftApplication (worker, FakeLlm)", () => {
  it("drafts grounded content from the org's facts, with gaps for unsupported sections, tenant-scoped", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const seededA = await seedOrg(a.orgId, "ALPHA");
    await seedOrg(b.orgId, "BRAVO");

    const ctx = createAppContext(env);
    const llm = ctx.llm as FakeLlm;
    const opp = await testDb().select().from(opportunities).limit(1).get();
    if (!opp) throw new Error("seed failed");

    const res = await draftApplication(ctx, {
      orgId: a.orgId,
      applicationId: seededA.appId,
      opportunity: opp,
      requirements,
      facts: seededA.factRows as DraftingFact[],
      projectId: seededA.projectId,
      requestedAmountCents: 5_000_000,
    });

    expect(ApplicationContent.safeParse(res.content).success).toBe(true);
    const provided = new Set(seededA.factRows.map((f) => f.id));
    const claims = res.content.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.claims));
    const factual = claims.filter((c) => c.kind === "factual");
    expect(factual.length).toBeGreaterThanOrEqual(3);
    for (const c of factual) {
      expect(c.factIds.length).toBeGreaterThan(0);
      for (const id of c.factIds) expect(provided.has(id)).toBe(true);
    }
    for (const c of claims.filter((c) => c.kind === "framing")) expect(c.text).not.toMatch(/\d/);

    const byKey = Object.fromEntries(res.content.sections.map((s) => [s.key, s]));
    expect(byKey.evaluator?.gaps.length).toBeGreaterThan(0);
    expect(byKey.budget?.paragraphs).toEqual([]);
    expect(byKey.budget?.gaps.length).toBe(1);
    expect(byKey.program?.paragraphs.length).toBeGreaterThan(0);

    expect(renderPlainText(res.content)).toContain("Program Design");
    expect(res.executiveSummary.length).toBeGreaterThan(20);
    expect(res.keyPoints.length).toBeGreaterThanOrEqual(3);

    // prompt layout + tenant isolation of the context
    const call = llm.calls.find(
      (c) => c.purpose === "drafting.section" && c.applicationId === seededA.appId,
    );
    expect(call?.orgId).toBe(a.orgId);
    expect(call?.context).toContain("<style_reference>");
    expect(call?.context).toContain("ALPHA style sample");
    expect(call?.context).toContain("ALPHA: lead with employment outcomes");
    expect(call?.context).toContain("ALPHA: too much jargon");
    expect(call?.context).not.toContain("ALPHA: neutral note");
    expect(call?.context).not.toContain("BRAVO");
    expect(call?.prompt).toContain("ALPHA Trades Academy");
    expect(call?.system).not.toContain(a.orgId);
  });

  it("does not load another org's project as focus", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const seededA = await seedOrg(a.orgId, "CHARLIE");
    const seededB = await seedOrg(b.orgId, "DELTA");
    const ctx = createAppContext(env);
    const llm = ctx.llm as FakeLlm;
    const opp = await testDb().select().from(opportunities).limit(1).get();
    if (!opp) throw new Error("seed failed");
    await draftApplication(ctx, {
      orgId: a.orgId,
      applicationId: seededA.appId,
      opportunity: opp,
      requirements: OpportunityRequirements.parse({ sections: [requirements.sections[1]] }),
      facts: seededA.factRows as DraftingFact[],
      projectId: seededB.projectId,
    });
    const call = llm.calls.find(
      (c) => c.purpose === "drafting.section" && c.applicationId === seededA.appId,
    );
    expect(call?.prompt).not.toContain("DELTA");
  });
});
