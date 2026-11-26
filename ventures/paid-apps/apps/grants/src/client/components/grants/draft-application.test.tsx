// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftApplicationButton, DraftApplicationForm } from "./draft-application";
import { makeMatch } from "./test-fixtures";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a href={Object.entries(params ?? {}).reduce((h, [k, v]) => h.replace(`$${k}`, v), to)}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useParams: () => ({ orgId: "org_1" }),
}));

const apiMock = vi.fn();
vi.mock("@client/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@client/lib/api")>();
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  navigate.mockReset();
  apiMock.mockReset();
});

afterEach(cleanup);

describe("DraftApplicationForm", () => {
  it("prefills the suggested ask, posts the draft and navigates to the new application", async () => {
    apiMock.mockResolvedValue({ id: "app_42", status: "draft_queued" });
    const user = userEvent.setup();
    wrap(
      <DraftApplicationForm
        orgId="org_1"
        opportunityId="opp_1"
        match={makeMatch({ suggestedAskCents: 15_000_000 })}
        projects={[
          {
            id: "prj_1",
            orgId: "org_1",
            title: "Construction trades academy",
            status: "active",
          } as never,
        ]}
      />,
    );

    const amount = screen.getByLabelText("Requested amount (USD)");
    expect(amount).toHaveValue("150000");
    await user.clear(amount);
    await user.type(amount, "120,000");
    await user.selectOptions(screen.getByLabelText("Project"), "prj_1");
    await user.click(screen.getByRole("button", { name: /Draft application/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(apiMock).toHaveBeenCalledWith("/api/orgs/org_1/applications", {
      method: "POST",
      body: { opportunityId: "opp_1", projectId: "prj_1", requestedAmountCents: 12_000_000 },
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/orgs/$orgId/applications/$applicationId",
      params: { orgId: "org_1", applicationId: "app_42" },
    });
  });

  it("rejects a non-numeric amount without posting", async () => {
    const user = userEvent.setup();
    wrap(<DraftApplicationForm orgId="org_1" opportunityId="opp_1" match={null} projects={[]} />);
    expect(screen.queryByLabelText("Project")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Requested amount (USD)"), "lots");
    await user.click(screen.getByRole("button", { name: /Draft application/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Enter a dollar amount/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("shows an upgrade prompt on 402 payment_required and stays on the page", async () => {
    const { ApiError } = await import("@client/lib/api");
    apiMock.mockRejectedValue(
      new ApiError(402, "payment_required", "You've used all 3 application drafts this month."),
    );
    const user = userEvent.setup();
    wrap(<DraftApplicationButton orgId="org_1" opportunityId="opp_9" requestedAmountCents={500} />);
    await user.click(screen.getByRole("button", { name: /Draft application/ }));
    expect(await screen.findByText("Upgrade to keep going")).toBeInTheDocument();
    expect(screen.getByText(/used all 3 application drafts/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upgrade/i })).toHaveAttribute(
      "href",
      "/orgs/org_1/settings/billing",
    );
    expect(apiMock).toHaveBeenCalledWith("/api/orgs/org_1/applications", {
      method: "POST",
      body: { opportunityId: "opp_9", projectId: undefined, requestedAmountCents: 500 },
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("explains a 409 when an application is already in progress", async () => {
    const { ApiError } = await import("@client/lib/api");
    apiMock.mockRejectedValue(new ApiError(409, "conflict", "already in progress"));
    const user = userEvent.setup();
    wrap(<DraftApplicationForm orgId="org_1" opportunityId="opp_1" match={null} projects={[]} />);
    await user.click(screen.getByRole("button", { name: /Draft application/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Open it from Applications/);
  });
});
