// Pipeline + applications/reviews API, driven inline (APP_ENV=test). Cross-module calls go through
// `pipelineDeps`, which is stubbed here with realistic returns so these tests stay deterministic.
import { env } from "cloudflare:workers";
import type { ApplicationDto, FeedbackDto, FlagDto } from "@shared/api/types";
import type { ApplicationContent, GroundingReport, OpportunityRequirements } from "@shared/content";
import { createAppContext } from "@worker/context";
import {
  applications,
  consentRecords,
  facts,
  member,
  opportunities,
  opportunityMatches,
  orgSettings,
} from "@worker/db/schema";
import type { Env } from "@worker/env";
import { AppError } from "@worker/lib/errors";
import { newId } from "@worker/lib/ids";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "../../../../test/worker/helpers";
import { type NormalizedFlag, pipelineDeps } from "./deps";
import { resumeAfterInfo } from "./index";

type Detail = ApplicationDto & {
  currentVersion: {
    id: string;
    versionNumber: number;
    content: ApplicationContent;
    authorType: string;
  } | null;
  versions: { id: string; versionNumber: number; authorType: string }[];
  flags: FlagDto[];
  citedFacts: { id: string }[];
  submissions: unknown[];
  opportunity: { id: string; title: string };
};

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

const report = (over: Partial<GroundingReport> = {}): GroundingReport => ({
  totalClaims: 2,
  factualClaims: 1,
  supported: 1,
  partiallySupported: 0,
  unsupported: 0,
  numericMismatches: 0,
  unconfirmedFactCitations: 0,
  gaps: 0,
  passed: true,
  verdicts: [],
  checkedAt: Date.now(),
  model: "fake",
  ...over,
});

const contentCiting = (
  factId: string,
  text = "SWIF trains 40 adults a year in construction trades.",
): ApplicationContent => ({
  sections: [
    {
      key: "need_statement",
      title: "Statement of need",
      paragraphs: [
        {
          id: "s1.p1",
          claims: [
            { id: "s1.p1.c1", text, kind: "factual", factIds: [factId] },
            {
              id: "s1.p1.c2",
              text: "We welcome the opportunity to partner.",
              kind: "framing",
              factIds: [],
            },
          ],
        },
      ],
      gaps: [],
    },
  ],
});

interface Setup {
  orgId: string;
  userId: string;
  oppId: string;
  factId: string;
}

async function seed(
  opts: {
    factStatus?: "confirmed" | "proposed";
    autopilot?: boolean;
    closeDate?: Date;
    ask?: number;
  } = {},
): Promise<Setup> {
  const t = await setupTenant("owner");
  const db = testDb();
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Gallup Community Foundation",
    title: "Workforce Pathways Grant",
    summary: "Training for trades careers.",
    awardCeilingCents: opts.ask ?? 500_000,
    closeDate: opts.closeDate ?? new Date(Date.now() + 30 * 86_400_000),
    submissionMethod: "email",
    submissionEmail: "grants@funder.example.org",
    requirements: REQUIREMENTS,
  });
  await db.insert(opportunityMatches).values({
    id: newId("mat"),
    orgId: t.orgId,
    opportunityId: oppId,
    fitScore: 90,
    likelihood: 0.3,
    suggestedAskCents: opts.ask ?? 500_000,
    status: "shortlisted",
  });
  const factId = newId("fct");
  await db.insert(facts).values({
    id: factId,
    orgId: t.orgId,
    category: "program",
    statement: "SWIF trains 40 adults a year in construction trades.",
    status: opts.factStatus ?? "confirmed",
    sourceType: "user_entered",
  });
  if (opts.autopilot) {
    await db
      .update(orgSettings)
      .set({ autopilotEnabled: true, reviewFirstSubmissionPerFunder: false })
      .where(eq(orgSettings.orgId, t.orgId));
    // Safety rail: autopilot never submits without the org's autopilot_submission consent.
    await db.insert(consentRecords).values({
      id: newId("cns"),
      orgId: t.orgId,
      userId: t.userId,
      scope: "autopilot_submission",
      policyVersion: "test",
      granted: true,
    });
  }
  return { orgId: t.orgId, userId: t.userId, oppId, factId };
}

async function addMember(orgId: string, role: "viewer" | "reviewer" | "editor") {
  const u = await createTestUser();
  await testDb()
    .insert(member)
    .values({
      id: newId("org").replace("org_", "mem_"),
      organizationId: orgId,
      userId: u.id,
      role,
    });
  return u.id;
}

