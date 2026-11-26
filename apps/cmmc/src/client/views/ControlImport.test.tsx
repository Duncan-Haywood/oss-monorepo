// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { ControlImport } from "./ControlImport";

const preview = {
  level: 2,
  columns: { id: "Control", status: "Status", owner: null, notes: "Comments", statement: null },
  changes: [
    {
      line: 2,
      controlId: "AC.L2-3.1.1",
      status: { from: "not_assessed", to: "implemented" },
      notes: true,
    },
  ],
  unchanged: 3,
  issues: [{ line: 4, message: '"mostly" is not a status this import reads' }],
  applied: false,
};

function setup(canApply: boolean, file?: File) {
  const calls: { apply: boolean; csv: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { apply: boolean; csv: string };
      calls.push(body);
      return new Response(JSON.stringify({ ...preview, applied: body.apply }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ControlImport orgId="org_1" level={2} canApply={canApply} onClose={() => {}} />
    </QueryClientProvider>,
  );
  const chosen =
    file ?? new File(["Control,Status\n3.1.1,Met\n"], "sheet.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Spreadsheet file"), { target: { files: [chosen] } });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("ControlImport", () => {
  it("previews, lists what is left out, then applies", async () => {
    const calls = setup(true);
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/1 requirement would change, 3 already match/)).toBeVisible();
    expect(screen.getByText(/Line 4:/)).toBeVisible();
    expect(screen.getByText("Not assessed → Implemented")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 requirement" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Imported 1 requirement");
    expect(calls.map((c) => c.apply)).toEqual([false, true]);
  });

  it("shows the preview but no import button without the Level 2 plan", async () => {
    setup(false);
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/needs the Level 2 plan/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Import \d/ })).toBeNull();
  });

  it("reads an .xlsx in the browser, picks the sheet with ids and sends that sheet as CSV", async () => {
    const wb = await workbook({
      "Read me": { 1: ["Instructions"] },
      Assessment: { 1: ["Control", "Status"], 2: ["3.1.1", "Met"], 4: ["3.1.2", "mostly"] },
    });
    const calls = setup(true, new File([wb as BlobPart], "ssp.xlsx"));
    const sheet = await screen.findByRole("combobox", { name: "Sheet" });
    expect(sheet).toHaveDisplayValue("Assessment (2 requirement ids)");
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(
      await screen.findByText(/ssp\.xlsx \(Assessment\): 1 requirement would change/),
    ).toBeVisible();
    expect(screen.getByText(/Row 4:/)).toBeVisible();
    expect(calls[0]?.csv).toBe("Control,Status\r\n3.1.1,Met\r\n\r\n3.1.2,mostly");
    fireEvent.change(sheet, { target: { value: "0" } });
    expect(screen.queryByText(/would change/)).toBeNull();
  });

  it("says why an old .xls cannot be read", async () => {
    setup(
      true,
      new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], "old.xls"),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/old \.xls workbook/);
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  });
});
