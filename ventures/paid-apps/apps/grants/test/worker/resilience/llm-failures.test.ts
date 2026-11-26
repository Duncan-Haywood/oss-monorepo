// Resilience: LLM refusal / malformed output / transient (5xx, timeout) / partial batch failure,
// injected through createAppContext(env, { llm }) for every module that calls the model.
// `it.fails` marks a documented bug (the assertion states the desired behaviour).
import { testFakes } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  facts,
  interviews,
  opportunities,
  opportunityMatches,
  orgProfiles,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import { parseRequirements } from "@worker/services/discovery/jobs";
import { draftApplication } from "@worker/services/drafting";
import { verifyDraft } from "@worker/services/grounding";
import { importOpportunityFromUrl } from "@worker/services/imports";
import { importOpportunityUrl } from "@worker/services/imports/jobs";
import { answerInterview, completeInterview, startInterview } from "@worker/services/interview";
import { extractDocumentFactsFor } from "@worker/services/knowledge/jobs";
import { defaultMatchingDeps, type MatchingDeps } from "@worker/services/matching/deps";
import { scoreOrgMatches } from "@worker/services/matching/score-org";
import { createApplication } from "@worker/services/pipeline";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTenant } from "../helpers";
import {
  callsTo,
  ctxWith,
  DAY,
  db,
  type FailureKind,
  failFirst,
  failingLlm,
  giveCompPlan,
  llmError,
  oneSectionRequirements,
  seedChunkedDocument,
  seedConfirmedFacts,
  seedOpportunity,
} from "./helpers";

const factsOf = (orgId: string) => db().select().from(facts).where(eq(facts.orgId, orgId)).all();

// ------------------------------------------------------------------------- fact extraction

describe("resilience: fact extraction (knowledge.extract_facts)", () => {
  const P = "knowledge.extract_facts";

  it("refusal: batch skipped, no facts fabricated, job does not throw (no retry loop)", async () => {
    const { orgId } = await setupTenant();
    const documentId = await seedChunkedDocument(orgId, 3);
    const stats = await extractDocumentFactsFor(
      ctxWith({ llm: failingLlm(P, "refusal") }),
      orgId,
      documentId,
    );
    expect(stats.refusedCalls).toBe(1);
    expect(stats.failedCalls).toBe(0);
    expect(await factsOf(orgId)).toHaveLength(0);
  });

  it("malformed output and transient errors: nothing persisted, job throws so the queue retries", async () => {
    for (const kind of ["malformed", "transient"] as FailureKind[]) {
      const { orgId } = await setupTenant();
      const documentId = await seedChunkedDocument(orgId, 3);
      await expect(
        extractDocumentFactsFor(ctxWith({ llm: failingLlm(P, kind) }), orgId, documentId),
      ).rejects.toThrow(/LLM call\(s\) failed/);
      expect(await factsOf(orgId)).toHaveLength(0);
    }
  });

  it("partial success across batches: kept batch survives, retry fills the rest without duplicates", async () => {
    // Baseline: a clean run on an identical document in another org.
    const base = await setupTenant();
    const baseDoc = await seedChunkedDocument(base.orgId, 12); // 2 batches (8 + 4 chunks)
    const clean = await extractDocumentFactsFor(ctxWith(), base.orgId, baseDoc);
    expect(clean.calls).toBe(2);
    const expected = (await factsOf(base.orgId)).length;
    expect(expected).toBeGreaterThan(0);

    const { orgId } = await setupTenant();
    const documentId = await seedChunkedDocument(orgId, 12);
    const llm = failFirst(P, "transient", 1);
    await expect(extractDocumentFactsFor(ctxWith({ llm }), orgId, documentId)).rejects.toThrow();
    const afterFirst = (await factsOf(orgId)).length;
    expect(afterFirst).toBeGreaterThan(0); // batch 2 persisted
    expect(afterFirst).toBeLessThan(expected);

    // Queue retry (same message): completes, no duplicates of batch 2.
    await extractDocumentFactsFor(ctxWith({ llm }), orgId, documentId);
    const rows = await factsOf(orgId);
    expect(rows).toHaveLength(expected);
    expect(new Set(rows.map((f) => f.statement)).size).toBe(rows.length);
    expect(rows.every((f) => f.status === "proposed")).toBe(true);
  });
});

