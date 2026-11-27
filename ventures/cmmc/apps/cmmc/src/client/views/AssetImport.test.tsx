// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { AssetImport, type AssetImportPreview } from "./AssetImport";

const preview: AssetImportPreview = {
  format: "sheet",
  columns: {
    name: "Asset",
    category: "Category",
    specializedType: null,
    assetType: "Type",
    location: null,
    provider: null,
    owner: null,
    notes: null,
    policy: null,
    separation: null,
  },
  changes: [
    {
      line: 2,
      name: "Haas VF-2 controller",
      category: "specialized",
      specializedType: "ot",
      kind: "new",
      fields: [],
    },
    {
      line: 3,
      name: "CAM-01",
      category: "cui",
      specializedType: null,
      kind: "update",
      fields: ["owner"],
    },
  ],
  unchanged: 1,
  issues: [{ line: 5, message: "Owner's phone has no category, so it is left out." }],
  existing: 4,
  max: 2000,
  applied: false,
};

function setup(file?: File) {
  const calls: { apply: boolean; csv: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("/api/orgs/org_1/assets/import");
      const body = JSON.parse(String(init.body)) as { apply: boolean; csv: string };
      calls.push(body);
      return new Response(JSON.stringify({ ...preview, applied: body.apply }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AssetImport orgId="org_1" onClose={() => {}} />
    </QueryClientProvider>,
  );
  const chosen =
    file ?? new File(["Asset,Category\nCAM-01,CUI\n"], "assets.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Asset list file"), { target: { files: [chosen] } });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("AssetImport", () => {
  it("previews new and updated assets and what is left out, then applies", async () => {
    const calls = setup();
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/1 new asset, 1 updated, 1 already match/)).toBeVisible();
    expect(screen.getByText("update owner")).toBeVisible();
    expect(screen.getByText(/Operational Technology/)).toBeVisible();
    expect(screen.getByText(/Line 5:/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import (1 new asset, 1 updated)" }));
    expect(await screen.findByRole("status")).toHaveTextContent("1 new asset, 1 updated");
    expect(calls.map((c) => c.apply)).toEqual([false, true]);
  });

  it("reads an .xlsx in the browser and picks the sheet with assets", async () => {
    const wb = await workbook({
      Cover: { 1: ["Asset inventory"] },
      Assets: { 1: ["Asset", "Category"], 2: ["CAM-01", "CUI"], 3: ["Firewall", "SPA"] },
    });
    const calls = setup(new File([wb as BlobPart], "assets.xlsx"));
    const sheet = await screen.findByRole("combobox", { name: "Sheet" });
    expect(sheet).toHaveDisplayValue("Assets (2 assets)");
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/assets\.xlsx \(Assets\)/)).toBeVisible();
    expect(screen.getByText(/Row 5:/)).toBeVisible();
    expect(calls[0]?.csv).toBe("Asset,Category\r\nCAM-01,CUI\r\nFirewall,SPA");
  });
});
