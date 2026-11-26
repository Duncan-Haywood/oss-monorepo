// @vitest-environment happy-dom
import { mockFetch, renderWithClient } from "@client/components/sourcing/test-helpers";
import type {
  FunderDetailResponse,
  FunderListResponse,
  FunderRelationSummaryDto,
} from "@shared/api/funders";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FunderDetailPage } from "./funder-detail";
import { FundersPage } from "./funders";
import { groupByStage, nextStepUrgency } from "./model";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => null,
  useParams: () => ({ orgId: "org_1", funderId: "frl_1" }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  Link: ({
    children,
    to: _to,
    params: _p,
    ...rest
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
  }) => <a {...rest}>{children}</a>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-11-19T12:00:00Z");
const zero = { prospect: 0, cultivating: 0, applied: 0, funded: 0, declined: 0, dormant: 0 };

function rel(over: Partial<FunderRelationSummaryDto> = {}): FunderRelationSummaryDto {
  return {
    id: "frl_1",
    funderId: "fnd_1",
    prospectEin: null,
    displayName: "Mesa Community Fund",
    stage: "cultivating",
    stageSource: "auto",
    origin: "match",
    ownerId: null,
    nextStepAt: null,
    nextStepNote: "",
    tags: [],
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ownerName: null,
    applicationCount: 0,
    awardedCents: 0,
    contactCount: 0,
    lastInteractionAt: null,
    ...over,
  };
}

function detail(over: Partial<FunderDetailResponse> = {}): FunderDetailResponse {
  const {
    ownerName: _o,
    applicationCount: _a,
    awardedCents: _w,
    contactCount: _c,
    lastInteractionAt: _l,
    ...relation
  } = rel({ nextStepAt: "2026-11-10T09:00:00.000Z", nextStepNote: "Send thank-you" });
  return {
    relation,
    funder: {
      id: "fnd_1",
      name: "Mesa Community Fund",
      type: "private_foundation",
      websiteUrl: null,
    },
    prospect: {
      prospectId: "prs_1",
      status: "researching",
      fitScore: 81,
      ein: "850123456",
      name: "Mesa Community Fund",
      city: "Gallup",
      state: "NM",
      totalGivingCents: 180_000_000,
      totalAssetsCents: null,
      latestFilingYear: 2024,
      website: null,
      propublicaUrl: "https://projects.propublica.org/nonprofits/organizations/850123456",
      attribution: {
        text: "Data: ProPublica Nonprofit Explorer (IRS Form 990 data).",
        source: "ProPublica Nonprofit Explorer",
        url: "https://projects.propublica.org/nonprofits/organizations/850123456",
        fetchedAt: "2026-11-01T00:00:00.000Z",
      },
    },
    contacts: [
      {
        id: "fco_1",
        relationId: "frl_1",
        name: "Dana Officer",
        role: "Program officer",
        email: "dana@mesa.example",
        phone: null,
        notes: "",
        preferredContact: "email",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    ],
    interactions: [],
    timeline: {
      upcoming: [
        {
          id: "report:rpt_1",
          kind: "report",
          at: "2027-01-31T00:00:00.000Z",
          title: "Final report due",
          detail: null,
          status: "upcoming",
          link: null,
        },
      ],
      past: [
        {
          id: "outcome:app_1",
          kind: "outcome",
          at: "2026-10-20T00:00:00.000Z",
          title: "Awarded $5,000: Youth program",
          detail: null,
          status: "awarded",
          link: "/applications/app_1",
        },
        {
          id: "application:app_1",
          kind: "application",
          at: "2026-09-01T00:00:00.000Z",
          title: "Application started: Youth program",
          detail: null,
          status: "submitted",
          link: "/applications/app_1",
        },
      ],
    },
    openOpportunities: [
      {
        id: "opp_1",
        title: "Spring youth grants",
        closeDate: "2027-03-01T00:00:00.000Z",
        awardCeilingCents: 1_000_000,
        hasActiveApplication: false,
      },
    ],
    members: [{ userId: "usr_1", name: "Alex" }],
    canEdit: true,
    ...over,
  };
}

describe("model", () => {
  it("groups by stage with the soonest next step first and flags overdue steps", () => {
    const g = groupByStage([
      rel({ id: "a", displayName: "B fund", nextStepAt: "2026-12-01T00:00:00Z" }),
      rel({ id: "b", displayName: "A fund" }),
      rel({ id: "c", displayName: "C fund", nextStepAt: "2026-11-20T00:00:00Z" }),
      rel({ id: "d", stage: "funded" }),
    ]);
    expect(g.cultivating.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(g.funded).toHaveLength(1);
    expect(nextStepUrgency("2026-11-18T00:00:00Z", NOW)).toBe("overdue");
    expect(nextStepUrgency("2026-11-22T00:00:00Z", NOW)).toBe("soon");
    expect(nextStepUrgency(null, NOW)).toBe("none");
  });
});

describe("FundersPage", () => {
  it("explains why relationships matter when there are no funders yet", async () => {
    mockFetch({
      "GET /funders": () => ({
        body: { items: [], counts: zero, canEdit: true } satisfies FunderListResponse,
      }),
    });
    renderWithClient(<FundersPage now={NOW} />);
    expect(await screen.findByText("Grants follow relationships")).toBeInTheDocument();
    expect(screen.getByText(/already knows/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add a funder/ })).toBeInTheDocument();
  });

  it("shows a board by stage, filters by stage, and switches to a list", async () => {
    const items = [
      rel({ id: "frl_1", nextStepAt: "2026-11-10T00:00:00Z", nextStepNote: "Call back" }),
      rel({ id: "frl_2", displayName: "Juniper Trust", stage: "funded", awardedCents: 500_000 }),
    ];
    mockFetch({
      "GET /funders": () => ({
        body: {
          items,
          counts: { ...zero, cultivating: 1, funded: 1 },
          canEdit: true,
        } satisfies FunderListResponse,
      }),
    });
    const user = userEvent.setup();
    renderWithClient(<FundersPage now={NOW} />);

    const cultivating = await screen.findByRole("region", { name: "Cultivating" });
    expect(within(cultivating).getByText("Mesa Community Fund")).toBeInTheDocument();
    expect(within(cultivating).getByText(/Overdue:/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Funded" })).getByText("$5,000 won"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Funded 1$/ }));
    expect(screen.queryByRole("region", { name: "Cultivating" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Funded" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /List/ }));
    const table = screen.getByRole("table", { name: "Funders" });
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((r) => r.textContent),
    ).toEqual(["Juniper Trust"]);
  });
});

describe("FunderDetailPage", () => {
  it("shows the timeline, people, 990-PF giving with attribution, and quick actions", async () => {
    const api = mockFetch({
      "GET /funders/frl_1": () => ({ body: detail() }),
      "POST /funders/frl_1/interactions": ({ body }) => ({
        status: 201,
        body: { id: "fin_1", ...(body as object) },
      }),
      "PATCH /funders/frl_1": () => ({ body: detail().relation }),
    });
    const user = userEvent.setup();
    renderWithClient(<FunderDetailPage now={NOW} />);

    const history = await screen.findByRole("region", { name: "History" });
    expect(
      within(history)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("data-kind")),
    ).toEqual(["outcome", "application"]);
    expect(
      within(screen.getByRole("region", { name: "Coming up" })).getByText("Final report due"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Overdue since/)).toBeInTheDocument();
    expect(screen.getByText("Dana Officer")).toBeInTheDocument();
    expect(
      screen.getByText(/Grants paid in 2024 \(Form 990-PF\): \$1,800,000/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ProPublica Nonprofit Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start an application/ })).toBeInTheDocument();

    // Log a call
    await user.click(screen.getByRole("button", { name: /Log a call/ }));
    const dialog = await screen.findByRole("dialog", { name: "Log a call" });
    await user.type(within(dialog).getByLabelText(/What happened/), "Discussed the spring cycle");
    await user.selectOptions(within(dialog).getByLabelText("With"), "fco_1");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.callsTo("POST /funders/frl_1/interactions")).toHaveLength(1));
    expect(api.callsTo("POST /funders/frl_1/interactions")[0]?.body).toMatchObject({
      kind: "call",
      summary: "Discussed the spring cycle",
      contactId: "fco_1",
    });

    // Set next step
    await user.click(screen.getByRole("button", { name: /Set next step/ }));
    const next = await screen.findByRole("dialog", { name: "Set next step" });
    const note = within(next).getByLabelText("What");
    await user.clear(note);
    await user.type(note, "Invite to showcase");
    await user.click(within(next).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.callsTo("PATCH /funders/frl_1")).toHaveLength(1));
    expect(api.callsTo("PATCH /funders/frl_1")[0]?.body).toMatchObject({
      nextStepNote: "Invite to showcase",
    });
  });

  it("hides write actions from members who cannot edit", async () => {
    mockFetch({ "GET /funders/frl_1": () => ({ body: detail({ canEdit: false }) }) });
    renderWithClient(<FunderDetailPage now={NOW} />);
    expect(await screen.findByText("Dana Officer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log a call/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start an application/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit Dana/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Stage")).toBeDisabled();
  });
});
