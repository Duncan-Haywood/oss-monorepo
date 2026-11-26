// Regression tests for D1's 100-bound-parameter limit (local D1 enforces it too: "too many SQL
// variables"). Each test builds data past the size at which an unchunked statement used to fail.
import { env } from "cloudflare:workers";
import type { ApplicationContent, GroundingReport, OpportunityRequirements } from "@shared/content";
import { createAppContext } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  facts,
  member,
  opportunities,
  organization,
  user,
} from "@worker/db/schema";
import { chunk } from "@worker/lib/chunk";
import { newId } from "@worker/lib/ids";
import { orgsWhereLastOwner } from "@worker/services/auth/account";
import { type NormalizedFlag, pipelineDeps } from "@worker/services/pipeline/deps";
import { stepRoute, stepVerify } from "@worker/services/pipeline/steps";
import { buildOrgExport } from "@worker/services/privacy/export";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setupTenant, testDb } from "./helpers";

const REQUIREMENTS: OpportunityRequirements = {
  sections: [
    {
      key: "need",
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

/** One claim per fact id, so the content cites every id. */
const contentCiting = (factIds: string[]): ApplicationContent => ({
  sections: [
    {
      key: "need",
      title: "Statement of need",
      paragraphs: [
        {
          id: "s1.p1",
          claims: factIds.map((id, i) => ({
            id: `s1.p1.c${i}`,
            text: `Claim ${i}`,
            kind: "factual" as const,
            factIds: [id],
          })),
        },
      ],
      gaps: [],
    },
  ],
});

async function seedOpportunity() {
  const id = newId("opp");
  await testDb().insert(opportunities).values({
    id,
    source: "manual",
    sourceId: id,
    funderName: "Gallup Community Foundation",
    title: "Workforce Pathways Grant",
    submissionMethod: "email",
    submissionEmail: "grants@funder.example.org",
    requirements: REQUIREMENTS,
  });
  return id;
}

async function seedFacts(orgId: string, n: number) {
  const db = testDb();
  const ids = Array.from({ length: n }, () => newId("fct"));
  // One statement per row (a batch) so the seeding itself stays under the parameter limit.
  for (const part of chunk(ids, 200)) {
    const [first, ...rest] = part.map((id) =>
      db.insert(facts).values({
        id,
        orgId,
        category: "program",
        statement: `Fact ${id}`,
        status: "confirmed",
        sourceType: "user_entered",
      }),
    );
    if (first) await db.batch([first, ...rest]);
  }
  return ids;
}

async function seedApplication(
  orgId: string,
  opportunityId: string,
  content: ApplicationContent,
  opts: { status?: "verifying" | "in_review"; report?: GroundingReport | null } = {},
) {
  const db = testDb();
  const applicationId = newId("app");
  const versionId = newId("ver");
  await db.insert(applications).values({
    id: applicationId,
    orgId,
    opportunityId,
    title: "Workforce Pathways Grant",
    status: opts.status ?? "verifying",
  });
  await db.insert(applicationVersions).values({
    id: versionId,
    orgId,
    applicationId,
    versionNumber: 1,
    content,
    authorType: "system",
    groundingReport: opts.report ?? null,
  });
  await db
    .update(applications)
    .set({ currentVersionId: versionId })
    .where(eq(applications.id, applicationId));
  return { applicationId, versionId };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("D1 bound-parameter limit", () => {
  it("stepVerify stores 12 flags (12 params per row) and resolves 120 cited facts", async () => {
    const t = await setupTenant();
    const oppId = await seedOpportunity();
    const factIds = await seedFacts(t.orgId, 120);
    const { applicationId, versionId } = await seedApplication(
      t.orgId,
      oppId,
      contentCiting(factIds),
    );
    const flags: NormalizedFlag[] = Array.from({ length: 12 }, (_, i) => ({
      severity: "warning",
      kind: "length_limit",
      sectionKey: "need",
      claimId: `s1.p1.c${i}`,
      message: `Warning ${i}`,
      suggestedQuestion: null,
    }));
    const verify = vi
      .spyOn(pipelineDeps, "verify")
      .mockResolvedValue({ report: passedReport(), flags });

    const ctx = createAppContext(env);
    const ids = { orgId: t.orgId, applicationId };
    const res = await stepVerify(ctx, ids, versionId);
    expect(res.status).toBe("verifying");
    expect(verify.mock.calls[0]?.[1].facts).toHaveLength(120);

    const stored = await testDb()
      .select()
      .from(applicationFlags)
      .where(and(eq(applicationFlags.orgId, t.orgId), eq(applicationFlags.versionId, versionId)))
      .all();
    expect(stored).toHaveLength(12);
    expect(new Set(stored.map((f) => f.id)).size).toBe(12);
    expect(stored.every((f) => f.applicationId === applicationId)).toBe(true);

    // A retry replaces the flags rather than duplicating them.
    await testDb()
      .update(applicationVersions)
      .set({ groundingReport: null })
      .where(eq(applicationVersions.id, versionId));
    await stepVerify(ctx, ids, versionId);
    const again = await testDb()
      .select({ id: applicationFlags.id })
      .from(applicationFlags)
      .where(eq(applicationFlags.versionId, versionId))
      .all();
    expect(again).toHaveLength(12);
  });

  it("stepRoute counts unconfirmed citations across 120 cited facts", async () => {
    const t = await setupTenant();
    const oppId = await seedOpportunity();
    const factIds = await seedFacts(t.orgId, 120);
    // Make one cited fact unconfirmed: the draft must not be auto-approved.
    await testDb()
      .update(facts)
      .set({ status: "proposed" })
      .where(eq(facts.id, factIds[110] ?? ""));
    const { applicationId } = await seedApplication(t.orgId, oppId, contentCiting(factIds), {
      report: passedReport(),
    });
    const ctx = createAppContext(env);
    const res = await stepRoute(ctx, { orgId: t.orgId, applicationId });
    expect(res.skipped).toBe(false);
    expect(res.status).toBe("in_review");
  });

  it("GET /applications/:id returns 120 cited facts", async () => {
    const t = await setupTenant();
    const oppId = await seedOpportunity();
    const factIds = await seedFacts(t.orgId, 120);
    const { applicationId } = await seedApplication(t.orgId, oppId, contentCiting(factIds), {
      status: "in_review",
      report: passedReport(),
    });
    const res = await api(`/api/orgs/${t.orgId}/applications/${applicationId}`, { as: t.userId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { citedFacts: { id: string }[] };
    expect(new Set(body.citedFacts.map((f) => f.id))).toEqual(new Set(factIds));
  });

  it("GET /reviews/queue counts flags for 120 applications in review", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    const oppId = await seedOpportunity();
    const db = testDb();
    const apps = Array.from({ length: 120 }, (_, i) => ({
      applicationId: newId("app"),
      versionId: newId("ver"),
      status: i % 2 === 0 ? ("in_review" as const) : ("changes_requested" as const),
    }));
    for (const part of chunk(apps, 100)) {
      const [first, ...rest] = part.flatMap((a) => [
        db.insert(applications).values({
          id: a.applicationId,
          orgId: t.orgId,
          opportunityId: oppId,
          title: "Workforce Pathways Grant",
          status: a.status,
        }),
        db.insert(applicationVersions).values({
          id: a.versionId,
          orgId: t.orgId,
          applicationId: a.applicationId,
          versionNumber: 1,
          content: contentCiting([]),
          authorType: "system",
        }),
        db
          .update(applications)
          .set({ currentVersionId: a.versionId })
          .where(eq(applications.id, a.applicationId)),
        db.insert(applicationFlags).values({
          id: newId("flg"),
          orgId: t.orgId,
          applicationId: a.applicationId,
          versionId: a.versionId,
          severity: "blocker",
          kind: "unsupported_claim",
          message: "Unsupported",
        }),
      ]);
      if (first) await db.batch([first, ...rest]);
    }
    const first = apps[0];
    if (!first) throw new Error("no apps");
    // Extra flags on the first app: one warning, one resolved blocker (not counted), and a flag on
    // an older version (not counted: only the current version's flags matter).
    const oldVersion = newId("ver");
    await db.insert(applicationVersions).values({
      id: oldVersion,
      orgId: t.orgId,
      applicationId: first.applicationId,
      versionNumber: 0,
      content: contentCiting([]),
      authorType: "system",
    });
    const flag = (over: Partial<typeof applicationFlags.$inferInsert>) =>
      db.insert(applicationFlags).values({
        id: newId("flg"),
        orgId: t.orgId,
        applicationId: first.applicationId,
        versionId: first.versionId,
        severity: "blocker",
        kind: "unsupported_claim",
        message: "x",
        ...over,
      });
    await db.batch([
      flag({ severity: "warning", kind: "length_limit" }),
      flag({ status: "resolved" }),
      flag({ versionId: oldVersion }),
    ]);
    // Another org's application in review is not listed or counted.
    const otherApp = await seedApplication(other.orgId, oppId, contentCiting([]), {
      status: "in_review",
    });
    await db.insert(applicationFlags).values({
      id: newId("flg"),
      orgId: other.orgId,
      applicationId: otherApp.applicationId,
      versionId: otherApp.versionId,
      severity: "blocker",
      kind: "unsupported_claim",
      message: "Other tenant",
    });

    const res = await api(`/api/orgs/${t.orgId}/reviews/queue`, { as: t.userId });
    expect(res.status).toBe(200);
    const items = (
      (await res.json()) as { items: { id: string; openBlockers: number; openWarnings: number }[] }
    ).items;
    expect(items).toHaveLength(120);
    expect(items.some((i) => i.id === otherApp.applicationId)).toBe(false);
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(first.applicationId)).toMatchObject({ openBlockers: 1, openWarnings: 1 });
    for (const a of apps.slice(1))
      expect(byId.get(a.applicationId)).toMatchObject({ openBlockers: 1, openWarnings: 0 });
  });

  it("privacy export includes every member of an org with 120 members", async () => {
    const t = await setupTenant();
    const db = testDb();
    const users = Array.from({ length: 120 }, (_, i) => {
      const id = newId("org").replace("org_", "usr_");
      return { id, name: `Member ${i}`, email: `${id}@example.test`, emailVerified: true };
    });
    for (const part of chunk(users, 100)) {
      const [first, ...rest] = part.flatMap((u) => [
        db.insert(user).values(u),
        db.insert(member).values({
          id: newId("org").replace("org_", "mem_"),
          organizationId: t.orgId,
          userId: u.id,
          role: "viewer",
        }),
      ]);
      if (first) await db.batch([first, ...rest]);
    }
    const { manifest } = await buildOrgExport(createAppContext(env), t.orgId);
    expect(manifest.tables.users).toBe(121);
  });

  it("orgsWhereLastOwner handles a user who owns 120 orgs", async () => {
    const t = await setupTenant();
    const db = testDb();
    const orgIds = Array.from({ length: 119 }, () => newId("org"));
    for (const part of chunk(orgIds, 100)) {
      const [first, ...rest] = part.flatMap((id) => [
        db.insert(organization).values({ id, name: "Owned Org", slug: id }),
        db.insert(member).values({
          id: newId("org").replace("org_", "mem_"),
          organizationId: id,
          userId: t.userId,
          role: "owner",
        }),
      ]);
      if (first) await db.batch([first, ...rest]);
    }
    const last = await orgsWhereLastOwner(createAppContext(env), t.userId);
    expect(new Set(last.map((o) => o.orgId))).toEqual(new Set([t.orgId, ...orgIds]));
  });
});
