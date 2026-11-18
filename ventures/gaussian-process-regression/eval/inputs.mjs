// Writes eval/inputs.json: the data, fixed hyperparameters, starts and bounds
// that eval/reference.py feeds to scikit-learn. Fixed theta = the engine's
// own starting values nudged off them, so gradients are not near zero.
//   node ventures/gaussian-process-regression/eval/inputs.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { KERNELS, defaultBounds, parseCsv, decimalYear } from "../engine.mjs";

const csv = readFileSync(new URL("../data/mauna-loa-co2-2010-2026.csv", import.meta.url), "utf8");
const { rows } = parseCsv(csv);
const x = rows.map((r) => decimalYear(r.cells[0]));
const y = rows.map((r) => Number(r.cells[1]));
const kernels = {};
for (const [name, k] of Object.entries(KERNELS)) {
  const spec = defaultBounds(name, x, { period: 1 });
  kernels[name] = {
    terms: k.terms,
    theta: spec.map((s, i) => Math.min(s.hi, Math.max(s.lo, s.init * (1 + 0.13 * ((i % 3) - 1))))),
    start: spec.map((s) => s.init),
    bounds: spec.map((s) => [s.lo, s.hi]),
  };
}
const xNew = [2010.04, 2015.5, 2020.123, 2026.7, 2027.5, 2029.0];
writeFileSync(new URL("./inputs.json", import.meta.url), JSON.stringify({ x, y, xNew, kernels }) + "\n");
console.log("wrote eval/inputs.json:", x.length, "points,", Object.keys(kernels).length, "kernels");
