// Application activity timeline: runs the real inline pipeline (FakeLlm, FAKE_EXTERNALS=true) for
// a human-approved and an autopilot application, then checks the merged, chronological events
// (kinds, order, actor types), that no document text / fact statement / comment leaks, cursor
// pagination, and tenant isolation.
import { env } from "cloudflare:workers";
import type { TimelineEvent, TimelineResponse } from "@shared/api/timeline";
import type { ApplicationDto, FlagDto } from "@shared/api/types";
import type { ApplicationContent } from "@shared/content";
import { POLICY_VERSION } from "@shared/legal";
import { createApp } from "@worker/app";
import {
  applications,
  applicationVersions,
  consentRecords,
  facts,
  llmCalls,
  member,
  opportunities,
  opportunityMatches,
  orgProfiles,
  orgSettings,
  subscriptions,
  user,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import timelineRoutes from "@worker/routes/org/application-timeline";
import type { AppEnv } from "@worker/types";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { BASE, createTestOrg, createTestUser, setupTenant, testDb } from "./helpers";

// Until app.ts mounts the router, mount it on a test instance exactly as app.ts will.
const app = createApp();
const sub = new Hono<AppEnv>();
sub.use("*", requireOrg("viewer"));
sub.route("/", timelineRoutes);
app.route("/api/orgs/:orgId/applications", sub);

function call(path: string, init: { method?: string; json?: unknown; as: string }) {
  const headers = new Headers({ [TEST_USER_HEADER]: init.as });
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  return app.fetch(
    new Request(`${BASE}${path}`, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    }),
    env,
  );
}

async function ok<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  const body = await r.text();
  expect(r.status, body).toBe(status);
  return JSON.parse(body) as T;
}

const FACTS = [
  "Southwest Indian Foundation runs a construction trades training program in Gallup, New Mexico.",
  "The trades program trained 42 adults in 2025.",
  "Southwest Indian Foundation serves Navajo and Zuni families in McKinley County.",
];
const SECRET_QUOTE = "verbatim-source-quote-that-must-never-appear";
const SECRET_FEEDBACK = "feedback-comment-that-must-never-appear";
const SECRET_RESOLUTION = "resolution-note-that-must-never-appear";

async function seedOrg(opts: { autopilot: boolean; reviewerName: string }) {
  const t = await setupTenant("owner");
  const db = testDb();
  await db.update(user).set({ name: opts.reviewerName }).where(eq(user.id, t.userId));
  await db.insert(subscriptions).values({ orgId: t.orgId, planKey: "comp", status: "comp" });
  await db
    .update(orgProfiles)
    .set({ contactEmail: "grants@swif.example.org" })
    .where(eq(orgProfiles.orgId, t.orgId));
  await db
    .update(orgSettings)
    .set(
      opts.autopilot
        ? {
            autopilotEnabled: true,
            autoSubmitMaxCents: 10_000_000,
            fullReviewAboveCents: 100_000_000,
            minFitScoreForAuto: 0,
            highLikelihoodThreshold: 1,
            reviewFirstSubmissionPerFunder: false,
            maxAutoSubmissionsPerMonth: 100,
          }
        : { autopilotEnabled: false },
    )
    .where(eq(orgSettings.orgId, t.orgId));
  if (opts.autopilot) {
    await db.insert(consentRecords).values({
      id: newId("cns"),
      orgId: t.orgId,
      userId: t.userId,
      scope: "autopilot_submission",
      policyVersion: POLICY_VERSION,
      granted: true,
    });
  }
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Gallup Community Foundation",
    title: "Workforce Pathways Grant",
    summary: "Supports job training in construction trades for adults in McKinley County.",
    awardCeilingCents: 2_500_000,
    closeDate: new Date(Date.now() + 30 * 86_400_000),
    submissionMethod: "email",
    submissionEmail: "apply@funder.example.org",
    submissionEmailVerified: true,
    requirements: {
      sections: [
        {
          key: "need_statement",
          title: "Statement of need",
          prompt: "Describe the need your program addresses.",
          kind: "narrative",
          required: true,
          wordLimit: 300,
          charLimit: null,
          guidance: "",
        },
      ],
      attachments: [],
      eligibilityCriteria: [],
      submissionInstructions: "",
      complete: true,
    },
  });
  await db.insert(opportunityMatches).values({
    id: newId("mat"),
    orgId: t.orgId,
    opportunityId: oppId,
    fitScore: 95,
    likelihood: 0.2,
    suggestedAskCents: 2_000_000,
    status: "shortlisted",
  });
  for (const statement of FACTS) {
    await db.insert(facts).values({
      id: newId("fct"),
      orgId: t.orgId,
      category: "program",
      statement,
      sourceQuote: `${statement} ${SECRET_QUOTE}`,
      status: "confirmed",
      sourceType: "user_entered",
    });
  }
  return { ...t, oppId };
}

