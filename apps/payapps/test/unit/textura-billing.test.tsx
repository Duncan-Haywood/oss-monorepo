// @vitest-environment happy-dom
import type { PayAppDetailDto, ProjectDetailDto } from "@shared/api/types";
import type { ContinuationLine } from "@shared/payapp-math";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TexturaBillingPanel } from "../../src/client/components/textura-billing";

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
  payApps: [{ id: "pa_1", number: 1 }],
  sovLines: [],
} as unknown as ProjectDetailDto;

const TEMPLATE = [
  "Phase Code,Description,Budget Amount,Work This Period,Material Stored This Period",
  "1,Mobilization,5000.00,0.00,0.00",
  "2,Rough-in,40000.00,0.00,0.00",
  "99,Allowance,1000.00,0.00,0.00",
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel(a: PayAppDetailDto) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TexturaBillingPanel orgId="org_1" project={project} app={a} />
    </QueryClientProvider>,
  );
}

it("fills the GC's template from the application, lets a row be re-matched, and downloads it", async () => {
  vi.stubGlobal("fetch", vi.fn());
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    blobs.push(b as Blob);
    return "blob:x";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  renderPanel(
    app("pa_1", 1, [
      cl("a", "1", "Mobilization", 500_000, 500_000, 0),
      cl("b", "2", "Rough-in", 4_000_000, 1_000_000, 250_000),
      cl("x", "3", "Extra work", 120_000, 10_000, 0),
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: /textura billing upload/i }));
  fireEvent.change(await screen.findByLabelText(/textura template/i), {
    target: { files: [new File([TEMPLATE], "Billing Template.csv", { type: "text/csv" })] },
  });
  await screen.findByText("Total written");
  // Extra work is on no Textura row yet.
  expect(screen.getByText(/Billed this period but on no Textura row/)).toHaveTextContent(
    /on no Textura row: Extra work\./,
  );
  fireEvent.change(screen.getByLabelText(/Your line for Textura row 99/), {
    target: { value: "x" },
  });
  await waitFor(() =>
    expect(screen.queryByText(/Billed this period but on no Textura row/)).toBeNull(),
  );
  expect(screen.getByText(/budget differs from your scheduled value/)).toHaveTextContent(
    /on Extra work \(\$1,000\.00 against \$1,200\.00\)/,
  );
  fireEvent.click(screen.getByRole("button", { name: /download the filled csv/i }));
  await waitFor(() => expect(blobs).toHaveLength(1));
  expect(await blobs[0]?.text()).toBe(
    [
      "Phase Code,Description,Budget Amount,Work This Period,Material Stored This Period",
      "1,Mobilization,5000.00,5000.00,0.00",
      "2,Rough-in,40000.00,10000.00,2500.00",
      "99,Allowance,1000.00,100.00,0.00",
      "",
    ].join("\r\n"),
  );
});

it("explains a file that is not the template, and asks for the work column when none is found", async () => {
  vi.stubGlobal("fetch", vi.fn());
  renderPanel(app("pa_1", 1, [cl("a", "1", "Mobilization", 500_000, 500_000, 0)]));
  fireEvent.click(screen.getByRole("button", { name: /textura billing upload/i }));
  const input = await screen.findByLabelText(/textura template/i);
  fireEvent.change(input, { target: { files: [new File(["a,b\n1,2\n"], "x.csv")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent(/Upload Billing Amounts/);
  fireEvent.change(input, {
    target: {
      files: [new File(["Phase Code,Description,Completed To Date\n1,Mobilization,0\n"], "t.csv")],
    },
  });
  expect(await screen.findByText(/looks like the/)).toBeInTheDocument();
  expect(screen.getByText(/Choose the template's “Work This Period” column/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /download the filled csv/i })).toBeDisabled();
});
