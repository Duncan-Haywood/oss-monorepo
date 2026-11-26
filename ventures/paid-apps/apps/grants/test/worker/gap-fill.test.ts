// needs_info → gap-fill interview answered → completed → facts extracted → application re-drafted and
// re-verified. Real interview / knowledge / pipeline / drafting / grounding modules with the FakeLlm
// (FAKE_EXTERNALS=true); jobs run inline (APP_ENV=test).
import { env } from "cloudflare:workers";
import type { ApplicationDto, InterviewDto } from "@shared/api/types";
import { createAppContext } from "@worker/context";
import { applicationVersions, facts, interviews, opportunities } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { extractInterviewFacts } from "@worker/services/knowledge/jobs";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, setupTenant, testDb } from "./helpers";

type Detail = ApplicationDto & {
  currentVersion: { id: string; versionNumber: number; groundingReport: unknown } | null;
  versions: { id: string; versionNumber: number }[];
};

async function detail(orgId: string, userId: string, id: string) {
  const res = await api(`/api/orgs/${orgId}/applications/${id}`, { as: userId });
  expect(res.status).toBe(200);
  return (await res.json()) as Detail;
}

describe("gap-fill interview resumes the pipeline", () => {
  it("redrafts and re-verifies a needs_info application once its gap-fill interview completes", async () => {
    const t = await setupTenant("owner");
    const db = testDb();
    const oppId = newId("opp");
    await db.insert(opportunities).values({
      id: oppId,
      source: "manual",
      sourceId: oppId,
      funderName: "Gallup Community Foundation",
      title: "Workforce Outcomes Grant",
      summary: "Supports construction trades job training for adults in McKinley County.",
      awardCeilingCents: 2_500_000,
      closeDate: new Date(Date.now() + 30 * 86_400_000),
      submissionMethod: "portal",
      submissionUrl: "https://funder.example.org/apply",
      privateToOrgId: t.orgId,
      requirements: {
        sections: [
          {
            key: "outcomes",
            title: "Program outcomes",
            prompt: "How many trainees completed the trades program, and how many were hired?",
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
    // One fact only: the drafter leaves a gap, so the application waits in needs_info.
    await db.insert(facts).values({
      id: newId("fct"),
      orgId: t.orgId,
      category: "program",
      statement: "Southwest Indian Foundation runs a construction trades training program.",
      sourceQuote: "Southwest Indian Foundation runs a construction trades training program.",
      status: "confirmed",
      sourceType: "user_entered",
    });

    const created = await api(`/api/orgs/${t.orgId}/applications`, {
      method: "POST",
      as: t.userId,
      json: { opportunityId: oppId },
    });
    expect(created.status).toBe(201);
    const app = (await created.json()) as ApplicationDto;
    expect(app.status).toBe("needs_info");
    const before = await detail(t.orgId, t.userId, app.id);
    expect(before.versions).toHaveLength(1);

    const gapFill = await db
      .select()
      .from(interviews)
      .where(
        and(
          eq(interviews.orgId, t.orgId),
          eq(interviews.focusApplicationId, app.id),
          eq(interviews.kind, "gap_fill"),
        ),
      )
      .get();
    if (!gapFill) throw new Error("expected the pipeline to open a gap-fill interview");
    expect(gapFill.status).toBe("active");

    const answers = [
      "In 2025, 42 adults completed the construction trades training program.",
      "In 2025, 31 graduates of the construction trades training program were hired by local contractors.",
      "The construction trades training program has a 74 percent job placement rate.",
    ];
    for (const content of answers) {
      const res = await api(`/api/orgs/${t.orgId}/interviews/${gapFill.id}/answer`, {
        method: "POST",
        as: t.userId,
        json: { content, inputMode: "text" },
      });
      expect(res.status).toBe(200);
      if (((await res.json()) as { done: boolean }).done) break;
    }
    const completed = await api(`/api/orgs/${t.orgId}/interviews/${gapFill.id}/complete`, {
      method: "POST",
      as: t.userId,
    });
    expect(completed.status).toBe(200);
    expect(((await completed.json()) as InterviewDto).status).toBe("completed");

    const interviewFacts = await db
      .select()
      .from(facts)
      .where(and(eq(facts.orgId, t.orgId), eq(facts.sourceInterviewId, gapFill.id)))
      .all();
    expect(interviewFacts.length).toBeGreaterThan(0);

    const after = await detail(t.orgId, t.userId, app.id);
    expect(after.lastError).toBeNull();
    expect(after.versions).toHaveLength(2);
    expect(after.currentVersion?.versionNumber).toBe(2);
    expect(after.currentVersion?.id).not.toBe(before.currentVersion?.id);
    expect(after.currentVersion?.groundingReport).toBeTruthy();
    expect(after.status).not.toBe("drafting");

    // Re-running the extraction job (queue redelivery) does not redraft again.
    const ctx = createAppContext(env);
    await extractInterviewFacts(ctx, {
      type: "facts.extract_interview",
      orgId: t.orgId,
      interviewId: gapFill.id,
    });
    const versions = await db
      .select({ id: applicationVersions.id })
      .from(applicationVersions)
      .where(
        and(eq(applicationVersions.orgId, t.orgId), eq(applicationVersions.applicationId, app.id)),
      )
      .all();
    expect(versions).toHaveLength(2);
  });
});
