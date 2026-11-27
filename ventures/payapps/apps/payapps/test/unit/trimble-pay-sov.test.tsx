// @vitest-environment happy-dom

import type { ProjectDetailDto } from "@shared/api/types";
import { writeXlsx } from "@shared/gc-export/xlsx-write";
import { readXlsx } from "@shared/sov-import/xlsx";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  TrimblePaySov,
  trimblePayContractCents,
  trimblePayLines,
} from "../../src/client/components/trimble-pay-sov";

const line = (
  id: string,
  itemNumber: string,
  description: string,
  original: number,
  current: number,
  co: string | null = null,
) =>
  ({
    id,
    itemNumber,
    description,
    originalCents: original,
    currentCents: current,
    changeOrderId: co,
  }) as const;

const project = (contract: number) =>
  ({
    id: "prj_1",
    name: "Elm St",
    number: "24-118",
    originalContractSumCents: contract,
    sovLines: [
      line("a", "1", "Rough-in", 4_000_000, 4_000_000),
      line("b", "2", "Trim", 1_000_000, 1_000_000),
      line("c", "CO-1", "Extra circuit", 0, 50_000, "co_1"),
      line("d", "CO-2", "Pending panel", 0, 0, "co_2"),
    ],
    changeOrders: [
      { id: "co_1", status: "approved", totalCents: 50_000 },
      { id: "co_2", status: "pending", totalCents: 90_000 },
    ],
  }) as unknown as ProjectDetailDto;

afterEach(() => {
  vi.restoreAllMocks();
});

it("takes approved change order lines for the current contract, none for the original", () => {
  const p = project(5_000_000);
  expect(trimblePayLines(p, "current").map((l) => l.itemNumber)).toEqual(["1", "2", "CO-1"]);
  expect(trimblePayLines(p, "base").map((l) => l.itemNumber)).toEqual(["1", "2"]);
  expect(trimblePayContractCents(p, "current")).toBe(5_050_000);
  expect(trimblePayContractCents(p, "base")).toBe(5_000_000);
});

it("reads the template, keeps its header rows and downloads the filled file", async () => {
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
    blobs.push(b as Blob);
    return "blob:x";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  render(<TrimblePaySov project={project(5_000_000)} />);
  fireEvent.click(screen.getByRole("button", { name: /trimble pay sov/i }));
  expect(screen.getByText(/matches the current contract value of \$50,500\.00/)).toBeTruthy();
  const download = screen.getByRole("button", { name: /download filled template/i });
  expect((download as HTMLButtonElement).disabled).toBe(true);

  const book = writeXlsx("SOV", [
    ["Flashtract SOV template"],
    ["Description", "Cost Code", "Value"],
    ["Example line", "00-000", "1"],
  ]);
  const file = new File([book as BlobPart], "flashtract.xlsx");
  fireEvent.change(screen.getByLabelText("Flashtract template"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByLabelText("Column A")).toBeTruthy());
  expect((screen.getByLabelText("Column A") as unknown as HTMLSelectElement).value).toBe(
    "description",
  );
  expect((screen.getByLabelText("Column B") as unknown as HTMLSelectElement).value).toBe("item");
  expect((screen.getByLabelText("Column C") as unknown as HTMLSelectElement).value).toBe("value");
  expect(screen.getByText(/1 row below the header; the download replaces/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /download filled template/i }));
  expect(names).toEqual(["24-118-trimble-pay-sov.xlsx"]);
  const blob = blobs[0];
  if (!blob) throw new Error("no download");
  const [sheet] = await readXlsx(new Uint8Array(await blob.arrayBuffer()));
  expect(sheet?.name).toBe("SOV");
  expect(sheet?.grid).toEqual([
    ["Flashtract SOV template"],
    ["Description", "Cost Code", "Value"],
    ["Rough-in", "1", "40000"],
    ["Trim", "2", "10000"],
    ["Extra circuit", "CO-1", "500"],
  ]);
});

it("asks for the roles when the header does not say, and warns on a short total", async () => {
  render(<TrimblePaySov project={project(5_100_000)} />);
  fireEvent.click(screen.getByRole("button", { name: /trimble pay sov/i }));
  fireEvent.click(screen.getByLabelText(/original contract only/i));
  expect(
    screen.getByText(/under the original contract value of \$51,000\.00 by \$1,000\.00/),
  ).toBeTruthy();
  const file = new File(["Col 1,Col 2,Col 3\r\nA,B,C\r\n"], "template.csv");
  fireEvent.change(screen.getByLabelText("Flashtract template"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByLabelText("Column A")).toBeTruthy());
  expect(screen.getByText(/give a, b and c one each/i)).toBeTruthy();
  const download = screen.getByRole("button", { name: /download filled template/i });
  expect((download as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Column A"), { target: { value: "item" } });
  fireEvent.change(screen.getByLabelText("Column B"), { target: { value: "description" } });
  fireEvent.change(screen.getByLabelText("Column C"), { target: { value: "value" } });
  expect((download as HTMLButtonElement).disabled).toBe(false);
});

it("says an old .xls template must be saved as .xlsx", async () => {
  render(<TrimblePaySov project={project(5_000_000)} />);
  fireEvent.click(screen.getByRole("button", { name: /trimble pay sov/i }));
  const file = new File(["x"], "flashtract.xls");
  fireEvent.change(screen.getByLabelText("Flashtract template"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/save it as \.xlsx/)).toBeTruthy());
});
