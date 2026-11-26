// @vitest-environment happy-dom
// Keyboard triage flow against a mocked API: j/k, s, d + reason picker, o, ?, x, bulk, inbox zero.
import type { BulkMatchResult, InboxItemDto, InboxResponse } from "@shared/match-triage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inDays, makeMatch, NOW } from "../test-fixtures";
import { useInboxCount } from "./queries";
import { TriageInbox } from "./triage-inbox";

const navigate = vi.fn();
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
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    let href = to;
    for (const [k, v] of Object.entries(params ?? {})) href = href.replace(`$${k}`, v);
    if (search) href += `?${new URLSearchParams(search)}`;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
  useNavigate: () => navigate,
  useParams: () => ({ orgId: "org_1" }),
}));

function item(id: string, title: string, over: Partial<InboxItemDto> = {}): InboxItemDto {
  return {
    ...makeMatch({ id, opportunityId: `opp_${id}` }),
    opportunity: {
      id: `opp_${id}`,
      title,
      funderId: null,
      funderName: `${title} Funder`,
      summary: "Funds construction training.",
      status: "posted",
      closeDate: inDays(30),
      estimatedCloseDate: null,
      awardFloorCents: 5_000_000,
      awardCeilingCents: 25_000_000,
      opportunityNumber: null,
      source: "grants_gov",
      sourceUrl: null,
    },
    eligibilityCheck: null,
    ...over,
  };
}

const A = item("a", "Alpha Youth Build", {
  expectedValueCents: 9_000_000,
  fitScore: 88,
  likelihood: 0.3,
  reasons: [
    { text: "Trains Navajo youth", polarity: "positive", factIds: ["fct_1", "fct_2"] },
    { text: "Strong outcomes", polarity: "positive", factIds: ["fct_3"] },
    { text: "Tight deadline", polarity: "negative", factIds: [] },
    { text: "Fourth reason", polarity: "neutral", factIds: [] },
  ],
  eligibilityCheck: {
    overall: "likely",
    checkedAt: NOW.toISOString(),
    items: [
      { criterionId: "c1", kind: "applicant_type", status: "met", text: "501(c)(3) nonprofit" },
      { criterionId: "c2", kind: "registration", status: "unknown", text: "SAM.gov registration" },
    ],
  },
});
const B = item("b", "Bravo Trades", { expectedValueCents: 5_000_000 });
const C = item("c", "Charlie Pantry", { expectedValueCents: 1_000_000 });

let server: InboxItemDto[];
let posts: unknown[];
let failNextPost: boolean;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const key = `${init?.method ?? "GET"} ${String(input)}`;
  if (key === "GET /api/orgs/org_1/matches/inbox") {
    return json(200, { items: server, total: server.length } satisfies InboxResponse);
  }
  if (key === "GET /api/orgs/org_1/matches/inbox?limit=0") {
    return json(200, { items: [], total: 7 } satisfies InboxResponse);
  }
  if (key === "POST /api/orgs/org_1/matches/bulk") {
    const body = JSON.parse(String(init?.body)) as { ids: string[] };
    posts.push(body);
    if (failNextPost) {
      failNextPost = false;
      return json(500, { error: { code: "internal", message: "Boom" } });
    }
    server = server.filter((i) => !body.ids.includes(i.id));
    return json(200, {
      updated: body.ids,
      unchanged: [],
      skipped: [],
      notFound: [],
    } satisfies BulkMatchResult);
  }
  throw new Error(`unexpected fetch ${key}`);
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const rowButton = (title: string) => screen.getByRole("button", { name: title });
const detailHeading = () => screen.getByRole("heading", { level: 2, name: /Alpha|Bravo|Charlie/ });
const status = () => screen.getAllByRole("status").find((el) => el.tagName === "P");

