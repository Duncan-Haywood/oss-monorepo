// The 2026 tax at each bracket edge, as printed in Rev. Proc. 2025-32 section 4.01, Tables 1 to 3
// (irs.gov/pub/irs-drop/rp-25-32.pdf, read 2026-11-14). The figures come from the IRS text, not from
// calc.mjs, so a bracket bound copied from the wrong table (head of household once had the single
// table's $201,775) fails here. platform/ci/check_irs_table_figures.py runs the same comparison repo-wide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { incomeTax } from "./calc.mjs";

const IRS = {
  mfj: [[24800, 2480], [100800, 11600], [211400, 35932], [403550, 82048], [512450, 116896], [768700, 206583.5]],
  hoh: [[17700, 1770], [67450, 7740], [105700, 16155], [201750, 39207], [256200, 56631], [640600, 191171]],
  single: [[12400, 1240], [50400, 5800], [105700, 17966], [201775, 41024], [256225, 58448], [640600, 192979.25]],
};

for (const [status, rows] of Object.entries(IRS)) {
  test(`2026 ${status} tax at every bracket edge matches the IRS table`, () => {
    for (const [taxable, tax] of rows) assert.ok(Math.abs(incomeTax(taxable, status) - tax) < 0.51, `${status} ${taxable}: ${incomeTax(taxable, status)} vs IRS ${tax}`);
  });
}
