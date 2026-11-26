// The REAL ApplicationPipeline Workflow (the production path) running in workerd with local
// Workflows/D1/R2. createApplication always runs inline under APP_ENV=test, so these tests insert
// the application row and call env.APPLICATION_PIPELINE.create() directly; route-side calls
// (review decisions, info provided, flag resolution) use a context whose env is NOT inline, so
// they go through instance.status()/sendEvent() exactly like production routes.
// Drafting/grounding are stubbed via `pipelineDeps` (deterministic); submission is the real module.
import { introspectWorkflowInstance, type WorkflowInstanceIntrospector } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { GroundingReport, OpportunityRequirements } from "@shared/content";
import { type AppContext, createAppContext, testFakes } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  facts,
  opportunities,
  opportunityMatches,
  orgProfiles,
  submissions,
} from "@worker/db/schema";
import type { Env } from "@worker/env";
import { AppError } from "@worker/lib/errors";
import { newId } from "@worker/lib/ids";
import { resolveFlag, resumeAfterInfo, submitReviewDecision } from "@worker/services/pipeline";
import { type NormalizedFlag, pipelineDeps } from "@worker/services/pipeline/deps";
import { draftVersionId } from "@worker/services/pipeline/steps";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTenant, testDb } from "./helpers";

const REQUIREMENTS: OpportunityRequirements = {
  sections: [
    {
      key: "need_statement",
      title: "Statement of need",
      prompt: "Describe the need.",
      kind: "narrative",
      required: true,
      wordLimit: 500,
      charLimit: null,
      guidance: "",
    },
  ],
  attachments: [],
  eligibilityCriteria: [],
  submissionInstructions: "",
  complete: true,
};

const report = (passed: boolean): GroundingReport => ({
  totalClaims: 1,
  factualClaims: 1,
  supported: passed ? 1 : 0,
  partiallySupported: 0,
  unsupported: passed ? 0 : 1,
  numericMismatches: 0,
  unconfirmedFactCitations: 0,
  gaps: 0,
  passed,
  verdicts: [],
  checkedAt: Date.now(),
  model: "fake",
});

const missingInfo: NormalizedFlag = {
  severity: "blocker",
  kind: "missing_info",
  sectionKey: "need_statement",
  claimId: null,
  message: "How many adults completed the program last year?",
  suggestedQuestion: "How many adults completed the program last year?",
};
const lengthWarning: NormalizedFlag = {
  severity: "warning",
  kind: "length_limit",
  sectionKey: "need_statement",
  claimId: null,
  message: "Close to the word limit",
  suggestedQuestion: null,
};

interface Seeded {
  orgId: string;
  userId: string;
  applicationId: string;
}

async function seed(): Promise<Seeded> {
  const t = await setupTenant("owner");
  const db = testDb();
  // A reply-to contact lets the real submission module use the email channel (-> "submitted").
  await db
    .update(orgProfiles)
    .set({ contactEmail: "director@swif.example.org" })
    .where(eq(orgProfiles.orgId, t.orgId));
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: `Funder ${oppId}`,
    title: "Workforce Pathways Grant",
    summary: "Training for trades careers.",
    awardCeilingCents: 500_000,
    closeDate: new Date(Date.now() + 30 * 86_400_000),
    submissionMethod: "email",
    submissionEmail: "grants@funder.example.org",
    requirements: REQUIREMENTS,
  });
  const matchId = newId("mat");
  await db.insert(opportunityMatches).values({
    id: matchId,
    orgId: t.orgId,
    opportunityId: oppId,
    fitScore: 90,
    likelihood: 0.3,
    suggestedAskCents: 500_000,
    status: "drafting",
  });
  await db.insert(facts).values({
    id: newId("fct"),
    orgId: t.orgId,
    category: "program",
    statement: "SWIF trains 40 adults a year in construction trades.",
    status: "confirmed",
    sourceType: "user_entered",
  });
  // What createApplication inserts before handing off to the Workflow.
  const applicationId = newId("app");
  await db.insert(applications).values({
    id: applicationId,
    orgId: t.orgId,
    opportunityId: oppId,
    matchId,
    title: "Workforce Pathways Grant",
    status: "draft_queued",
    requestedAmountCents: 500_000,
    createdBy: t.userId,
    workflowInstanceId: applicationId,
  });
  return { orgId: t.orgId, userId: t.userId, applicationId };
}

