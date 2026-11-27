// @vitest-environment happy-dom
import type { ControlShare } from "@shared/service-providers";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { CrmImport } from "./CrmImport";

function setup(file: File, controls: ControlShare[] = []) {
  const onApply = vi.fn();
  render(<CrmImport providerName="Acme IT" controls={controls} onApply={onApply} />);
  fireEvent.change(screen.getByLabelText("Customer responsibility matrix file"), {
    target: { files: [file] },
  });
  return onApply;
}

describe("CrmImport", () => {
  it("previews a CSV matrix, lists what it left out, and fills the marks", async () => {
    const csv = [
      "Requirement,Responsibility",
      "3.1.1,Shared",
      "3.1.2,Acme IT",
      "3.1.3,Customer",
      "3.1.4,Ask us",
    ].join("\n");
    const onApply = setup(new File([csv], "crm.csv", { type: "text/csv" }), [
      { controlId: "AC.L2-3.1.3", responsibility: "provider" },
      { controlId: "AU.L2-3.3.1", responsibility: "shared" },
    ]);
    expect(
      await screen.findByText(/3 requirements listed: 1 provider, 1 shared, 1 yours/),
    ).toBeVisible();
    expect(screen.getByText(/Line 5:/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Use these marks" }));
    expect(onApply).toHaveBeenCalledWith([
      { controlId: "AU.L2-3.3.1", responsibility: "shared" },
      { controlId: "AC.L2-3.1.1", responsibility: "shared" },
      { controlId: "AC.L2-3.1.2", responsibility: "provider" },
    ]);
    expect(screen.getByRole("button", { name: /Marks filled in/ })).toBeDisabled();
  });

  it("reads an .xlsx in the browser and picks the sheet with requirement ids", async () => {
    const wb = await workbook({
      Cover: { 1: ["Acme IT CRM, version 3"] },
      Matrix: {
        1: ["Control", "Customer", "Provider", "Shared"],
        2: ["AC.L2-3.1.1", "", "X", ""],
        3: ["AC.L2-3.1.2", "X", "", "X"],
      },
    });
    const onApply = setup(new File([wb as BlobPart], "crm.xlsx"));
    expect(await screen.findByRole("combobox", { name: "Sheet" })).toHaveDisplayValue("Matrix");
    expect(
      await screen.findByText(/2 requirements listed: 1 provider, 1 shared, 0 yours/),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Use these marks" }));
    expect(onApply).toHaveBeenCalledWith([
      { controlId: "AC.L2-3.1.1", responsibility: "provider" },
      { controlId: "AC.L2-3.1.2", responsibility: "shared" },
    ]);
  });

  it("says why a Rev. 3 matrix cannot be used, and offers nothing to apply", async () => {
    setup(new File(["ID,Responsibility\n03.01.01,Shared\n"], "crm.csv", { type: "text/csv" }));
    expect(await screen.findByText(/Rev\. 3 numbers/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Use these marks" })).toBeNull();
  });
});
