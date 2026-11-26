// @vitest-environment happy-dom
import type { ProjectDetailDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OpeningBalance } from "../../src/client/components/opening-balance";

const line = (id: string, itemNumber: string, description: string, currentCents: number) => ({
  id,
  itemNumber,
  description,
  originalCents: currentCents,
  currentCents,
  sortOrder: 0,
  changeOrderId: null,
  openingCompletedCents: 0,
  retainagePctBps: null,
  retainageLocked: false,
});
const project = {
  id: "prj_1",
  opening: null,
  payApps: [],
  sovLines: [
    line("l1", "1", "Rough-in", 100_000),
    line("l2", "2", "Trim", 50_000),
    line("l3", "3", "Fixtures", 80_000),
  ],
} as unknown as ProjectDetailDto;

afterEach(() => vi.unstubAllGlobals());

it("fills the opening balance from a continuation sheet, then saves only what the form shows", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(project), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <OpeningBalance
        project={project}
        path="/api/orgs/o/projects/prj_1/opening"
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /enter the last application/i }));
  const csv = [
    "Application No.: 4",
    "Period to: 10/31/2026",
    "Item,Description,Scheduled value,From previous application,This period,Materials stored,Total completed and stored to date,Retainage",
    "1,Rough-in,1000,600,200,0,800,80",
    "2,Trim,500,0,100,0,100,10",
    "9,Gas piping,300,0,50,0,50,5",
  ].join("\n");
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File([csv], "app4.csv", { type: "text/csv" })] },
  });
  await screen.findByText(/Filled from app4.csv: work completed on 2 lines/, undefined, {
    timeout: 5000,
  });
  expect(screen.getByText(/did not match one line here: 9 Gas piping/)).toBeInTheDocument();
  // Reading the file sent nothing: it stays in the browser until the contractor saves.
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /save opening balance/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled(), { timeout: 5000 });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/o/projects/prj_1/opening");
  expect(JSON.parse(String(init.body))).toEqual({
    appNumber: 4,
    periodTo: "2026-10-31",
    // line 4 is G over every sheet row ($950), less retainage $95
    previousCertificatesCents: 85_500,
    retainageHeldCents: 9_500,
    lines: [
      { sovLineId: "l1", completedCents: 80_000 },
      { sovLineId: "l2", completedCents: 10_000 },
    ],
  });
});

it("puts a row that did not match on the line the contractor chooses, moves it, and saves the sum", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(project), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  const { container } = render(
    <QueryClientProvider client={new QueryClient()}>
      <OpeningBalance
        project={project}
        path="/api/orgs/o/projects/prj_1/opening"
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /enter the last application/i }));
  const csv = [
    "Application No.: 4",
    "Period to: 10/31/2026",
    "Item,Description,Scheduled value,From previous application,This period,Materials stored,Total completed and stored to date,Retainage",
    "1,Rough-in,1000,600,200,0,800,80",
    "2,Trim,500,0,100,0,100,10",
    "CO-2,Added gas line on trim,450,0,450,0,450,45",
  ].join("\n");
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File([csv], "app4.csv", { type: "text/csv" })] },
  });
  const select = (await screen.findByRole(
    "combobox",
    { name: /Line for CO-2 Added gas line on trim/ },
    { timeout: 5000 },
  )) as unknown as HTMLSelectElement;
  const trim = screen.getByRole("textbox", { name: /Work completed to date, item 2/ });
  const fixtures = screen.getByRole("textbox", { name: /Work completed to date, item 3/ });
  expect(select.value).toBe("");
  // On Trim: $100 from its own row plus $450, over Trim's $500.
  fireEvent.change(select, { target: { value: "l2" } });
  expect((trim as HTMLInputElement).value).toMatch(/550/);
  expect(screen.getByRole("alert")).toHaveTextContent(/2 Trim: \$550.00 completed of \$500.00/);
  // Moved to Fixtures: Trim goes back to its own row, and the warning goes.
  fireEvent.change(select, { target: { value: "l3" } });
  expect((trim as HTMLInputElement).value).toMatch(/100/);
  expect((fixtures as HTMLInputElement).value).toMatch(/450/);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /save opening balance/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled(), { timeout: 5000 });
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body)).lines).toEqual([
    { sovLineId: "l1", completedCents: 80_000 },
    { sovLineId: "l2", completedCents: 10_000 },
    { sovLineId: "l3", completedCents: 45_000 },
  ]);
});
