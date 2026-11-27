// @vitest-environment happy-dom
import type { PayAppDetailDto, ProjectDetailDto } from "@shared/api/types";
import type { ContinuationLine } from "@shared/payapp-math";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProcoreInvoicePanel } from "../../src/client/components/procore-invoice";

const cl = (id: string, item: string, desc: string, c: number, e: number, f: number) =>
  ({
    sovLineId: id,
    itemNumber: item,
    description: desc,
    scheduledValueCents: c,
    fromPreviousCents: 0,
    thisPeriodCents: e,
    storedMaterialsCents: f,
    completedAndStoredCents: e + f,
    percentCompleteBps: Math.round(((e + f) * 10_000) / c),
    balanceToFinishCents: c - e - f,
    retainageCents: 0,
    retainageReleasedThisPeriodCents: 0,
    retainageRateBps: null,
  }) satisfies ContinuationLine;

const app = (id: string, number: number, lines: ContinuationLine[]) =>
  ({ id, number, status: "submitted", computed: { lines } }) as unknown as PayAppDetailDto;

const project = {
  id: "prj_1",
  opening: null,
  payApps: [
    { id: "pa_1", number: 1 },
    { id: "pa_2", number: 2 },
  ],
  sovLines: [
    { id: "a", changeOrderId: null },
    { id: "c", changeOrderId: "co_1" },
  ],
} as unknown as ProjectDetailDto;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel(a: PayAppDetailDto, p: ProjectDetailDto = project) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ProcoreInvoicePanel orgId="org_1" project={p} app={a} />
    </QueryClientProvider>,
  );
}

it("loads the previous application, shows the amounts to type and flags a stored balance that fell", async () => {
  const previous = app("pa_1", 1, [cl("a", "1", "Rough-in", 4_000_000, 1_000_000, 300_000)]);
  const fetchMock = vi.fn(
    async (_url: string) => new Response(JSON.stringify(previous), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  renderPanel(
    app("pa_2", 2, [
      cl("a", "1", "Rough-in", 4_000_000, 800_000, 100_000),
      cl("c", "CO-1", "Extra circuit", 50_000, 50_000, 20_000),
    ]),
  );
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /procore invoice sheet/i }));
  await screen.findByText(/Stored materials went down on 1 Rough-in/);
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/pay-apps/pa_1");
  expect(screen.getByText("(change order)")).toBeInTheDocument();
  // The CO line was not on the previous application: all of its stored balance is new.
  expect(
    screen.getByRole("button", { name: /copy new materials stored for CO-1/i }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /copy new materials stored for 1 Rough-in/i }),
  ).toBeNull();
  expect(screen.getByText("$8,500.00")).toBeInTheDocument();
});

it("on the first application needs no fetch and downloads the worksheet", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    blobs.push(b as Blob);
    return "blob:x";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  renderPanel(app("pa_1", 1, [cl("a", "1", "Rough-in", 4_000_000, 1_000_000, 250_000)]));
  fireEvent.click(screen.getByRole("button", { name: /procore invoice sheet/i }));
  fireEvent.click(await screen.findByRole("button", { name: /download as csv/i }));
  await waitFor(() => expect(blobs).toHaveLength(1));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await blobs[0]?.text()).toContain("1 Rough-in,,40000.00,10000.00,2500.00,2500.00,31.25");
});

it("totals by the saved Procore SOV positions, lists change orders apart, and switches to lines", async () => {
  vi.stubGlobal("fetch", vi.fn());
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    blobs.push(b as Blob);
    return "blob:x";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const placedProject = {
    ...project,
    payApps: [{ id: "pa_1", number: 1 }],
    sovLines: [
      { id: "a", changeOrderId: null },
      { id: "b", changeOrderId: null },
      { id: "c", changeOrderId: "co_1" },
    ],
    procoreSsov: {
      positions: [{ position: "10", description: "Electrical", amountCents: 5_000_000 }],
      placed: { a: "10", b: "10" },
      savedOn: "2026-11-20",
    },
  } as unknown as ProjectDetailDto;
  renderPanel(
    app("pa_1", 1, [
      cl("a", "1", "Rough-in", 4_000_000, 1_000_000, 0),
      cl("b", "2", "Trim", 1_000_000, 250_000, 0),
      cl("c", "CO-1", "Extra circuit", 50_000, 50_000, 0),
    ]),
    placedProject,
  );
  fireEvent.click(screen.getByRole("button", { name: /procore invoice sheet/i }));
  await screen.findByText(/Totalled by the GC's 1 Procore SOV position/);
  expect(screen.getByText("10 Electrical")).toBeInTheDocument();
  expect(screen.getByText("1 Rough-in; 2 Trim")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /copy work this period for position 10/i }),
  ).toBeInTheDocument();
  expect(screen.getByText("$12,500.00")).toBeInTheDocument();
  expect(screen.getByText(/Change orders \(Procore lists/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /download as csv/i }));
  await waitFor(() => expect(blobs).toHaveLength(1));
  expect(await blobs[0]?.text()).toContain("10,Electrical,50000.00,12500.00,0.00,0.00,25.00");

  fireEvent.click(screen.getByRole("button", { name: /show your lines instead/i }));
  expect(
    screen.getByRole("button", { name: /copy work this period for 1 Rough-in/i }),
  ).toBeInTheDocument();
  expect(screen.queryByText("10 Electrical")).toBeNull();
});
