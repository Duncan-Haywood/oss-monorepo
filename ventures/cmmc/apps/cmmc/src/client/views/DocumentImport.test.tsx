// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { DocumentImport, type DocumentImportPreview } from "./DocumentImport";

const preview = (): DocumentImportPreview => ({
  columns: {
    docNumber: "Doc No",
    title: "Title",
    kind: "Type",
    origin: null,
    issuer: null,
    revision: "Rev",
    status: "Status",
    approvedBy: "Approved By",
    approvedOn: "Rev Date",
    effectiveOn: null,
    lastReviewedOn: null,
    reviewDue: null,
    withdrawnOn: null,
    owner: null,
    location: null,
    reviewMonths: null,
    notes: null,
  },
  dates: { order: "mdy", source: "default", numeric: 1 },
  changes: [
    {
      line: 2,
      docNumber: "QM-001",
      title: "Quality Manual",
      kind: "quality_manual",
      kindSource: "file",
      origin: "internal",
      status: "released",
      revision: "C",
      approvedOn: "2025-03-14",
      approver: "Dana Smith",
      approverMatched: false,
      owner: "",
      reviewDue: "2026-03-14",
    },
    {
      line: 3,
      docNumber: "WI-210",
      title: "Deburr Work Instruction",
      kind: "work_instruction",
      kindSource: "title",
      origin: "internal",
      status: "draft",
      revision: "A",
      approvedOn: null,
      approver: "",
      approverMatched: false,
      owner: "",
      reviewDue: null,
    },
  ],
  alreadyListed: 1,
  issues: [{ line: 2, message: 'QM-001: "Dana Smith" is not one member of this workspace.' }],
  existing: 1,
  max: 1000,
  applied: false,
});

function setup(opts: { file?: File; canAdd?: boolean } = {}) {
  const calls: { apply: boolean; csv: string; dateOrder?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/orgs/org_1/documents/import");
      const body = JSON.parse(String(init.body));
      calls.push(body);
      return new Response(JSON.stringify({ ...preview(), applied: body.apply }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DocumentImport
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
    new File(["Doc No,Title,Rev\nQM-001,Quality Manual,C\n"], "list.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Master list file"), { target: { files: [chosen] } });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("DocumentImport", () => {
  it("previews the documents, flags an approver who is not a member, then applies", async () => {
    const calls = setup();
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(
      await screen.findByText(/2 documents, 1 with a released revision, 1 already on the list/),
    ).toBeVisible();
    expect(screen.getByText(/Dana Smith \(not a member\)/)).toBeVisible();
    expect(screen.getByText("(from the title)")).toBeVisible();
    expect(screen.getByText(/Line 2: QM-001/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Date order"), { target: { value: "dmy" } });
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    fireEvent.click(
      screen.getByRole("button", { name: "Import (2 documents, 1 with a released revision)" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Imported from list.csv");
    expect(calls.map((c) => [c.apply, c.dateOrder])).toEqual([
      [false, undefined],
      [false, "dmy"],
      [true, "dmy"],
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

  it("reads an .xlsx in the browser and picks the sheet with documents", async () => {
    const wb = await workbook({
      Cover: { 1: ["Master Document List"] },
      List: {
        1: ["Doc No", "Title", "Rev", "Approved on"],
        2: ["QM-001", "Quality Manual", "C", "2025-03-14"],
        3: ["QP-7.5", "Document control", "B", "2024-01-09"],
      },
    });
    const calls = setup({ file: new File([wb as BlobPart], "list.xlsx") });
    const sheet = await screen.findByRole("combobox", { name: "Sheet" });
    expect(sheet).toHaveDisplayValue("List (2 documents)");
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/list\.xlsx \(List\)/)).toBeVisible();
    expect(calls[0]?.csv).toBe(
      "Doc No,Title,Rev,Approved on\r\nQM-001,Quality Manual,C,2025-03-14\r\nQP-7.5,Document control,B,2024-01-09",
    );
  });
});
