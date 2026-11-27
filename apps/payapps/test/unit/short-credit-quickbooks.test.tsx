// @vitest-environment happy-dom
// The pay application's QuickBooks panel: a balance closed short offers "Send as a credit memo"
// once every payment is in QuickBooks, waits while one is not, and says when QuickBooks applied the
// credit to another invoice.
import type { PayAppQuickBooksDto, QuickBooksShortCreditDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QuickBooksPanel } from "../../src/client/components/quickbooks";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const credit = (over: Partial<QuickBooksShortCreditDto> = {}): QuickBooksShortCreditDto => ({
  cents: 500_000,
  reason: "backcharge",
  closedOn: "2026-11-20",
  sent: null,
  waitingFor: null,
  ...over,
});

const dto = (shortCredit: QuickBooksShortCreditDto | null): PayAppQuickBooksDto => ({
  status: {
    available: true,
    mode: "fake",
    planIncludes: true,
    connection: {
      realmId: "r1",
      environment: "fake",
      connectedAt: "2026-11-01T00:00:00.000Z",
      refreshExpiresAt: "2027-02-01T00:00:00.000Z",
      invoiceItem: null,
      autoSendPayments: false,
    },
  },
  sent: {
    invoiceId: "1047",
    docNumber: "PA24-117-01",
    totalCents: 4_500_000,
    lineCount: 2,
    sentAt: "2026-11-01T00:00:00.000Z",
    realmId: "r1",
  },
  preview: null,
  previewProblem: null,
  payments: [],
  shortCredit,
});

async function mount(first: PayAppQuickBooksDto) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(
      init?.method === "POST"
        ? dto(
            credit({
              sent: {
                creditMemoId: "2301",
                docNumber: "CR24-117-01",
                byHand: false,
                applied: true,
                sentAt: "2026-11-20T00:00:00.000Z",
              },
            }),
          )
        : first,
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        <QuickBooksPanel orgId="org_1" base="/api/orgs/org_1/projects/pr_1/pay-apps/pa_1" />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
  await screen.findByText(/Sent on/);
  return fetchMock;
}

it("sends the balance closed short as a credit memo", async () => {
  const fetchMock = await mount(dto(credit()));
  expect(screen.getByText(/\$5,000\.00 closed as backcharge on 2026-11-20/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Send as a credit memo" }));
  await screen.findByText(/credit memo CR24-117-01, applied to the invoice/);
  const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method);
  expect(post?.[0]).toBe("/api/orgs/org_1/projects/pr_1/pay-apps/pa_1/quickbooks/short-credit");
});

it("waits for the payments, and flags a credit QuickBooks applied elsewhere", async () => {
  await mount(dto(credit({ waitingFor: "Send or mark the payment above first, so ..." })));
  expect(screen.queryByRole("button", { name: "Send as a credit memo" })).toBeNull();
  expect(screen.getByText(/Send or mark the payment above first/)).toBeTruthy();
  cleanup();
  await mount(
    dto(
      credit({
        sent: {
          creditMemoId: "2301",
          docNumber: "CR24-117-01",
          byHand: false,
          applied: false,
          sentAt: "2026-11-20T00:00:00.000Z",
        },
      }),
    ),
  );
  await waitFor(() => expect(screen.getByText(/applied it to\s+another invoice/)).toBeTruthy());
});