// ------------------------------------------------------------------------ interview engine

describe("resilience: interview next question (interview.next_question)", () => {
  for (const kind of ["refusal", "malformed", "transient"] as FailureKind[]) {
    it(`${kind}: falls back to the deterministic agenda; interview still works`, async () => {
      const { orgId, userId } = await setupTenant();
      const ctx = ctxWith({ llm: failingLlm("interview.next_question", kind) });
      const iv = await startInterview(ctx, { orgId, userId, kind: "onboarding" });
      expect(iv.status).toBe("active");
      const first = iv.turns.at(-1);
      expect(first?.role).toBe("interviewer");
      expect(first?.content.trim().length).toBeGreaterThan(10);

      const res = await answerInterview(ctx, {
        orgId,
        userId,
        interviewId: iv.id,
        content: "We were founded in 1968 in Gallup and serve Navajo families.",
        inputMode: "text",
      });
      expect(res.turns[0].role).toBe("respondent");
      expect(res.turns[1]?.role).toBe("interviewer");
      expect(res.turns[1]?.content).not.toBe(first?.content);
    });
  }

  it("summary/project-field refusals on complete: interview completes, summary null (not invented)", async () => {
    const { orgId, userId } = await setupTenant();
    const llm = new FakeLlm(allFakeHandlers)
      .on("interview.summary", (r) => {
        throw llmError("refusal", r.purpose);
      })
      .on("interview.project_fields", (r) => {
        throw llmError("transient", r.purpose);
      });
    const ctx = ctxWith({ llm });
    const iv = await startInterview(ctx, { orgId, userId, kind: "onboarding" });
    await answerInterview(ctx, {
      orgId,
      userId,
      interviewId: iv.id,
      content: "Our trades program trained 42 adults in 2025.",
      inputMode: "text",
    });
    const done = await completeInterview(ctx, { orgId, userId, interviewId: iv.id });
    expect(done.status).toBe("completed");
    expect(done.summary).toBeNull();
  });
});

// ------------------------------------------------------------------------------- matching

async function seedMatchingOrg() {
  const t = await setupTenant();
  await db()
    .update(orgProfiles)
    .set({
      orgType: "nonprofit_501c3",
      focusAreas: ["workforce development", "construction trades training"],
      serviceAreas: ["Gallup, NM", "McKinley County, NM", "Navajo Nation"],
    })
    .where(eq(orgProfiles.orgId, t.orgId));
  await seedConfirmedFacts(t.orgId);
  return t;
}

const matchOpp = (title: string) =>
  seedOpportunity({
    title,
    summary: "Funds construction trades workforce training serving Native American adults.",
    applicantTypes: ["Nonprofits having a 501(c)(3) status with the IRS"],
    geographicScope: "National",
    awardFloorCents: 1_000_000,
    awardCeilingCents: 20_000_000,
  });

const noDraftDeps: MatchingDeps = { ...defaultMatchingDeps, createApplication: async () => null };

const matchesOf = (orgId: string) =>
  db().select().from(opportunityMatches).where(eq(opportunityMatches.orgId, orgId)).all();

