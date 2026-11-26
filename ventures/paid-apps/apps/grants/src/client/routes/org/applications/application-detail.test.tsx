// @vitest-environment happy-dom
import {
  type FetchCall,
  json,
  ME,
  makeDetail,
  makeFlag,
  mockFetch,
  type Route,
} from "@client/components/application/test-fixtures";
import type { ApplicationDetail } from "@client/components/application/types";
import { guideKeys, writeGuidePref } from "@client/components/guide/storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationDetailPage } from "./application-detail";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/mock" className={className}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useParams: () => ({ orgId: "org_1", applicationId: "app_1" }),
}));

const BASE = "/api/orgs/org_1";

function routes(detail: () => ApplicationDetail, extra: Route[] = []): Route[] {
  return [
    ...extra,
    ["GET", "/api/me", () => ME],
    ["GET", `${BASE}/applications/app_1`, () => detail()],
    ["GET", `${BASE}/applications/app_1/cost`, () => ({ costMicros: 1_234_567, calls: 6 })],
    ["GET", `${BASE}/reviews/app_1/feedback`, () => ({ items: [] })],
  ];
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApplicationDetailPage />
    </QueryClientProvider>,
  );
}

const decisionCalls = (calls: FetchCall[]) =>
  calls.filter((c) => c.method === "POST" && c.url.endsWith("/reviews/app_1/decision"));

// A returning reviewer: the review tour would otherwise auto-start (its own tests live in guide/).
beforeEach(() => writeGuidePref(guideKeys.toursOptOut(ME.user.id), "1"));
afterEach(() => {
  vi.unstubAllGlobals();
  navigate.mockReset();
  window.localStorage.clear();
});

