import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents, readStatement } from "./bank.mjs";

// A minus sign pasted from a PDF, a web page or a spreadsheet is often not ASCII "-".
const MINUSES = ["-", "−", "–", "—", "‐", "‑", "‒", "﹣", "－"];

test("every dash-like minus makes an amount negative, ahead of the number or after it", () => {
  for (const m of MINUSES) {
    assert.equal(parseCents(`${m}12.50`), -1250, `leading U+${m.codePointAt(0).toString(16)}`);
    assert.equal(parseCents(`${m} 5.00`), -500, `spaced U+${m.codePointAt(0).toString(16)}`);
    assert.equal(parseCents(`${m}$1,234.56`), -123456);
    assert.equal(parseCents(`12.50${m}`), -1250, `trailing U+${m.codePointAt(0).toString(16)}`);
  }
});

test("a lone dash of any kind is still an empty cell, not an amount", () => {
  for (const m of MINUSES) assert.equal(parseCents(m), 0);
});

test("a statement with en-dash debits keeps their sign", () => {
  const csv = "Date,Description,Amount\n2026-03-01,Coffee,–4.50\n2026-03-02,Refund,10.00\n2026-03-03,Rent,12.00−\n";
  const r = readStatement(csv);
  assert.deepEqual(r.rows.map((x) => x.cents), [-450, 1000, -1200]);
});
