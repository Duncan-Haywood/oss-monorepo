#!/usr/bin/env node
// Method comparison from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs pairs.csv [--x COL --y COL] [--lambda R] [--levels 120,140] [--percent] [--json|--csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, PAPERS, fmt } from "./engine.mjs";

export const HELP = `method-comparison: do two measurement methods agree? (Passing-Bablok, Deming, Bland-Altman)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: CSV or tab-separated rows, one sample per row, a column per method.
The first numeric column is the comparison (reference, current) method x,
the second the new method y; columns named id, sample or seqn are skipped.
  sample,old_method,new_method
  1,4.1,4.3
  2,5.0,5.4

Options:
  --x NAME, --y NAME  pick the columns (name or 1-based number)
  --lambda R          error-variance ratio for Deming: var(y errors) / var(x errors) (default 1)
  --sd-x S --sd-y S   repeatability SDs of each method; sets lambda = (sd-y / sd-x)^2
  --levels A,B        decision levels: the difference between the methods there, with intervals
  --percent           Bland-Altman on percentage differences (scatter grows with the level)
  --multiplier K      limits of agreement at bias +/- K SD (default 1.96)
  --alpha A           1 - confidence level (default 0.05)
  --bootstrap B       resamples for Passing-Bablok intervals at decision levels (default 1000; up to 500 pairs)
  --seed S            bootstrap seed (default 1)
  --no-weighted       skip weighted Deming
  --csv               one row per pair: readings, mean, difference, both fits
  --json              the full JSON result
  --help              this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Statistical estimates from the readings you give. Not medical, laboratory
accreditation, regulatory or other professional advice; a standard (CLSI,
ISO 15189, a regulator) may require a different protocol. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/method-comparison/`;

