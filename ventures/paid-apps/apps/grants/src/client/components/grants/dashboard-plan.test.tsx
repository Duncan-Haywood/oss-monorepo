// @vitest-environment happy-dom
import type { HomeCalendar, HomeGreeting, NextBestAction, PipelineValue } from "@shared/api/home";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DeadlineCalendarStrip,
  joinList,
  NextBestActionsCard,
  PipelineValueTile,
  PlanHeader,
  watchStatement,
} from "./dashboard-plan";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const greeting: HomeGreeting = {
  firstName: "Ana",
  orgName: "Gallup Trades Academy",
  role: "owner",
  focusAreas: ["workforce development", "construction trades"],
  serviceAreas: ["Gallup, NM", "McKinley County, NM"],
  orgTypeLabel: "501(c)(3) nonprofit",
  location: "Gallup, NM",
};

const actions: NextBestAction[] = [
  {
    id: "review_draft:app_1",
    kind: "review_draft",
    title: "Review the draft for Rural Skills 2027 (due in 12 days)",
    reason: "Fact-checked and ready for one-click approval for Mesa Trust.",
    href: "/orgs/org_1/applications/app_1",
    cta: "Review draft",
    priority: "high",
    dueAt: "2026-12-01T00:00:00.000Z",
  },
  {
    id: "confirm_facts:doc_1",
    kind: "confirm_facts",
    title: "Confirm 7 facts extracted from your Annual Report",
    reason: "Confirmed facts are the only ones autopilot drafts may rely on without a warning.",
    href: "/orgs/org_1/knowledge/documents/doc_1",
    cta: "Review facts",
    priority: "medium",
    dueAt: null,
  },
  {
    id: "add_uei",
    kind: "add_uei",
    title: "Add your SAM.gov UEI to qualify for 6 federal grants",
    reason: "Federal funders require an active SAM.gov registration, and your profile has no UEI.",
    href: "/orgs/org_1/settings/general",
    cta: "Add UEI",
    priority: "medium",
    dueAt: null,
  },
];

