// Automation levels end to end through the pipeline (inline, APP_ENV=test): routing under each level,
// safety rails loaded from D1, backward compatibility and the two-person rule. Cross-module calls
// go through `pipelineDeps`, stubbed like pipeline.worker.test.ts (submit marks the app submitted).
import type { ApplicationDto } from "@shared/api/types";
import type { ApplicationContent, GroundingReport, OpportunityRequirements } from "@shared/content";
import {
  applications,
  auditLog,
  consentRecords,
  documents,
  facts,
  member,
  opportunities,
  opportunityMatches,
  orgSettings,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "../../../../test/worker/helpers";
import { pipelineDeps } from "./deps";

const DAY = 86_400_000;

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

const passedReport = (): GroundingReport => ({
  totalClaims: 1,
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
});

const contentCiting = (factId: string): ApplicationContent => ({
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
              factIds: [factId],
            },
          ],
        },
      ],
      gaps: [],
    },
  ],
});

interface Seed {
  orgId: string;
  userId: string;
  oppId: string;
  factId: string;
}

async function seed(
  opts: {
    settings?: Partial<typeof orgSettings.$inferInsert>;
    consent?: boolean;
    ask?: number;
    likelihood?: number;
    closeDate?: Date;
    privateImport?: boolean;
    injectedSource?: boolean;
  } = {},
): Promise<Seed> {
  const t = await setupTenant("owner");
  const db = testDb();
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: opts.privateImport ? "url_import" : "manual",
    sourceId: oppId,
    privateToOrgId: opts.privateImport ? t.orgId : null,
    funderName: `Funder ${oppId}`,
    title: "Workforce Pathways Grant",
    awardCeilingCents: opts.ask ?? 500_000,
    closeDate: opts.closeDate ?? new Date(Date.now() + 30 * DAY),
    submissionMethod: "email",
    submissionEmail: "grants@funder.example.org",
    requirements: REQUIREMENTS,
  });
  await db.insert(opportunityMatches).values({
    id: newId("mat"),
    orgId: t.orgId,
    opportunityId: oppId,
    fitScore: 90,
    likelihood: opts.likelihood ?? 0.3,
    suggestedAskCents: opts.ask ?? 500_000,
    status: "shortlisted",
  });
  let docId: string | null = null;
  if (opts.injectedSource) {
    docId = newId("doc");
    await db.insert(documents).values({
      id: docId,
      orgId: t.orgId,
      title: "Annual report",
      kind: "annual_report",
      mimeType: "text/plain",
      sizeBytes: 10,
      sha256: "x",
      r2Key: `orgs/${t.orgId}/documents/${docId}/original`,
      status: "ready",
      safetyFlags: {
        injectionSuspected: true,
        injectionScore: 0.9,
        findings: [{ kind: "instruction_override", excerpt: "ignore previous instructions" }],
        version: "test",
        scannedAt: new Date().toISOString(),
      },
    });
  }
  const factId = newId("fct");
  await db.insert(facts).values({
    id: factId,
    orgId: t.orgId,
    category: "program",
    statement: "SWIF trains 40 adults a year in construction trades.",
    status: "confirmed",
    sourceType: docId ? "document" : "user_entered",
    sourceDocumentId: docId,
  });
  await db
    .update(orgSettings)
    .set({ reviewFirstSubmissionPerFunder: false, ...opts.settings })
    .where(eq(orgSettings.orgId, t.orgId));
  if (opts.consent ?? true) {
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

async function addMember(orgId: string, role: "reviewer" | "editor" | "admin") {
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

beforeEach(() => {
  vi.spyOn(pipelineDeps, "ensureRequirements").mockResolvedValue(REQUIREMENTS);
  vi.spyOn(pipelineDeps, "factsForDrafting").mockImplementation(async (_ctx, orgId) =>
    testDb().select().from(facts).where(eq(facts.orgId, orgId)).all(),
  );
  vi.spyOn(pipelineDeps, "factsByIds").mockImplementation(async (_ctx, orgId) =>
    testDb().select().from(facts).where(eq(facts.orgId, orgId)).all(),
  );
  vi.spyOn(pipelineDeps, "draft").mockImplementation(async (_ctx, input) => ({
    content: contentCiting(input.facts[0]?.id ?? "fct_missing"),
    executiveSummary: "SWIF requests support for its trades training program.",
    keyPoints: [],
    model: "fake-llm",
    promptVersion: "test",
  }));
  vi.spyOn(pipelineDeps, "verify").mockResolvedValue({ report: passedReport(), flags: [] });
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
});

async function create(s: Seed): Promise<ApplicationDto> {
  const res = await api(`/api/orgs/${s.orgId}/applications`, {
    method: "POST",
    as: s.userId,
    json: { opportunityId: s.oppId },
  });
  expect(res.status).toBe(201);
  return res.json();
}

const decide = (s: Seed, id: string, as: string) =>
  api(`/api/orgs/${s.orgId}/reviews/${id}/decision`, {
    method: "POST",
    as,
    json: { decision: "approved" },
  });

const routedAudit = (orgId: string, applicationId: string) =>
  testDb()
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.orgId, orgId),
        eq(auditLog.targetId, applicationId),
        eq(auditLog.action, "application.routed"),
      ),
    )
    .get();

