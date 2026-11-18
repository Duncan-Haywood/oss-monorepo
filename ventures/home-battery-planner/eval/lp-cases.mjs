// Writes the cases eval/lp-check.py solves exactly, with the shipped programme's bill for each.
// node eval/lp-cases.mjs [meter files...] > cases.json   (no files: the synthetic example year)
import { readFileSync } from "node:fs";
import { readMeter } from "../meter.mjs";
import { parseTariffs, hourlyPrices, EXAMPLE_TARIFFS } from "../tariff.mjs";
import { battery, bill, runOptimal } from "../dispatch.mjs";
import { syntheticYear } from "../example.mjs";

const meters = process.argv.slice(2).map((f) => ({ name: f.split("/").pop(), ...readMeter(readFileSync(f, "utf8")) }));
if (!meters.length) meters.push({ name: "synthetic example year", ...syntheticYear() });
const plans = parseTariffs(EXAMPLE_TARIFFS).map((t) => t.plan);
const bats = [
  { kwh: 13.5, kw: 5, roundTrip: 0.9, reserve: 0.2 },
  { kwh: 13.5, kw: 5, roundTrip: 0.9, reserve: 0.2, gridExport: true },
  { kwh: 5, kw: 3.8, roundTrip: 0.85, reserve: 0.1, gridCharge: true },
  { kwh: 27, kw: 10, roundTrip: 0.9, reserve: 0.2, gridCharge: true, gridExport: true },
];
const cases = [];
for (const m of meters) for (const plan of plans.slice(0, 2)) for (const b of bats) {
  const p = hourlyPrices(plan, m.start, m.net.length);
  const bat = battery(b);
  const t0 = Date.now();
  const r = runOptimal(m.net, bat, p);
  const ms = Date.now() - t0;
  cases.push({ meter: m.name, plan: plan.name, battery: bat, net: Array.from(m.net), imp: Array.from(p.imp), exp: Array.from(p.exp), none: bill(m.net, p).energy, dp: bill(r.grid, p).energy, ms });
}
process.stdout.write(JSON.stringify(cases));