describe("NextBestActionsCard", () => {
  it("renders each action in rank order with its reason and in-app link", () => {
    render(
      <NextBestActionsCard actions={actions} greeting={greeting} loading={false} failed={false} />,
    );
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Review the draft for Rural Skills 2027 (due in 12 days)");
    expect(items[0]).toHaveTextContent("ready for one-click approval for Mesa Trust");
    expect(items[2]).toHaveTextContent("Add your SAM.gov UEI to qualify for 6 federal grants");

    const review = screen.getByRole("link", { name: /Review draft/ });
    expect(review).toHaveAttribute("href", "/orgs/org_1/applications/app_1");
    expect(review).toHaveAccessibleDescription(/Review the draft for Rural Skills 2027/);
    expect(screen.getByRole("link", { name: /Review facts/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/knowledge/documents/doc_1",
    );
    expect(screen.getByRole("link", { name: /Add UEI/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/settings/general",
    );

    fireEvent.click(review);
    expect(navigate).toHaveBeenCalledWith({ href: "/orgs/org_1/applications/app_1" });
  });

  it("tailors the caught-up state to the org's focus areas and service area", () => {
    render(<NextBestActionsCard actions={[]} greeting={greeting} loading={false} failed={false} />);
    expect(
      screen.getByText(
        /We're watching for workforce development and construction trades grants in Gallup, NM and McKinley County, NM\./,
      ),
    ).toBeInTheDocument();
  });

  it("shows a section error when the plan fails to load", () => {
    render(<NextBestActionsCard actions={[]} greeting={undefined} loading={false} failed />);
    expect(screen.getByText(/Couldn't load your grant plan/)).toBeInTheDocument();
  });
});

describe("PlanHeader", () => {
  it("greets the user by first name with the org's own plan and focus", () => {
    render(
      <PlanHeader
        greeting={greeting}
        fallbackOrgName={undefined}
        firstRun={false}
        now={new Date("2026-11-19T09:00:00")}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Good morning, Ana, here's Gallup Trades Academy's grant plan",
    );
    expect(
      screen.getByText(/watching for workforce development and construction/),
    ).toBeInTheDocument();
  });

  it("falls back to the org name, then to Dashboard", () => {
    const { unmount } = render(
      <PlanHeader
        greeting={undefined}
        fallbackOrgName="Gallup Trades Academy"
        firstRun={false}
        now={new Date("2026-11-19T19:00:00")}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Good evening, here's Gallup Trades Academy's grant plan",
    );
    unmount();
    render(
      <PlanHeader greeting={undefined} fallbackOrgName={undefined} firstRun now={new Date()} />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard");
  });
});

describe("DeadlineCalendarStrip", () => {
  const calendar: HomeCalendar = {
    windowDays: 90,
    from: "2026-11-19T12:00:00.000Z",
    to: "2027-02-17T12:00:00.000Z",
    total: 2,
    months: [
      {
        month: "2026-11",
        label: "November 2026",
        entries: [
          {
            id: "app:app_1",
            kind: "application",
            title: "Rural Skills 2027",
            funderName: "Mesa Trust",
            date: "2026-11-30T12:00:00.000Z",
            daysLeft: 11,
            status: "in_review",
            href: "/orgs/org_1/applications/app_1",
          },
        ],
      },
      {
        month: "2026-12",
        label: "December 2026",
        entries: [
          {
            id: "match:mat_1",
            kind: "match",
            title: "Community Builders Award",
            funderName: "Four Corners Fund",
            date: "2026-12-19T12:00:00.000Z",
            daysLeft: 30,
            status: "shortlisted",
            href: "/orgs/org_1/opportunities/opp_1",
          },
        ],
      },
      { month: "2027-01", label: "January 2027", entries: [] },
      { month: "2027-02", label: "February 2027", entries: [] },
    ],
  };

  it("groups deadlines by month with links to the draft or the grant", () => {
    render(
      <DeadlineCalendarStrip
        calendar={calendar}
        greeting={greeting}
        opportunitiesHref="/orgs/org_1/opportunities"
        loading={false}
        failed={false}
      />,
    );
    const nov = screen.getByRole("region", { name: "November 2026" });
    expect(within(nov).getByRole("link", { name: "Rural Skills 2027" })).toHaveAttribute(
      "href",
      "/orgs/org_1/applications/app_1",
    );
    const dec = screen.getByRole("region", { name: "December 2026" });
    expect(within(dec).getByRole("link", { name: "Community Builders Award" })).toHaveAttribute(
      "href",
      "/orgs/org_1/opportunities/opp_1",
    );
    expect(within(dec).getByText(/Shortlisted grant · Four Corners Fund/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "January 2027" })).getByText("Nothing due"),
    ).toBeInTheDocument();
  });

  it("says what we're watching for when nothing is due", () => {
    render(
      <DeadlineCalendarStrip
        calendar={{
          ...calendar,
          total: 0,
          months: calendar.months.map((m) => ({ ...m, entries: [] })),
        }}
        greeting={greeting}
        opportunitiesHref="/orgs/org_1/opportunities"
        loading={false}
        failed={false}
      />,
    );
    expect(screen.getByText(/No deadlines in the next 90 days/)).toHaveTextContent(
      "We're watching for workforce development and construction trades grants",
    );
    expect(screen.getByRole("link", { name: "Browse open grants" })).toHaveAttribute(
      "href",
      "/orgs/org_1/opportunities",
    );
  });
});

describe("PipelineValueTile", () => {
  const pipeline: PipelineValue = {
    expectedValueCents: 1_500_000,
    shortlistedCount: 1,
    draftingCount: 1,
    awardedCents: 2_500_000,
    awardedCount: 1,
    declinedCount: 1,
    winRate: 0.5,
  };

  it("shows expected value, awards to date and the win rate", () => {
    render(<PipelineValueTile pipeline={pipeline} greeting={greeting} loading={false} />);
    expect(screen.getByText("$15,000")).toBeInTheDocument();
    expect(
      screen.getByText(/Expected value of 2 shortlisted or drafting grants/),
    ).toBeInTheDocument();
    expect(screen.getByText("$25,000")).toBeInTheDocument();
    expect(screen.getByText("(1 of 2)")).toBeInTheDocument();
  });

  it("nudges toward the org's focus when the pipeline is empty", () => {
    render(
      <PipelineValueTile
        pipeline={{
          ...pipeline,
          expectedValueCents: 0,
          shortlistedCount: 0,
          draftingCount: 0,
          winRate: null,
        }}
        greeting={greeting}
        loading={false}
      />,
    );
    expect(
      screen.getByText("Shortlist a workforce development grant to start building your pipeline"),
    ).toBeInTheDocument();
    expect(screen.getByText("No outcomes yet")).toBeInTheDocument();
  });
});

describe("copy helpers", () => {
  it("joins lists and handles orgs without focus areas", () => {
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
    expect(watchStatement({ focusAreas: [], serviceAreas: [], location: "Gallup, NM" })).toBe(
      "Add your focus areas in settings so we know which grants to watch for in Gallup, NM.",
    );
  });
});