const base = (orgId: string) => `/api/orgs/${orgId}`;

/**
 * FakeLlm does not write llm_calls (only the real client's onUsage hook does): record what real
 * mode would have, around the first version's creation time, plus noise from another org.
 */
async function seedLlmCalls(orgId: string, appId: string) {
  const db = testDb();
  const v1 = await db
    .select({ createdAt: applicationVersions.createdAt })
    .from(applicationVersions)
    .where(eq(applicationVersions.applicationId, appId))
    .orderBy(applicationVersions.versionNumber)
    .get();
  const at = v1?.createdAt.getTime() ?? Date.now();
  const row = (purpose: string, costMicros: number, dt: number, org = orgId) => ({
    id: newId("llm"),
    orgId: org,
    applicationId: appId,
    purpose,
    model: "claude-opus-5-5",
    inputTokens: 1000,
    outputTokens: 200,
    costMicros,
    createdAt: new Date(at + dt),
  });
  const other = await setupTenant("owner");
  await db
    .insert(llmCalls)
    .values([
      row("drafting.section", 20_000, -30),
      row("drafting.section", 20_000, -20),
      row("drafting.summary", 10_000, -10),
      row("grounding.verify_claims", 4_000, 5),
      row("drafting.section", 999_000, -5, other.orgId),
    ]);
}

async function timeline(orgId: string, appId: string, as: string, qs = "") {
  return ok<TimelineResponse>(call(`${base(orgId)}/applications/${appId}/timeline${qs}`, { as }));
}

/** Kinds in order, without the LLM usage totals (their position depends only on call times). */
const kindsOf = (items: TimelineEvent[]) =>
  items.filter((e) => e.kind !== "llm.usage").map((e) => e.kind);

async function expectNoContentLeak(orgId: string, appId: string, userId: string, body: unknown) {
  const json = JSON.stringify(body);
  for (const s of [...FACTS, SECRET_QUOTE, SECRET_FEEDBACK, SECRET_RESOLUTION]) {
    expect(json).not.toContain(s);
  }
  // No claim text, executive summary or flag message from any version either.
  const versions = await testDb()
    .select({ content: applicationVersions.content, summary: applicationVersions.executiveSummary })
    .from(applicationVersions)
    .where(eq(applicationVersions.applicationId, appId))
    .all();
  expect(versions.length).toBeGreaterThan(0);
  for (const v of versions) {
    if (v.summary.length > 20) expect(json).not.toContain(v.summary);
    for (const s of (v.content as ApplicationContent).sections)
      for (const p of s.paragraphs)
        for (const c of p.claims) if (c.text.length > 20) expect(json).not.toContain(c.text);
  }
  const detail = await ok<{ flags: FlagDto[] }>(
    call(`${base(orgId)}/applications/${appId}`, { as: userId }),
  );
  for (const f of detail.flags) expect(json).not.toContain(f.message);
}

