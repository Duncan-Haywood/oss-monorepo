// @vitest-environment happy-dom

import type { ProjectDetailDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ProcoreSsov, ssovLines } from "../../src/client/components/procore-ssov";

const withQuery = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const line = (
  id: string,
  itemNumber: string,
  description: string,
  cents: number,
  co: string | null = null,
) =>
  ({
    id,
    itemNumber,
    description,
    originalCents: cents,
    currentCents: cents,
    changeOrderId: co,
  }) as const;

const project = {
  id: "prj_1",
  sovLines: [
    line("a", "1", "Rough-in", 4_000_000),
    line("b", "2", "Trim", 1_000_000),
    line("c", "CO-1", "Extra circuit", 50_000, "co_1"),
  ],
} as unknown as ProjectDetailDto;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("leaves change order lines out and prefixes the item number", () => {
  expect(ssovLines(project)).toEqual([
    { id: "a", description: "1 Rough-in", cents: 4_000_000 },
    { id: "b", description: "2 Trim", cents: 1_000_000 },
  ]);
});

it("reads the GC's template, places the lines, shows totals and downloads the filled copy", async () => {
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    blobs.push(b as Blob);
    return "blob:x";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  withQuery(<ProcoreSsov project={project} />);
  fireEvent.click(screen.getByRole("button", { name: /procore subcontractor sov/i }));
  const csv =
    "SOV Position Number,Budget Code,SOV Description,SOV Amount,Subcontractor SOV Description,Subcontractor SOV Amount\r\n1,26-100 - Electrical,Electrical,50000,,0.00\r\n";
  fireEvent.change(screen.getByLabelText(/procore subcontractor sov template/i), {
    target: { files: [new File([csv], "SSOV.csv", { type: "text/csv" })] },
  });
  await screen.findByText(/matches the GC's \$50,000\.00/);
  expect(screen.getByLabelText(/GC position for 1 Rough-in/)).toHaveValue("1");
  fireEvent.click(screen.getByRole("button", { name: /download filled template/i }));
  await waitFor(() => expect(blobs).toHaveLength(1));
  expect(click).toHaveBeenCalledOnce();
  expect(await blobs[0]?.text()).toBe(
    "SOV Position Number,Budget Code,SOV Description,SOV Amount,Subcontractor SOV Description,Subcontractor SOV Amount\r\n1,26-100 - Electrical,Electrical,50000,1 Rough-in,40000.00\r\n1,26-100 - Electrical,Electrical,50000,2 Trim,10000.00\r\n",
  );

  fireEvent.change(screen.getByLabelText(/GC position for 2 Trim/), { target: { value: "" } });
  await screen.findByText(/under by \$10,000\.00/);
  expect(screen.getByText(/1 line is left out of the file/)).toBeInTheDocument();
});

it("explains a file that is not the template", async () => {
  withQuery(<ProcoreSsov project={project} />);
  fireEvent.click(screen.getByRole("button", { name: /procore subcontractor sov/i }));
  fireEvent.change(screen.getByLabelText(/procore subcontractor sov template/i), {
    target: { files: [new File(["Item,Description,Amount\n1,x,2\n"], "sov.csv")] },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(/Download CSV Template/);
});

it("preselects a saved placement and saves the placement for the invoice sheet", async () => {
  const csv =
    "SOV Position Number,SOV Description,SOV Amount,Subcontractor SOV Description,Subcontractor SOV Amount\r\n1,Electrical,40000,,0.00\r\n2,Fire alarm,10000,,0.00\r\n";
  const savedProject = {
    ...project,
    procoreSsov: {
      positions: [
        { position: "1", description: "Electrical", amountCents: 4_000_000 },
        { position: "2", description: "Fire alarm", amountCents: 1_000_000 },
      ],
      placed: { a: "1", b: "1" },
      savedOn: "2026-11-20",
    },
  } as unknown as ProjectDetailDto;
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(savedProject), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  withQuery(<ProcoreSsov project={savedProject} path="/api/x/procore-ssov" onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("button", { name: /procore subcontractor sov/i }));
  expect(screen.getByText(/Saved for the Procore invoice sheet on 2026-11-20/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/procore subcontractor sov template/i), {
    target: { files: [new File([csv], "SSOV.csv", { type: "text/csv" })] },
  });
  // By amount, Trim (10,000) would go under position 2; the saved choice (1) wins.
  await waitFor(() => expect(screen.getByLabelText(/GC position for 2 Trim/)).toHaveValue("1"));
  expect(screen.getByLabelText(/GC position for 1 Rough-in/)).toHaveValue("1");
  fireEvent.change(screen.getByLabelText(/GC position for 2 Trim/), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: /save for the invoice sheet/i }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(String(url)).toContain("/api/x/procore-ssov");
  expect(init?.method).toBe("PUT");
  expect(JSON.parse(String(init?.body))).toEqual({
    positions: [
      { position: "1", description: "Electrical", amountCents: 4_000_000 },
      { position: "2", description: "Fire alarm", amountCents: 1_000_000 },
    ],
    placed: { a: "1" },
  });
});
