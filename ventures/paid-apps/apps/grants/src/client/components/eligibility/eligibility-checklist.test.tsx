// @vitest-environment happy-dom
import type { EligibilityCheckDto } from "@shared/eligibility";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELIGIBILITY_DISCLAIMER, EligibilityChecklist } from "./eligibility-checklist";

const check: EligibilityCheckDto = {
  opportunityId: "opp_1",
  overall: "likely",
  summary: "Likely eligible: 2 of 3 requirements met; 1 item to confirm.",
  criteriaModel: "claude-opus-5-5",
  assessModel: "claude-opus-5-5",
  checkedAt: "2026-11-19T12:00:00.000Z",
  checklist: [
    {
      criterionId: "c1",
      kind: "applicant_type",
      text: "The applicant must be a 501(c)(3) nonprofit.",
      sourceQuote: "Nonprofits having a 501(c)(3) status with the IRS",
      status: "met",
      method: "deterministic",
      reason: "The listed applicant types include a 501(c)(3) nonprofit.",
      evidence: [
        {
          ref: "profile:orgType",
          kind: "profile",
          label: "Organization type: 501(c)(3) nonprofit",
          factStatus: null,
        },
      ],
    },
    {
      criterionId: "c2",
      kind: "population",
      text: "Programs must serve Native American young adults.",
      sourceQuote: "Programs must serve Native American young adults in construction trades.",
      status: "met",
      method: "assessed",
      reason: "The fact base says the organization trains Native American young adults.",
      evidence: [
        {
          ref: "fct_youth",
          kind: "fact",
          label: "Trains Native American young adults in construction trades.",
          factStatus: "proposed",
        },
      ],
    },
    {
      criterionId: "c3",
      kind: "registration",
      text: "Applicants must have an active SAM.gov registration.",
      sourceQuote: "Applicants must have an active SAM.gov registration.",
      status: "unknown",
      method: "assessed",
      reason: "Nothing in the profile or fact base settles this requirement.",
      evidence: [],
    },
  ],
  missingInfoQuestions: [
    { criterionId: "c3", question: "Do you have an active SAM.gov registration?" },
  ],
};

type Route = (init: RequestInit | undefined) => { status: number; body: unknown };
let routes: Record<string, Route>;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const key = `${init?.method ?? "GET"} ${String(input)}`;
  const route = routes[key];
  if (!route) throw new Error(`unexpected fetch ${key}`);
  const { status, body } = route(init);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const GET = "GET /api/orgs/org_1/eligibility/opp_1";

beforeEach(() => {
  routes = {};
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EligibilityChecklist", () => {
  it("shows statuses, the funder's verbatim words, evidence links and the disclaimer", async () => {
    routes[GET] = () => ({ status: 200, body: check });
    wrap(<EligibilityChecklist orgId="org_1" opportunityId="opp_1" />);

    expect(await screen.findByText("Likely eligible")).toBeInTheDocument();
    const rows = [
      ...screen
        .getByRole("list", { name: "Eligibility requirements" })
        .querySelectorAll(":scope > li"),
    ];
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["met", "met", "unknown"]);
    expect(rows[0]).toHaveTextContent("Met:");
    expect(rows[2]).toHaveTextContent("Unknown:");
    expect(
      screen.getByText("Programs must serve Native American young adults in construction trades."),
    ).toBeInTheDocument();

    const fact = screen.getByRole("link", { name: /Trains Native American young adults/ });
    expect(fact).toHaveAttribute("href", "/orgs/org_1/knowledge/facts#fct_youth");
    expect(within(fact).getByText("Unconfirmed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Organization type/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/settings/general",
    );
    expect(screen.getByText("Do you have an active SAM.gov registration?")).toBeInTheDocument();
    expect(screen.getByText(ELIGIBILITY_DISCLAIMER)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("starts a follow-up interview from the missing-info questions", async () => {
    routes[GET] = () => ({ status: 200, body: check });
    let posted: unknown = null;
    routes["POST /api/orgs/org_1/interviews"] = (init) => {
      posted = JSON.parse(String(init?.body));
      return { status: 201, body: { id: "int_9", kind: "follow_up" } };
    };
    const user = userEvent.setup();
    wrap(<EligibilityChecklist orgId="org_1" opportunityId="opp_1" />);
    await user.click(await screen.findByRole("button", { name: "Ask in an interview" }));

    expect(await screen.findByRole("link", { name: "Open the interview" })).toHaveAttribute(
      "href",
      "/orgs/org_1/interviews/int_9",
    );
    expect(posted).toEqual({ kind: "follow_up" });
  });

  it("offers a check when none has run, and shows the result of a recheck", async () => {
    routes[GET] = () => ({
      status: 404,
      body: { error: { code: "not_checked", message: "Eligibility has not been checked yet." } },
    });
    routes["POST /api/orgs/org_1/eligibility/opp_1/recheck"] = () => ({
      status: 200,
      body: {
        ...check,
        overall: "ineligible",
        summary: "Not eligible: 1 requirement not met.",
        missingInfoQuestions: [],
      },
    });
    const user = userEvent.setup();
    wrap(<EligibilityChecklist orgId="org_1" opportunityId="opp_1" />);

    expect(await screen.findByText("Not checked yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Check eligibility/ }));
    expect(await screen.findByText("Not eligible")).toBeInTheDocument();
    expect(screen.getByText("Not eligible: 1 requirement not met.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask in an interview" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Re-check/ })).not.toBeDisabled(),
    );
  });

  it("surfaces a recheck permission error", async () => {
    routes[GET] = () => ({ status: 200, body: check });
    routes["POST /api/orgs/org_1/eligibility/opp_1/recheck"] = () => ({
      status: 403,
      body: { error: { code: "forbidden", message: "You do not have access to this resource" } },
    });
    const user = userEvent.setup();
    wrap(<EligibilityChecklist orgId="org_1" opportunityId="opp_1" />);
    await user.click(await screen.findByRole("button", { name: /Re-check/ }));
    expect(await screen.findByText("Could not run the check")).toBeInTheDocument();
    expect(screen.getByText("Likely eligible")).toBeInTheDocument();
  });
});
