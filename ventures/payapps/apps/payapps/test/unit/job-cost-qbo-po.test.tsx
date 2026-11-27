// @vitest-environment happy-dom
// Purchase orders from QuickBooks on the job-cost page (docs/QUICKBOOKS.md, "Purchase orders from
// QuickBooks").
import type { JobCostDto, JobCostQboPoLineDto, JobCostQboPoLinesDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  PurchaseOrdersFromQuickBooks,
  poNote,
  ticksByDefault,
} from "../../src/client/components/job-cost-qbo-po";

afterEach(() => vi.unstubAllGlobals());

const d = {
  report: { lines: [{ sovLineId: "sov_1", itemNumber: "1", description: "Gear" }] },
} as unknown as JobCostDto;

const po = (over: Partial<JobCostQboPoLineDto>): JobCostQboPoLineDto => ({
  source: "9130:PurchaseOrder:201:1",
  txnDate: "2026-09-12",
  docNumber: "1001",
  vendor: "Graybar Electric",
  account: "Switchgear materials",
  description: null,
  amountCents: 1_800_000,
  status: "Open",
  manuallyClosed: false,
  suggestedCategory: "material",
  imported: null,
  ...over,
});

const list: JobCostQboPoLinesDto = {
  from: "2025-11-26",
  to: "2026-11-26",
  link: { by: "customer", id: "c2", name: "Acme General:Riverside Clinic" },
  truncated: false,
  lines: [
    po({}),
    po({
      source: "9130:PurchaseOrder:202:1",
      docNumber: "1002",
      vendor: "Sparky Subs LLC",
      amountCents: 500_000,
      status: "Closed",
      manuallyClosed: true,
      suggestedCategory: "subcontract",
    }),
  ],
};

it("ticks open orders, not closed ones, and imports the ticked ones as commitments", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ added: 1, skipped: 0, linked: 2 });
    if (url.includes("/purchase-orders?")) return Response.json(list);
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn(async () => {});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PurchaseOrdersFromQuickBooks
        d={d}
        qb="/api/orgs/org_1/projects/prj_1/job-cost/quickbooks"
        win={{ from: "2025-11-26", to: "2026-11-26" }}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Read purchase orders" }));
  expect(await screen.findByLabelText("Import PO 1001 Graybar Electric $18,000.00")).toBeChecked();
  expect(screen.getByLabelText("Import PO 1002 Sparky Subs LLC $5,000.00")).not.toBeChecked();
  expect(screen.getByText(/Closed by hand in QuickBooks/)).toBeTruthy();
  fireEvent.change(
    screen.getAllByLabelText("Schedule-of-values line for the order")[0] as Element,
    {
      target: { value: "sov_1" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Import 1 as commitments ($18,000.00)" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const post = fetchMock.mock.calls.find(
    (c) => (c[1] as RequestInit | undefined)?.method === "POST",
  );
  expect(post?.[0]).toBe(
    "/api/orgs/org_1/projects/prj_1/job-cost/quickbooks/purchase-orders/import",
  );
  expect(JSON.parse(String((post?.[1] as RequestInit | undefined)?.body))).toEqual({
    from: "2025-11-26",
    to: "2026-11-26",
    lines: [{ source: "9130:PurchaseOrder:201:1", sovLineId: "sov_1", category: "material" }],
  });
  expect(
    await screen.findByText(
      "Added 1 commitment; 2 imported costs from those orders put against them.",
    ),
  ).toBeTruthy();
});

it("notes imported, changed and closed orders", () => {
  expect(ticksByDefault(po({}))).toBe(true);
  expect(ticksByDefault(po({ status: "Closed" }))).toBe(false);
  expect(poNote(po({ status: "Closed" }))).toMatch(/billed in full/);
  expect(
    poNote(po({ imported: { commitmentId: "c", projectId: "p", thisJob: true, amountCents: 1 } })),
  ).toMatch(/Imported at \$0\.01; changed in QuickBooks since/);
  expect(
    poNote(
      po({
        imported: { commitmentId: "c", projectId: "q", thisJob: false, amountCents: 1_800_000 },
      }),
    ),
  ).toBe("Imported into another job");
  expect(poNote(po({}))).toBeNull();
});
