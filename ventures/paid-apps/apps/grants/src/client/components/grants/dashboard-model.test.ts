import { describe, expect, it } from "vitest";
import {
  buildAttention,
  buildKpis,
  buildUpcomingDeadlines,
  normalizeActivity,
  topMatches,
} from "./dashboard-model";
import type { ApplicationListItem, DashboardSummary, MatchWithOpportunity } from "./queries";
import { inDays, makeMatch, makeOpportunity, NOW } from "./test-fixtures";

const app = (over: Partial<ApplicationListItem>): ApplicationListItem =>
  ({
    id: "app_1",
    orgId: "org_1",
    opportunityId: "opp_1",
    title: "YouthBuild 2027",
    status: "drafting",
    reviewTier: null,
    deadline: inDays(10),
    awardedAmountCents: null,
    submittedAt: null,
    lastError: null,
    opportunity: { id: "opp_1", title: "YouthBuild", funderName: "DOL", closeDate: inDays(10) },
    ...over,
  }) as ApplicationListItem;

/** A GET /submissions/dashboard body (services/submission/dashboard.ts). */
const dash = (over: Partial<DashboardSummary> = {}): DashboardSummary => ({
  counts: { byStatus: {} },
  upcomingDeadlines: [],
  pendingReviews: 0,
  awardedCents: 0,
  submittedThisMonth: 0,
  recentActivity: [],
  ...over,
});

const matchWithOpp = (
  id: string,
  over: Partial<MatchWithOpportunity> = {},
  oppOver: Parameters<typeof makeOpportunity>[0] = {},
): MatchWithOpportunity => {
  const { match: _m, ...opportunity } = makeOpportunity({ id: `opp_${id}`, ...oppOver });
  return { ...makeMatch({ id: `mat_${id}`, opportunityId: `opp_${id}` }), opportunity, ...over };
};

describe("buildKpis", () => {
  it("prefers dashboard values", () => {
    const k = buildKpis(
      dash({
        awardedCents: 12_500_000,
        submittedThisMonth: 3,
        pendingReviews: 2,
        counts: { byStatus: { drafting: 1, in_review: 2, awarded: 4, submitted: 5 } },
      }),
      [],
      NOW,
    );
    expect(k).toEqual({
      awardedCents: 12_500_000,
      awardedCount: 4,
      submittedThisMonth: 3,
      pendingReviews: 2,
      inProgress: 3,
    });
  });

  it("falls back to the application list when the dashboard is unavailable", () => {
    const k = buildKpis(
      undefined,
      [
        app({ id: "a", status: "awarded", awardedAmountCents: 5_000_000 }),
        app({ id: "b", status: "in_review" }),
        app({ id: "c", status: "submitted", submittedAt: inDays(-1) }),
        app({ id: "d", status: "needs_info" }),
      ],
      NOW,
    );
    expect(k).toEqual({
      awardedCents: 5_000_000,
      awardedCount: 1,
      submittedThisMonth: 1,
      pendingReviews: 1,
      inProgress: 2,
    });
  });

  it("uses the dashboard's pendingReviews count", () => {
    expect(buildKpis(dash({ pendingReviews: 3 }), [], NOW).pendingReviews).toBe(3);
  });
});

describe("buildAttention", () => {
  it("collects needs-info, reviews, manual submissions and due follow-ups in priority order", () => {
    const items = buildAttention({
      now: NOW,
      applications: [
        app({ id: "r", status: "in_review", reviewTier: "one_click" }),
        app({ id: "n", status: "needs_info" }),
        app({ id: "x", status: "drafting" }),
      ],
      submissions: [
        {
          id: "sub_1",
          applicationId: "r",
          channel: "manual",
          status: "pending",
          createdAt: inDays(-1),
          application: { id: "r", title: "Manual one" },
        } as never,
        {
          id: "sub_2",
          applicationId: "r",
          channel: "email",
          status: "sent",
          createdAt: inDays(-1),
        } as never,
      ],
      followups: [
        {
          id: "f1",
          title: "Status check",
          status: "pending",
          dueAt: inDays(-2),
          applicationId: null,
        } as never,
        {
          id: "f2",
          title: "Far away",
          status: "pending",
          dueAt: inDays(40),
          applicationId: null,
        } as never,
      ],
    });
    expect(items.map((i) => i.kind)).toEqual([
      "needs_info",
      "review",
      "manual_submission",
      "followup",
    ]);
    expect(items[1]?.detail).toMatch(/one-click/);
    expect(items[3]?.detail).toBe("Overdue by 2 days");
  });
});

