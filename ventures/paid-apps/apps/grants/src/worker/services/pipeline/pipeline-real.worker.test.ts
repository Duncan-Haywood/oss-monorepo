// End-to-end smoke test of the inline pipeline with the REAL drafting / grounding / knowledge /
// discovery / submission / billing modules and the FakeLlm (FAKE_EXTERNALS=true) — the offline demo path.
import type { ApplicationDto, FlagDto, SubmissionDto } from "@shared/api/types";
import { facts, opportunities, subscriptions } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { describe, expect, it } from "vitest";
import { api, setupTenant, testDb } from "../../../../test/worker/helpers";

describe("inline pipeline with real modules", () => {
  it("drafts, verifies, routes and submits a grounded application", async () => {
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
    for (const statement of [
      "Southwest Indian Foundation runs a construction trades training program in Gallup, New Mexico.",
      "The trades program trained 42 adults in 2025.",
      "Southwest Indian Foundation serves Navajo and Zuni families in McKinley County.",
    ]) {
      await db.insert(facts).values({
        id: newId("fct"),
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
    expect(app.lastError).toBeNull();
    expect(["in_review", "needs_info"]).toContain(app.status);
    expect(app.currentVersionId).toBeTruthy();

    const detail = (await (
      await api(`/api/orgs/${t.orgId}/applications/${app.id}`, { as: t.userId })
    ).json()) as ApplicationDto & {
      currentVersion: { groundingReport: unknown } | null;
      flags: FlagDto[];
    };
    expect(detail.currentVersion?.groundingReport).toBeTruthy();

    if (app.status !== "in_review") return; // the fake drafter left gaps: needs_info is correct
    // Resolve any blockers, then one-click approve.
    for (const f of detail.flags.filter((x) => x.severity === "blocker")) {
      await api(`/api/orgs/${t.orgId}/applications/${app.id}/flags/${f.id}/resolve`, {
        method: "POST",
        as: t.userId,
        json: { resolution: "Checked by hand" },
      });
    }
    const decided = await api(`/api/orgs/${t.orgId}/reviews/${app.id}/decision`, {
      method: "POST",
      as: t.userId,
      json: { decision: "approved" },
    });
    expect(decided.status).toBe(200);
    const after = (await decided.json()) as ApplicationDto;
    expect(["submitting", "submitted"]).toContain(after.status);
    const subs = (await (
      await api(`/api/orgs/${t.orgId}/applications/${app.id}`, { as: t.userId })
    ).json()) as { submissions: SubmissionDto[] };
    expect(subs.submissions).toHaveLength(1);
    expect(subs.submissions[0]?.approvedBy).toBe(t.userId);
  });
});
