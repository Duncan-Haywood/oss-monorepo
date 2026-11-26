// Auto-drafting obeys the automation level (nothing below `prepared`) and the match-approval
// checkpoint (only `shortlisted` matches when requireMatchApproval is on). Real D1; the pipeline
// is stubbed (createApplication records calls).
import { env } from "cloudflare:workers";
import type { MatchStatus } from "@shared/enums";
import { createAppContext } from "@worker/context";
import {
  applications,
  auditLog,
  opportunities,
  opportunityMatches,
  orgSettings,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { createApplication } from "@worker/services/pipeline";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTenant, testDb } from "../../../../test/worker/helpers";
import { runAutopilotDrafting } from "./autodraft";
import type { AutoDraftInput } from "./deps";

const DAY = 86_400_000;

async function seed(
  settings: Partial<typeof orgSettings.$inferInsert>,
  statuses: MatchStatus[] = ["new", "shortlisted"],
) {
  const t = await setupTenant();
  const db = testDb();
  await db
    .update(orgSettings)
    .set({ autoDraftTopN: 5, ...settings })
    .where(eq(orgSettings.orgId, t.orgId));
  const matches: { matchId: string; oppId: string; status: MatchStatus }[] = [];
  for (const status of statuses) {
    const oppId = newId("opp");
    await db.insert(opportunities).values({
      id: oppId,
      source: "manual",
      sourceId: oppId,
      funderName: "Level Test Funder",
      title: `Grant (${status})`,
      status: "posted",
      closeDate: new Date(Date.now() + 60 * DAY),
    });
    const matchId = newId("mat");
    await db.insert(opportunityMatches).values({
      id: matchId,
      orgId: t.orgId,
      opportunityId: oppId,
      fitScore: 85,
      likelihood: 0.3,
      suggestedAskCents: 500_000,
      expectedValueCents: 150_000,
      status,
    });
    matches.push({ matchId, oppId, status });
  }
  return { ...t, matches };
}

function stub(calls: AutoDraftInput[]) {
  return {
    async createApplication(_ctx: unknown, input: AutoDraftInput) {
      calls.push(input);
      const id = newId("app");
      await testDb().insert(applications).values({
        id,
        orgId: input.orgId,
        opportunityId: input.opportunityId,
        title: "auto draft",
        createdBy: null,
      });
      return id;
    },
  };
}

const run = (orgId: string, calls: AutoDraftInput[]) =>
  runAutopilotDrafting(createAppContext(env), orgId, stub(calls));

describe("auto-drafting × automation level", () => {
  it.each(["manual", "assisted"] as const)("%s: never auto-drafts", async (level) => {
    const s = await seed({ automationLevel: level });
    const calls: AutoDraftInput[] = [];
    const res = await run(s.orgId, calls);
    expect(res.skipped).toBe("automation_level");
    expect(calls).toHaveLength(0);
  });

  it.each(["prepared", "supervised", "full"] as const)(
    "%s: drafts new and shortlisted matches",
    async (level) => {
      const s = await seed({ automationLevel: level, autopilotEnabled: level !== "prepared" });
      const calls: AutoDraftInput[] = [];
      const res = await run(s.orgId, calls);
      expect(res.skipped).toBeUndefined();
      expect(calls.map((c) => c.opportunityId).sort()).toEqual(
        s.matches.map((m) => m.oppId).sort(),
      );
    },
  );

  it("legacy rows (no level) keep auto-drafting (autopilot off → prepared)", async () => {
    const s = await seed({ automationLevel: null, autopilotEnabled: false });
    const calls: AutoDraftInput[] = [];
    await run(s.orgId, calls);
    expect(calls).toHaveLength(2);
  });
});

describe("auto-drafting × requireMatchApproval", () => {
  it("only drafts matches a person shortlisted", async () => {
    const s = await seed({ automationLevel: "prepared", requireMatchApproval: true });
    const calls: AutoDraftInput[] = [];
    const res = await run(s.orgId, calls);
    const shortlisted = s.matches.find((m) => m.status === "shortlisted");
    const fresh = s.matches.find((m) => m.status === "new");
    expect(calls.map((c) => c.opportunityId)).toEqual([shortlisted?.oppId]);
    expect(res.drafted.map((d) => d.matchId)).toEqual([shortlisted?.matchId]);
    const left = await testDb()
      .select({ status: opportunityMatches.status })
      .from(opportunityMatches)
      .where(eq(opportunityMatches.id, fresh?.matchId ?? ""))
      .get();
    expect(left?.status).toBe("new");
  });

  it("drafts nothing when no match was approved", async () => {
    const s = await seed(
      { automationLevel: "full", autopilotEnabled: true, requireMatchApproval: true },
      ["new", "new"],
    );
    const calls: AutoDraftInput[] = [];
    await run(s.orgId, calls);
    expect(calls).toHaveLength(0);
  });

  it("audits each auto-draft as autopilot with the level in effect", async () => {
    const s = await seed({ automationLevel: "supervised", autopilotEnabled: true }, ["new"]);
    await run(s.orgId, []);
    const entry = await testDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, s.orgId), eq(auditLog.action, "match.autodrafted")))
      .get();
    expect(entry?.actorType).toBe("autopilot");
    expect(entry?.metadata).toMatchObject({
      automationLevel: "supervised",
      opportunityId: s.matches[0]?.oppId,
    });
  });
});

describe("createApplication as autopilot", () => {
  it("is refused below prepared (people start every draft)", async () => {
    const s = await seed({ automationLevel: "assisted" }, ["new"]);
    await expect(
      createApplication(createAppContext(env), {
        orgId: s.orgId,
        opportunityId: s.matches[0]?.oppId ?? "",
        startedBy: "autopilot",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
