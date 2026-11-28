// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { SupplierImport, type SupplierImportPreview } from "./SupplierImport";

const preview = (over: Partial<SupplierImportPreview> = {}): SupplierImportPreview => ({
  columns: {
    name: "Supplier Name",
    supplies: "Process",
    infoFlowed: null,
    cots: null,
    requiredLevel: null,
    status: "CMMC Status",
    statusDate: null,
    affirmedOn: null,
    cmmcUids: null,
    clauseFlowedDown: null,
    subcontractRef: "PO",
    checkedOn: null,
    awardedOn: null,
    notes: null,
  },
  dates: { order: "mdy", source: "default", numeric: 0 },
  changes: [
    {
      line: 2,
      name: "Acme Anodizing",
      kind: "update",
      infoFlowed: "cui",
      infoSource: "kept",
      requiredLevel: "l2_self",
      status: "final_l2_self",
      fields: ["subcontractRef"],
    },
  ],
  unchanged: 0,
  issues: [
    {
      line: 3,
      message: "Steel Depot: the row does not say what the order sends (CUI, FCI only or neither).",
    },
  ],
  needInfo: 1,
  existing: 1,
  max: 500,
  needsLevel2Plan: false,
  applied: false,
  ...over,
});

const infoOptions = [
  { key: "cui" as const, label: "CUI" },
  { key: "fci" as const, label: "FCI only" },
  { key: "none" as const, label: "Neither" },
];

function setup(
  opts: { file?: File; level2?: boolean; reply?: Partial<SupplierImportPreview> } = {},
) {
  const calls: { apply: boolean; csv: string; infoDefault: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/orgs/org_1/suppliers/import");
      const body = JSON.parse(String(init.body));
      calls.push(body);
      const p =
        body.infoDefault === "none"
          ? preview({
              ...opts.reply,
              needInfo: 0,
              issues: [],
              changes: [
                ...preview().changes,
                {
                  line: 3,
                  name: "Steel Depot",
                  kind: "new",
                  infoFlowed: "none",
                  infoSource: "choice",
                  requiredLevel: null,
                  status: null,
                  fields: ["infoFlowed", "supplies"],
                },
              ],
            })
          : preview(opts.reply);
      return new Response(JSON.stringify({ ...p, applied: body.apply }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SupplierImport
        orgId="org_1"
        today="2026-11-28"
        level2={opts.level2 ?? true}
        infoOptions={infoOptions}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
  const chosen =
    opts.file ??
    new File(["Supplier Name,PO\nAcme Anodizing,PO 2\n"], "asl.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Supplier list file"), { target: { files: [chosen] } });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("SupplierImport", () => {
  it("previews, asks what rows without a CUI/FCI cell send, then applies", async () => {
    const calls = setup();
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(
      await screen.findByText(/0 new suppliers, 1 updated, 1 left out until you choose/),
    ).toBeVisible();
    expect(screen.getByText("update PO")).toBeVisible();
    expect(screen.getByText(/Line 3: Steel Depot/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Rows that do not say what the order sends"), {
      target: { value: "none" },
    });
    expect(await screen.findByText("(your choice)")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import (1 new supplier, 1 updated)" }));
    expect(await screen.findByRole("status")).toHaveTextContent("1 new supplier, 1 updated");
    expect(calls.map((c) => [c.apply, c.infoDefault])).toEqual([
      [false, null],
      [false, "none"],
      [true, "none"],
    ]);
  });

  it("offers no import below the Level 2 plan when the file records CUI", async () => {
    setup({ level2: false, reply: { needsLevel2Plan: true } });
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByRole("note")).toHaveTextContent("needs the Level 2 plan");
    expect(screen.queryByRole("button", { name: /^Import \(/ })).toBeNull();
  });

  it("reads an .xlsx in the browser and picks the sheet with suppliers", async () => {
    const wb = await workbook({
      Cover: { 1: ["Approved Supplier List"] },
      ASL: { 1: ["Supplier", "Process"], 2: ["Acme", "Anodize"], 3: ["Bob's", "Blast"] },
    });
    const calls = setup({ file: new File([wb as BlobPart], "asl.xlsx") });
    const sheet = await screen.findByRole("combobox", { name: "Sheet" });
    expect(sheet).toHaveDisplayValue("ASL (2 suppliers)");
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/asl\.xlsx \(ASL\)/)).toBeVisible();
    expect(calls[0]?.csv).toBe("Supplier,Process\r\nAcme,Anodize\r\nBob's,Blast");
  });
});