describe("ApplicationDetailPage", () => {
  it("shows the header, reviewer summary, grounding counts, flags and cost", async () => {
    mockFetch(routes(() => makeDetail()));
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "YouthBuild Gallup 2027", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /executive summary/i })).toBeInTheDocument();
    expect(screen.getByText(/train Navajo youth in construction trades/)).toBeInTheDocument();
    // Tier reason as plain sentences.
    expect(
      screen.getByText(
        "First submission to this funder. Ask $50,000 is above the autopilot limit of $10,000.",
      ),
    ).toBeInTheDocument();
    const flags = screen.getByRole("region", { name: "Flags" });
    expect(within(flags).getByText(/does not appear in the cited fact/)).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument(); // grounding badge
    expect(await screen.findByText("$1.23")).toBeInTheDocument();
  });

  it("approve & submit lists open warnings + the channel, then posts the decision", async () => {
    let detail = makeDetail();
    const calls = mockFetch(
      routes(
        () => detail,
        [
          [
            "POST",
            `${BASE}/reviews/app_1/decision`,
            () => {
              detail = { ...detail, status: "submitted" };
              return detail;
            },
          ],
        ],
      ),
    );
    const user = userEvent.setup();
    renderPage();
    const approve = await screen.findByRole("button", { name: /approve.*submit/i });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);

    const dialog = await screen.findByRole("dialog", { name: /approve & submit/i });
    expect(within(dialog).getByText(/Open warnings \(1\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/does not appear in the cited fact/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Grants\.gov Workspace/)).toBeInTheDocument();
    expect(decisionCalls(calls)).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: /approve & submit/i }));
    await waitFor(() => expect(decisionCalls(calls)).toHaveLength(1));
    expect(decisionCalls(calls)[0]?.body).toEqual({ decision: "approved" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The detail is refetched after the decision.
    expect(await screen.findAllByText("Submitted")).not.toHaveLength(0);
  });

  it("disables approve while blockers are open and explains why", async () => {
    const detail = makeDetail({
      flags: [
        makeFlag(),
        makeFlag({
          id: "flg_2",
          severity: "blocker",
          kind: "unsupported_claim",
          message: "The claim about job placement isn't supported by any fact.",
        }),
      ],
    });
    const calls = mockFetch(routes(() => detail));
    const user = userEvent.setup();
    renderPage();
    const approve = await screen.findByRole("button", { name: /approve.*submit/i });
    expect(approve).toBeDisabled();
    expect(screen.getByText("Resolve 1 blocking flag before approving.")).toBeInTheDocument();
    expect(approve).toHaveAccessibleDescription("Resolve 1 blocking flag before approving.");
    await user.click(approve);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(decisionCalls(calls)).toHaveLength(0);
    // Blockers are listed before warnings.
    const items = within(screen.getByRole("region", { name: "Flags" })).getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("data-severity", "blocker");
    expect(items[1]).toHaveAttribute("data-severity", "warning");
  });

  it("keeps blockers visible and collapses a long tail of warnings", async () => {
    const warnings = [1, 2, 3, 4, 5].map((i) =>
      makeFlag({ id: `flg_w${i}`, message: `Warning number ${i}` }),
    );
    const blocker = makeFlag({ id: "flg_b", severity: "blocker", message: "A blocker" });
    mockFetch(routes(() => makeDetail({ flags: [...warnings, blocker] })));
    const user = userEvent.setup();
    renderPage();
    const region = await screen.findByRole("region", { name: "Flags" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(4);
    expect(within(region).getAllByRole("listitem")[0]).toHaveAttribute("data-severity", "blocker");
    await user.click(within(region).getByRole("button", { name: "Show 2 more flags" }));
    expect(within(region).getAllByRole("listitem")).toHaveLength(6);
  });

  it("shows a friendly message when the API rejects approval with 409", async () => {
    mockFetch(
      routes(
        () => makeDetail(),
        [
          [
            "POST",
            `${BASE}/reviews/app_1/decision`,
            () =>
              json(
                {
                  error: {
                    code: "open_blockers",
                    message: "Resolve 1 blocking flag before approving",
                  },
                },
                409,
              ),
          ],
        ],
      ),
    );
    const user = userEvent.setup();
    renderPage();
    const approve = await screen.findByRole("button", { name: /approve.*submit/i });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    const dialog = await screen.findByRole("dialog", { name: /approve & submit/i });
    await user.click(within(dialog).getByRole("button", { name: /approve & submit/i }));
    expect(
      await within(dialog).findByText("Resolve the blocking flags first, then approve again."),
    ).toBeInTheDocument();
  });

  it("request changes requires comments and posts them", async () => {
    const calls = mockFetch(
      routes(
        () => makeDetail(),
        [
          [
            "POST",
            `${BASE}/reviews/app_1/decision`,
            () => makeDetail({ status: "changes_requested" }),
          ],
        ],
      ),
    );
    const user = userEvent.setup();
    renderPage();
    const btn = await screen.findByRole("button", { name: /request changes/i });
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    await user.click(within(dialog).getByRole("button", { name: "Request changes" }));
    expect(await within(dialog).findByText("Tell the drafter what to change.")).toBeInTheDocument();
    expect(decisionCalls(calls)).toHaveLength(0);
    await user.type(within(dialog).getByLabelText(/What should change/), "Shorten the need");
    await user.click(within(dialog).getByRole("button", { name: "Request changes" }));
    await waitFor(() => expect(decisionCalls(calls)).toHaveLength(1));
    expect(decisionCalls(calls)[0]?.body).toEqual({
      decision: "changes_requested",
      comments: "Shorten the need",
    });
  });

  it("resolves a flag and starts a gap-fill interview for missing info", async () => {
    const detail = makeDetail({
      status: "needs_info",
      flags: [
        makeFlag({
          id: "flg_9",
          severity: "blocker",
          kind: "missing_info",
          claimId: null,
          message: "We don't know how many participants the project will serve.",
          suggestedQuestion: "How many participants will you serve in year one?",
        }),
      ],
    });
    const calls = mockFetch(
      routes(
        () => detail,
        [
          ["POST", `${BASE}/applications/app_1/flags/flg_9/resolve`, () => makeFlag()],
          ["POST", `${BASE}/interviews`, () => ({ id: "int_7", turns: [] })],
        ],
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /answer in an interview/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(calls.find((c) => c.url === `${BASE}/interviews`)?.body).toEqual({
      kind: "gap_fill",
      focusApplicationId: "app_1",
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/orgs/$orgId/interviews/$interviewId",
      params: { orgId: "org_1", interviewId: "int_7" },
    });

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await user.type(screen.getByLabelText("How was this resolved?"), "About 40 per cohort");
    await user.click(screen.getByRole("button", { name: "Save resolution" }));
    await waitFor(() =>
      expect(calls.find((c) => c.url.endsWith("/flags/flg_9/resolve"))?.body).toEqual({
        resolution: "About 40 per cohort",
      }),
    );
  });
});
