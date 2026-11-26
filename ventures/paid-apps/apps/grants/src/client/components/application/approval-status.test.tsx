// @vitest-environment happy-dom
import type { ApprovalStatusDto } from "@shared/approvals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalStatus, ApprovalStatusView, approvalSummaryText } from "./approval-status";

const status = (over: Partial<ApprovalStatusDto> = {}): ApprovalStatusDto => ({
  satisfied: false,
  needed: 2,
  have: [{ userId: "u_rosa", name: "Rosa" }],
  missingDescription: "Waiting for an admin",
  rule: { id: "big", name: "Big grants" },
  twoPersonRule: false,
  versionId: "ver_1",
  ...over,
});

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => vi.restoreAllMocks());

describe("approvalSummaryText", () => {
  it("reads like the review sidebar line", () => {
    expect(approvalSummaryText(status())).toBe("Approvals: 1 of 2 — Rosa ✓, waiting for an admin");
    expect(
      approvalSummaryText(
        status({
          satisfied: true,
          have: [
            { userId: "u_rosa", name: "Rosa" },
            { userId: "u_ken", name: "Ken" },
          ],
          missingDescription: "",
        }),
      ),
    ).toBe("Approvals: 2 of 2 — Rosa ✓, Ken ✓");
    expect(
      approvalSummaryText(status({ have: [], missingDescription: "Waiting for 2 more admins" })),
    ).toBe("Approvals: 0 of 2 — waiting for 2 more admins");
  });
});

describe("<ApprovalStatusView />", () => {
  it("lists approvers, delegations and who is still needed", () => {
    render(
      <ApprovalStatusView
        status={status({
          twoPersonRule: true,
          have: [{ userId: "u_ken", name: "Ken", onBehalfOf: { userId: "u_rosa", name: "Rosa" } }],
        })}
      />,
    );
    const region = screen.getByRole("region", { name: "Approvals" });
    expect(region).toHaveTextContent("Approvals: 1 of 2 — Ken ✓, waiting for an admin");
    expect(region).toHaveTextContent("(for Rosa)");
    expect(region).toHaveTextContent("Two-person rule");
    expect(region).toHaveTextContent("Rule: Big grants");
  });
});

describe("<ApprovalStatus />", () => {
  it("fetches the status for the application while it is in review", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(status()), { status: 200 }));
    withQuery(
      <ApprovalStatus orgId="org_1" applicationId="app_1" status="in_review" versionId="ver_1" />,
    );
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Approvals" })).toHaveTextContent("1 of 2"),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/orgs/org_1/approval-policies/status/app_1");
  });

  it("stays out of the way for the plain one-approver flow and outside review", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify(status({ needed: 1, have: [], rule: { id: "default", name: "Default" } })),
          { status: 200 },
        ),
      );
    const { container, rerender } = withQuery(
      <ApprovalStatus orgId="org_1" applicationId="app_1" status="in_review" versionId="ver_1" />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    fetchMock.mockClear();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ApprovalStatus orgId="org_1" applicationId="app_1" status="drafting" versionId="ver_1" />
      </QueryClientProvider>,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
