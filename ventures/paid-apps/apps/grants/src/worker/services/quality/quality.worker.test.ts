// Funder rubric scoring end to end, inline pipeline with the real drafting / grounding / quality
// modules and the FakeLlm (FAKE_EXTERNALS=true): the report is stored after verification, applying
// suggestions creates a new re-verified version, and a failing review never blocks the pipeline.
import { env } from "cloudflare:workers";
import type { ApplicationDto } from "@shared/api/types";
import type { QualityReportDto } from "@shared/quality";
import { applicationVersions, facts, opportunities, subscriptions } from "@worker/db/schema";
import { applicationQuality } from "@worker/db/schema/quality";
import { newId } from "@worker/lib/ids";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { api, setupTenant, testDb } from "../../../../test/worker/helpers";
import { qualityDeps } from "../pipeline/quality-step";

// db/schema/index.ts does not export ./quality yet (integration pass), so the exported test DDL
// lacks this table: create it here, mirroring db/schema/quality.ts.
beforeAll(async () => {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS application_quality (
      version_id text PRIMARY KEY NOT NULL REFERENCES application_versions(id) ON DELETE cascade,
      org_id text NOT NULL REFERENCES organization(id) ON DELETE cascade,
      application_id text NOT NULL REFERENCES applications(id) ON DELETE cascade,
      report text NOT NULL,
      model text,
      created_at integer NOT NULL
    )`,
  ).run();
});

afterEach(() => vi.restoreAllMocks());

type Detail = ApplicationDto & {
  currentVersion: { id: string; groundingReport: unknown; changeNote: string | null } | null;
  versions: { id: string }[];
};

async function seed() {
  const t = await setupTenant("owner");
  const db = testDb();
  await db.insert(subscriptions).values({ orgId: t.orgId, planKey: "comp", status: "comp" });
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
    submissionMethod: "portal",
    submissionUrl: "https://funder.example.org/apply",
    requirements: {
      sections: [
        {
          key: "need_statement",
          title: "Statement of need",
          prompt: "Describe the need your construction training program addresses.",
          kind: "narrative",
          required: true,
          wordLimit: 300,
          charLimit: null,
          guidance:
            "Reviewers score the documented need in McKinley County. Reviewers score training outcomes for adults.",
        },
      ],
      attachments: [],
      eligibilityCriteria: [],
      submissionInstructions: "",
      complete: true,
    },
  });
  const factIds: string[] = [];
  for (const statement of [
    "Southwest Indian Foundation runs a construction trades training program in Gallup, New Mexico.",
    "The construction training program trained 42 adults in 2025.",
    "Southwest Indian Foundation serves Navajo and Zuni families in McKinley County.",
    "Training outcomes for adults include construction trade certificates.",
  ]) {
    const id = newId("fct");
    factIds.push(id);
    await db.insert(facts).values({
      id,
      orgId: t.orgId,
      category: "program",
      statement,
      sourceQuote: statement,
      status: "confirmed",
      sourceType: "user_entered",
    });
  }
  const res = await api(`/api/orgs/${t.orgId}/applications`, {
    method: "POST",
    as: t.userId,
    json: { opportunityId: oppId },
  });
  expect(res.status).toBe(201);
  const app = (await res.json()) as ApplicationDto;
  return { ...t, app, factIds };
}

const getQuality = (orgId: string, appId: string, as: string) =>
  api(`/api/orgs/${orgId}/applications/${appId}/quality`, { as });

describe("quality.rubric_review in the pipeline", () => {
  it("stores a rubric report after verification that cites only existing facts", async () => {
    const { orgId, userId, app, factIds } = await seed();
    expect(app.lastError).toBeNull();
    expect(["in_review", "needs_info"]).toContain(app.status);

    const res = await getQuality(orgId, app.id, userId);
    expect(res.status).toBe(200);
    const q = (await res.json()) as QualityReportDto;
    expect(q.versionId).toBe(app.currentVersionId);
    expect(q.current).toBe(true);
    const section = q.report.sections[0];
    expect(section?.status).toBe("scored");
    expect(section?.criteria.map((c) => c.criterion)).toEqual([
      "Reviewers score the documented need in McKinley County",
      "Reviewers score training outcomes for adults",
    ]);
    for (const c of section?.criteria ?? []) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(5);
      for (const s of c.suggestions) {
        expect(s.factIds.every((id) => factIds.includes(id))).toBe(true);
        if (s.kind === "missing_evidence") expect(s.question).toBeTruthy();
      }
    }
    expect(q.report.overallScore).toBe(section?.score);

    const row = await testDb()
      .select()
      .from(applicationQuality)
      .where(and(eq(applicationQuality.orgId, orgId), eq(applicationQuality.applicationId, app.id)))
      .all();
    expect(row).toHaveLength(1);
    expect(row[0]?.model).toBe("fake-llm");
  });

  it("applies chosen suggestions as a grounded redraft: new version, re-verified, re-scored", async () => {
    const { orgId, userId, app } = await seed();
    const q = (await (await getQuality(orgId, app.id, userId)).json()) as QualityReportDto;
    const suggestions = q.report.sections[0]?.criteria.flatMap((c) => c.suggestions) ?? [];
    const pick = suggestions.find((s) => s.kind !== "missing_evidence");
    expect(pick).toBeTruthy();

    const res = await api(`/api/orgs/${orgId}/applications/${app.id}/quality/apply`, {
      method: "POST",
      as: userId,
      json: { sectionKey: "need_statement", suggestionIds: [pick?.id] },
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as ApplicationDto;
    expect(updated.currentVersionId).not.toBe(app.currentVersionId);
    expect(updated.lastError).toBeNull();

    const detail = (await (
      await api(`/api/orgs/${orgId}/applications/${app.id}`, { as: userId })
    ).json()) as Detail;
    expect(detail.versions).toHaveLength(2);
    expect(detail.currentVersion?.groundingReport).toBeTruthy(); // re-verified
    expect(detail.currentVersion?.changeNote).toBe(
      'Applied 1 quality suggestion to "Statement of need"',
    );
    const version = await testDb()
      .select({ authorType: applicationVersions.authorType })
      .from(applicationVersions)
      .where(eq(applicationVersions.id, updated.currentVersionId ?? ""))
      .get();
    expect(version?.authorType).toBe("system");

    const again = (await (await getQuality(orgId, app.id, userId)).json()) as QualityReportDto;
    expect(again.versionId).toBe(updated.currentVersionId); // the new version was scored too
  });

  it("rejects missing_evidence and unknown suggestion ids for apply", async () => {
    const { orgId, userId, app } = await seed();
    const q = (await (await getQuality(orgId, app.id, userId)).json()) as QualityReportDto;
    const missing = q.report.sections[0]?.criteria
      .flatMap((c) => c.suggestions)
      .find((s) => s.kind === "missing_evidence");
    const apply = (ids: string[]) =>
      api(`/api/orgs/${orgId}/applications/${app.id}/quality/apply`, {
        method: "POST",
        as: userId,
        json: { sectionKey: "need_statement", suggestionIds: ids },
      });
    expect((await apply(["need_statement#c9.g9"])).status).toBe(400);
    if (missing) {
      expect((await apply([missing.id])).status).toBe(400);
      const interview = await api(`/api/orgs/${orgId}/applications/${app.id}/quality/interview`, {
        method: "POST",
        as: userId,
        json: { suggestionIds: [missing.id] },
      });
      expect(interview.status).toBe(201);
      expect(((await interview.json()) as { interviewId: string }).interviewId).toMatch(/^int_/);
    }
  });

  it("never blocks the pipeline when the review fails", async () => {
    vi.spyOn(qualityDeps, "review").mockRejectedValue(new Error("model unavailable"));
    const { orgId, userId, app } = await seed();
    expect(app.lastError).toBeNull();
    expect(["in_review", "needs_info"]).toContain(app.status);
    expect((await getQuality(orgId, app.id, userId)).status).toBe(404);
    const conflict = await api(`/api/orgs/${orgId}/applications/${app.id}/quality/apply`, {
      method: "POST",
      as: userId,
      json: { sectionKey: "need_statement", suggestionIds: ["need_statement#c1.g1"] },
    });
    expect(conflict.status).toBe(409);
  });

  it("is tenant-scoped: another org gets 404", async () => {
    const { orgId, app } = await seed();
    const other = await setupTenant("owner");
    expect((await getQuality(orgId, app.id, other.userId)).status).toBe(404);
    expect((await getQuality(other.orgId, app.id, other.userId)).status).toBe(404);
    const res = await api(`/api/orgs/${other.orgId}/applications/${app.id}/quality/apply`, {
      method: "POST",
      as: other.userId,
      json: { sectionKey: "need_statement", suggestionIds: ["need_statement#c1.g1"] },
    });
    expect(res.status).toBe(404);
  });
});
