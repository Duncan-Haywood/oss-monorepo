// @vitest-environment happy-dom
// "Labor from a payroll report" on the job-cost page (src/shared/payroll-report.ts).
import type { JobCostDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PayrollImport, parseBurdenPercent } from "../../src/client/components/payroll-import";

afterEach(() => vi.unstubAllGlobals());

const d = {
  projectId: "prj_1",
  projectName: "Riverside Clinic",
  billedThrough: null,
  entries: [
    {
      id: "jce_1",
      sovLineId: "sov_1",
      incurredOn: "2026-11-07",
      category: "labor",
      amountCents: 1,
      vendor: "Payroll",
      description: null,
      reference: "Payroll 2026-11-07 item 1",
      commitmentId: null,
      fromQuickBooks: false,
      createdAt: "2026-11-08T00:00:00Z",
    },
  ],
  commitments: [],
  canEdit: true,
  report: {
    lines: [
      { sovLineId: "sov_1", itemNumber: "1", description: "Branch wiring" },
      { sovLineId: "sov_2", itemNumber: "2", description: "Devices" },
    ],
  },
} as unknown as JobCostDto;

const CSV = [
  "Payroll by job",
  "Pay Date,Employee,Job,Cost Code,Hours,Gross Pay,Employer Taxes",
  "11/07/2026,Ana,Riverside Clinic,1,40,1000.00,76.50",
  "11/14/2026,Ana,Riverside Clinic,1,40,1000.00,76.50",
  "11/14/2026,Ben,Riverside Clinic,2,20,500.00,38.25",
  "11/14/2026,Cy,Other Job,1,40,900.00,68.85",
].join("\n");

it("reads the report, picks this job by name, adds burden and skips a date already imported", async () => {
  const fetchMock = vi.fn(async () => Response.json({ added: 2, skipped: 0 }, { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn(async () => {});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PayrollImport d={d} base="/api/orgs/org_1/projects/prj_1/job-cost" onSaved={onSaved} />
    </QueryClientProvider>,
  );
  const file = new File([CSV], "payroll.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Payroll report"), { target: { files: [file] } });
  expect(await screen.findByText(/header on row 2/)).toBeTruthy();
  expect(screen.getByLabelText("Job in the report")).toHaveValue("Riverside Clinic");
  expect(screen.getByText(/1 already imported; 1 rows of other jobs left out/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Labor burden percent"), { target: { value: "20" } });
  // 11/14: line 1 1000 + 76.50 + 200 burden; line 2 500 + 38.25 + 100 burden
  fireEvent.click(screen.getByRole("button", { name: "Add 2 labor costs ($1,914.75)" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/org_1/projects/prj_1/job-cost/entries");
  expect(JSON.parse(String(init.body))).toEqual({
    skipExistingReferences: true,
    entries: [
      {
        incurredOn: "2026-11-14",
        amountCents: 127_650,
        category: "labor",
        sovLineId: "sov_1",
        vendor: "Payroll",
        description: "Payroll report: 1 employee, 40 h, burden 20% of wages",
        reference: "Payroll 2026-11-14 item 1",
      },
      {
        incurredOn: "2026-11-14",
        amountCents: 63_825,
        category: "labor",
        sovLineId: "sov_2",
        vendor: "Payroll",
        description: "Payroll report: 1 employee, 20 h, burden 20% of wages",
        reference: "Payroll 2026-11-14 item 2",
      },
    ],
  });
  expect(await screen.findByText("Added 2 labor costs.")).toBeTruthy();
});

it("says so when the file has no payroll header", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PayrollImport d={d} base="/x" onSaved={async () => {}} />
    </QueryClientProvider>,
  );
  const file = new File(["Name,Phone\nAna,555"], "x.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Payroll report"), { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent(/No header row/);
});

it("reads a burden percent, and refuses what is not one", () => {
  expect(parseBurdenPercent("")).toBeNull();
  expect(parseBurdenPercent("18")).toBe(1_800);
  expect(parseBurdenPercent("22.5%")).toBe(2_250);
  expect(parseBurdenPercent("abc")).toBeUndefined();
  expect(parseBurdenPercent("250")).toBeUndefined();
});