let verifyFlags: NormalizedFlag[][] = [];
let draftFactId = "";
const spies = () => ({
  draft: vi.mocked(pipelineDeps.draft),
  verify: vi.mocked(pipelineDeps.verify),
  submit: vi.mocked(pipelineDeps.submit),
  gapFill: vi.mocked(pipelineDeps.createGapFillInterview),
  usage: vi.mocked(pipelineDeps.recordDraftUsage),
  canDraft: vi.mocked(pipelineDeps.assertCanDraft),
  reminders: vi.mocked(pipelineDeps.scheduleDeadlineReminders),
});

beforeEach(() => {
  verifyFlags = [];
  vi.spyOn(pipelineDeps, "ensureRequirements").mockResolvedValue(REQUIREMENTS);
  vi.spyOn(pipelineDeps, "factsForDrafting").mockImplementation(async (_ctx, orgId) =>
    testDb().select().from(facts).where(eq(facts.orgId, orgId)).all(),
  );
  vi.spyOn(pipelineDeps, "factsByIds").mockImplementation(async (_ctx, orgId) =>
    testDb().select().from(facts).where(eq(facts.orgId, orgId)).all(),
  );
  vi.spyOn(pipelineDeps, "draft").mockImplementation(async (_ctx, input) => ({
    content: contentCiting(draftFactId || (input.facts[0]?.id ?? "fct_missing")),
    executiveSummary: "SWIF requests support for its trades training program.",
    keyPoints: ["40 adults trained per year"],
    model: "fake-llm",
    promptVersion: "test",
  }));
  vi.spyOn(pipelineDeps, "redraftSection").mockImplementation(async (_ctx, input) => ({
    content: input.previous ?? { sections: [] },
    model: "fake-llm",
    promptVersion: "test",
  }));
  vi.spyOn(pipelineDeps, "verify").mockImplementation(async () => {
    const flags = verifyFlags.shift() ?? [];
    const blockers = flags.filter((f) => f.severity === "blocker").length;
    return { report: report({ passed: blockers === 0, unsupported: blockers }), flags };
  });
  vi.spyOn(pipelineDeps, "createGapFillInterview").mockResolvedValue(undefined);
  vi.spyOn(pipelineDeps, "submit").mockImplementation(async (_ctx, input) => {
    await testDb()
      .update(applications)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(applications.id, input.applicationId));
  });
  vi.spyOn(pipelineDeps, "scheduleDeadlineReminders").mockResolvedValue(undefined);
  vi.spyOn(pipelineDeps, "assertCanDraft").mockResolvedValue(undefined);
  vi.spyOn(pipelineDeps, "recordDraftUsage").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  draftFactId = "";
});

async function create(s: Setup, as = s.userId, body: Record<string, unknown> = {}) {
  return api(`/api/orgs/${s.orgId}/applications`, {
    method: "POST",
    as,
    json: { opportunityId: s.oppId, ...body },
  });
}

async function detail(s: Setup, id: string): Promise<Detail> {
  const res = await api(`/api/orgs/${s.orgId}/applications/${id}`, { as: s.userId });
  expect(res.status).toBe(200);
  return res.json();
}

const decide = (s: Setup, id: string, as: string, json: Record<string, unknown>) =>
  api(`/api/orgs/${s.orgId}/reviews/${id}/decision`, { method: "POST", as, json });

const unsupportedBlocker: NormalizedFlag = {
  severity: "blocker",
  kind: "unsupported_claim",
  sectionKey: "need_statement",
  claimId: "s1.p1.c1",
  message: "The cited fact does not support this claim.",
  suggestedQuestion: null,
};