describe("buildUpcomingDeadlines", () => {
  it("merges dashboard deadlines, applications and strong matches within 30 days, deduped and sorted", () => {
    const deadline = (applicationId: string, opportunityId: string, days: number) => ({
      applicationId,
      title: `App ${applicationId}`,
      status: "drafting" as const,
      deadline: inDays(days),
      daysLeft: days,
      opportunityId,
      funderName: "DOL",
    });
    const items = buildUpcomingDeadlines({
      now: NOW,
      applications: [
        app({ id: "app_1", opportunityId: "opp_a", deadline: inDays(12) }),
        app({ id: "app_x", opportunityId: "opp_x", deadline: inDays(2), status: "failed" }),
      ],
      dashboard: dash({
        upcomingDeadlines: [
          deadline("app_1", "opp_a", 12), // also in the applications list -> deduped
          deadline("app_z", "opp_z", 3), // only known to the dashboard
          { ...deadline("app_bad", "opp_q", 4), deadline: "not a date" },
        ],
      }),
      matches: [
        matchWithOpp("a", {}, { closeDate: inDays(5) }), // has an application -> skipped
        matchWithOpp("b", { fitScore: 80 }, { closeDate: inDays(20) }),
        matchWithOpp("c", { fitScore: 20 }, { closeDate: inDays(8) }), // weak, not shortlisted
        matchWithOpp("d", { fitScore: 20, status: "shortlisted" }, { closeDate: inDays(25) }),
        matchWithOpp("e", { fitScore: 90 }, { closeDate: inDays(45) }), // outside window
      ],
    });
    expect(items.map((d) => [d.key, d.days])).toEqual([
      ["app-app_z", 3],
      ["app-app_1", 12],
      ["opp-opp_b", 20],
      ["opp-opp_d", 25],
    ]);
  });
});

describe("topMatches", () => {
  it("returns open, non-dismissed matches by expected value", () => {
    const res = topMatches(
      [
        matchWithOpp("1", { expectedValueCents: 100 }),
        matchWithOpp("2", { expectedValueCents: 900, status: "dismissed" }),
        matchWithOpp("3", { expectedValueCents: 500 }),
        matchWithOpp("4", { expectedValueCents: 700, eligibility: "ineligible" }),
        matchWithOpp("5", { expectedValueCents: 800 }, { closeDate: inDays(-1) }),
      ],
      5,
      NOW,
    );
    expect(res.map((m) => m.id)).toEqual(["mat_3", "mat_1"]);
  });
});

describe("dashboard deadlines", () => {
  it("carries the dashboard's funder and title", () => {
    const [d] = buildUpcomingDeadlines({
      now: NOW,
      dashboard: dash({
        upcomingDeadlines: [
          {
            applicationId: "app_9",
            title: "Native youth workforce",
            status: "in_review",
            deadline: inDays(6),
            daysLeft: 6,
            opportunityId: "opp_9",
            funderName: "Kellogg Foundation",
          },
        ],
      }),
    });
    expect(d).toMatchObject({
      kind: "application",
      title: "Native youth workforce",
      subtitle: "Kellogg Foundation",
      applicationId: "app_9",
      opportunityId: "opp_9",
      status: "in_review",
      days: 6,
    });
  });
});

describe("normalizeActivity", () => {
  it("labels audit entries and ignores malformed rows", () => {
    const row = (id: string, action: string, days: number, actorType = "user") => ({
      id,
      action,
      actorType,
      createdAt: inDays(days),
      targetType: null,
      targetId: null,
    });
    const res = normalizeActivity([
      { ...row("a1", "document.uploaded", -2), targetType: "document", targetId: "doc_1" },
      row("a2", "application.submitted", -1, "autopilot"),
      row("a3", "custom.thing_happened", -3, "system"),
      row("a4", "fact.bulk_confirmed", -4),
      { ...row("a5", "fact.confirmed", -5), createdAt: "garbage" },
    ]);
    expect(res.map((a) => [a.label, a.actor])).toEqual([
      ["Application submitted", "autopilot"],
      ["Document uploaded", "user"],
      ["Custom thing happened", "system"],
      ["Facts confirmed", "user"],
    ]);
    expect(res[1]).toMatchObject({ targetType: "document", targetId: "doc_1" });
    expect(normalizeActivity(undefined)).toEqual([]);
  });
});
