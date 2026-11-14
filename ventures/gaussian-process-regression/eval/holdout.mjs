// Out-of-sample check on the bundled NOAA file: fit every kernel on
// 2010-01..2023-09, forecast the last 36 months (2023-10..2026-09) that the
// fit never saw, and score each forecast against what Mauna Loa measured.
// Both mean functions (constant, linear) are scored. Writes eval/holdout.json; engine.test.mjs checks the stored numbers still
// reproduce for the winning kernel.
//   node ventures/gaussian-process-regression/eval/holdout.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { KERNELS, parseCsv, decimalYear, fitKernel, predict, predictLinearMean, olsLine } from "../engine.mjs";
import { pathToFileURL } from "node:url";

export const SPLIT = "2023-09";
const csv = readFileSync(new URL("../data/mauna-loa-co2-2010-2026.csv", import.meta.url), "utf8");
const rows = parseCsv(csv).rows.map((r) => ({ month: r.cells[0], x: decimalYear(r.cells[0]), y: Number(r.cells[1]) }));
const train = rows.filter((r) => r.month <= SPLIT), test = rows.filter((r) => r.month > SPLIT);

export function scoreKernel(name, meanKind) {
  const x = train.map((r) => r.x), y = train.map((r) => r.y);
  const n = y.length, mean = y.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(y.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const yz = y.map((v) => (v - mean) / sd);
  const line = meanKind === "linear" ? olsLine(x, yz) : null;
  const target = line ? yz.map((v, i) => v - line.fitted[i]) : yz;
  const fit = fitKernel(name, x, target, { period: 1 });
  const p = (line ? predictLinearMean : predict)(name, fit.theta, x, yz, test.map((r) => r.x));
  let sq = 0, inside = 0, absMax = 0, bias = 0;
  test.forEach((r, i) => {
    const m = p[i].mean * sd + mean, s = Math.sqrt(p[i].obsVar) * sd;
    sq += (r.y - m) ** 2;
    bias += (r.y - m) / test.length;
    absMax = Math.max(absMax, Math.abs(r.y - m));
    if (Math.abs(r.y - m) <= 1.959964 * s) inside++;
  });
  return { kernel: name, mean: meanKind, lml: fit.lml, rmse: Math.sqrt(sq / test.length), meanError: bias, maxAbsError: absMax, coverage95: inside / test.length };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const results = {};
  for (const m of ["constant", "linear"]) results[m] = Object.keys(KERNELS).map((k) => scoreKernel(k, m)).sort((a, b) => b.lml - a.lml);
  // Naive baselines: last year's same month plus the mean annual rise over training.
  const byMonth = Object.fromEntries(train.map((r) => [r.month, r.y]));
  const rise = (train.at(-1).y - train.at(-13).y);
  let sq = 0;
  for (const r of test) {
    const [yy, mm] = r.month.split("-");
    let k = 1, base;
    while (!(base = byMonth[`${Number(yy) - k}-${mm}`])) k++;
    const f = base + k * rise;
    sq += (r.y - f) ** 2;
  }
  const out = { split: SPLIT, train: train.length, test: test.length, results, seasonalNaive: { rmse: Math.sqrt(sq / test.length), method: "same month in the last training year + (years ahead) x the last 12-month rise in training" } };
  writeFileSync(new URL("./holdout.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  console.log(JSON.stringify(out, null, 1));
}