describe("POST /applications (inline pipeline)", () => {
  it("drafts, verifies and routes to one_click review with flags", async () => {
    const s = await seed();
    verifyFlags = [
      [
        {
          severity: "warning",
          kind: "length_limit",
          sectionKey: "need_statement",
          claimId: null,
          message: "Close to the word limit",
          suggestedQuestion: null,
        },
      ],
    ];
    const res = await create(s);
    expect(res.status).toBe(201);
    const app = (await res.json()) as ApplicationDto;
    expect(app.status).toBe("in_review");
    expect(app.reviewTier).toBe("one_click");
    expect(app.reviewTierReason).toMatch(/Autopilot is turned off/);
    expect(app.requestedAmountCents).toBe(500_000);

    const { draft, usage, canDraft, reminders } = spies();
    expect(canDraft).toHaveBeenCalled();
    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft.mock.calls[0]?.[1].requirements.sections[0]?.key).toBe("need_statement");
    expect(draft.mock.calls[0]?.[1].facts.map((f) => f.id)).toEqual([s.factId]);
    expect(usage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subjectId: app.id }),
    );
    expect(reminders).toHaveBeenCalledTimes(1);

    const d = await detail(s, app.id);
    expect(d.opportunity.id).toBe(s.oppId);
    expect(d.currentVersion?.versionNumber).toBe(1);
    expect(d.currentVersion?.authorType).toBe("system");
    expect(d.versions).toHaveLength(1);
    expect(d.flags.map((f) => f.kind)).toEqual(["length_limit"]);
    expect(d.citedFacts.map((f) => f.id)).toEqual([s.factId]);

    const list = await api(`/api/orgs/${s.orgId}/applications?status=in_review`, { as: s.userId });
    const items = (
      (await list.json()) as { items: (ApplicationDto & { opportunity: { title: string } })[] }
    ).items;
    expect(items.map((i) => i.id)).toEqual([app.id]);
    expect(items[0]?.opportunity.title).toBe("Workforce Pathways Grant");

    const cost = await api(`/api/orgs/${s.orgId}/applications/${app.id}/cost`, { as: s.userId });
    expect(await cost.json()).toEqual({ costMicros: 0, calls: 0 });
  });

  it("rejects a duplicate active application with 409 and unknown opportunities with 404", async () => {
    const s = await seed();
    expect((await create(s)).status).toBe(201);
    expect((await create(s)).status).toBe(409);
    const missing = await create(s, s.userId, { opportunityId: "opp_nope" });
    expect(missing.status).toBe(404);
  });

  it("returns 402 when the plan cannot draft", async () => {
    const s = await seed();
    vi.mocked(pipelineDeps.assertCanDraft).mockRejectedValue(
      new AppError(402, "payment_required", "Choose a plan to start drafting applications."),
    );
    const res = await create(s);
    expect(res.status).toBe(402);
  });

  it("marks the application failed (not 500) when drafting throws", async () => {
    const s = await seed();
    vi.mocked(pipelineDeps.draft).mockRejectedValue(new Error("model overloaded"));
    const res = await create(s);
    expect(res.status).toBe(201);
    const app = (await res.json()) as ApplicationDto;
    expect(app.status).toBe("failed");
    expect(app.lastError).toMatch(/model overloaded/);
  });
});

