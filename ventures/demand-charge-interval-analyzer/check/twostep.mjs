// The shipped monthly plan (tou.mjs planMonth) on every case in a JSON file.
// Usage: node check/twostep.mjs cases.json [--no-joint] > twostep.json
// --no-joint: the older two-step plan only (no jointLP candidate).
// cases.json: {months: [{building, month, t[], kw[]}], cases: [{m (month index), tariff, bat}]}
import { readFileSync } from "node:fs";
import { onPeakFlags, planMonth } from "../tou.mjs";

const { months, cases } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const joint = !process.argv.includes("--no-joint");
const out = cases.map((c) => {
  const mo = months[c.m];
  const on = onPeakFlags(mo.t.map((w) => Date.parse(w + ":00Z")), c.tariff);
  const price = on.map((x) => (x ? c.tariff.onPrice : c.tariff.offPrice));
  const t0 = performance.now();
  const p = planMonth(mo.kw, on, price, 0.25, c.bat, c.tariff.facilityRate, c.tariff.onDemandRate, { joint });
  return { score: p.score, scoreBefore: p.scoreBefore, method: p.method, facKw: p.after.facKw, onKw: p.after.onKw, energy: p.after.energy, ms: performance.now() - t0 };
});
process.stdout.write(JSON.stringify(out));