describe("resilience: matching score (matching.score)", () => {
  it("partial failure (one refusal, one 5xx): good scores stored, failed ones get no fabricated match", async () => {
    const t = await seedMatchingOrg();
    const ok = await matchOpp("Trades Training Grant OK");
    const refused = await matchOpp("Trades Training Grant REFUSE");
    const broken = await matchOpp("Trades Training Grant BROKEN");
    const real = allFakeHandlers["matching.score"];
    const llm = new FakeLlm(allFakeHandlers).on("matching.score", (req) => {
      if (req.prompt.includes("REFUSE")) throw llmError("refusal", req.purpose);
      if (req.prompt.includes("BROKEN")) throw llmError("transient", req.purpose);
      return real?.(req);
    });
    const res = await scoreOrgMatches(
      ctxWith({ llm }),
      { orgId: t.orgId, opportunityIds: [ok, refused, broken] },
      noDraftDeps,
    );
    expect(res.scored).toBe(1);
    expect(res.failed).toBe(2);
    const rows = await matchesOf(t.orgId);
    expect(rows.map((r) => r.opportunityId)).toEqual([ok]);
  });

  it("all calls transient: job throws so the queue retries; nothing stored", async () => {
    const t = await seedMatchingOrg();
    const a = await matchOpp("Trades Training Grant A");
    await expect(
      scoreOrgMatches(
        ctxWith({ llm: failingLlm("matching.score", "transient") }),
        { orgId: t.orgId, opportunityIds: [a] },
        noDraftDeps,
      ),
    ).rejects.toThrow(/scoring calls failed/);
    expect(await matchesOf(t.orgId)).toHaveLength(0);
  });

  // FIXED (regression test; was): src/worker/services/matching/score-org.ts:320 — the "all calls failed" retry trigger counts
  // refusals (and malformed output) as failures, so a single refused opportunity makes the whole
  // matching.score_org job throw and be retried until the DLQ, re-refusing every time (and burning
  // tokens). Only transient errors should cause a retry.
  it("all calls refused: job completes (no retry loop), no match stored", async () => {
    const t = await seedMatchingOrg();
    const a = await matchOpp("Trades Training Grant B");
    const res = await scoreOrgMatches(
      ctxWith({ llm: failingLlm("matching.score", "refusal") }),
      { orgId: t.orgId, opportunityIds: [a] },
      noDraftDeps,
    );
    expect(res.failed).toBe(1);
    expect(await matchesOf(t.orgId)).toHaveLength(0);
  });
});

// ----------------------------------------------------------------- requirements parsing

describe("resilience: requirements parsing (discovery.parse_requirements)", () => {
  const P = "discovery.parse_requirements";
  const requirementsOf = async (id: string) =>
    (
      await db()
        .select({ r: opportunities.requirements })
        .from(opportunities)
        .where(eq(opportunities.id, id))
        .get()
    )?.r ?? null;

  it("transient error: job throws (retry) and no requirements are persisted", async () => {
    const id = await seedOpportunity({ requirements: null });
    await expect(
      parseRequirements(ctxWith({ llm: failingLlm(P, "transient") }), {
        type: "opportunity.parse_requirements",
        opportunityId: id,
        orgId: null,
      }),
    ).rejects.toThrow();
    expect(await requirementsOf(id)).toBeNull();
  });

  it("malformed output: nothing fabricated is persisted", async () => {
    const id = await seedOpportunity({ requirements: null });
    await parseRequirements(ctxWith({ llm: failingLlm(P, "malformed") }), {
      type: "opportunity.parse_requirements",
      opportunityId: id,
      orgId: null,
    }).catch(() => undefined);
    expect(await requirementsOf(id)).toBeNull();
  });

  // FIXED (regression test; was): src/worker/services/discovery/requirements.ts:226 (and jobs.ts:11) — a refusal is not
  // handled: LlmRefusalError escapes the opportunity.parse_requirements job, so the queue retries a
  // deterministic refusal until the DLQ. Expected: no retry; persist nothing (or the standard
  // sections with complete=false) and let drafting use the listing fallback.
  it("refusal: job does not throw (refusals are not retried)", async () => {
    const id = await seedOpportunity({ requirements: null });
    await parseRequirements(ctxWith({ llm: failingLlm(P, "refusal") }), {
      type: "opportunity.parse_requirements",
      opportunityId: id,
      orgId: null,
    });
    const r = (await requirementsOf(id)) as { complete?: boolean } | null;
    expect(r === null || r.complete === false).toBe(true);
  });
});

// --------------------------------------------------------------------- URL import extraction

const GRANT_HTML = `<!doctype html><html><head><title>Rural Trades Grant 2027</title></head><body><main>
<h1>Rural Trades Grant 2027</h1><p>Funder: Mesa Community Foundation</p>
<p>The Mesa Community Foundation invites proposals for construction trades training programs in rural New Mexico.</p>
<p>Eligibility: 501(c)(3) nonprofits serving McKinley County are eligible to apply.</p>
<p>Awards range from $25,000 to $150,000. Applications are due March 15, 2027.</p>
<ol><li>Describe the need your program addresses.</li></ol></main></body></html>`;

