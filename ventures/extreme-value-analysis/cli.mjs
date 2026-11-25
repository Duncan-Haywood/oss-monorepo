#!/usr/bin/env node
// Extreme value analysis from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data/potomac-annual-peaks.csv
//   node cli.mjs data/potomac-daily-flow.csv --year-start 10 --run-length 7
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS, fmt, formatP } from "./engine.mjs";

export const HELP = `extreme-value-analysis: 100-year levels from annual maxima (GEV, Gumbel) or peaks over a threshold (GPD)

Usage:
  node cli.mjs [data.csv | -] [options]        (reads stdin when no file or "-")

Input: a CSV with one numeric column, plus a year or date column. One row a year is read
as annual maxima. A longer series (daily, hourly) gets both: its annual maxima fitted with a
GEV, and its declustered peaks over a threshold fitted with a generalized Pareto.

Options:
  --value NAME           column to analyse (default: the last numeric column that is not a year)
  --date NAME            date column, YYYY-MM-DD or M/D/YYYY (default: detected)
  --year NAME            year column (default: a column whose name contains "year")
  --year-start M         month the block year starts; 10 = US water year (default 1)
  --method auto          auto | gev | pot
  --threshold U          POT threshold (default: the 98th percentile of the series)
  --run-length R         declustering: a cluster ends after R observations below U (default 3)
  --per-year N           observations a year, for a POT series with no dates
  --periods 2,10,100     return periods in years (default 2,5,10,25,50,100,200,500)
  --confidence 0.95      level for the intervals
  --design-life 50       years, for the chance of at least one exceedance
  --no-trend             skip the GEV with a linear trend in location
  --no-profile           delta-method intervals only (faster; they undercover, see README)
  --json                 print the full JSON result
  --help                 this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. ${p.url}`).join("\n")}

Statistical estimates from your data, not engineering, legal, tax or financial advice, and not a
regulatory flood study (US federal flood frequency follows Bulletin 17C). No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/extreme-value-analysis/`;

const FLAGS = { "--value": "value", "--date": "date", "--year": "year", "--year-start": "yearStart", "--method": "method", "--threshold": "threshold", "--run-length": "runLength", "--per-year": "perYear", "--periods": "returnPeriods", "--confidence": "confidence", "--design-life": "designLife" };
const NUMERIC = ["yearStart", "threshold", "runLength", "perYear", "confidence", "designLife"];

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null, trend: true, profile: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--no-trend") o.trend = false;
    else if (a === "--no-profile") o.profile = false;
    else if (FLAGS[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[FLAGS[a]] = argv[++i];
    } else if (a.startsWith("--") && a.includes("=") && FLAGS[a.slice(0, a.indexOf("="))]) o[FLAGS[a.slice(0, a.indexOf("="))]] = a.slice(a.indexOf("=") + 1);
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}; see --help`);
    else if (o.file === null) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  for (const k of NUMERIC) if (o[k] !== undefined) {
    o[k] = Number(o[k]);
    if (!Number.isFinite(o[k])) throw new Error(`--${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())} must be a number`);
  }
  if (o.returnPeriods !== undefined) o.returnPeriods = String(o.returnPeriods).split(",").map(Number); // "2,10,100,1000": no thousands commas here
  return o;
}

export const shapeInterval = (pr, cl) => (pr ? `; ${cl} profile ${pr.lower === null ? "-1 (search limit)" : fmt(pr.lower)} to ${pr.upper === null ? "3 (search limit)" : fmt(pr.upper)}` : "");

const iv = (row) => {
  const p = row.profile;
  const prof = p && p.lower !== null ? `${fmt(p.lower)} to ${p.upper === null ? "open" : fmt(p.upper)}` : "n/a";
  return [`${fmt(row.delta.lower)} to ${fmt(row.delta.upper)}`, prof];
};

function table(rows, cl) {
  const out = [`  years   level         ${cl} profile interval      ${cl} delta interval`];
  for (const r of rows) {
    const [d, p] = iv(r);
    out.push(`  ${String(r.T).padStart(5)}   ${fmt(r.level).padEnd(12)}  ${p.padEnd(26)}  ${d}${r.extrapolated ? "   (beyond twice the record)" : ""}`);
  }
  return out;
}

