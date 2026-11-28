// The free POA&M template the marketing site serves (apps/cmmc-site/src/poam-template.mjs) must import
// into the workspace's POA&M page without retyping: read with the browser's workbook reader, the
// POA&M sheet chosen (the Rules sheet's requirement lists must never outrank it), every filled row
// planned, each column on its field, dates read whether typed as text or saved as Excel numbers.
import { describe, expect, it } from "vitest";
// @ts-expect-error: the site is plain ESM with no type declarations
import * as tpl from "../../../cmmc-site/src/poam-template.mjs";
import { planPoamImport } from "../../src/shared/controls/poam-import";
import { gridToCsv, readWorkbookForImport } from "../../src/shared/controls/sheet-import";

describe("the site's free POA&M template", () => {
  it("imports at Level 2: each row on its fields, the POA&M sheet chosen", async () => {
    const items = [
      {
        id: "AC.L2-3.1.10",
        weakness: 'Shop-floor PCs have no screen lock, "CAD" ones included',
        remediation: "Group policy: lock after 15 minutes",
        milestones: "Policy written 2026-12-01\nRolled out 2026-12-15",
        responsible: "it@example.com",
        due: tpl.excelDate("2026-12-31"),
        status: "Open",
      },
      { id: "3.13.11", weakness: "VPN not FIPS-validated", due: "2027-01-15", status: "Closed" },
      { id: "3.4.9", weakness: "No software install rule", due: "01/20/2027" },
    ];
    const bytes: Uint8Array = tpl.buildPoamWorkbook({
      items,
      statusDate: tpl.excelDate("2026-08-01"),
    });
    const read = await readWorkbookForImport(bytes, 2);
    expect(read.sheets.map((s) => s.name)).toEqual(tpl.SHEETS);
    expect(read.sheets[read.best]?.name).toBe("POA&M");
    const plan = planPoamImport(gridToCsv(read.grids[read.best] ?? []), 2);
    expect(plan.issues).toEqual([]);
    expect(plan.columns).toEqual({
      id: "Requirement",
      weakness: "Weakness",
      remediation: "Remediation plan",
      milestones: "Milestones",
      responsible: "Responsible",
      scheduledCompletion: "Scheduled completion",
      status: "Status",
    });
    expect(plan.rows).toEqual([
      {
        line: 2,
        controlId: "AC.L2-3.1.10",
        weakness: items[0]?.weakness,
        remediation: items[0]?.remediation,
        milestones: items[0]?.milestones,
        responsible: "it@example.com",
        scheduledCompletion: "2026-12-31",
        status: "open",
      },
      {
        line: 3,
        controlId: "SC.L2-3.13.11",
        weakness: "VPN not FIPS-validated",
        scheduledCompletion: "2027-01-15",
        status: "closed",
      },
      {
        line: 4,
        controlId: "CM.L2-3.4.9",
        weakness: "No software install rule",
        scheduledCompletion: "2027-01-20",
      },
    ]);
  });

  it("the blank template picks no sheet: there is nothing to import yet", async () => {
    const read = await readWorkbookForImport(tpl.buildPoamWorkbook(), 2);
    expect(read.best).toBe(-1);
    for (const s of read.sheets) expect(s.idCells, s.name).toBe(0);
  });
});
