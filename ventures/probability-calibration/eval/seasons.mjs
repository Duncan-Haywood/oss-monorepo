// The numbers the README, page and post quote about the example, from the
// engine itself:  node eval/seasons.mjs > eval/seasons.json
import { readFileSync } from "node:fs";
import { analyze, parseCsv, binned, corp } from "../engine.mjs";

const csv = readFileSync(new URL("../data/nfl-elo-2010-2020.csv", import.meta.url), "utf8");
const { header, rows } = parseCsv(csv);
const col = (n) => header.indexOf(n);
const all = rows.map((r) => ({ season: Number(r[col("season")]), playoff: r[col("playoff")] !== "0", p: Number(r[col("elo_prob_home")]), y: Number(r[col("home_won")]) }));

const seasons = [];
for (let s = 2010; s <= 2020; s++) {
  const g = all.filter((x) => x.season === s);
  const r = analyze({ p: g.map((x) => x.p), y: g.map((x) => x.y), resamples: 0 });
  seasons.push({ season: s, games: r.n, homeWinRate: r.baseRate, meanForecast: r.meanForecast, observed: r.inTheLarge.observed, expected: r.inTheLarge.expected, z: r.inTheLarge.z, p: r.inTheLarge.p, brier: r.brier.score, mcb: r.brier.mcb });
}
const pre = all.filter((x) => x.season < 2020);
const r19 = analyze({ p: pre.map((x) => x.p), y: pre.map((x) => x.y), resamples: 1000 });
const full = analyze({ csv, resamples: 1000 });
const p = all.map((x) => x.p);
const y = all.map((x) => x.y);
const ece = [5, 10, 15, 20, 30].map((bins) => ({ bins, eceWidth: binned(p, y, { bins }).ece, eceCount: binned(p, y, { bins, binning: "count" }).ece }));
const pick = (r) => ({ n: r.n, homeWinRate: r.baseRate, meanForecast: r.meanForecast, oeZ: r.inTheLarge.z, oeP: r.inTheLarge.p, mcbTestP: r.consistency.pValue, spiegelhalterP: r.spiegelhalter.p, coxIntercept: r.cox.intercept, coxSlope: r.cox.slope, coxSlopeSe: r.cox.se.slope, brier: r.brier, auc: r.auc });
console.log(JSON.stringify({ seasons, all: pick(full), through2019: pick(r19), eceByBins: ece, corpMcb: corp(p, y).mcb }, null, 1));
