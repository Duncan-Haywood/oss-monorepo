// Resilience: at-least-once delivery. Every queue job is run twice (sequentially = redelivery after
// a lost ack, concurrently = two consumers got the same message), plus the pipeline steps the
// Workflow may replay, plus a concurrent double-click on "approve".
import { testFakes } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  documentChunks,
  documents,
  facts,
  followups,
  interviews,
  opportunities,
  opportunityMatches,
  orgProfiles,
  orgSettings,
  submissions,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import { FakeEmbedder, InMemoryVectorStore } from "@worker/ports/fakes";
import { runJob } from "@worker/queues/consumer";
import { importOpportunityFromUrl } from "@worker/services/imports";
import { createDocumentFromText } from "@worker/services/ingestion";
import { answerInterview, completeInterview, startInterview } from "@worker/services/interview";
import { defaultMatchingDeps, type MatchingDeps } from "@worker/services/matching/deps";
import { scoreOrgMatches } from "@worker/services/matching/score-org";
import { stepDraft, stepSubmit, stepVerify, submitReviewDecision } from "@worker/services/pipeline";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTenant } from "../helpers";
import {
  callsTo,
  ctxWith,
  DAY,
  db,
  giveCompPlan,
  oneSectionRequirements,
  RecordingEmail,
  seedApplicationWithVersion,
  seedChunkedDocument,
  seedConfirmedFacts,
  seedOpportunity,
  setContacts,
  uniqEmail,
} from "./helpers";

const factsOf = (orgId: string) => db().select().from(facts).where(eq(facts.orgId, orgId)).all();
const twice = async (fn: () => Promise<unknown>) => {
  await fn();
  await fn();
};

