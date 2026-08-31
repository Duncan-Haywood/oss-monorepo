import { describe, expect, it } from "vitest";
import { EAA_PREAUDIT_CHECKS, checklistExport, checklistPercent } from "./eaa-checklist";

describe("EAA pre-audit checklist", () => {
  it("calculates progress from the available checks", () => {
    expect(checklistPercent([])).toBe(0);
    expect(checklistPercent(EAA_PREAUDIT_CHECKS.map((item) => item.id))).toBe(100);
  });

  it("exports checked and open items without customer content", () => {
    const output = checklistExport(["scope"], "2026-08-24");
    expect(output).toContain("[x] Scope recorded");
    expect(output).toContain("[ ] Keyboard pass");
    expect(output).toContain("2026-08-24");
  });
});
