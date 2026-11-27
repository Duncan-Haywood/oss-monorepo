// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import type { ProjectDetailDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { copyFromJob, SovImport } from "../../src/client/components/sov-import";

const project = {
  id: "prj_1",
  originalContractSumCents: 1_500_000,
  sovTotalCents: 0,
  sovLines: [],
  billingStarted: false,
} as unknown as ProjectDetailDto;

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const onImported = vi.fn();
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ ...project, sovTotalCents: 1_500_000 }), { status: 201 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SovImport
        orgId="o"
        project={project}
        bulkPath="/api/orgs/o/projects/p/sov-lines/bulk"
        onImported={onImported}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /import from excel, csv, pdf or another job/i }),
  );
  return { onImported, fetchMock };
}

const pick = (text: string, name = "sov.csv") => {
  const input = screen.getByLabelText(/spreadsheet or pdf file/i) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([text], name, { type: "text/csv" })] } });
};

it("previews the sheet, shows what was left out, and posts only the contract lines", async () => {
  const { onImported, fetchMock } = setup();
  pick(
    [
      "Item,Description,Scheduled value",
      '1,Site work,"$10,000.00"',
      "2,Paving,5000",
      "CO-1,Extra striping,750",
      'TOTAL,,"$15,750.00"',
    ].join("\n"),
  );
  // The file's first test pays for the cold render; on a loaded CI runner it took 3 s and the default
  // 1 s wait ran out (PR 19627's first run), so the two waits get 5 s.
  await screen.findByText(/Found 2 lines/, undefined, { timeout: 5000 });
  expect(screen.getByText(/will total the contract sum exactly/)).toBeInTheDocument();
  expect(screen.getByText(/left out \(change order\)/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /add 2 lines/i }));
  await waitFor(() => expect(onImported).toHaveBeenCalled(), { timeout: 5000 });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/o/projects/p/sov-lines/bulk");
  expect(JSON.parse(String(init.body))).toEqual({
    lines: [
      { itemNumber: "1", description: "Site work", originalCents: 1_000_000 },
      { itemNumber: "2", description: "Paving", originalCents: 500_000 },
    ],
  });
});

it("previews a PDF bid breakdown with each line's page and line", async () => {
  const { fetchMock } = setup();
  const bytes = readFileSync(`${process.cwd()}/test/fixtures/bid-breakdown-chrome.pdf`);
  const input = screen.getByLabelText(/spreadsheet or pdf file/i) as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File([new Uint8Array(bytes)], "bid.pdf", { type: "application/pdf" })] },
  });
  await screen.findByText(/Found 48 lines/);
  expect(screen.getByText(/Read from the PDF's text/)).toBeInTheDocument();
  expect(screen.getAllByText(/page 1, line 5/).length).toBeGreaterThan(0);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("says how far the import is from the contract sum, and shows a reading error without posting", async () => {
  const { fetchMock } = setup();
  pick("Item,Description,Amount\n1,Site work,9000");
  await screen.findByText(/\$6,000\.00 apart/);
  pick("Item,Description,Amount\n1,Site work,TBD");
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent(/is not a dollar amount/);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("previews rows pasted from Excel (tabs) and posts them", async () => {
  const { onImported, fetchMock } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Paste rows" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: {
      value:
        "Item\tDescription\tScheduled value\n1\tMobilization, bonds\t5,000.00\n2\tRough-in\t$10,000.00\n",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(await screen.findByText(/total the contract sum exactly/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /add 2 lines/i }));
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
  const body = JSON.parse(String(init.body));
  expect(body.lines).toEqual([
    { itemNumber: "1", description: "Mobilization, bonds", originalCents: 500_000 },
    { itemNumber: "2", description: "Rough-in", originalCents: 1_000_000 },
  ]);
});

it("copies another job's original lines, with or without amounts, leaving CO lines out", () => {
  const other = {
    ...project,
    id: "prj_2",
    name: "Oak Ave School",
    sovLines: [
      {
        id: "a",
        itemNumber: "1",
        description: "Mobilization",
        originalCents: 300_000,
        currentCents: 300_000,
        sortOrder: 1,
        changeOrderId: null,
      },
      {
        id: "b",
        itemNumber: "9",
        description: "CO 1 panel",
        originalCents: 0,
        currentCents: 50_000,
        sortOrder: 2,
        changeOrderId: "co_1",
      },
    ],
  } as unknown as ProjectDetailDto;
  const r = copyFromJob(other, true);
  expect(r.ok && r.lines).toEqual([
    {
      itemNumber: "1",
      description: "Mobilization",
      originalCents: 300_000,
      source: "Oak Ave School",
    },
  ]);
  expect(r.ok && r.notes[0]).toMatch(/1 line added there by change orders left out/);
  const blank = copyFromJob(other, false);
  expect(blank.ok && blank.lines[0]?.originalCents).toBe(0);
  expect(copyFromJob({ ...other, sovLines: [] } as unknown as ProjectDetailDto, true).ok).toBe(
    false,
  );
});

it("lists the organization's other jobs to copy from", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              { id: "prj_1", name: "This job" },
              { id: "prj_2", name: "Oak Ave School", number: "24-17" },
            ],
          }),
          { status: 200 },
        ),
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SovImport orgId="o" project={project} bulkPath="/x" onImported={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /import from excel, csv, pdf or another job/i }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy from another job" }));
  expect(await screen.findByRole("option", { name: "Oak Ave School (24-17)" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "This job" })).toBeNull();
});