/** A context whose env does not force inline mode, i.e. what production routes get. */
function routeCtx(): AppContext {
  const base = createAppContext(env as Env);
  return { ...base, env: { ...(env as Env), APP_ENV: "development", FAKE_EXTERNALS: "false" } };
}

const db = () => testDb();
const appRow = async (s: Seeded) => {
  const row = await db()
    .select()
    .from(applications)
    .where(and(eq(applications.id, s.applicationId), eq(applications.orgId, s.orgId)))
    .get();
  if (!row) throw new Error("application missing");
  return row;
};
const versionsOf = (s: Seeded) =>
  db()
    .select({ id: applicationVersions.id, n: applicationVersions.versionNumber })
    .from(applicationVersions)
    .where(eq(applicationVersions.applicationId, s.applicationId))
    .orderBy(applicationVersions.versionNumber)
    .all();
const flagsOf = (s: Seeded) =>
  db()
    .select()
    .from(applicationFlags)
    .where(eq(applicationFlags.applicationId, s.applicationId))
    .all();
const submissionsOf = (s: Seeded) =>
  db().select().from(submissions).where(eq(submissions.applicationId, s.applicationId)).all();
const instanceStatus = async (s: Seeded) =>
  (await (await env.APPLICATION_PIPELINE.get(s.applicationId)).status()).status;

