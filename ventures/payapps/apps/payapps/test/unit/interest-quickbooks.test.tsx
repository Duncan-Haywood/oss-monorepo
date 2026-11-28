// @vitest-environment happy-dom
// The cash page's paid-late interest row: "Invoice in QuickBooks" posts to the pay application's
// interest-invoice route and then shows the invoice number; nothing shows while QuickBooks is not
// connected, and waived interest gets no button.
import type { QuickBooksInterestInvoicesDto } from "@shared/api/types";
import type { CashReportProject, PaidLateApp } from "@shared/cash-report";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  InterestQuickBooks,
  useInterestInvoices,
} from "../../src/client/components/interest-quickbooks";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const status = (connected = true): QuickBooksInterestInvoicesDto["status"] => ({
  available: true,
  mode: "fake",
  planIncludes: true,
  connection: connected
    ? {
        realmId: "r1",
        environment: "fake",
        connectedAt: "2026-11-01T00:00:00.000Z",
        refreshExpiresAt: "2027-02-01T00:00:00.000Z",
        invoiceItem: null,
        autoSendPayments: false,
      }
    : null,
});

const job = { id: "prj_1", gcName: "Harbor Builders" } as CashReportProject;
const app = (settled: PaidLateApp["settled"] = null): PaidLateApp => ({
  payAppId: "pa_1",
  number: 1,
  applicationDate: "2026-08-01",
  periodTo: "2026-07-31",
  dueOn: "2026-08-31",
  paidOn: "2026-09-30",
  daysLate: 30,
  paidCents: 4_500_000,
  interestCents: 67_500,
  settled,
});

function Row({ a }: { a: PaidLateApp }) {
  const q = useInterestInvoices("org_1");
  return <InterestQuickBooks orgId="org_1" job={job} app={a} data={q.data} />;
}

function mount(first: QuickBooksInterestInvoicesDto, a = app()) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(
      init?.method === "POST"
        ? {
            status: first.status,
            invoices: [
              {
                payAppId: "pa_1",
                invoiceId: "1050",
                docNumber: "LI24-117-01",
                byHand: false,
                amountCents: 67_500,
                sentAt: "2026-11-28T00:00:00.000Z",
                otherCompany: false,
              },
            ],
          }
        : first,
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Row a={a} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

it("invoices the interest in QuickBooks and shows the invoice number", async () => {
  const fetchMock = mount({ status: status(), invoices: [] });
  fireEvent.click(await screen.findByRole("button", { name: "Invoice in QuickBooks" }));
  await screen.findByText("In QuickBooks as invoice LI24-117-01");
  const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method);
  expect(post?.[0]).toBe(
    "/api/orgs/org_1/projects/prj_1/pay-apps/pa_1/quickbooks/interest-invoice",
  );
});

it("shows nothing without a connection, and no button for waived interest", async () => {
  const fetchMock = mount({ status: status(false), invoices: [] });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole("button", { name: "Invoice in QuickBooks" })).toBeNull();
  cleanup();
  mount(
    { status: status(), invoices: [] },
    app({ kind: "waived", on: "2026-10-05", cents: 67_500, note: null }),
  );
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole("button", { name: "Invoice in QuickBooks" })).toBeNull();
});