beforeEach(() => {
  server = [A, B, C];
  posts = [];
  failNextPost = false;
  navigate.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TriageInbox", () => {
  it("triages by keyboard: j/k, s, d with a reason, o, ?, x and inbox zero", async () => {
    const user = userEvent.setup();
    wrap(<TriageInbox orgId="org_1" canEdit now={NOW} />);

    // Highest expected value first; the first grant is shown in the detail pane.
    expect(await screen.findByRole("button", { name: "Alpha Youth Build" })).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "New matches" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Alpha"),
      expect.stringContaining("Bravo"),
      expect.stringContaining("Charlie"),
    ]);
    expect(detailHeading()).toHaveTextContent("Alpha Youth Build");
    expect(rowButton("Alpha Youth Build")).toHaveAttribute("aria-current", "true");

    // Fit, likelihood, expected value, eligibility chips, top 3 reasons with fact links.
    const detail = screen.getByRole("region", { name: "Alpha Youth Build" });
    expect(within(detail).getByRole("meter", { name: "Fit score" })).toHaveAttribute(
      "aria-valuenow",
      "88",
    );
    expect(within(detail).getByText("30%")).toBeInTheDocument();
    expect(within(detail).getByText("$90,000")).toBeInTheDocument();
    const chips = within(detail).getByRole("list", { name: "Eligibility" });
    expect(chips).toHaveTextContent("Likely eligible");
    expect(chips).toHaveTextContent("Applicant type: met");
    expect(chips).toHaveTextContent("Registration: unknown");
    const reasons = within(detail).getByRole("list", { name: "Top reasons" });
    expect(within(reasons).getByText("Tight deadline")).toBeInTheDocument();
    expect(within(reasons).queryByText("Fourth reason")).not.toBeInTheDocument();
    expect(within(reasons).getByText("+1 more on the opportunity page")).toBeInTheDocument();
    expect(within(reasons).getByRole("link", { name: /view cited fact fct_2/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/knowledge/facts?factId=fct_2",
    );
    // Every shortcut has a button that announces it.
    expect(within(detail).getByRole("button", { name: /Shortlist/ })).toHaveAttribute(
      "aria-keyshortcuts",
      "s",
    );
    expect(within(detail).getByRole("link", { name: /Open/ })).toHaveAttribute(
      "aria-keyshortcuts",
      "o",
    );
    expect(screen.getByRole("button", { name: "Next grant" })).toHaveAttribute(
      "aria-keyshortcuts",
      "j",
    );

    // j / k move the active grant and focus.
    await user.keyboard("j");
    expect(rowButton("Bravo Trades")).toHaveFocus();
    expect(detailHeading()).toHaveTextContent("Bravo Trades");
    await user.keyboard("k");
    expect(rowButton("Alpha Youth Build")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(rowButton("Bravo Trades")).toHaveFocus();
    await user.keyboard("{ArrowUp}");

    // s shortlists; focus moves to the next grant and the result is announced.
    await user.keyboard("s");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Alpha Youth Build" })).not.toBeInTheDocument(),
    );
    expect(rowButton("Bravo Trades")).toHaveFocus();
    expect(status()).toHaveTextContent("Shortlisted “Alpha Youth Build”. 2 grants left.");
    expect(posts).toEqual([{ ids: ["a"], status: "shortlisted" }]);

    // d opens the reason picker: 2 = wrong focus, Enter dismisses.
    await user.keyboard("d");
    const dialog = await screen.findByRole("dialog", { name: "Dismiss “Bravo Trades”?" });
    await user.keyboard("2");
    expect(within(dialog).getByRole("radio", { name: /Wrong focus/ })).toBeChecked();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(rowButton("Charlie Pantry")).toHaveFocus());
    expect(posts.at(-1)).toEqual({ ids: ["b"], status: "dismissed", dismissReason: "wrong_focus" });
    expect(status()).toHaveTextContent("Dismissed “Bravo Trades”. 1 grant left.");

    // o opens the opportunity.
    await user.keyboard("o");
    expect(navigate).toHaveBeenCalledWith({
      to: "/orgs/$orgId/opportunities/$opportunityId",
      params: { orgId: "org_1", opportunityId: "opp_c" },
    });

    // ? shows the shortcuts; Escape closes it (and is not taken as "clear selection").
    await user.keyboard("?");
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // x selects for bulk; s applies to the selection; the last one leaves inbox zero focused.
    await user.keyboard("x");
    expect(screen.getByRole("checkbox", { name: "Select Charlie Pantry" })).toBeChecked();
    expect(screen.getByRole("toolbar", { name: "Bulk actions" })).toHaveTextContent("1 selected");
    await user.keyboard("s");
    const zero = await screen.findByRole("heading", { name: "Inbox zero" });
    await waitFor(() => expect(zero).toHaveFocus());
    expect(status()).toHaveTextContent("Shortlisted “Charlie Pantry”. Inbox zero.");
    expect(posts.at(-1)).toEqual({ ids: ["c"], status: "shortlisted" });
  }, 30_000);

  it("bulk-dismisses the selection with buttons and requires a reason", async () => {
    const user = userEvent.setup();
    wrap(<TriageInbox orgId="org_1" canEdit now={NOW} />);
    await user.click(await screen.findByRole("checkbox", { name: "Select all 3" }));
    const toolbar = screen.getByRole("toolbar", { name: "Bulk actions" });
    await user.click(within(toolbar).getByRole("button", { name: /Dismiss 3/ }));

    const dialog = await screen.findByRole("dialog", { name: "Dismiss 3 grants?" });
    await user.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Pick a reason to dismiss.");
    expect(posts).toEqual([]);

    await user.click(within(dialog).getByRole("radio", { name: /Too small/ }));
    await user.type(within(dialog).getByRole("textbox", { name: "Note (optional)" }), "Under $5k");
    await user.click(within(dialog).getByRole("button", { name: "Dismiss" }));

    expect(await screen.findByRole("heading", { name: "Inbox zero" })).toBeInTheDocument();
    expect(posts).toEqual([
      {
        ids: ["a", "b", "c"],
        status: "dismissed",
        dismissReason: "too_small",
        dismissNote: "Under $5k",
      },
    ]);
  }, 20_000);

  it("puts the grant back and announces the error when the update fails", async () => {
    const user = userEvent.setup();
    failNextPost = true;
    wrap(<TriageInbox orgId="org_1" canEdit now={NOW} />);
    await screen.findByRole("button", { name: "Alpha Youth Build" });
    await user.keyboard("s");
    await waitFor(() => expect(status()).toHaveTextContent(/Couldn't update “Alpha Youth Build”/));
    expect(screen.getByRole("button", { name: "Alpha Youth Build" })).toBeInTheDocument();
  });

  it("is read-only for viewers: no triage buttons, shortcuts explain why", async () => {
    const user = userEvent.setup();
    wrap(<TriageInbox orgId="org_1" canEdit={false} now={NOW} />);
    await screen.findByRole("button", { name: "Alpha Youth Build" });
    expect(screen.queryByRole("button", { name: /Shortlist/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.keyboard("s");
    expect(status()).toHaveTextContent("Only editors can shortlist or dismiss grants.");
    await user.keyboard("j");
    expect(rowButton("Bravo Trades")).toHaveFocus();
    expect(posts).toEqual([]);
  });

  it("ignores shortcuts while typing in a field", async () => {
    const user = userEvent.setup();
    wrap(
      <>
        <input aria-label="Search" />
        <TriageInbox orgId="org_1" canEdit now={NOW} />
      </>,
    );
    await screen.findByRole("button", { name: "Alpha Youth Build" });
    await user.type(screen.getByRole("textbox", { name: "Search" }), "sdj");
    expect(posts).toEqual([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

function CountBadge() {
  const n = useInboxCount("org_1");
  return <span data-testid="count">{n ?? "…"}</span>;
}

describe("useInboxCount", () => {
  it("reads the inbox total without loading the items", async () => {
    wrap(<CountBadge />);
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("7"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orgs/org_1/matches/inbox?limit=0",
      expect.anything(),
    );
  });
});
