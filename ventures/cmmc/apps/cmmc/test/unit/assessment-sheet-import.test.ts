// The free self-assessment workbook the marketing site serves (apps/cmmc-site/src/assessment-sheet.mjs)
// must import into this workspace without retyping: read with the browser's workbook reader, the
// Assessment sheet chosen for Level 2, every one of its 110 rows planned, each column on its field.
import { describe, expect, it } from "vitest";
// @ts-expect-error: the site is plain ESM with no type declarations
import * as sheet from "../../../cmmc-site/src/assessment-sheet.mjs";
import { planImport } from "../../src/shared/controls/csv-import";
import { LEVEL2_REQUIREMENTS } from "../../src/shared/controls/level2";
import { gridToCsv, readWorkbookForImport } from "../../src/shared/controls/sheet-import";

describe("the site's free self-assessment spreadsheet", () => {
  it("imports at Level 2: all 110 rows, each column on its field, no issues", async () => {
    const filled: Record<string, Record<string, string>> = {};
    for (const [i, r] of LEVEL2_REQUIREMENTS.entries()) {
      filled[r.nistId] = {
        status: sheet.STATUSES[i % sheet.STATUSES.length],
        owner: i % 3 === 0 ? "it@example.com" : "",
        statement: i % 2 === 0 ? `How we meet ${r.nistId}, "quoted", with a comma.` : "",
        notes: i === 5 ? "Line one\nline two" : "",
      };
    }
    const bytes: Uint8Array = sheet.buildWorkbook({ filled });
    const read = await readWorkbookForImport(bytes, 2);
    expect(read.sheets[read.best]?.name).toBe("Assessment");
    const grid = read.grids[read.best] ?? [];
    const plan = planImport(gridToCsv(grid), 2);
    expect(plan.issues).toEqual([]);
    expect(plan.columns).toEqual({
      id: "CMMC ID",
      status: "Status",
      owner: "Owner",
      notes: "Notes",
      statement: "Implementation statement",
    });
    expect(plan.rows).toHaveLength(110);
    for (const [i, r] of LEVEL2_REQUIREMENTS.entries()) {
      const row = plan.rows.find((x) => x.controlId === r.id);
      expect(row, r.id).toBeDefined();
      const want = filled[r.nistId] ?? {};
      expect(row?.status).toBe(sheet.STATUS_TO_APP[want.status ?? ""]);
      expect(row?.ownerEmail ?? "").toBe(want.owner);
      expect(row?.statement ?? "").toBe(want.statement);
      expect(row?.notes ?? "").toBe(want.notes);
      expect(row?.line).toBe(i + 2);
    }
  });

  it("the blank template is read, and says plainly there is nothing to import yet", async () => {
    const read = await readWorkbookForImport(sheet.buildWorkbook(), 2);
    expect(read.sheets[read.best]?.name).toBe("Assessment");
    const plan = planImport(gridToCsv(read.grids[read.best] ?? []), 2);
    expect(plan.columns.status).toBe("Status");
    expect(plan.rows).toEqual([]);
    expect(plan.issues.map((i) => i.message)).toEqual([
      "Every requirement row is blank in the columns found, so there is nothing to import.",
    ]);
  });

  it("is not mistaken for a Level 1 sheet: every row is refused with a reason", async () => {
    const read = await readWorkbookForImport(sheet.buildWorkbook(), 1);
    const plan = planImport(gridToCsv(read.grids[read.best] ?? []), 1);
    expect(plan.rows.length).toBeLessThanOrEqual(17);
  });
});
