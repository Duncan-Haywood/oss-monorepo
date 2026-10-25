// A real Starling export, fetched at run time and never copied: the spec file
// of sanichi/mio (a personal finance app; 40 rows, Aug-Sep 2025). Skips offline.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, checkRunningBalance } from "./bank.mjs";

const URL = "https://raw.githubusercontent.com/sanichi/mio/HEAD/spec/files/starling.csv";

test("real Starling CSV: recognised, 40 rows, balance chain holds", async (t) => {
  let text;
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return t.skip(`HTTP ${r.status}`);
    text = await r.text();
  } catch (e) { return t.skip(`offline: ${e.message}`); }
  const r = readStatement(text);
  assert.equal(r.bank, "starling");
  assert.equal(r.rows.length, 40);
  assert.deepEqual(r.problems || [], []);
  const c = checkRunningBalance(r.rows);
  assert.equal(c.checked, true);
  assert.deepEqual(c.breaks, []);
  assert.equal(c.closing, 27085);
});