const WITH_VALUE = ["--x", "--y", "--lambda", "--sd-x", "--sd-y", "--levels", "--multiplier", "--alpha", "--bootstrap", "--seed"];

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    const need = () => {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      return val;
    };
    const number = (min, max = Infinity) => {
      const v = Number(need());
      if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${a} needs a number from ${min}${max < Infinity ? ` to ${max}` : " up"}, got "${val}"`);
      return v;
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--percent") o.opts.baScale = "percent";
    else if (a === "--no-weighted") o.opts.weighted = false;
    else if (a === "--x") o.opts.xColumn = need();
    else if (a === "--y") o.opts.yColumn = need();
    else if (a === "--lambda") {
      o.opts.lambda = number(0);
      if (!(o.opts.lambda > 0)) throw new Error("--lambda must be above zero");
    } else if (a === "--sd-x") o.opts.sdX = number(0);
    else if (a === "--sd-y") o.opts.sdY = number(0);
    else if (a === "--multiplier") o.opts.loaMultiplier = number(0.5, 5);
    else if (a === "--alpha") o.opts.alpha = number(0.001, 0.4);
    else if (a === "--bootstrap") o.opts.bootstrap = number(0, 100000);
    else if (a === "--seed") o.opts.seed = number(0);
    else if (a === "--levels") {
      o.opts.decisionLevels = need().split(",").filter((s) => s.trim()).map((s) => {
        const v = Number(s);
        if (!Number.isFinite(v)) throw new Error(`--levels takes numbers separated by commas, got "${s}"`);
        return v;
      });
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const g = (v, s = 4) => (Number.isFinite(v) ? Number(v.toPrecision(s)).toString() : String(v));
const ci = (c, s = 4) => (c && Number.isFinite(c[0]) ? `${g(c[0], s)} to ${g(c[1], s)}` : "n/a");

export function formatText(r) {
  const out = [...r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  out.push(`${r.n} pairs; x = ${r.xName} (comparison), y = ${r.yName} (new); ${r.xName} from ${g(r.range[0])} to ${g(r.range[1])}.`, "");
  out.push("Regression            intercept (95% CI)                slope (95% CI)");
  const row = (name, f, withCI = true) => out.push(`  ${name.padEnd(20)}${g(f.intercept, 5).padStart(9)} (${withCI ? ci(f.interceptCI) : "-"})`.padEnd(56) + `${g(f.slope, 5).padStart(8)} (${withCI ? ci(f.slopeCI, 5) : "-"})`);
  row("Passing-Bablok", r.passingBablok);
  row(`Deming (λ=${g(r.lambda, 3)})`, r.deming);
  if (r.weightedDeming) row("Weighted Deming", r.weightedDeming);
  out.push(`  ${"Least squares".padEnd(20)}${g(r.ols.intercept, 5).padStart(9)}`.padEnd(56) + `${g(r.ols.slope, 5).padStart(8)}  (biased when x has error; shown for contrast)`);
  out.push("", `Kendall's tau-b ${fmt(r.kendall.tau, 3)} (p ${r.kendall.p < 1e-4 ? "< 0.0001" : fmt(r.kendall.p, 4)}); Pearson r ${fmt(r.ols.r, 4)} (correlation is not agreement).`);
  if (r.cusum && Number.isFinite(r.cusum.p)) out.push(`CUSUM linearity: statistic ${fmt(r.cusum.statistic, 3)}, p ${fmt(r.cusum.p, 3)} (${r.cusum.above} above, ${r.cusum.below} below the line).`);
  const ba = r.blandAltman, u = ba.scale === "percent" ? "%" : "";
  out.push("", `Bland-Altman (${ba.scale === "percent" ? "percentage differences" : "differences"} y - x):`,
    `  bias ${g(ba.bias)}${u} (95% CI ${ci(ba.biasCI)}), SD ${g(ba.sd)}${u}`,
    `  limits of agreement ${g(ba.lower)} to ${g(ba.upper)}${u} (lower 95% CI ${ci(ba.lowerCI)}; upper ${ci(ba.upperCI)}); ${ba.outside} of ${ba.n} pairs outside`,
    `  trend of differences with level: slope ${g(ba.trend.slope)} per unit (p ${fmt(ba.trend.p, 4)}); of their size: p ${fmt(r.blandAltmanAbsolute.spreadTrend.p, 4)}`);
  if (r.decision.length) {
    out.push("", "Difference y - x at decision levels (95% CI):");
    for (const d of r.decision) {
      out.push(`  at ${g(d.level)}: Deming ${g(d.deming.bias)} (${ci(d.deming.ci)})` + (d.weightedDeming ? `; weighted Deming ${g(d.weightedDeming.bias)} (${ci(d.weightedDeming.ci)})` : "") + `; Passing-Bablok ${g(d.passingBablok.bias)}${d.passingBablok.ci ? ` (${ci(d.passingBablok.ci)}, ${d.passingBablok.resamples} resamples)` : ""}`);
    }
  }
  out.push("", `Passing-Bablok: ${r.passingBablok.N.toLocaleString("en-US")} slopes (${r.passingBablok.algorithm}); ${r.passingBablok.pairs.vertical} vertical pairs, ${r.passingBablok.pairs.identical} identical, ${r.passingBablok.pairs.minusOne} of slope -1 left out.`);
  return out.join("\n");
}

export function run(argv, stdinText = "") {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: `Error: ${e.message}\n\n${HELP}` };
  }
  if (o.help) return { code: 0, out: HELP };
  let text = stdinText;
  try {
    if (o.file && o.file !== "-") text = readFileSync(o.file, "utf8");
  } catch (e) {
    return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` };
  }
  if (!text || !text.trim()) return { code: 2, out: `Error: no input given (pass a file or pipe one in).\n\n${HELP}` };
  let r;
  try {
    r = analyze({ text, ...o.opts });
  } catch (e) {
    return { code: 1, out: `Error: ${e.message}` };
  }
  if (o.json) {
    const { x, y, ...rest } = r;
    const slim = { ...rest, blandAltman: { ...r.blandAltman, means: undefined, diffs: undefined }, blandAltmanAbsolute: undefined, weightedDeming: r.weightedDeming && { ...r.weightedDeming, weights: undefined } };
    return { code: 0, out: JSON.stringify(slim, null, 2) };
  }
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  return { code: 0, out: formatText(r) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const withValue = new Set(WITH_VALUE);
  const hasFile = argv.some((a, i) => !a.startsWith("-") && !withValue.has(argv[i - 1]));
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && !hasFile;
  const finish = (text) => {
    const { code, out } = run(argv, text);
    process.stdout.write(out + "\n");
    process.exitCode = code;
  };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
