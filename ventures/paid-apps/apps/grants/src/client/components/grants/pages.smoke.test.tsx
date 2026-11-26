// @vitest-environment happy-dom
// Smoke tests: the dashboard / opportunities pages render real-looking API data (and survive
// failing endpoints) without crashing.
import { DashboardPage } from "@client/routes/org/dashboard";
import { OpportunitiesPage } from "@client/routes/org/opportunities/opportunities";
import { OpportunityDetailPage } from "@client/routes/org/opportunities/opportunity-detail";
import { GUIDE_STEPS } from "@shared/guide";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inDays, makeMatch, makeOpportunity } from "./test-fixtures";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    children: React.ReactNode;
  } & Record<string, unknown>) => {
    let href = to;
    for (const [k, v] of Object.entries(params ?? {})) href = href.replace(`$${k}`, v);
    if (search) href += `?${new URLSearchParams(search)}`;
    return (
      <a href={href} className={rest.className as string}>
        {children}
      </a>
    );
  },
  useNavigate: () => vi.fn(),
  useParams: () => ({ orgId: "org_1", opportunityId: "opp_1" }),
}));

const ApiErr = class extends Error {
  status = 500;
};
let routes: Record<string, unknown> = {};
vi.mock("@client/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@client/lib/api")>();
  return {
    ...actual,
    api: async (path: string) => {
      const key = path.replace("/api/orgs/org_1", "").split("?")[0] || "/";
      if (!(key in routes)) throw new ApiErr(`no mock for ${key}`);
      return routes[key];
    },
  };
});

const opp = makeOpportunity({
  closeDate: inDays(6),
  requirements: {
    sections: [
      {
        key: "need",
        title: "Statement of need",
        prompt: "Describe the need.\nInclude data.",
        kind: "narrative",
        required: true,
        wordLimit: 500,
        charLimit: null,
        guidance: "",
      },
    ],
    attachments: [{ name: "Budget", required: true, description: "" }],
    eligibilityCriteria: ["501(c)(3) or tribal org"],
    submissionInstructions: "Submit via Grants.gov",
    complete: true,
  },
  match: makeMatch({
    reasons: [
      { text: "Serves Navajo Nation youth", polarity: "positive", factIds: ["fct_1", "fct_2"] },
      { text: "No audited financials on file", polarity: "negative", factIds: [] },
    ],
  }),
});
const { match: _m, ...oppOnly } = opp;

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  routes = {};
});
afterEach(cleanup);

describe("pages smoke", () => {
  it("dashboard renders KPIs, attention, matches, deadlines, coverage and activity", async () => {
    routes = {
      "/": { org: { id: "org_1", name: "Southwest Indian Foundation", slug: "swif" } },
      "/submissions/dashboard": {
        counts: { byStatus: { in_review: 1, needs_info: 1, awarded: 2 } },
        awardedCents: 32_500_000,
        submittedThisMonth: 2,
        pendingReviews: 1,
        upcomingDeadlines: [
          {
            applicationId: "app_1",
            title: "Trades Academy - DOL",
            status: "needs_info",
            deadline: inDays(9),
            daysLeft: 9,
            opportunityId: "opp_x",
            funderName: "DOL",
          },
        ],
        recentActivity: [
          {
            id: "a",
            action: "application.submitted",
            createdAt: inDays(-1),
            actorType: "user",
            targetType: "application",
            targetId: "app_1",
          },
        ],
      },
      "/applications": {
        items: [
          {
            id: "app_1",
            opportunityId: "opp_x",
            title: "Trades Academy - DOL",
            status: "needs_info",
            deadline: inDays(9),
            opportunity: { id: "opp_x", title: "x", funderName: "DOL", closeDate: inDays(9) },
          },
        ],
      },
      "/matches": { items: [{ ...opp.match, opportunity: oppOnly }] },
      "/submissions": { items: [] },
      "/submissions/followups": { items: [] },
      "/facts/summary": {
        byStatus: { confirmed: 10, proposed: 3 },
        byCategory: {},
        coverage: [
          { topic: "Outcomes", factCount: 0, status: "missing" },
          { topic: "Mission", factCount: 9, status: "good" },
        ],
      },
      "/documents": { items: [{ id: "doc_1" }] },
      "/interviews": { items: [{ id: "int_1" }] },
    };
    wrap(<DashboardPage />);
    expect(await screen.findByText("Southwest Indian Foundation")).toBeInTheDocument();
    expect(await screen.findByText("$325,000")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Answer questions" })).toBeInTheDocument();
    // Appears in top matches and (closing in 6 days) in the deadlines timeline.
    expect(
      await screen.findAllByText("YouthBuild Construction Training", { selector: "a" }),
    ).toHaveLength(2);
    expect(screen.getAllByText("Trades Academy - DOL").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Start an interview/ })).toBeInTheDocument();
    expect(screen.getByText("Application submitted")).toBeInTheDocument();
  });

  it("dashboard survives every endpoint failing and shows first-run guidance when empty", async () => {
    wrap(<DashboardPage />);
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load matches/)).toBeInTheDocument();
    cleanup();
    routes = {
      "/documents": { items: [] },
      "/applications": { items: [] },
      "/interviews": { items: [] },
      "/facts/summary": { byStatus: {}, byCategory: {}, coverage: [] },
      "/matches": { items: [] },
      "/guide": {
        steps: GUIDE_STEPS.map((s) => ({ ...s, done: false })),
        doneCount: 0,
        total: GUIDE_STEPS.length,
        complete: false,
        nextStep: "profile",
      },
    };
    wrap(<DashboardPage />);
    expect(await screen.findByText("Get to your first grounded draft")).toBeInTheDocument();
    expect(
      screen.getByText(`0 of ${GUIDE_STEPS.length} steps done`, { exact: false }),
    ).toBeInTheDocument();
  });

  it("opportunities list renders cards sorted by expected value", async () => {
    routes = {
      "/opportunities": {
        items: [
          makeOpportunity({
            id: "low",
            title: "Low EV",
            match: makeMatch({ expectedValueCents: 10 }),
          }),
          makeOpportunity({
            id: "high",
            title: "High EV",
            match: makeMatch({ expectedValueCents: 999 }),
          }),
        ],
      },
    };
    wrap(<OpportunitiesPage />);
    const titles = await screen.findAllByRole("heading", { level: 3 });
    expect(titles.map((t) => t.textContent)).toEqual(["High EV", "Low EV"]);
    expect(screen.getByRole("button", { name: /Rescore matches/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import a grant/ })).toBeInTheDocument();
  });

  it("opportunity detail renders requirements, match reasons with fact links and the draft form", async () => {
    routes = { "/opportunities/opp_1": opp, "/projects": { items: [] } };
    wrap(<OpportunityDetailPage />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(opp.title);
    expect(screen.getByText("Statement of need")).toBeInTheDocument();
    expect(screen.getByText("500 words max")).toBeInTheDocument();
    expect(screen.getByText("Serves Navajo Nation youth")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view cited fact fct_2/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/knowledge/facts?factId=fct_2",
    );
    expect(screen.getByLabelText("Requested amount (USD)")).toHaveValue("150000");
    expect(screen.getByRole("button", { name: /Shortlist/ })).toBeInTheDocument();
  });
});
