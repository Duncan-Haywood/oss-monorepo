// @vitest-environment happy-dom
import type { UnsentQuickBooksPaymentsDto } from "@shared/api/types";
import type { MemberRole } from "@shared/enums";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UnsentQuickBooksPayments } from "../../src/client/components/unsent-quickbooks";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const status = (over: Partial<UnsentQuickBooksPaymentsDto["status"]> = {}) => ({
  available: true,
  mode: "fake" as const,
  planIncludes: true,
  connection: {
    realmId: "r1",
    environment: "fake",
    connectedAt: "2026-11-01T00:00:00.000Z",
    refreshExpiresAt: "2027-02-01T00:00:00.000Z",
    invoiceItem: null,
    autoSendPayments: true,
  },
  ...over,
});

const payment = (over: Partial<UnsentQuickBooksPaymentsDto["payments"][number]> = {}) => ({
  paymentId: "pm_1",
  projectId: "pr_1",
  projectName: "Tempe Library Reroof",
  projectNumber: "25-031",
  payAppId: "pa_1",
  payAppNumber: 3,
  docNumber: "PA25-031-03",
  amountCents: 40_000,
  receivedOn: "2026-11-20",
  reference: "CHK-2210",
  otherCompany: false,
  ...over,
});

async function mount(first: UnsentQuickBooksPaymentsDto, role: MemberRole | null = "editor") {
  let current = first;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      current = { ...current, payments: [] };
      return Response.json({});
    }
    return Response.json(current);
  });
  vi.stubGlobal("fetch", fetchMock);
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        <UnsentQuickBooksPayments orgId="org_1" role={role} />
        <p>loaded</p>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
  await screen.findByText("loaded");
  return fetchMock;
}

it("lists each payment waiting and sends it through the pay application's route", async () => {
  const fetchMock = await mount({ status: status(), payments: [payment()] });
  expect(await screen.findByRole("heading", { name: "Not yet in QuickBooks" })).toBeTruthy();
  expect(screen.getByText(/One payment \(\$400\.00\)/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Tempe Library Reroof (25-031) #3" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Send to QuickBooks" }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method)).toBe(true),
  );
  const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method);
  expect(post?.[0]).toBe("/api/orgs/org_1/projects/pr_1/pay-apps/pa_1/payments/pm_1/quickbooks");
  // Sent: the list refetches empty and the card goes away.
  await waitFor(() => expect(screen.queryByText("Not yet in QuickBooks")).toBeNull());
});

it("marks one as already entered by hand", async () => {
  const fetchMock = await mount({ status: status(), payments: [payment()] });
  fireEvent.click(await screen.findByRole("button", { name: "Already in QuickBooks" }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method)?.[0]).toBe(
      "/api/orgs/org_1/projects/pr_1/pay-apps/pa_1/payments/pm_1/quickbooks?already=1",
    ),
  );
});

it("shows viewers the list without buttons, and says when QuickBooks is disconnected", async () => {
  await mount({ status: status(), payments: [payment()] }, "viewer");
  expect(await screen.findByText("Not sent")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send to QuickBooks" })).toBeNull();
  cleanup();
  await mount({ status: status({ connection: null }), payments: [payment()] });
  expect(await screen.findByText(/QuickBooks is not connected now/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send to QuickBooks" })).toBeNull();
});

it("flags an invoice in another company and hides the card when nothing waits", async () => {
  await mount({ status: status(), payments: [payment({ otherCompany: true })] });
  expect(
    await screen.findByText(/another QuickBooks company: enter it there by hand/),
  ).toBeTruthy();
  cleanup();
  await mount({ status: status(), payments: [] });
  expect(screen.queryByText("Not yet in QuickBooks")).toBeNull();
});
