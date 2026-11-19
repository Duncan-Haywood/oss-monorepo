// Three-point ranges read from P6 activity UDFs (udf-ranges.mjs) on real P6 files.
//
//   node eval/udf-ranges-check.mjs <dir-or-files...> [--runs 60] [--json out.json]
//
// Per file:
// (1) as exported: the numeric activity UDFs the file holds and whether the
//     name guess reads any of them as a range field (it should not: none of
//     the public files keeps ranges, and a wrong guess would silently replace
//     the default range);
// (2) planted: optimistic / most likely / pessimistic UDFs (FT_FLOAT_2_DECIMALS,
//     like a P6 number field) added beside the file's own UDFTYPE and UDFVALUE
//     rows for every open activity of the project the risk run reads, values
//     drawn from a seeded generator around the remaining duration, and on one
//     activity in ten only the optimistic value (a half-filled field). The run
//     with the UDF ranges must equal, percentile for percentile and activity for
//     activity, the run with the same numbers pasted as CSV lines;
// (3) the same plant in hours, in % of remaining, and with no most-likely
//     field (the file's remaining duration); each must equal its own CSV run,
//     and the largest P10-P90 gap to the days run (in working days) shows
//     what two-decimal storage in another unit moves.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { buildModel } from "../cpm.mjs";
import { riskAnalysis, parseRanges, rng } from "../risk.mjs";
import { udfFields, guessRangeFields, rangesFromUdf, udfRangeNote } from "../udf-ranges.mjs";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const runs = Number(opt("--runs") || 60);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--runs", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const r2 = (x) => Math.round(x * 100) / 100;
const same = (a, b) => JSON.stringify(a.percentiles) === JSON.stringify(b.percentiles) && JSON.stringify(a.activities) === JSON.stringify(b.activities);

function plant(text, model, pid, unit, withLikely) {
  const x = parseXer(text); // a fresh copy per variant
  const ids = { min: "990001", likely: "990002", max: "990003" };
  const word = { days: "Duration", hours: "Dur (hrs)", pct: "%" }[unit];
  const types = [["min", `Optimistic ${word}`], ["likely", `Most Likely ${word}`], ["max", `Pessimistic ${word}`]].filter(([k]) => withLikely || k !== "likely");
  (x.tables.UDFTYPE ||= []).push(...types.map(([k, label]) => ({ udf_type_id: ids[k], table_name: "TASK", udf_type_name: `user_field_${ids[k]}`, udf_type_label: label, logical_data_type: "FT_FLOAT_2_DECIMALS", super_flag: "N" })));
  const vals = (x.tables.UDFVALUE ||= []);
  const rand = rng(42);
  const csv = [];
  let planted = 0, partial = 0;
  for (const t of model.tasks.values()) {
    if (t.proj !== pid || t.span || t.status === "TK_Complete" || t.type === "TT_Mile" || t.type === "TT_FinMile" || !(t.remain > 0)) continue;
    const hpd = t.cal.hoursPerDay || 8, days = t.remain / 60 / hpd;
    const fa = 0.6 + 0.4 * rand(), fb = 1 + 0.8 * rand(), half = rand() < 0.1;
    // the stored numbers, in the plant's unit at two decimals, as P6 keeps them
    const conv = { days: (f) => r2(days * f), hours: (f) => r2(days * f * hpd), pct: (f) => r2(100 * f) }[unit];
    const pts = { min: conv(fa), likely: conv(1), max: conv(fb) };
    const put = (k) => vals.push({ udf_type_id: ids[k], fk_id: t.id, proj_id: pid, udf_date: "", udf_number: String(pts[k]), udf_text: "", udf_code_id: "" });
    put("min");
    if (half) { partial++; continue; }
    if (withLikely) put("likely");
    put("max");
    planted++;
    // the same numbers in working days, as a reviewer would paste them
    const toDays = { days: (v) => v, hours: (v) => v / hpd, pct: (v) => (days * v) / 100 }[unit];
    csv.push(`${t.code},${toDays(pts.min)},${withLikely ? toDays(pts.likely) : days},${toDays(pts.max)}`);
  }
  return { x, csv: csv.join("\n"), planted, partial };
}

const out = [];
for (const f of files) {
  const text = decodeXer(readFileSync(f));
  const xer = parseXer(text);
  const fields = udfFields(xer);
  const guess = guessRangeFields(fields);
  const model = buildModel(xer);
  const pid = riskAnalysis(xer, { iterations: 10, model }).project.id;
  const row = { file: basename(f), numericUdfs: fields.length, withValues: fields.filter((u) => u.values > 0).length, guessAsExported: guess, variants: [] };
  let ref = null;
  for (const [unit, withLikely] of [["days", true], ["hours", true], ["pct", true], ["days", false]]) {
    const p = plant(text, model, pid, unit, withLikely);
    const u = rangesFromUdf(p.x, { projId: pid });
    const t0 = Date.now();
    const a = riskAnalysis(p.x, { iterations: runs, seed: 5, projId: pid, ranges: u.ranges, rangeSource: udfRangeNote(u) });
    const ms = Date.now() - t0;
    const b = riskAnalysis(p.x, { iterations: runs, seed: 5, projId: pid, ranges: parseRanges(p.csv).ranges });
    const v = { unit, likely: withLikely, guessed: u.fields ? [u.fields.min.label, u.fields.likely?.label ?? null, u.fields.max.label] : null, planted: p.planted, read: u.read, partial: u.partial.length, plantedPartial: p.partial, overrides: a.overrides, inconsistent: a.inconsistentRanges, equalsCsv: same(a, b), P50: a.percentiles.find((q) => q.p === 50).overDeterministic, P80: a.percentiles.find((q) => q.p === 80).overDeterministic, seconds: Math.round(ms / 100) / 10 };
    if (unit === "days" && withLikely) ref = a; else v.maxGapToDaysRun = r2(Math.max(...a.percentiles.map((q, i) => Math.abs(q.days - ref.percentiles[i].days)))); // two-decimal rounding in another unit
    row.variants.push(v);
  }
  out.push(row);
  console.log(JSON.stringify(row));
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ runs, files: out }, null, 2) + "\n");
console.log("DONE");