export function formatText(r) {
  const cl = `${Math.round(r.input.confidence * 100)}%`;
  const out = [...r.summary, ""];
  if (r.block) {
    const b = r.block, g = b.gev, gu = b.gumbel;
    out.push(`GEV on ${b.nYears} annual maxima of "${r.input.valueColumn}" (maximum likelihood)`);
    out.push(`  location ${fmt(g.mu)} (se ${fmt(g.se.mu)})  scale ${fmt(g.sigma)} (se ${fmt(g.se.sigma)})  shape ${fmt(g.xi)} (se ${fmt(g.se.xi)}${shapeInterval(g.xiProfile, cl)})`);
    out.push(`  negative log-likelihood ${g.nll.toFixed(3)}, AIC ${g.aic.toFixed(2)}; L-moment fit: ${fmt(g.lmom.mu)}, ${fmt(g.lmom.sigma)}, ${fmt(g.lmom.xi)}`);
    out.push(...table(b.returnLevels, cl));
    out.push(`Gumbel: location ${fmt(gu.mu)}, scale ${fmt(gu.sigma)}, AIC ${gu.aic.toFixed(2)}; against GEV, LR ${fmt(b.gumbelVsGev.deviance)}, p = ${formatP(b.gumbelVsGev.p)}`);
    out.push(...table(b.gumbelReturnLevels, cl));
    if (b.trend) {
      const t = b.trend;
      out.push(`GEV with a linear trend in location: ${fmt(t.muPerDecade)} per decade (se ${fmt(t.se.muPerDecade)}), LR ${fmt(t.lrt.deviance)}, p = ${formatP(t.lrt.p)}`);
      for (const e of t.levelsAtEnds) out.push(`  ${e.T}-year level under the trend: ${fmt(e.first)} in ${t.firstYear}, ${fmt(e.last)} in ${t.lastYear}`);
    }
    out.push("");
  }
  if (r.pot) {
    const p = r.pot, g = p.gpd;
    out.push(`Peaks over ${fmt(p.threshold)}: ${p.nExceed} exceedances, ${p.nClusters} clusters (run length ${p.runLength}), ${fmt(p.ratePerYear)} a year over ${fmt(p.nYears)} years`);
    out.push(`  GPD scale ${fmt(g.sigma)} (se ${fmt(g.se.sigma)})  shape ${fmt(g.xi)} (se ${fmt(g.se.xi)}${shapeInterval(g.xiProfile, cl)})`);
    out.push(...table(p.returnLevels, cl));
    out.push("Threshold stability (shape and modified scale should settle above a good threshold):");
    out.push("  threshold     clusters  shape    modified scale");
    for (const s of p.stability) out.push(`  ${fmt(s.u).padEnd(12)}  ${String(s.clusters).padStart(8)}  ${s.xi.toFixed(3).padStart(6)}   ${fmt(s.sigmaStar)}`);
    out.push("");
  }
  if (r.warnings.length) out.push(...r.warnings.map((w) => `Note: ${w}`));
  return out.join("\n").trimEnd();
}

export function run(argv, stdinText) {
  let o;
  try { o = parseArgs(argv); } catch (e) { return { code: 2, out: `Error: ${e.message}\n\n${HELP}` }; }
  if (o.help) return { code: 0, out: HELP };
  let csv;
  try { csv = o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdinText; } catch (e) { return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` }; }
  if (!csv || !csv.trim()) return { code: 2, out: `Error: no CSV given (pass a file or pipe one in).\n\n${HELP}` };
  const { json, help, file, ...input } = o;
  void help; void file;
  let r;
  try { r = analyze({ ...input, csv }); } catch (e) { return { code: 1, out: `Error: ${e.message}` }; }
  if (json) return { code: 0, out: JSON.stringify(r, null, 2) };
  return { code: 0, out: formatText(r) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const takesValue = new Set(Object.keys(FLAGS));
  const hasFile = argv.some((a, i) => !a.startsWith("-") && !takesValue.has(argv[i - 1]));
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && (!hasFile || argv.includes("-"));
  const finish = (text) => { const { code, out } = run(argv, text); process.stdout.write(out + "\n"); process.exitCode = code; };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
