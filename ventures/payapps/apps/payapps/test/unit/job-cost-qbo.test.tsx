// @vitest-environment happy-dom
// "Costs from QuickBooks" on the job-cost page (docs/QUICKBOOKS.md, "Job costs from QuickBooks").
import type { JobCostDto, JobCostQboLineDto, JobCostQboLinesDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CostsFromQuickBooks, importedNote } from "../../src/client/components/job-cost-qbo";

afterEach(() => vi.unstubAllGlobals());

const d = {
  projectId: "prj_1",
  projectName: "Riverside Clinic",
  billedThrough: null,
  entries: [],
  commitments: [],
  canEdit: true,
  report: { lines: [{ sovLineId: "sov_1", itemNumber: "1", description: "Branch wiring" }] },
} as unknown as JobCostDto;

const line = (over: Partial<JobCostQboLineDto>): JobCostQboLineDto => ({
  source: "9130:Bill:146:1",
  txnType: "Bill",
  label: "Bill",
  txnDate: "2026-10-03",
  docNumber: "INV-7781",
  vendor: "Graybar Electric",
  account: "Job Materials",
  description: null,
  amountCents: 125_040,
  fromPurchaseOrder: false,
  suggestedCategory: "material",
  imported: null,
  ...over,
});

const lines: JobCostQboLinesDto = {
  from: "2025-11-26",
  to: "2026-11-26",
  link: { by: "customer", id: "c2", name: "Acme General:Riverside Clinic" },
  truncated: false,
  lines: [
    line({}),
    line({
      source: "9130:Purchase:150:1",
      txnType: "Purchase",
      label: "Card",
      docNumber: null,
      vendor: "Sunbelt Rentals",
      amountCents: 48_000,
      suggestedCategory: "equipment",
      imported: { entryId: "jce_1", projectId: "prj_1", thisJob: true, amountCents: 48_000 },
    }),
  ],
};

it("reads the linked customer's lines and imports the ticked ones on the chosen line", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ added: 1, skipped: 0 });
    if (url.includes("/lines?")) return Response.json(lines);
    return Response.json({
      available: true,
      reason: null,
      link: { by: "customer", id: "c2", name: "Acme General:Riverside Clinic" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn(async () => {});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CostsFromQuickBooks d={d} base="/api/orgs/org_1/projects/prj_1/job-cost" onSaved={onSaved} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Acme General:Riverside Clinic")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Read from QuickBooks" }));
  const box = await screen.findByLabelText("Import Graybar Electric $1,250.40");
  expect(box).toBeChecked();
  // The imported line has no checkbox and says so.
  expect(screen.queryByLabelText(/Import Sunbelt Rentals/)).toBeNull();
  expect(screen.getByText("Imported")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Schedule-of-values line"), {
    target: { value: "sov_1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import 1 as costs ($1,250.40)" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const post = fetchMock.mock.calls.find(
    (c) => (c[1] as RequestInit | undefined)?.method === "POST",
  );
  expect(post?.[0]).toBe("/api/orgs/org_1/projects/prj_1/job-cost/quickbooks/import");
  expect(JSON.parse(String((post?.[1] as RequestInit | undefined)?.body))).toEqual({
    from: "2025-11-26",
    to: "2026-11-26",
    lines: [{ source: "9130:Bill:146:1", sovLineId: "sov_1", category: "material" }],
  });
  expect(await screen.findByText("Added 1 cost.")).toBeTruthy();
});

it("says why when costs cannot be read, and flags a bill changed since import", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ available: false, reason: "Connect QuickBooks first.", link: null }),
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CostsFromQuickBooks d={d} base="/x" onSaved={async () => {}} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Connect QuickBooks first.")).toBeTruthy();
  expect(
    importedNote(
      line({ imported: { entryId: "e", projectId: "p", thisJob: true, amountCents: 100 } }),
    ),
  ).toMatch(/Imported at \$1\.00; changed in QuickBooks since/);
  expect(
    importedNote(
      line({ imported: { entryId: "e", projectId: "q", thisJob: false, amountCents: 1 } }),
    ),
  ).toBe("Imported into another job");
});

it("links a job by class, offering the job's invoice class first", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return Response.json({
        available: true,
        reason: null,
        link: { by: "class", id: "k2", name: "Jobs:Mesa Clinic" },
      });
    }
    if (url.endsWith("/classes")) {
      return Response.json({
        classes: [
          { id: "k1", name: "Jobs" },
          { id: "k2", name: "Jobs:Mesa Clinic" },
        ],
        jobClassId: "k2",
      });
    }
    if (url.endsWith("/customers")) return Response.json({ customers: [] });
    return Response.json({ available: true, reason: null, link: null });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CostsFromQuickBooks d={d} base="/j" onSaved={async () => {}} />
    </QueryClientProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Costs tagged by"), {
    target: { value: "class" },
  });
  expect(await screen.findByText("Jobs:Mesa Clinic (on this job's invoices)")).toBeTruthy();
  expect(screen.getByLabelText("QuickBooks class")).toHaveValue("k2");
  fireEvent.click(screen.getByRole("button", { name: "Link class" }));
  expect(await screen.findByText("class Jobs:Mesa Clinic")).toBeTruthy();
  const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
  expect(put?.[0]).toBe("/j/quickbooks/link");
  expect(JSON.parse(String((put?.[1] as RequestInit | undefined)?.body))).toEqual({
    classId: "k2",
  });
});
