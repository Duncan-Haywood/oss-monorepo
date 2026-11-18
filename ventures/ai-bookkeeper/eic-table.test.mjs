// The 2025 Earned Income Credit Table from the Form 1040 instructions, every cell, against eicTableCredit
// and Worksheet A in estimatedTax. Source and how it was read: fixtures/eic-table-2025.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks } from "./engine.mjs";
import { estimatedTax, eicTableCredit, EITC_2025 } from "./estimatedtax.mjs";

const T = JSON.parse(readFileSync(new URL("./fixtures/eic-table-2025.json", import.meta.url), "utf8"));
const foot = new Map(T.footnotes.map((f) => [`${f.atLeast}/${f.column}`, f]));
const filingOf = (col) => (col >= 4 ? "mfj" : "single");
const rowAt = (x) => T.rows.find((r) => r[0] <= x && x < r[1]);

test("the fixture is the whole table: 1,374 contiguous $50 rows from $1 to $68,700", () => {
  assert.equal(T.rows.length, 1374);
  assert.deepEqual(T.rows[0].slice(0, 2), [1, 50]);
  assert.deepEqual(T.rows.at(-1).slice(0, 2), [68650, 68700]);
  for (let i = 1; i < T.rows.length; i++) assert.equal(T.rows[i][0], T.rows[i - 1][1]);
  // The instructions' own example: single, one child, $2,455 -> $842.
  assert.equal(rowAt(2455)[3], 842);
});

test("eicTableCredit gives the printed credit at the bottom, middle and top of every band, all eight columns", () => {
  let checked = 0;
  for (const r of T.rows) {
    for (let col = 0; col < 8; col++) {
      const f = foot.get(`${r[0]}/${col}`);
      const hi = f ? f.lessThan : r[1];
      for (const x of new Set([r[0], Math.floor((r[0] + hi) / 2), hi - 1])) {
        for (const cents of [x * 100, x * 100 + 99]) {
          assert.equal(eicTableCredit(EITC_2025, col % 4, filingOf(col), cents), r[2 + col] * 100, `${cents} cents, column ${col}`);
          checked++;
        }
      }
      if (f) assert.equal(eicTableCredit(EITC_2025, col % 4, filingOf(col), f.lessThan * 100), 0, `footnote end ${f.lessThan}`);
    }
  }
  assert.ok(checked > 60000);
  assert.equal(eicTableCredit(EITC_2025, 3, "mfj", 6870000), 0); // past the table
  assert.equal(eicTableCredit(EITC_2025, 1, "single", 0), 0);
  assert.equal(eicTableCredit(EITC_2025, 1, "single", 50), 0); // under $1
});

// Empty books, so earned income is the wages alone.
const est = (o) => estimatedTax(newBooks(), { year: 2025, withholding: 0, qbi: false, ...o });

test("Worksheet A: earned income's lookup, or the smaller of it and AGI's once AGI reaches the phase-out start", () => {
  // Single, one child, wages 5,000 (table: 1,709) and 25,000 of other income: AGI 30,000 looks up at 3,265,
  // so the credit stays 1,709. The old formula took the phase-out off the phase-in credit and gave about 637.
  assert.equal(est({ wages: 500000, otherIncome: 2500000, eitcChildren: 1, eitcTable: true }).eitcCredit, rowAt(5000)[3] * 100);
  assert.equal(est({ wages: 500000, otherIncome: 2500000, eitcChildren: 1 }).eitcCredit, 170000); // exact: 0.34 x 5,000
  // AGI's lookup the smaller: wages 15,000 (4,328) with AGI 40,000.
  assert.equal(est({ wages: 1500000, otherIncome: 2500000, eitcChildren: 1, eitcTable: true }).eitcCredit, rowAt(40000)[3] * 100);
  // AGI under the start: earned income alone (wages 3,000, other 1,000).
  assert.equal(est({ wages: 300000, otherIncome: 100000, eitcChildren: 1, eitcTable: true }).eitcCredit, rowAt(3000)[3] * 100);
  // Joint, three children, wages 30,480: the band 30,450-30,500 straddles the 30,470 start and prints the maximum.
  assert.equal(est({ wages: 3048000, filing: "mfj", eitcChildren: 3, eitcTable: true }).eitcCredit, 804600);
});

test("the exact credit stays within a dollar of the table cell for wages alone, every band", () => {
  // Wages alone (AGI = earned income): exact figures vs the printed table, at each band's midpoint.
  let worst = 0;
  for (const r of T.rows) {
    for (let col = 0; col < 8; col++) {
      if (foot.has(`${r[0]}/${col}`)) continue;
      // Skip the bands the table rounds up to the maximum: the one holding the earned-income amount and the
      // one holding the phase-out start (exact figures there are up to $2.25 under the printed maximum).
      const row = EITC_2025.rows[col % 4], ea = row.earnedAmount / 100;
      const start = (row.phaseOutStart + (col >= 4 ? row.marriedAdd : 0)) / 100;
      if ((r[0] < ea && ea < r[1]) || (r[0] < start && start < r[1])) continue;
      const mid = (r[0] + r[1]) / 2;
      const exact = est({ wages: mid * 100, eitcChildren: col % 4, filing: filingOf(col) }).eitcCredit;
      worst = Math.max(worst, Math.abs(exact - r[2 + col] * 100));
    }
  }
  assert.ok(worst <= 100, `worst gap ${worst} cents`);
});