describe("routing under automation levels", () => {
  it.each([
    ["manual", false, "full_review"],
    ["assisted", false, "one_click"],
    ["prepared", false, "one_click"],
    ["supervised", true, "auto"],
    ["full", true, "auto"],
  ] as const)("%s routes a small, clean grant to %s", async (level, autopilotEnabled, tier) => {
    const s = await seed({ settings: { automationLevel: level, autopilotEnabled } });
    const app = await create(s);
    expect(app.reviewTier).toBe(tier);
    expect(app.status).toBe(tier === "auto" ? "submitted" : "in_review");
    const audit = await routedAudit(s.orgId, app.id);
    expect(audit?.actorType).toBe(tier === "auto" ? "autopilot" : "system");
    expect(audit?.metadata).toMatchObject({ tier, automationLevel: level });
  });

  it("full auto-submits a large, high-likelihood ask that supervised sends to full review", async () => {
    const big = { ask: 25_000_000, likelihood: 0.8 };
    const sup = await seed({
      ...big,
      settings: { automationLevel: "supervised", autopilotEnabled: true },
    });
    expect((await create(sup)).reviewTier).toBe("full_review");
    const full = await seed({
      ...big,
      settings: { automationLevel: "full", autopilotEnabled: true },
    });
    const app = await create(full);
    expect(app.reviewTier).toBe("auto");
    expect(app.status).toBe("submitted");
    expect(vi.mocked(pipelineDeps.submit)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ applicationId: app.id, submittedByType: "autopilot" }),
    );
  });

  it("requireSubmissionApproval keeps supervised from auto-submitting", async () => {
    const s = await seed({
      settings: {
        automationLevel: "supervised",
        autopilotEnabled: true,
        requireSubmissionApproval: true,
      },
    });
    const app = await create(s);
    expect(app.reviewTier).toBe("one_click");
    expect(app.reviewTierReason).toMatch(/Submission approval is required/);
    expect(vi.mocked(pipelineDeps.submit)).not.toHaveBeenCalled();
  });
});

describe("safety rails loaded from D1 (full autopilot)", () => {
  const full = { automationLevel: "full" as const, autopilotEnabled: true };
  it.each([
    ["no autopilot_submission consent", { consent: false }, /autopilot submission consent/],
    ["a passed deadline", { closeDate: new Date(Date.now() - DAY) }, /deadline has passed/],
    [
      "an unverified (imported) funder email",
      { privateImport: true },
      /email address is not verified/,
    ],
    [
      "an injection warning on a source document",
      { injectedSource: true },
      /prompt-injection warning/,
    ],
  ] as const)("never auto-submits with %s", async (_name, opts, reason) => {
    const s = await seed({ ...opts, settings: full });
    const app = await create(s);
    expect(app.reviewTier).not.toBe("auto");
    expect(app.reviewTierReason).toMatch(reason);
    expect(vi.mocked(pipelineDeps.submit)).not.toHaveBeenCalled();
  });

  it("a revoked consent wins over an earlier grant", async () => {
    const s = await seed({ settings: full });
    await testDb()
      .insert(consentRecords)
      .values({
        id: newId("cns"),
        orgId: s.orgId,
        userId: s.userId,
        scope: "autopilot_submission",
        policyVersion: "test",
        granted: false,
        createdAt: new Date(Date.now() + 1000),
      });
    expect((await create(s)).reviewTier).toBe("one_click");
  });
});

describe("backward compatibility", () => {
  it("autopilotEnabled=true with no level behaves as supervised", async () => {
    const s = await seed({ settings: { automationLevel: null, autopilotEnabled: true } });
    const app = await create(s);
    expect(app.reviewTier).toBe("auto");
    expect((await routedAudit(s.orgId, app.id))?.metadata).toMatchObject({
      automationLevel: "supervised",
      automationSource: "legacy",
    });
    // ...and a large ask still goes to full review, as before.
    const big = await seed({
      ask: 25_000_000,
      settings: { automationLevel: null, autopilotEnabled: true },
    });
    expect((await create(big)).reviewTier).toBe("full_review");
  });

  it("autopilotEnabled=false with no level behaves as prepared", async () => {
    const s = await seed({ settings: { automationLevel: null, autopilotEnabled: false } });
    const app = await create(s);
    expect(app.reviewTier).toBe("one_click");
    expect(app.reviewTierReason).toMatch(/Autopilot is turned off/);
  });
});

describe("two-person rule", () => {
  it("needs two different reviewers before submitting; the same one cannot approve twice", async () => {
    const s = await seed({
      ask: 5_000_000,
      settings: {
        automationLevel: "prepared",
        autopilotEnabled: false,
        twoPersonRuleAboveCents: 1_000_000,
      },
    });
    const app = await create(s);
    expect(app.status).toBe("in_review");
    expect(app.reviewTierReason).toMatch(/Two different reviewers must approve/);
    const a = await addMember(s.orgId, "reviewer");
    const b = await addMember(s.orgId, "reviewer");

    const first = await decide(s, app.id, a);
    expect(first.status).toBe(200);
    expect(((await first.json()) as ApplicationDto).status).toBe("in_review");
    expect(vi.mocked(pipelineDeps.submit)).not.toHaveBeenCalled();

    const again = await decide(s, app.id, a);
    expect(again.status).toBe(409);
    expect(vi.mocked(pipelineDeps.submit)).not.toHaveBeenCalled();

    const second = await decide(s, app.id, b);
    expect(second.status).toBe(200);
    expect(((await second.json()) as ApplicationDto).status).toBe("submitted");
    expect(vi.mocked(pipelineDeps.submit)).toHaveBeenCalledTimes(1);
  });

  it("does not apply at or below the threshold", async () => {
    const s = await seed({
      ask: 1_000_000,
      settings: {
        automationLevel: "prepared",
        autopilotEnabled: false,
        twoPersonRuleAboveCents: 1_000_000,
      },
    });
    const app = await create(s);
    const a = await addMember(s.orgId, "reviewer");
    const res = await decide(s, app.id, a);
    expect(((await res.json()) as ApplicationDto).status).toBe("submitted");
  });
});