describe("GET /applications/:id/timeline", () => {
  it("shows AI drafting + checking, human approval and the human-approved email submission in order", async () => {
    const t = await seedOrg({ autopilot: false, reviewerName: "Rosa Martinez" });
    const created = await ok<ApplicationDto>(
      call(`${base(t.orgId)}/applications`, {
        as: t.userId,
        json: { opportunityId: t.oppId, requestedAmountCents: 2_000_000 },
      }),
      201,
    );
    expect(created.lastError).toBeNull();
    const appId = created.id;
    await seedLlmCalls(t.orgId, appId);

    // Resolve every open blocker (missing info included) so the draft can be approved.
    const detail = await ok<ApplicationDto & { flags: FlagDto[] }>(
      call(`${base(t.orgId)}/applications/${appId}`, { as: t.userId }),
    );
    const blockers = detail.flags.filter((f) => f.severity === "blocker" && f.status === "open");
    for (const f of blockers) {
      await ok(
        call(`${base(t.orgId)}/applications/${appId}/flags/${f.id}/resolve`, {
          as: t.userId,
          json: { resolution: SECRET_RESOLUTION },
        }),
      );
    }
    const before = await ok<ApplicationDto>(
      call(`${base(t.orgId)}/applications/${appId}`, { as: t.userId }),
    );
    expect(before.status).toBe("in_review");

    // While waiting, the in-review wait is open and nobody has approved yet.
    const waiting = await timeline(t.orgId, appId, t.userId);
    const openWait = waiting.items.find((e) => e.kind === "wait.in_review");
    expect(openWait?.detail?.open).toBe(true);
    expect(waiting.whoDecided.find((s) => s.step === "decided")).toMatchObject({
      label: "Awaiting approval",
      pending: true,
    });

    await ok(
      call(`${base(t.orgId)}/reviews/${appId}/feedback`, {
        as: t.userId,
        json: { rating: 4, comment: SECRET_FEEDBACK, tags: ["clear"] },
      }),
      201,
    );
    const decided = await ok<ApplicationDto>(
      call(`${base(t.orgId)}/reviews/${appId}/decision`, {
        as: t.userId,
        json: { decision: "approved", comments: "Looks right to me" },
      }),
    );
    expect(decided.status).toBe("submitted");

    const tl = await timeline(t.orgId, appId, t.userId);
    const kinds = kindsOf(tl.items);
    const order = [
      "application.created",
      "version.drafted",
      "check.flagged|check.passed",
      "application.routed",
      "wait.in_review",
      "feedback.added",
      "review.approved",
      "submission.sent",
    ];
    let at = -1;
    for (const k of order) {
      const idx = kinds.findIndex((x, i) => i > at && k.split("|").includes(x));
      expect(idx, `${k} after index ${at} in ${kinds.join(", ")}`).toBeGreaterThan(at);
      at = idx;
    }
    if (blockers.length > 0) {
      expect(kinds.filter((k) => k === "flag.resolved")).toHaveLength(blockers.length);
    }
    // Chronological.
    const times = tl.items.map((e) => Date.parse(e.at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    const byKind = (k: string) => tl.items.find((e) => e.kind === k);
    expect(byKind("application.created")?.actor).toEqual({ type: "human", name: "Rosa Martinez" });
    expect(byKind("application.created")?.summary).toBe("Rosa started this application");
    expect(byKind("version.drafted")?.actor.type).toBe("ai");
    expect(byKind("version.drafted")?.summary).toMatch(/^AI drafted version 1 using \d+ facts?$/);
    const check = tl.items.find((e) => e.kind.startsWith("check."));
    expect(check?.actor.type).toBe("ai");
    expect(check?.summary).toMatch(/^Grounding check (flagged|passed)/);
    expect(byKind("application.routed")?.actor.type).toBe("system");
    expect(byKind("wait.in_review")?.detail?.open).toBe(false);
    expect(byKind("wait.in_review")?.summary).toMatch(/^Waited .+ for human review$/);
    expect(byKind("review.approved")).toMatchObject({
      actor: { type: "human", name: "Rosa Martinez" },
      summary: "Rosa approved version 1",
    });
    expect(byKind("feedback.added")?.summary).toBe("Rosa rated version 1 4/5");
    const sent = byKind("submission.sent");
    expect(sent?.actor).toEqual({ type: "human", name: "Rosa Martinez" });
    expect(sent?.summary).toMatch(/^Rosa submitted by email \(sha256 [0-9a-f]{4}…\)$/);
    expect(sent?.detail?.channel).toBe("email");
    expect(sent?.detail?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sent?.link).toMatch(new RegExp(`^/api/orgs/${t.orgId}/submissions/sub_`));

    // LLM totals per stage: counts + cost only.
    const usage = tl.items.filter((e) => e.kind === "llm.usage");
    expect(usage.map((e) => e.detail?.stage).sort()).toEqual(["drafting", "grounding"]);
    expect(usage.find((e) => e.detail?.stage === "drafting")).toMatchObject({
      summary: "AI made 3 drafting calls · $0.05",
      detail: { calls: 3, costMicros: 50_000, purposes: ["drafting.section", "drafting.summary"] },
    });
    expect(usage.find((e) => e.detail?.stage === "grounding")?.summary).toBe(
      "AI made 1 fact-checking call · $0.0040",
    );
    for (const u of usage) {
      expect(u.actor.type).toBe("ai");
      expect(Object.keys(u.detail ?? {}).sort()).toEqual(
        ["calls", "cost", "costMicros", "lastAt", "models", "purposes", "stage"].sort(),
      );
    }
    const drafting = usage.find((e) => e.detail?.stage === "drafting");
    expect(Date.parse(drafting?.at ?? "")).toBeLessThanOrEqual(
      Date.parse(byKind("version.drafted")?.at ?? ""),
    );

    expect(tl.whoDecided.map((s) => s.label)).toEqual(
      expect.arrayContaining([
        "Drafted by AI",
        "Checked by AI",
        "Approved by Rosa",
        "Submitted by Rosa",
      ]),
    );
    expect(tl.nextCursor).toBeNull();
    await expectNoContentLeak(t.orgId, appId, t.userId, tl);
    expect(JSON.stringify(tl)).not.toContain("Looks right to me");

    // Cursor pagination walks the same events in the same order.
    const seen: TimelineEvent[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const page = await timeline(t.orgId, appId, t.userId, qs);
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items);
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 50);
    expect(seen.map((e) => e.id)).toEqual(tl.items.map((e) => e.id));
    expect(pages).toBe(Math.ceil(tl.items.length / 2));
    const bad = await call(`${base(t.orgId)}/applications/${appId}/timeline?cursor=nope`, {
      as: t.userId,
    });
    expect(bad.status).toBe(400);
  }, 120_000);

  it("attributes an autopilot submission to Autopilot", async () => {
    const t = await seedOrg({ autopilot: true, reviewerName: "Sam Yazzie" });
    const created = await ok<ApplicationDto>(
      call(`${base(t.orgId)}/applications`, {
        as: t.userId,
        json: { opportunityId: t.oppId, requestedAmountCents: 2_000_000 },
      }),
      201,
    );
    const tl = await timeline(t.orgId, created.id, t.userId);
    const kinds = kindsOf(tl.items);
    const routedReasons = tl.items.find((e) => e.kind === "application.routed")?.detail?.reasons;
    expect(created.status, `routed with: ${JSON.stringify(routedReasons)}`).toBe("submitted");
    expect(kinds).toEqual([
      "application.created",
      "version.drafted",
      "check.passed",
      "application.routed",
      "submission.sent",
    ]);
    const routed = tl.items.find((e) => e.kind === "application.routed");
    expect(routed?.actor.type).toBe("autopilot");
    expect(routed?.summary).toBe("Autopilot cleared every gate, so no human review was needed");
    const sent = tl.items.find((e) => e.kind === "submission.sent");
    expect(sent?.actor).toEqual({ type: "autopilot", name: "Autopilot" });
    expect(sent?.summary).toMatch(/^Autopilot submitted by email \(sha256 [0-9a-f]{4}…\)$/);
    expect(tl.whoDecided.map((s) => s.label)).toEqual([
      "Drafted by AI",
      "Checked by AI",
      "Approved by Autopilot",
      "Submitted by Autopilot",
    ]);
    await expectNoContentLeak(t.orgId, created.id, t.userId, tl);
  }, 120_000);

  it("is tenant-scoped: other orgs get 404, viewers can read", async () => {
    const t = await setupTenant("owner");
    const db = testDb();
    const oppId = newId("opp");
    await db.insert(opportunities).values({
      id: oppId,
      source: "manual",
      sourceId: oppId,
      funderName: "Funder",
      title: "Grant",
      summary: "",
    });
    const appId = newId("app");
    await db.insert(applications).values({
      id: appId,
      orgId: t.orgId,
      opportunityId: oppId,
      title: "Grant",
      status: "in_review",
      createdBy: t.userId,
    });

    const viewer = await createTestUser({ name: "Vi Viewer" });
    await db.insert(member).values({
      id: newId("mem"),
      organizationId: t.orgId,
      userId: viewer.id,
      role: "viewer",
    });
    const own = await timeline(t.orgId, appId, viewer.id);
    expect(own.items[0]?.kind).toBe("application.created");

    const other = await createTestUser();
    const otherOrg = await createTestOrg(other.id);
    // Not a member of the first org.
    const r1 = await call(`${base(t.orgId)}/applications/${appId}/timeline`, { as: other.id });
    expect(r1.status).toBe(404);
    // A member of another org asking for this org's application through their own org.
    const r2 = await call(`${base(otherOrg.orgId)}/applications/${appId}/timeline`, {
      as: other.id,
    });
    expect(r2.status).toBe(404);
    expect(JSON.stringify(await r2.json())).not.toContain(appId.slice(4));
  });
});