describe("review routing + one-click approval", () => {
  it("blockers force full_review; approval is refused until resolved, then submits", async () => {
    const s = await seed();
    verifyFlags = [[unsupportedBlocker]];
    const app = (await (await create(s)).json()) as ApplicationDto;
    expect(app.reviewTier).toBe("full_review");
    expect(app.reviewTierReason).toMatch(/1 blocking flag/);

    const blocked = await decide(s, app.id, s.userId, { decision: "approved" });
    expect(blocked.status).toBe(409);

    const d = await detail(s, app.id);
    const flagId = d.flags[0]?.id as string;
    const resolved = await api(
      `/api/orgs/${s.orgId}/applications/${app.id}/flags/${flagId}/resolve`,
      {
        method: "POST",
        as: s.userId,
        json: { resolution: "Reworded by hand; fact confirmed with program director." },
      },
    );
    expect(resolved.status).toBe(200);
    expect(((await resolved.json()) as FlagDto).status).toBe("resolved");
    const rerouted = await detail(s, app.id);
    expect(rerouted.reviewTier).toBe("one_click");

    const reviewerId = await addMember(s.orgId, "reviewer");
    const ok = await decide(s, app.id, reviewerId, { decision: "approved" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as ApplicationDto).status).toBe("submitted");
    const { submit } = spies();
    expect(submit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        applicationId: app.id,
        versionId: app.currentVersionId,
        submittedByType: "user",
        submittedBy: reviewerId,
        approvedBy: reviewerId,
      }),
    );
  });

  it("auto-submits when every autopilot gate passes", async () => {
    const s = await seed({ autopilot: true });
    const app = (await (await create(s)).json()) as ApplicationDto;
    expect(app.reviewTier).toBe("auto");
    expect(app.status).toBe("submitted");
    expect(spies().submit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ submittedByType: "autopilot" }),
    );
  });

  it("never auto-submits drafts citing unconfirmed facts", async () => {
    const s = await seed({ autopilot: true, factStatus: "proposed" });
    const app = (await (await create(s)).json()) as ApplicationDto;
    expect(app.reviewTier).toBe("one_click");
    expect(app.reviewTierReason).toMatch(/unconfirmed facts/);
    expect(spies().submit).not.toHaveBeenCalled();
  });

  it("never auto-submits a human-edited draft, even once every other gate passes", async () => {
    const s = await seed({ autopilot: true });
    verifyFlags = [[unsupportedBlocker]]; // first draft: full_review; the edit then verifies clean
    const app = (await (await create(s)).json()) as ApplicationDto;
    expect(app.reviewTier).toBe("full_review");

    const paragraphs = [
      {
        id: "s1.p1",
        claims: [
          {
            id: "s1.p1.c1",
            text: "SWIF trains 40 adults a year in construction trades.",
            kind: "factual",
            factIds: [s.factId],
          },
        ],
      },
    ];
    const res = await api(`/api/orgs/${s.orgId}/applications/${app.id}/sections/need_statement`, {
      method: "PATCH",
      as: s.userId,
      json: { paragraphs },
    });
    expect(res.status).toBe(200);
    const edited = (await res.json()) as ApplicationDto;
    expect(edited.reviewTier).toBe("one_click");
    expect(edited.status).toBe("in_review");
    expect(edited.reviewTierReason).toMatch(/A person edited this draft/);
    expect(spies().submit).not.toHaveBeenCalled();

    // A system redraft after the human edit still needs a human approval.
    const regen = await api(`/api/orgs/${s.orgId}/applications/${app.id}/regenerate`, {
      method: "POST",
      as: s.userId,
      json: {},
    });
    expect(regen.status).toBe(200);
    const redrafted = (await regen.json()) as ApplicationDto;
    expect((await detail(s, app.id)).currentVersion?.authorType).toBe("system");
    expect(redrafted.reviewTier).toBe("one_click");
    expect(redrafted.status).toBe("in_review");
    expect(spies().submit).not.toHaveBeenCalled();

    const ok = await decide(s, app.id, s.userId, { decision: "approved" });
    expect(((await ok.json()) as ApplicationDto).status).toBe("submitted");
    expect(spies().submit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ submittedByType: "user", approvedBy: s.userId }),
    );
  });

  it("changes_requested redrafts with the reviewer's comments and returns to review", async () => {
    const s = await seed();
    const app = (await (await create(s)).json()) as ApplicationDto;
    const missingComments = await decide(s, app.id, s.userId, { decision: "changes_requested" });
    expect(missingComments.status).toBe(400);
    const res = await decide(s, app.id, s.userId, {
      decision: "changes_requested",
      comments: "Lead with the apprenticeship outcomes.",
    });
    expect(res.status).toBe(200);
    const after = (await res.json()) as ApplicationDto;
    expect(after.status).toBe("in_review");
    const { draft } = spies();
    expect(draft).toHaveBeenCalledTimes(2);
    expect(draft.mock.calls[1]?.[1].reviewerNotes).toBe("Lead with the apprenticeship outcomes.");
    expect(draft.mock.calls[1]?.[1].previous?.sections).toHaveLength(1);
    const d = await detail(s, app.id);
    expect(d.currentVersion?.versionNumber).toBe(2);
  });

  it("rejected withdraws the application", async () => {
    const s = await seed();
    const app = (await (await create(s)).json()) as ApplicationDto;
    const res = await decide(s, app.id, s.userId, { decision: "rejected", comments: "Not a fit" });
    expect(((await res.json()) as ApplicationDto).status).toBe("withdrawn");
  });
});