/** Poll until `check` passes (the Workflow runs asynchronously in the engine). */
async function eventually<T>(check: () => Promise<T>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

/**
 * Waits until the application is in `status` while the instance is still live (locally an
 * instance parked on waitForEvent reports "running"; events sent earlier are queued for it).
 */
async function parkedAt(s: Seeded, status: string) {
  await eventually(async () => {
    expect((await appRow(s)).status).toBe(status);
    expect(["running", "waiting"]).toContain(await instanceStatus(s));
  });
}

const started: string[] = [];

async function start(
  s: Seeded,
  modify?: Parameters<WorkflowInstanceIntrospector["modify"]>[0],
  opts: { keepRetryDelays?: boolean } = {},
): Promise<WorkflowInstanceIntrospector> {
  const instance = await introspectWorkflowInstance(env.APPLICATION_PIPELINE, s.applicationId);
  await instance.modify(async (m) => {
    await m.disableSleeps();
    // Real backoff is 30s+ for LLM steps: a test that keeps it proves no retry happened.
    if (!opts.keepRetryDelays) await m.disableRetryDelays();
    if (modify) await modify(m);
  });
  await env.APPLICATION_PIPELINE.create({
    id: s.applicationId,
    params: { orgId: s.orgId, applicationId: s.applicationId, startedBy: s.userId },
  });
  started.push(s.applicationId);
  return instance;
}

let verifyFlags: NormalizedFlag[][] = [];

beforeEach(() => {
  verifyFlags = [];
  testFakes.email.sent.length = 0;
  vi.spyOn(pipelineDeps, "ensureRequirements").mockResolvedValue(REQUIREMENTS);
  vi.spyOn(pipelineDeps, "factsForDrafting").mockImplementation(async (_ctx, orgId) =>
    testDb().select().from(facts).where(eq(facts.orgId, orgId)).all(),
  );
  vi.spyOn(pipelineDeps, "factsByIds").mockImplementation(async (_ctx, orgId) =>
    testDb().select().from(facts).where(eq(facts.orgId, orgId)).all(),
  );
  vi.spyOn(pipelineDeps, "draft").mockImplementation(async (_ctx, input) => ({
    content: {
      sections: [
        {
          key: "need_statement",
          title: "Statement of need",
          paragraphs: [
            {
              id: "s1.p1",
              claims: [
                {
                  id: "s1.p1.c1",
                  text: "SWIF trains 40 adults a year in construction trades.",
                  kind: "factual",
                  factIds: [input.facts[0]?.id ?? "fct_missing"],
                },
              ],
            },
          ],
          gaps: [],
        },
      ],
    },
    executiveSummary: "SWIF requests support for its trades training program.",
    keyPoints: ["40 adults trained per year"],
    model: "fake-llm",
    promptVersion: "test",
  }));
  vi.spyOn(pipelineDeps, "verify").mockImplementation(async () => {
    const flags = verifyFlags.shift() ?? [];
    return { report: report(!flags.some((f) => f.severity === "blocker")), flags };
  });
  vi.spyOn(pipelineDeps, "createGapFillInterview").mockResolvedValue(undefined);
  vi.spyOn(pipelineDeps, "scheduleDeadlineReminders").mockResolvedValue(undefined);
  vi.spyOn(pipelineDeps, "assertCanDraft").mockResolvedValue(undefined);
  vi.spyOn(pipelineDeps, "recordDraftUsage").mockResolvedValue(undefined);
  vi.spyOn(pipelineDeps, "submit");
});

afterEach(async () => {
  try {
    // Stop instances still parked on an event before the stubs go away (disposed introspectors
    // already removed theirs: get() then throws instance.not_found).
    for (const id of started.splice(0)) {
      const handle = await env.APPLICATION_PIPELINE.get(id).catch(() => null);
      const status = handle ? (await handle.status()).status : "gone";
      if (["queued", "running", "waiting", "paused"].includes(status)) await handle?.terminate();
    }
  } finally {
    vi.restoreAllMocks();
  }
});

/** Emails sent to the funder (the team also gets a "submitted" notification). */
const funderEmails = () =>
  testFakes.email.sent.filter((m) => m.to.includes("grants@funder.example.org"));

describe("ApplicationPipeline Workflow", () => {
  it("drafts to in_review, then a review_decision (approved) submits", async () => {
    const s = await seed();
    verifyFlags = [[lengthWarning]];
    await using instance = await start(s);
    await parkedAt(s, "in_review");

    const before = await appRow(s);
    expect(before.reviewTier).toBe("one_click");
    expect(before.currentVersionId).toBe(draftVersionId(s.applicationId, 0));
    expect(await instance.waitForStepResult({ name: "verify-0" })).toEqual({ status: "verifying" });
    expect(await instance.waitForStepResult({ name: "route-0" })).toEqual({
      tier: "one_click",
      status: "in_review",
    });
    expect(vi.mocked(pipelineDeps.assertCanDraft)).toHaveBeenCalledTimes(1);

    // The route: records the decision in D1, then wakes the Workflow (no inline submit).
    const decided = await submitReviewDecision(routeCtx(), {
      orgId: s.orgId,
      applicationId: s.applicationId,
      reviewerId: s.userId,
      decision: "approved",
    });
    expect(decided.status).toBe("approved");

    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toEqual({ status: "submitted" });
    const after = await appRow(s);
    expect(after.status).toBe("submitted");
    expect(after.lastError).toBeNull();
    const subs = await submissionsOf(s);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ channel: "email", status: "sent", approvedBy: s.userId });
    expect(subs[0]?.submittedByType).toBe("user");
    expect(vi.mocked(pipelineDeps.submit)).toHaveBeenCalledTimes(1);
    expect(funderEmails()).toHaveLength(1);
    expect(await versionsOf(s)).toHaveLength(1);
    expect((await flagsOf(s)).map((f) => f.kind)).toEqual(["length_limit"]);
  });

  it("needs_info -> info_provided (redraft) -> redrafts, verifies and routes to review", async () => {
    const s = await seed();
    verifyFlags = [[missingInfo], []];
    await using instance = await start(s);
    await parkedAt(s, "needs_info");
    expect(vi.mocked(pipelineDeps.createGapFillInterview)).toHaveBeenCalledTimes(1);

    const resumed = await resumeAfterInfo(routeCtx(), {
      orgId: s.orgId,
      applicationId: s.applicationId,
      redraft: true,
    });
    expect(resumed.status).toBe("needs_info"); // the Workflow does the work, not the route
    await parkedAt(s, "in_review");

    expect(await instance.waitForStepResult({ name: "info-0-round" })).toBe(1);
    expect((await versionsOf(s)).map((v) => v.id)).toEqual([
      draftVersionId(s.applicationId, 0),
      draftVersionId(s.applicationId, 1),
    ]);
    expect((await appRow(s)).currentVersionId).toBe(draftVersionId(s.applicationId, 1));
    expect(vi.mocked(pipelineDeps.draft)).toHaveBeenCalledTimes(2);
  });

  it("needs_info resolved by hand (info_provided without redraft) re-routes the version", async () => {
    const s = await seed();
    verifyFlags = [[missingInfo]];
    await using instance = await start(s);
    await parkedAt(s, "needs_info");
    const [flag] = await flagsOf(s);
    if (!flag) throw new Error("flag missing");

    await resolveFlag(routeCtx(), {
      orgId: s.orgId,
      applicationId: s.applicationId,
      flagId: flag.id,
      resolution: "Answered on the phone; added as a fact",
      userId: s.userId,
    });
    await parkedAt(s, "in_review");
    expect(await instance.waitForStepResult({ name: "info-0-route" })).toEqual({
      status: "in_review",
    });
    expect(vi.mocked(pipelineDeps.draft)).toHaveBeenCalledTimes(1);
    expect(await versionsOf(s)).toHaveLength(1);
  });

  it("changes_requested redrafts automatically at most 3 times, then waits for a human", async () => {
    const s = await seed();
    await using instance = await start(s);
    await parkedAt(s, "in_review");

    const ctx = routeCtx();
    for (let k = 1; k <= 3; k++) {
      await submitReviewDecision(ctx, {
        orgId: s.orgId,
        applicationId: s.applicationId,
        reviewerId: s.userId,
        decision: "changes_requested",
        comments: `Change request ${k}`,
      });
      await eventually(async () => {
        const app = await appRow(s);
        expect(app.currentVersionId).toBe(draftVersionId(s.applicationId, k));
        expect(app.status).toBe("in_review");
      });
      const call = vi.mocked(pipelineDeps.draft).mock.calls[k];
      expect(call?.[1].reviewerNotes).toBe(`Change request ${k}`);
    }

    // 4th request: no automatic redraft; the instance waits for a human decision.
    await submitReviewDecision(ctx, {
      orgId: s.orgId,
      applicationId: s.applicationId,
      reviewerId: s.userId,
      decision: "changes_requested",
      comments: "Change request 4",
    });
    expect(await instance.waitForStepResult({ name: "changes-count-11" })).toBe(4);
    await parkedAt(s, "changes_requested");
    expect(await versionsOf(s)).toHaveLength(4);
    expect(vi.mocked(pipelineDeps.draft)).toHaveBeenCalledTimes(4);

    await submitReviewDecision(ctx, {
      orgId: s.orgId,
      applicationId: s.applicationId,
      reviewerId: s.userId,
      decision: "approved",
    });
    await instance.waitForStatus("complete");
    expect((await appRow(s)).status).toBe("submitted");
    expect((await submissionsOf(s)).map((x) => x.versionId)).toEqual([
      draftVersionId(s.applicationId, 3),
    ]);
  });

  describe("retries and idempotency", () => {
    it("a draft attempt that dies after inserting its version is finished by the retry", async () => {
      const s = await seed();
      const real = vi.mocked(pipelineDeps.draft).getMockImplementation();
      vi.mocked(pipelineDeps.draft).mockImplementationOnce(async (ctx, input) => {
        // Simulate a crash between the version insert and the status update.
        const r = await (real as NonNullable<typeof real>)(ctx, input);
        await db()
          .insert(applicationVersions)
          .values({
            id: draftVersionId(s.applicationId, 0),
            orgId: s.orgId,
            applicationId: s.applicationId,
            versionNumber: 1,
            content: r.content,
            authorType: "system",
            changeNote: "Initial draft",
          });
        throw new Error("D1 connection reset");
      });
      await using instance = await start(s);
      await parkedAt(s, "in_review");
      expect(await instance.waitForStepResult({ name: "draft-0" })).toEqual({
        versionId: draftVersionId(s.applicationId, 0),
      });
      expect(await versionsOf(s)).toHaveLength(1);
      expect((await appRow(s)).currentVersionId).toBe(draftVersionId(s.applicationId, 0));
    });

    it("a verify attempt that fails after writing flags does not duplicate them", async () => {
      const s = await seed();
      verifyFlags = [[lengthWarning]];
      vi.mocked(pipelineDeps.verify).mockImplementationOnce(async () => {
        await db()
          .insert(applicationFlags)
          .values({
            id: newId("flg"),
            orgId: s.orgId,
            applicationId: s.applicationId,
            versionId: draftVersionId(s.applicationId, 0),
            ...lengthWarning,
          });
        throw new Error("grounding model overloaded");
      });
      await using _instance = await start(s);
      await parkedAt(s, "in_review");
      expect(vi.mocked(pipelineDeps.verify)).toHaveBeenCalledTimes(2);
      expect((await flagsOf(s)).map((f) => f.kind)).toEqual(["length_limit"]);
    });

    it("a submit attempt whose response is lost does not submit twice or un-submit", async () => {
      const s = await seed();
      vi.mocked(pipelineDeps.submit).mockRestore();
      const realSubmit = pipelineDeps.submit; // the real submission module
      let calls = 0;
      vi.spyOn(pipelineDeps, "submit").mockImplementation(async (ctx, input) => {
        calls++;
        await realSubmit(ctx, input);
        if (calls === 1) throw new Error("socket closed before the response");
      });
      await using instance = await start(s);
      await parkedAt(s, "in_review");
      await submitReviewDecision(routeCtx(), {
        orgId: s.orgId,
        applicationId: s.applicationId,
        reviewerId: s.userId,
        decision: "approved",
      });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "submitted" });
      expect((await appRow(s)).status).toBe("submitted");
      expect(await submissionsOf(s)).toHaveLength(1);
      expect(funderEmails()).toHaveLength(1);
      expect(await versionsOf(s)).toHaveLength(1);
      expect(calls).toBe(1); // the retry saw "submitted" and skipped
    });
  });

  describe("failures", () => {
    it("a refused submission retries in one bounded step, then ends failed (no send loop)", async () => {
      const s = await seed();
      const send = vi
        .spyOn(testFakes.email, "send")
        .mockRejectedValue(new Error("451 temporary local problem"));
      await using instance = await start(s);
      await parkedAt(s, "in_review");
      await submitReviewDecision(routeCtx(), {
        orgId: s.orgId,
        applicationId: s.applicationId,
        reviewerId: s.userId,
        decision: "approved",
      });
      await instance.waitForStatus("errored");
      // One submit step: 1 attempt + 3 retries, never the 25-iteration loop.
      expect(vi.mocked(pipelineDeps.submit)).toHaveBeenCalledTimes(4);
      expect(send.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(send.mock.calls.length).toBeLessThanOrEqual(4);
      const subs = await submissionsOf(s);
      expect(subs.length).toBeLessThanOrEqual(4);
      expect(subs.every((x) => x.status === "failed")).toBe(true);
      expect(new Set(subs.map((x) => x.versionId))).toEqual(
        new Set([draftVersionId(s.applicationId, 0)]),
      );
      const app = await appRow(s);
      expect(app.status).toBe("failed");
      expect(app.lastError).toMatch(/Email submission failed: 451 temporary local problem/);
    });

    it("does not retry a 4xx AppError (402 plan limit) and shows its message", async () => {
      const s = await seed();
      vi.mocked(pipelineDeps.assertCanDraft).mockRejectedValue(
        new AppError(402, "payment_required", "Choose a plan to start drafting applications."),
      );
      await using instance = await start(s);
      await instance.waitForStatus("errored");
      expect(vi.mocked(pipelineDeps.assertCanDraft)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(pipelineDeps.draft)).not.toHaveBeenCalled();
      const app = await appRow(s);
      expect(app.status).toBe("failed");
      expect(app.lastError).toBe("Choose a plan to start drafting applications.");
      expect(await versionsOf(s)).toHaveLength(0);
    });

    it("retries a transient error up to the step limit, then marks the application failed", async () => {
      const s = await seed();
      vi.mocked(pipelineDeps.draft).mockRejectedValue(new Error("model overloaded"));
      await using instance = await start(s);
      await instance.waitForStatus("errored");
      expect(vi.mocked(pipelineDeps.draft)).toHaveBeenCalledTimes(4); // 1 + 3 retries
      const app = await appRow(s);
      expect(app.status).toBe("failed");
      expect(app.lastError).toMatch(/model overloaded/);
    });

    it("ends with a 404 (application deleted mid-flight) instead of retrying forever", async () => {
      const s = await seed();
      vi.mocked(pipelineDeps.ensureRequirements).mockImplementation(async () => {
        await db().delete(applications).where(eq(applications.id, s.applicationId));
        return REQUIREMENTS;
      });
      // Retry delays stay on: a retried 404 would back off 5s, 10s, 20s... and time out the test.
      await using instance = await start(s, undefined, { keepRetryDelays: true });
      await instance.waitForStatus("errored");
      expect((await instance.getError()).message).toMatch(/NonRetryableError/);
      expect(vi.mocked(pipelineDeps.ensureRequirements)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(pipelineDeps.draft)).not.toHaveBeenCalled();
    });
  });

  describe("event timeouts and payloads", () => {
    it("a review wait timeout ends the instance cleanly; a later approval runs inline", async () => {
      const s = await seed();
      await using instance = await start(s, async (m) => {
        await m.forceEventTimeout({ name: "review-1" });
      });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "in_review", timedOut: true });
      const app = await appRow(s);
      expect(app.status).toBe("in_review");
      expect(app.lastError).toBeNull();

      // The route notices the instance is no longer live and submits inline instead of
      // sending an event nobody will consume.
      const decided = await submitReviewDecision(routeCtx(), {
        orgId: s.orgId,
        applicationId: s.applicationId,
        reviewerId: s.userId,
        decision: "approved",
      });
      expect(decided.status).toBe("submitted");
      expect(await submissionsOf(s)).toHaveLength(1);
    });

    it("an info wait timeout leaves the application in needs_info", async () => {
      const s = await seed();
      verifyFlags = [[missingInfo]];
      await using instance = await start(s, async (m) => {
        await m.forceEventTimeout({ name: "info-0" });
      });
      await instance.waitForStatus("complete");
      expect(await instance.getOutput()).toEqual({ status: "needs_info", timedOut: true });
      const app = await appRow(s);
      expect(app.status).toBe("needs_info");
      expect(app.lastError).toBeNull();
    });

    it("malformed event payloads do not crash the instance", async () => {
      const s = await seed();
      verifyFlags = [[missingInfo]];
      await using instance = await start(s);
      await parkedAt(s, "needs_info");
      const handle = await env.APPLICATION_PIPELINE.get(s.applicationId);

      // Garbage info_provided: treated as "re-route if possible" (blockers remain -> needs_info).
      await handle.sendEvent({ type: "info_provided", payload: { redraft: "yes please" } });
      expect(await instance.waitForStepResult({ name: "info-0-route" })).toEqual({
        status: "needs_info",
      });
      await parkedAt(s, "needs_info");
      expect(vi.mocked(pipelineDeps.draft)).toHaveBeenCalledTimes(1);

      // Garbage review_decision while in review: a wake-up only; D1 still says in_review.
      const [flag] = await flagsOf(s);
      await db()
        .update(applicationFlags)
        .set({ status: "resolved" })
        .where(eq(applicationFlags.id, flag?.id ?? ""));
      await handle.sendEvent({ type: "info_provided", payload: { redraft: false } });
      await parkedAt(s, "in_review");
      await handle.sendEvent({ type: "review_decision", payload: null });
      expect(await instance.waitForStepResult({ name: "state-3" })).toMatchObject({
        status: "in_review",
      });
      await parkedAt(s, "in_review");
      expect(await submissionsOf(s)).toHaveLength(0);
    });
  });
});