describe("resilience: URL import extraction (imports.extract_opportunity)", () => {
  const P = "imports.extract_opportunity";
  const setPage = (url: string) =>
    testFakes.web.set(url, { url, status: 200, contentType: "text/html", body: GRANT_HTML });

  it("refusal / malformed / transient on first import: no opportunity row is created", async () => {
    for (const kind of ["refusal", "malformed", "transient"] as FailureKind[]) {
      const { orgId, userId } = await setupTenant();
      const url = `https://grants.mesa.example.org/${kind}-${newId("job").slice(4)}`;
      setPage(url);
      await expect(
        importOpportunityFromUrl(ctxWith({ llm: failingLlm(P, kind) }), { orgId, url, userId }),
      ).rejects.toThrow();
      const rows = await db()
        .select()
        .from(opportunities)
        .where(eq(opportunities.privateToOrgId, orgId))
        .all();
      expect(rows).toHaveLength(0);
    }
  });

  it("refusal on first import: a 422 extraction_refused with a friendly message (not a 500)", async () => {
    const { orgId, userId } = await setupTenant();
    const url = `https://grants.mesa.example.org/refused-${newId("job").slice(4)}`;
    setPage(url);
    await expect(
      importOpportunityFromUrl(ctxWith({ llm: failingLlm(P, "refusal") }), { orgId, url, userId }),
    ).rejects.toMatchObject({
      status: 422,
      code: "extraction_refused",
      message: expect.not.stringMatching(/declined|cyber/),
    });
  });

  async function importedOpp() {
    const { orgId, userId } = await setupTenant();
    const url = `https://grants.mesa.example.org/re-${newId("job").slice(4)}`;
    setPage(url);
    const opp = await importOpportunityFromUrl(ctxWith(), { orgId, url, userId });
    return { orgId, url, opp };
  }

  it("transient on a queued re-import: job throws (retry), stored opportunity is untouched", async () => {
    const { orgId, url, opp } = await importedOpp();
    await expect(
      importOpportunityUrl(ctxWith({ llm: failingLlm(P, "transient") }), {
        type: "opportunity.import_url",
        orgId,
        opportunityId: opp.id,
        url,
      }),
    ).rejects.toThrow();
    const row = await db().select().from(opportunities).where(eq(opportunities.id, opp.id)).get();
    expect(row?.title).toBe(opp.title);
    expect(row?.requirements).toEqual(opp.requirements);
  });

  // FIXED (regression test; was): src/worker/services/imports/jobs.ts:43 — only AppError < 500 is treated as permanent; an
  // LlmRefusalError (and LlmOutputError) from extract.ts:84-87 is rethrown, so the queue retries a
  // refusal until the DLQ. The same error surfaces as a 500 from POST /imports/opportunity-url
  // instead of a 422 "could not read this opportunity".
  it("refusal on a queued re-import: job completes without retrying", async () => {
    const { orgId, url, opp } = await importedOpp();
    await importOpportunityUrl(ctxWith({ llm: failingLlm(P, "refusal") }), {
      type: "opportunity.import_url",
      orgId,
      opportunityId: opp.id,
      url,
    });
  });
});

// --------------------------------------------------------------------------------- drafting

async function draftingInput(sections: number) {
  const { orgId } = await setupTenant();
  await seedConfirmedFacts(orgId);
  const oppId = await seedOpportunity({ requirements: oneSectionRequirements(sections) });
  const opp = await db().select().from(opportunities).where(eq(opportunities.id, oppId)).get();
  if (!opp) throw new Error("seed failed");
  return {
    orgId,
    applicationId: newId("app"),
    opportunity: opp,
    requirements: oneSectionRequirements(sections),
    facts: await factsOf(orgId),
    requestedAmountCents: 2_500_000,
  };
}

