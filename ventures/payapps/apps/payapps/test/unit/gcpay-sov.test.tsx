// @vitest-environment happy-dom

import type { ProjectDetailDto } from "@shared/api/types";
import { readXlsx } from "@shared/sov-import/xlsx";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GcpaySov, gcpayLines } from "../../src/client/components/gcpay-sov";

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

const project = (contract: number) =>
  ({
    id: "prj_1",
    name: "Elm St",
    number: "24-118",
    originalContractSumCents: contract,
    sovLines: [
      line("a", "1", "Rough-in", 4_000_000),
      line("b", "", "Trim", 1_000_000),
      line("c", "CO-1", "Extra circuit", 50_000, "co_1"),
    ],
  }) as unknown as ProjectDetailDto;

afterEach(() => {
  vi.restoreAllMocks();
});

it("leaves change order lines out", () => {
  expect(gcpayLines(project(5_000_000))).toEqual([
    { itemNumber: "1", description: "Rough-in", cents: 4_000_000 },
    { itemNumber: "", description: "Trim", cents: 1_000_000 },
  ]);
});

it("checks the total and downloads the three-column workbook", async () => {
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
  render(<GcpaySov project={project(5_000_000)} />);
  fireEvent.click(screen.getByRole("button", { name: /gcpay sov/i }));
  expect(screen.getByText(/matches the original contract sum of \$50,000\.00/)).toBeTruthy();
  expect(screen.getByText(/1 line has no item number/)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /download gcpay workbook/i }));
  expect(names).toEqual(["24-118-gcpay-sov.xlsx"]);
  const blob = blobs[0];
  if (!blob) throw new Error("no download");
  const [sheet] = await readXlsx(new Uint8Array(await blob.arrayBuffer()));
  expect(sheet?.grid).toEqual([
    ["Item Number", "Description", "Value"],
    ["1", "Rough-in", "40000"],
    ["", "Trim", "10000"],
  ]);
});

it("warns when the lines do not add up to the contract sum", () => {
  render(<GcpaySov project={project(5_100_000)} />);
  fireEvent.click(screen.getByRole("button", { name: /gcpay sov/i }));
  expect(
    screen.getByText(/under the original contract sum of \$51,000\.00 by \$1,000\.00/),
  ).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toMatch(/will not let you submit/);
});