describe("idempotency: duplicate queue deliveries", () => {
  it("facts.extract_document redelivered (sequential): no duplicate facts", async () => {
    const { orgId } = await setupTenant();
    const documentId = await seedChunkedDocument(orgId, 4);
    const job = { type: "facts.extract_document", orgId, documentId } as const;
    await runJob(ctxWith(), job);
    const n = (await factsOf(orgId)).length;
    expect(n).toBeGreaterThan(0);
    await runJob(ctxWith(), job);
    expect(await factsOf(orgId)).toHaveLength(n);
  });

  // FIXED (regression test; was): src/worker/services/knowledge/jobs.ts:170 + :216 — dedupe is check-then-insert against a
  // StatementIndex snapshot loaded at job start, with no DB-level uniqueness on facts. Two
  // concurrent deliveries (queue redelivery while the first is still running, or "reprocess"
  // during an in-flight extraction) both see an empty index and insert every fact twice. Same in
  // extractInterviewFactsFor (:255/:320). Fix: unique (org_id, source_chunk_id|source_turn_id,
  // normalized statement hash) + onConflictDoNothing, or a per-source claim.
  it("facts.extract_document delivered concurrently: no duplicate facts", async () => {
    const base = await setupTenant();
    const doc1 = await seedChunkedDocument(base.orgId, 4);
    await runJob(ctxWith(), {
      type: "facts.extract_document",
      orgId: base.orgId,
      documentId: doc1,
    });
    const n = (await factsOf(base.orgId)).length;

    const { orgId } = await setupTenant();
    const documentId = await seedChunkedDocument(orgId, 4);
    const job = { type: "facts.extract_document", orgId, documentId } as const;
    await Promise.all([runJob(ctxWith(), job), runJob(ctxWith(), job)]);
    expect(await factsOf(orgId)).toHaveLength(n);
  });

  it("facts.extract_interview delivered twice: no duplicate facts", async () => {
    const { orgId, userId } = await setupTenant();
    const ctx = ctxWith();
    const iv = await startInterview(ctx, { orgId, userId, kind: "onboarding" });
    await answerInterview(ctx, {
      orgId,
      userId,
      interviewId: iv.id,
      content:
        "We were founded in 1968 in Gallup. Our trades program trained 142 students in 2024.",
      inputMode: "text",
    });
    await completeInterview(ctx, { orgId, userId, interviewId: iv.id }); // runs extraction inline
    const n = (await factsOf(orgId)).length;
    expect(n).toBeGreaterThan(0);
    const job = { type: "facts.extract_interview", orgId, interviewId: iv.id } as const;
    await twice(() => runJob(ctxWith(), job));
    expect(await factsOf(orgId)).toHaveLength(n);
    const row = await db().select().from(interviews).where(eq(interviews.id, iv.id)).get();
    expect(row?.factCount).toBe(n);
  });

  it("document.process delivered twice: chunks/vectors replaced, not duplicated; facts stable", async () => {
    const { orgId, userId } = await setupTenant();
    const store = new InMemoryVectorStore();
    const ctx = ctxWith({ vectors: store });
    const { documentId } = await createDocumentFromText(ctx, orgId, {
      title: "Overview",
      kind: "annual_report",
      text: "## About\n\nOur trades program trained 142 students in 2024 in Gallup, New Mexico.\n\n## Budget\n\nThe annual operating budget was $4,200,000 in fiscal year 2025.",
      uploadedBy: userId,
    });
    const chunks = async () =>
      db().select().from(documentChunks).where(eq(documentChunks.documentId, documentId)).all();
    const n = (await chunks()).length;
    const f = (await factsOf(orgId)).length;
    const job = { type: "document.process", orgId, documentId } as const;
    await twice(() => runJob(ctx, job));
    expect(await chunks()).toHaveLength(n);
    expect(await factsOf(orgId)).toHaveLength(f);
    const [q] = await new FakeEmbedder().embed(["trades"]);
    expect(await store.query(orgId, q ?? [], { topK: 1000 })).toHaveLength(n);
    const doc = await db().select().from(documents).where(eq(documents.id, documentId)).get();
    expect(doc?.status).toBe("ready");
  });

  it("opportunity.import_url delivered twice: one private opportunity, updated in place", async () => {
    const { orgId, userId } = await setupTenant();
    const url = `https://grants.mesa.example.org/dup-${newId("job").slice(4)}`;
    testFakes.web.set(url, {
      url,
      status: 200,
      contentType: "text/html",
      body: "<html><head><title>Rural Trades Grant</title></head><body><h1>Rural Trades Grant</h1><p>Funder: Mesa Community Foundation.</p><p>The foundation invites proposals for construction trades training programs in rural New Mexico.</p><p>Awards up to $50,000. Applications are due March 15, 2027.</p></body></html>",
    });
    const opp = await importOpportunityFromUrl(ctxWith(), { orgId, url, userId });
    const job = { type: "opportunity.import_url", orgId, opportunityId: opp.id, url } as const;
    await twice(() => runJob(ctxWith(), job));
    await Promise.all([runJob(ctxWith(), job), runJob(ctxWith(), job)]);
    const rows = await db()
      .select()
      .from(opportunities)
      .where(eq(opportunities.privateToOrgId, orgId))
      .all();
    expect(rows.map((r) => r.id)).toEqual([opp.id]);
  });

  it("opportunity.parse_requirements delivered twice: parsed once (cached), LLM not re-called", async () => {
    const id = await seedOpportunity({ requirements: null });
    const llm = new FakeLlm(allFakeHandlers);
    const job = { type: "opportunity.parse_requirements", opportunityId: id, orgId: null } as const;
    await twice(() => runJob(ctxWith({ llm }), job));
    expect(callsTo(llm, "discovery.parse_requirements")).toHaveLength(1);
  });

  it("matching.score_org delivered twice (and concurrently with autopilot on): one match per opportunity, one auto-draft", async () => {
    const t = await setupTenant();
    await db()
      .update(orgProfiles)
      .set({
        orgType: "nonprofit_501c3",
        focusAreas: ["construction trades training"],
        serviceAreas: ["Gallup, NM"],
      })
      .where(eq(orgProfiles.orgId, t.orgId));
    await db().update(orgSettings).set({ autoDraftTopN: 1 }).where(eq(orgSettings.orgId, t.orgId));
    await seedConfirmedFacts(t.orgId);
    const oppId = await seedOpportunity({
      title: "Construction Trades Workforce Training for Native American adults",
      summary: "Funds construction trades workforce training in Gallup, New Mexico.",
      applicantTypes: ["Nonprofits having a 501(c)(3) status with the IRS"],
      geographicScope: "National",
      awardCeilingCents: 20_000_000,
    });
    const created: string[] = [];
    const deps: MatchingDeps = {
      ...defaultMatchingDeps,
      // Always score high so the autopilot picks it.
      async createApplication(_ctx, input) {
        const id = newId("app");
        created.push(id);
        await db().insert(applications).values({
          id,
          orgId: input.orgId,
          opportunityId: input.opportunityId,
          title: "auto",
          createdBy: null,
        });
        return id;
      },
    };
    const llm = new FakeLlm(allFakeHandlers).on("matching.score", () => ({
      eligibility: "likely_eligible",
      eligibilityNotes: "",
      fitScore: 90,
      likelihood: 0.5,
      suggestedAskCents: 5_000_000,
      effortHours: 10,
      reasons: [],
      projectId: null,
    }));
    const run = () =>
      scoreOrgMatches(ctxWith({ llm }), { orgId: t.orgId, opportunityIds: [oppId] }, deps);
    await Promise.all([run(), run()]);
    await run();
    const matches = await db()
      .select()
      .from(opportunityMatches)
      .where(eq(opportunityMatches.orgId, t.orgId))
      .all();
    expect(matches).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  it("followups.run_due delivered twice / concurrently: one reminder email per follow-up", async () => {
    const { orgId } = await setupTenant();
    const team = uniqEmail("team");
    await setContacts(orgId, null, [team]);
    const { appId } = await seedApplicationWithVersion(orgId);
    await db()
      .insert(followups)
      .values({
        id: newId("fup"),
        orgId,
        applicationId: appId,
        kind: "status_check",
        title: "Check status",
        dueAt: new Date(Date.now() - DAY),
        dedupeKey: `t:${newId("job")}`,
      });
    const email = new RecordingEmail();
    const job = { type: "followups.run_due" } as const;
    await Promise.all([runJob(ctxWith({ email }), job), runJob(ctxWith({ email }), job)]);
    await runJob(ctxWith({ email }), job);
    expect(email.to(team)).toHaveLength(1);
  });

  it("followups.run_due: a failed send is released and retried on the next run (exactly one email)", async () => {
    const { orgId } = await setupTenant();
    const team = uniqEmail("team");
    await setContacts(orgId, null, [team]);
    const { appId } = await seedApplicationWithVersion(orgId);
    await db()
      .insert(followups)
      .values({
        id: newId("fup"),
        orgId,
        applicationId: appId,
        kind: "status_check",
        title: "Check status",
        dueAt: new Date(Date.now() - DAY),
        dedupeKey: `t:${newId("job")}`,
      });
    const email = new RecordingEmail();
    email.failFor.add(team);
    const job = { type: "followups.run_due" } as const;
    await runJob(ctxWith({ email }), job);
    expect(email.to(team)).toHaveLength(0);
    email.failFor.clear();
    await twice(() => runJob(ctxWith({ email }), job));
    expect(email.to(team)).toHaveLength(1);
  });
});

// --------------------------------------------------------------- workflow step replays

async function draftableApp() {
  const { orgId, userId } = await setupTenant();
  await giveCompPlan(orgId);
  await seedConfirmedFacts(orgId);
  const oppId = await seedOpportunity({ requirements: oneSectionRequirements(2) });
  const appId = newId("app");
  await db().insert(applications).values({
    id: appId,
    orgId,
    opportunityId: oppId,
    title: "Replay test",
    status: "draft_queued",
    requestedAmountCents: 2_500_000,
    createdBy: userId,
  });
  return { orgId, userId, ids: { orgId, applicationId: appId } };
}

const versionsOf = (appId: string) =>
  db().select().from(applicationVersions).where(eq(applicationVersions.applicationId, appId)).all();
const flagsOf = (appId: string) =>
  db().select().from(applicationFlags).where(eq(applicationFlags.applicationId, appId)).all();

describe("idempotency: pipeline step replays (Workflow retries)", () => {
  it("stepDraft replayed (sequential and concurrent): exactly one version per round", async () => {
    const { ids } = await draftableApp();
    await Promise.all([
      stepDraft(ctxWith(), ids, { round: 0 }),
      stepDraft(ctxWith(), ids, { round: 0 }),
    ]);
    await stepDraft(ctxWith(), ids, { round: 0 });
    expect(await versionsOf(ids.applicationId)).toHaveLength(1);
  });

  it("stepVerify replayed sequentially: flags are not duplicated", async () => {
    const { ids } = await draftableApp();
    const d = await stepDraft(ctxWith(), ids, { round: 0 });
    await stepVerify(ctxWith(), ids, d.versionId ?? "");
    const n = (await flagsOf(ids.applicationId)).length;
    await stepVerify(ctxWith(), ids, d.versionId ?? "");
    expect(await flagsOf(ids.applicationId)).toHaveLength(n);
  });

  // FIXED (regression test; was): src/worker/services/pipeline/steps.ts:389-418 — stepVerify's "delete flags, insert flags"
  // is not atomic and not guarded: two concurrent runs (Workflow retry overlapping the inline
  // reverify after an edit, or a duplicate extract_interview -> resumeAfterInfo) both see no
  // groundingReport, both delete, both insert -> every flag appears twice (and the judge is paid
  // twice). ensureGapFillInterview (:452) has the same check-then-insert race. Use db.batch for
  // delete+insert and a deterministic flag id (versionId+index) with onConflictDoNothing.
  it("stepVerify run concurrently: flags are not duplicated", async () => {
    const { orgId } = await setupTenant();
    const { appId, verId } = await seedApplicationWithVersion(orgId, { status: "verifying" });
    const ids = { orgId, applicationId: appId };
    await Promise.all([stepVerify(ctxWith(), ids, verId), stepVerify(ctxWith(), ids, verId)]);
    const flags = await flagsOf(appId);
    const keys = flags.map((f) => `${f.kind}|${f.claimId}|${f.message}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stepSubmit replayed: one submission, one funder email", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniqEmail("contact"), []);
    const funder = uniqEmail("funder");
    const { appId } = await seedApplicationWithVersion(orgId, {
      status: "approved",
      submissionEmail: funder,
    });
    const email = new RecordingEmail();
    const ids = { orgId, applicationId: appId };
    const opts = { submittedByType: "user" as const, submittedBy: userId, approvedBy: userId };
    await twice(() => stepSubmit(ctxWith({ email }), ids, opts));
    const subs = await db()
      .select()
      .from(submissions)
      .where(eq(submissions.applicationId, appId))
      .all();
    expect(subs).toHaveLength(1);
    expect(email.to(funder)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- concurrent double-approve

describe("concurrency: double-submit of the approve decision", () => {
  it("sequential second approve after a successful submission is rejected (409), no second email", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniqEmail("contact"), []);
    const funder = uniqEmail("funder");
    const { appId } = await seedApplicationWithVersion(orgId, { submissionEmail: funder });
    const email = new RecordingEmail();
    const decide = () =>
      submitReviewDecision(ctxWith({ email }), {
        orgId,
        applicationId: appId,
        reviewerId: userId,
        decision: "approved",
      });
    const first = await decide();
    expect(first.status).toBe("submitted");
    await expect(decide()).rejects.toMatchObject({ status: 409 });
    expect(email.to(funder)).toHaveLength(1);
  });

  // FIXED (regression test; was): src/worker/services/pipeline/index.ts:297-345 + src/worker/services/submission/index.ts:88-103
  // — the approve path is check-then-act with no claim: both requests read status in_review, both
  // insert a review, both call stepSubmit; submitApplication's "existing non-failed submission"
  // check runs before either insert, and `submissions` has no unique (application_id, version_id)
  // for live rows (db/schema/submissions.ts:44). Result: two submissions and the funder is emailed
  // twice. Fix: atomic status claim (UPDATE ... SET status='submitting' WHERE status IN (...)
  // RETURNING) before sending, and/or a partial unique index on live submissions per version.
  it("two concurrent approves -> exactly one submission and one funder email", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniqEmail("contact"), []);
    const funder = uniqEmail("funder");
    const { appId } = await seedApplicationWithVersion(orgId, { submissionEmail: funder });
    const email = new RecordingEmail();
    const decide = () =>
      submitReviewDecision(ctxWith({ email }), {
        orgId,
        applicationId: appId,
        reviewerId: userId,
        decision: "approved",
      });
    await Promise.allSettled([decide(), decide()]);
    const subs = await db()
      .select()
      .from(submissions)
      .where(eq(submissions.applicationId, appId))
      .all();
    expect(subs.filter((s) => s.status !== "failed")).toHaveLength(1);
    expect(email.to(funder)).toHaveLength(1);
  });
});