describe("needs_info", () => {
  it("opens a gap-fill interview and resumes with a redraft once info is provided", async () => {
    const s = await seed();
    verifyFlags = [
      [
        {
          severity: "blocker",
          kind: "missing_info",
          sectionKey: "need_statement",
          claimId: null,
          message: "No data on local unemployment.",
          suggestedQuestion: "What is the unemployment rate in McKinley County?",
        },
      ],
      [],
    ];
    const app = (await (await create(s)).json()) as ApplicationDto;
    expect(app.status).toBe("needs_info");
    expect(spies().gapFill).toHaveBeenCalledWith(expect.anything(), {
      orgId: s.orgId,
      applicationId: app.id,
      questions: ["What is the unemployment rate in McKinley County?"],
    });

    const ctx = createAppContext(env as Env);
    const resumed = await resumeAfterInfo(ctx, { orgId: s.orgId, applicationId: app.id });
    expect(resumed.status).toBe("in_review");
    expect(spies().draft).toHaveBeenCalledTimes(2);
    const d = await detail(s, app.id);
    expect(d.versions).toHaveLength(2);
    expect(d.flags).toHaveLength(0); // flags shown are the current version's
  });

  it("resolving the last missing-info blocker moves the application on without a redraft", async () => {
    const s = await seed();
    verifyFlags = [
      [
        {
          severity: "blocker",
          kind: "missing_info",
          sectionKey: "need_statement",
          claimId: null,
          message: "Missing budget detail",
          suggestedQuestion: "What will the funds buy?",
        },
      ],
    ];
    const app = (await (await create(s)).json()) as ApplicationDto;
    const d = await detail(s, app.id);
    await api(`/api/orgs/${s.orgId}/applications/${app.id}/flags/${d.flags[0]?.id}/resolve`, {
      method: "POST",
      as: s.userId,
      json: { resolution: "Not required by this funder" },
    });
    const after = await detail(s, app.id);
    expect(after.status).toBe("in_review");
    expect(spies().draft).toHaveBeenCalledTimes(1);
  });
});

