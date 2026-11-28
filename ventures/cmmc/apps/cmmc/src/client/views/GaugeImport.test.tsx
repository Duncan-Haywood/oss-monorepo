// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { GaugeImport, type GaugeImportPreview } from "./GaugeImport";

const preview = (): GaugeImportPreview => ({
  columns: {
    tag: "Gage #",
    description: "Description",
    kind: null,
    manufacturer: null,
    serial: null,
    range: null,
    location: null,
    owner: null,
    assignedTo: null,
    status: "Status",
    interval: "Interval",
    lastCalibratedOn: "Last Cal Date",
    dueOn: "Next Cal Due",
    calibratedBy: null,
    result: null,
    certificateNo: null,
    traceability: null,
    method: null,
    notes: null,
  },
  dates: { order: "mdy", source: "default", numeric: 2 },
  changes: [
    {
      line: 2,
      tag: "C-001",
      description: "0-6 in caliper",
      kind: "caliper",
      kindSource: "description",
      status: "active",
      intervalMonths: 12,
      intervalSource: "file",
      calibration: null,
    },
    {
      line: 3,
      tag: "H-003",
      description: "12 in height gage",
      kind: "height_gauge",
      kindSource: "description",
      status: "active",
      intervalMonths: 12,
      intervalSource: "due",
      calibration: {
        calibratedOn: "2026-02-01",
        asFound: "in_tolerance",
        performer: "external",
        performedBy: "Acme Cal Lab",
        dueOn: "2027-02-01",
        resultSource: "statement",
      },
    },
  ],
  alreadyListed: 1,
  needResult: 1,
  needPerformer: 2,
  issues: [{ line: null, message: "1 row gives a last calibration date with no result." }],
  existing: 1,
  max: 2000,
  applied: false,
});

function setup(opts: { file?: File; canAdd?: boolean } = {}) {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/orgs/org_1/gauges/import");
      const body = JSON.parse(String(init.body));
      calls.push(body);
      return new Response(JSON.stringify({ ...preview(), applied: body.apply }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GaugeImport
        orgId="org_1"
        today="2026-11-28"
        canAdd={opts.canAdd ?? true}
        onUpgrade={() => {}}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
  const chosen =
    opts.file ??
    new File(["Gage #,Description,Interval\nC-001,Caliper,12\n"], "gauges.csv", {
      type: "text/csv",
    });
  fireEvent.change(screen.getByLabelText("Gauge list file"), { target: { files: [chosen] } });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("GaugeImport", () => {
  it("previews, takes the whole-file statement and who calibrated, then applies", async () => {
    const calls = setup();
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(
      await screen.findByText(/2 gauges, 1 with a last calibration, 1 already on the list/),
    ).toBeVisible();
    expect(screen.getByText("none recorded")).toBeVisible();
    expect(screen.getByText("(as stated)")).toBeVisible();
    expect(screen.getByText("(from the due date)")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox"));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Calibrated by"), { target: { value: "in_house" } });
    await vi.waitFor(() => expect(calls).toHaveLength(3));
    fireEvent.click(
      screen.getByRole("button", { name: "Import (2 gauges, 1 with a last calibration)" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Imported from gauges.csv");
    expect(calls.map((c) => [c.apply, c.lastCalPassed, c.performerDefault])).toEqual([
      [false, false, null],
      [false, true, null],
      [false, true, "in_house"],
      [true, true, "in_house"],
    ]);
  });

  it("shows the preview below the quality plan, with no import button", async () => {
    setup({ canAdd: false });
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByRole("note")).toHaveTextContent("needs the Level 2 + Quality plan");
    expect(screen.queryByRole("button", { name: /^Import \(/ })).toBeNull();
  });

  it("reads an .xlsx in the browser and picks the sheet with gauges", async () => {
    const wb = await workbook({
      Notes: { 1: ["Calibration log"] },
      Gauges: {
        1: ["Gauge ID", "Description", "Interval"],
        2: ["C-001", "0-6 in caliper", "12"],
        3: ["M-002", "0-1 in mic", "6"],
      },
    });
    const calls = setup({ file: new File([wb as BlobPart], "gauges.xlsx") });
    const sheet = await screen.findByRole("combobox", { name: "Sheet" });
    expect(sheet).toHaveDisplayValue("Gauges (2 gauges)");
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/gauges\.xlsx \(Gauges\)/)).toBeVisible();
    expect(calls[0]?.csv).toBe(
      "Gauge ID,Description,Interval\r\nC-001,0-6 in caliper,12\r\nM-002,0-1 in mic,6",
    );
  });
});
