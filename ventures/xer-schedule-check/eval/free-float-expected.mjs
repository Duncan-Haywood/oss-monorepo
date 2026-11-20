// Free float of activities with an expected finish against P6's stored values,
// with the expected-finish rule (cpm.mjs variant ffExpected) on and off.
//   node eval/free-float-expected.mjs <file.xer>
// eval/free-float-expected-2026-11-20.md
import { readFileSync } from "node:fs";
const base = new URL("../", import.meta.url).href;
const { parseXer, decodeXer, num } = await import(base + "xer.mjs");
const { schedule } = await import(base + "cpm.mjs");
const xer = parseXer(decodeXer(readFileSync(process.argv[2])));
const off = schedule(xer, { variant: { ffExpected: false } }), on = schedule(xer);
let c = { expN: 0, expGap: 0, expStored0: 0, otherGap: 0, otherGapMatch: 0, offMatch: 0, onMatch: 0, n: 0 };
for (const t of off.model.tasks.values()) {
  if (t.span || t.status === "TK_Complete" || !t.row.early_end_date) continue;
  const r = off.tasks.get(t.id), r2 = on.tasks.get(t.id); if (!r || r.lf === undefined) continue;
  const pFF = num(t.row.free_float_hr_cnt); if (pFF === null) continue;
  c.n++; c.offMatch += Math.abs(pFF - r.ff) < 0.01; c.onMatch += Math.abs(pFF - r2.ff) < 0.01;
  if (t.row.expect_end_date) { c.expN++; if (r.ff > 0.01) c.expGap++; if (pFF === 0) c.expStored0++; }
  else if (r.ff > 0.01) { c.otherGap++; if (Math.abs(pFF - r.ff) < 0.01) c.otherGapMatch++; }
}
console.log(JSON.stringify(c));