describe("edits, outcome, feedback, queue", () => {
  it("PATCH section creates a user version and re-verifies", async () => {
    const s = await seed();
    const app = (await (await create(s)).json()) as ApplicationDto;
    const paragraphs = [
      {
        id: "s1.p1",
        claims: [
          {
            id: "s1.p1.c1",
            text: "SWIF trains 40 adults a year in construction trades.",
            kind: "factual",
            factIds: [s.factId],
          },
        ],
      },
    ];
    const res = await api(`/api/orgs/${s.orgId}/applications/${app.id}/sections/need_statement`, {
      method: "PATCH",
      as: s.userId,
      json: { paragraphs },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ApplicationDto).status).toBe("in_review");
    const d = await detail(s, app.id);
    expect(d.currentVersion?.versionNumber).toBe(2);
    expect(d.currentVersion?.authorType).toBe("user");
    expect(d.currentVersion?.content.sections[0]?.paragraphs[0]?.claims).toHaveLength(1);
    expect(spies().verify).toHaveBeenCalledTimes(2);

    const bad = await api(`/api/orgs/${s.orgId}/applications/${app.id}/sections/nope`, {
      method: "PATCH",
      as: s.userId,
      json: { paragraphs },
    });
    expect(bad.status).toBe(404);
  });

  it("regenerates a section through the drafter", async () => {
    const s = await seed();
    const app = (await (await create(s)).json()) as ApplicationDto;
    const res = await api(`/api/orgs/${s.orgId}/applications/${app.id}/regenerate`, {
      method: "POST",
      as: s.userId,
      json: { sectionKey: "need_statement" },
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(pipelineDeps.redraftSection)).toHaveBeenCalledTimes(1);
    expect((await detail(s, app.id)).versions).toHaveLength(2);
  });

  it("records awarded outcomes after submission", async () => {
    const s = await seed({ autopilot: true });
    const app = (await (await create(s)).json()) as ApplicationDto;
    const early = await seed();
    const pending = (await (await create(early)).json()) as ApplicationDto;
    const refused = await api(`/api/orgs/${early.orgId}/applications/${pending.id}/outcome`, {
      method: "POST",
      as: early.userId,
      json: { outcome: "awarded" },
    });
    expect(refused.status).toBe(409);

    const res = await api(`/api/orgs/${s.orgId}/applications/${app.id}/outcome`, {
      method: "POST",
      as: s.userId,
      json: { outcome: "awarded", awardedAmountCents: 450_000, notes: "Award letter received" },
    });
    expect(res.status).toBe(200);
    const after = (await res.json()) as ApplicationDto;
    expect(after.status).toBe("awarded");
    expect(after.awardedAmountCents).toBe(450_000);
  });

  it("withdraws", async () => {
    const s = await seed();
    const app = (await (await create(s)).json()) as ApplicationDto;
    const res = await api(`/api/orgs/${s.orgId}/applications/${app.id}/withdraw`, {
      method: "POST",
      as: s.userId,
    });
    expect(((await res.json()) as ApplicationDto).status).toBe("withdrawn");
    // A withdrawn application no longer blocks a new one for the same opportunity.
    expect((await create(s)).status).toBe(201);
  });

  it("stores and lists 1-5 feedback", async () => {
    const s = await seed();
    const app = (await (await create(s)).json()) as ApplicationDto;
    const url = `/api/orgs/${s.orgId}/reviews/${app.id}/feedback`;
    const bad = await api(url, { method: "POST", as: s.userId, json: { rating: 6 } });
    expect(bad.status).toBe(400);
    const ok = await api(url, {
      method: "POST",
      as: s.userId,
      json: {
        rating: 5,
        comment: "Exceptionally good",
        sectionKey: "need_statement",
        tags: ["tone"],
      },
    });
    expect(ok.status).toBe(201);
    const fb = (await ok.json()) as FeedbackDto;
    expect(fb.versionId).toBe(app.currentVersionId);
    const list = (await (await api(url, { as: s.userId })).json()) as { items: FeedbackDto[] };
    expect(list.items.map((f) => f.rating)).toEqual([5]);
  });

  it("queues in_review applications by deadline with flag counts", async () => {
    const s = await seed({ closeDate: new Date(Date.now() + 60 * 86_400_000) });
    verifyFlags = [[unsupportedBlocker]];
    const later = (await (await create(s)).json()) as ApplicationDto;
    const soonOpp = newId("opp");
    await testDb()
      .insert(opportunities)
      .values({
        id: soonOpp,
        source: "manual",
        sourceId: soonOpp,
        funderName: "Other Funder",
        title: "Soon Grant",
        closeDate: new Date(Date.now() + 5 * 86_400_000),
        requirements: REQUIREMENTS,
      });
    const soon = (await (
      await create(s, s.userId, { opportunityId: soonOpp })
    ).json()) as ApplicationDto;
    const res = await api(`/api/orgs/${s.orgId}/reviews/queue`, { as: s.userId });
    const items = (
      (await res.json()) as {
        items: (ApplicationDto & { openBlockers: number; openWarnings: number })[];
      }
    ).items;
    expect(items.map((i) => i.id)).toEqual([soon.id, later.id]);
    expect(items[1]?.openBlockers).toBe(1);
    expect(items[0]?.openBlockers).toBe(0);
  });
});

describe("roles and tenancy", () => {
  it("viewers and reviewers cannot create; viewers cannot decide; reviewers can", async () => {
    const s = await seed();
    const viewer = await addMember(s.orgId, "viewer");
    const reviewer = await addMember(s.orgId, "reviewer");
    expect((await create(s, viewer)).status).toBe(403);
    expect((await create(s, reviewer)).status).toBe(403);
    const app = (await (await create(s)).json()) as ApplicationDto;
    expect((await decide(s, app.id, viewer, { decision: "approved" })).status).toBe(403);
    const viewerList = await api(`/api/orgs/${s.orgId}/applications`, { as: viewer });
    expect(viewerList.status).toBe(200);
    expect((await decide(s, app.id, reviewer, { decision: "approved" })).status).toBe(200);
  });

  it("hides other tenants' applications (404)", async () => {
    const a = await seed();
    const app = (await (await create(a)).json()) as ApplicationDto;
    const b = await setupTenant("owner");
    const base = `/api/orgs/${b.orgId}`;
    expect((await api(`${base}/applications/${app.id}`, { as: b.userId })).status).toBe(404);
    expect((await api(`${base}/applications/${app.id}/cost`, { as: b.userId })).status).toBe(404);
    expect(
      (
        await api(`${base}/reviews/${app.id}/decision`, {
          method: "POST",
          as: b.userId,
          json: { decision: "approved" },
        })
      ).status,
    ).toBe(404);
    expect((await api(`${base}/reviews/${app.id}/feedback`, { as: b.userId })).status).toBe(404);
    const list = (await (await api(`${base}/applications`, { as: b.userId })).json()) as {
      items: unknown[];
    };
    expect(list.items).toHaveLength(0);
    // and a non-member cannot reach org A at all
    expect((await api(`/api/orgs/${a.orgId}/applications`, { as: b.userId })).status).toBe(404);
  });

  it("cannot draft against another org's private opportunity", async () => {
    const a = await seed();
    const b = await setupTenant("owner");
    const priv = newId("opp");
    await testDb().insert(opportunities).values({
      id: priv,
      source: "url_import",
      sourceId: priv,
      funderName: "Private",
      title: "Private RFP",
      privateToOrgId: b.orgId,
    });
    const res = await create(a, a.userId, { opportunityId: priv });
    expect(res.status).toBe(404);
  });
});