describe("resilience: drafting sections (drafting.section)", () => {
  it("refusal: every section becomes a gap with no paragraphs (nothing invented)", async () => {
    const input = await draftingInput(2);
    const llm = failingLlm("drafting.section", "refusal");
    const res = await draftApplication(ctxWith({ llm }), input);
    expect(res.content.sections).toHaveLength(2);
    for (const s of res.content.sections) {
      expect(s.paragraphs).toHaveLength(0);
      expect(s.gaps.length).toBeGreaterThan(0);
    }
    expect(callsTo(llm, "drafting.section")).toHaveLength(2); // refusals are not retried
    expect(callsTo(llm, "drafting.summary")).toHaveLength(0); // no claims => deterministic summary
  });

  it("malformed output: retried once per section, then a gap", async () => {
    const input = await draftingInput(1);
    const llm = failingLlm("drafting.section", "malformed");
    const res = await draftApplication(ctxWith({ llm }), input);
    expect(callsTo(llm, "drafting.section")).toHaveLength(2);
    expect(res.content.sections[0]?.paragraphs).toHaveLength(0);
    expect(res.content.sections[0]?.gaps.length).toBeGreaterThan(0);
  });

  it("transient error: draft throws so the workflow step retries", async () => {
    const input = await draftingInput(1);
    await expect(
      draftApplication(ctxWith({ llm: failingLlm("drafting.section", "transient") }), input),
    ).rejects.toThrow(/overloaded/);
  });

  it("partial: one section refused, the other drafted; summary refusal falls back deterministically", async () => {
    const input = await draftingInput(2);
    const real = allFakeHandlers["drafting.section"];
    const llm = new FakeLlm(allFakeHandlers)
      .on("drafting.section", (req) => {
        if (req.prompt.includes("Section 2")) throw llmError("refusal", req.purpose);
        return real?.(req);
      })
      .on("drafting.summary", (req) => {
        throw llmError("refusal", req.purpose);
      });
    const res = await draftApplication(ctxWith({ llm }), input);
    const [s1, s2] = res.content.sections;
    expect(s2?.paragraphs).toHaveLength(0);
    expect(s2?.gaps.length).toBeGreaterThan(0);
    expect(s1?.paragraphs.length).toBeGreaterThan(0);
    const allowed = new Set(input.facts.map((f) => f.id));
    for (const p of s1?.paragraphs ?? [])
      for (const c of p.claims) for (const id of c.factIds) expect(allowed.has(id)).toBe(true);
    expect(res.executiveSummary.length).toBeGreaterThan(0);
  });

  it("pipeline: refused sections end in needs_info with missing_info blockers, never in_review", async () => {
    const { orgId, userId } = await setupTenant();
    await giveCompPlan(orgId);
    await seedConfirmedFacts(orgId);
    const oppId = await seedOpportunity({ requirements: oneSectionRequirements(1) });
    const ctx = ctxWith({ llm: failingLlm("drafting.section", "refusal") });
    const app = await createApplication(ctx, { orgId, opportunityId: oppId, startedBy: userId });
    expect(app.status).toBe("needs_info");
    const flags = await db()
      .select()
      .from(applicationFlags)
      .where(eq(applicationFlags.applicationId, app.id))
      .all();
    expect(flags.some((f) => f.kind === "missing_info" && f.severity === "blocker")).toBe(true);
    const ivs = await db()
      .select()
      .from(interviews)
      .where(and(eq(interviews.orgId, orgId), eq(interviews.focusApplicationId, app.id)))
      .all();
    expect(ivs).toHaveLength(1); // gap-fill interview created
  });

  it("pipeline: transient drafting outage marks the application failed with a visible error (inline mode)", async () => {
    const { orgId, userId } = await setupTenant();
    await giveCompPlan(orgId);
    await seedConfirmedFacts(orgId);
    const oppId = await seedOpportunity({ requirements: oneSectionRequirements(1) });
    const ctx = ctxWith({ llm: failingLlm("drafting.section", "transient") });
    const app = await createApplication(ctx, { orgId, opportunityId: oppId, startedBy: userId });
    expect(app.status).toBe("failed");
    expect(app.lastError).toMatch(/Pipeline error/);
    const versions = await db()
      .select()
      .from(applicationVersions)
      .where(eq(applicationVersions.applicationId, app.id))
      .all();
    expect(versions).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------------- grounding

function claimContent(factId: string, sections = 1) {
  return {
    sections: Array.from({ length: sections }, (_, i) => ({
      key: `section_${i + 1}`,
      title: `Section ${i + 1}`,
      gaps: [],
      paragraphs: [
        {
          id: `p${i}`,
          claims: [
            {
              id: `s${i}.c1`,
              kind: "factual" as const,
              text: "The trades program trained 42 adults in 2025.",
              factIds: [factId],
            },
          ],
        },
      ],
    })),
  };
}

const groundingFact = (id: string) => ({
  id,
  statement: "The trades program trained 42 adults in 2025.",
  sourceQuote: "The trades program trained 42 adults in 2025.",
  status: "confirmed" as const,
  sensitivity: "internal" as const,
  category: "program",
});

describe("resilience: grounding judge (grounding.verify_claims) fails closed", () => {
  for (const kind of ["refusal", "malformed", "transient"] as FailureKind[]) {
    it(`${kind}: passed=false, a blocker per unverified section, no claim marked supported`, async () => {
      const llm = failingLlm("grounding.verify_claims", kind);
      const { report, flags } = await verifyDraft(ctxWith({ llm }), {
        orgId: "org_x",
        applicationId: "app_x",
        content: claimContent("fct_1", 2),
        facts: [groundingFact("fct_1")],
        requirements: oneSectionRequirements(0),
        autopilot: false,
      });
      expect(report.passed).toBe(false);
      expect(report.supported).toBe(0);
      expect(flags.filter((f) => f.severity === "blocker" && f.kind === "other")).toHaveLength(2);
    });
  }

  it("partial: one section's judge call fails — that section blocks, the other is judged", async () => {
    const real = allFakeHandlers["grounding.verify_claims"];
    const llm = new FakeLlm(allFakeHandlers).on("grounding.verify_claims", (req) => {
      if (req.prompt.includes('section "Section 2"')) throw llmError("transient", req.purpose);
      return real?.(req);
    });
    const { report, flags } = await verifyDraft(ctxWith({ llm }), {
      orgId: "org_x",
      applicationId: "app_x",
      content: claimContent("fct_1", 2),
      facts: [groundingFact("fct_1")],
      requirements: oneSectionRequirements(0),
      autopilot: true,
    });
    expect(report.passed).toBe(false);
    const blockers = flags.filter((f) => f.severity === "blocker" && f.kind === "other");
    expect(blockers.map((f) => f.sectionKey)).toEqual(["section_2"]);
    expect(report.verdicts.find((v) => v.claimId === "s0.c1")?.verdict).toBe("supported");
    expect(report.verdicts.find((v) => v.claimId === "s1.c1")?.verdict).not.toBe("supported");
  });

  it("judge omits a claim: that claim is unsupported and blocks", async () => {
    const llm = new FakeLlm(allFakeHandlers).on("grounding.verify_claims", () => ({
      verdicts: [],
    }));
    const { report, flags } = await verifyDraft(ctxWith({ llm }), {
      orgId: "org_x",
      applicationId: "app_x",
      content: claimContent("fct_1", 1),
      facts: [groundingFact("fct_1")],
      requirements: oneSectionRequirements(0),
      autopilot: false,
    });
    expect(report.passed).toBe(false);
    expect(report.unsupported).toBe(1);
    expect(flags.some((f) => f.severity === "blocker" && f.claimId === "s0.c1")).toBe(true);
  });

  it("pipeline: judge outage during stepVerify routes to human review, never auto-approves", async () => {
    const { orgId, userId } = await setupTenant();
    await giveCompPlan(orgId);
    await seedConfirmedFacts(orgId);
    const oppId = await seedOpportunity({
      requirements: oneSectionRequirements(1),
      closeDate: new Date(Date.now() + 40 * DAY),
    });
    const ctx = ctxWith({ llm: failingLlm("grounding.verify_claims", "transient") });
    const app = await createApplication(ctx, { orgId, opportunityId: oppId, startedBy: userId });
    expect(["in_review", "needs_info"]).toContain(app.status);
    const version = await db()
      .select()
      .from(applicationVersions)
      .where(eq(applicationVersions.id, app.currentVersionId ?? ""))
      .get();
    expect(version?.groundingReport?.passed).toBe(false);
    const rows = await db().select().from(applications).where(eq(applications.id, app.id)).get();
    expect(rows?.status).not.toBe("approved");
  });
});
