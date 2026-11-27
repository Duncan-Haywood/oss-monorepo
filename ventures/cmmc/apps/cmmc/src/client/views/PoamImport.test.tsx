// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { PoamImport, type PoamImportPreview } from "./PoamImport";

const preview: PoamImportPreview = {
  level: 2,
  dates: { order: "dmy", source: "detected", numeric: 3, evidenceLine: 4 },
  columns: {
    id: "Requirement",
    weakness: "Weakness",
    remediation: null,
    milestones: null,
    responsible: null,
    scheduledCompletion: "Due date",
    status: "Status",
  },
  changes: [
    {
      line: 2,
      controlId: "AC.L2-3.1.20",
      weakness: "No list of external systems",
      kind: "new",
      fields: [],
      scheduledCompletion: "2026-12-31",
      eligible: false,
      eligibilityReason: "32 CFR 170.21(a)(2)(iv) excludes this requirement from POA&Ms",
    },
    {
      line: 3,
      controlId: "AC.L2-3.1.1",
      weakness: "No account review",
      kind: "update",
      fields: ["scheduledCompletion"],
      scheduledCompletion: "2027-02-15",
      eligible: true,
      eligibilityReason: "1-point requirement",
    },
  ],
  unchanged: 1,
  issues: [{ line: 5, message: '"31/12/2026" is not a date this import reads' }],
  applied: false,
};

function setup(file?: File) {
  const calls: { apply: boolean; csv: string; level: number; dateOrder?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/orgs/org_1/poam/import");
      const body = JSON.parse(String(init.body)) as (typeof calls)[number];
      calls.push(body);
      return new Response(JSON.stringify({ ...preview, applied: body.apply }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PoamImport orgId="org_1" level={2} onClose={() => {}} />
    </QueryClientProvider>,
  );
  const chosen =
    file ??
    new File(["Requirement,Weakness,Due date\n3.1.20,x,2026-12-31\n"], "poam.csv", {
      type: "text/csv",
    });
  fireEvent.change(screen.getByLabelText("POA&M spreadsheet file"), {
    target: { files: [chosen] },
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("PoamImport", () => {
  it("previews new and updated items, eligibility and what is left out, then applies", async () => {
    const calls = setup();
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/1 new item, 1 updated, 1 already match/)).toBeVisible();
    expect(screen.getByText("update date")).toBeVisible();
    expect(screen.getByText(/excludes this requirement/)).toBeVisible();
    expect(screen.getByText(/Line 5:/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import (1 new item, 1 updated)" }));
    expect(await screen.findByRole("status")).toHaveTextContent("1 new item, 1 updated");
    expect(calls.map((c) => [c.apply, c.level, c.dateOrder])).toEqual([
      [false, 2, undefined],
      [true, 2, undefined],
    ]);
  });

  it("says how numeric dates were read and sends the order the person picks", async () => {
    const calls = setup();
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(
      await screen.findByText(
        /3 numeric dates read as day\/month\/year \(line 4 can only be day first\)/,
      ),
    ).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "Dates like 03/04/2026 are" }), {
      target: { value: "mdy" },
    });
    expect(screen.queryByText(/numeric dates read as/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.dateOrder).toBe("mdy");
  });

  it("reads an .xlsx in the browser and sends the POA&M sheet as CSV", async () => {
    const wb = await workbook({
      Cover: { 1: ["Plan of action"] },
      POAM: { 1: ["Requirement", "Weakness", "Due date"], 2: ["3.1.20", "No list", 46387] },
    });
    const calls = setup(new File([wb as BlobPart], "poam.xlsx"));
    const sheet = await screen.findByRole("combobox", { name: "Sheet" });
    expect(sheet).toHaveDisplayValue("POAM (1 requirement id)");
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/poam\.xlsx \(POAM\)/)).toBeVisible();
    expect(screen.getByText(/Row 5:/)).toBeVisible();
    expect(calls[0]?.csv).toBe("Requirement,Weakness,Due date\r\n3.1.20,No list,46387");
  });
});
