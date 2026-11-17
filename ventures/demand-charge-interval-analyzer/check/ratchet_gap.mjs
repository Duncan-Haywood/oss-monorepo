// The shipped yearly plan (tou.mjs touBattery) on full-year buildings, with
// and without the whole-period programme that puts the ratchet inside it.
// Usage: node check/ratchet_gap.mjs cases.json > out.json
// cases.json: {buildings: [{building, walls[], kw[]}], cases: [{b (building index), tariff, bat, ratchet}]}
import { readFileSync } from "node:fs";
import { analyze } from "../calc.mjs";
import { touBattery } from "../tou.mjs";

const { buildings, cases } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const cache = new Map();
const out = cases.map((c) => {
  const key = `${c.b}|${c.ratchet}|${c.tariff.facilityRate}`;
  if (!cache.has(key)) {
    const bd = buildings[c.b];
    const rows = bd.walls.map((w, i) => ({ t: Date.parse(w + ":00Z"), v: bd.kw[i] }));
    cache.set(key, analyze(rows, { unit: "kw", intervalMin: "15", demandRate: String(c.tariff.facilityRate), ratchetPct: String(c.ratchet), usablePct: "" }));
  }
  const a = cache.get(key);
  let t0 = performance.now();
  const mbm = touBattery(a, c.tariff, c.bat, { yearPlan: false });
  const msMonth = performance.now() - t0;
  t0 = performance.now();
  const yr = touBattery(a, c.tariff, c.bat);
  const msYear = performance.now() - t0;
  return { before: mbm.yearlyBefore, monthByMonth: mbm.yearlyAfter, shipped: yr.yearlyAfter, wholePeriod: yr.ratchetPlan?.wholePeriod ?? null, used: yr.ratchetPlan?.used ?? false, skipped: yr.ratchetPlan?.skipped ?? false, lpOk: yr.ratchetPlan?.ok ?? null, iterations: yr.ratchetPlan?.iterations ?? null, msMonth, msYear };
});
process.stdout.write(JSON.stringify(out));
