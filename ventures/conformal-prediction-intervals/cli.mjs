#!/usr/bin/env node
// Conformal prediction intervals from the command line. Zero dependencies.
// Same engine as the page: node cli.mjs data.csv --target y --coverage 0.9 --method cqr [--json]
import { readFileSync } from "node:fs";
import { analyze, PAPERS } from "./engine.mjs";

export const HELP = `conformal-prediction-intervals: distribution-free prediction intervals for a CSV

Usage:
  node cli.mjs [data.csv | -] [options]        (reads stdin when no file or "-")

Options:
  --target NAME           column to predict (default: last column)
  --features A,B,C        feature columns (default: every other numeric column)
  --coverage 0.9          target coverage, between 0 and 1 (default 0.9)
  --method all            split | normalized | cqr | all (default all)
  --seed 1                seed for the random train/calibration/test split
  --test-fraction 0.25    share of rows held out for evaluation
  --cal-fraction 0.25     share of rows used for calibration
  --repeats 20            extra random splits to average coverage over (0 to skip)
  --new rows.csv          CSV of new rows (feature columns) to get intervals for
  --json                  print the full JSON result
  --help                  this text

Methods:
  split       split conformal around a ridge regression (Lei et al. 2018)
  normalized  locally weighted split conformal, residual / fitted spread (Lei et al. 2018, sec. 5.2)
  cqr         conformalized quantile regression with linear quantiles (Romano, Patterson & Candes 2019)

Guarantee: if rows are exchangeable, a new row lands in its interval with
probability at least the coverage, on average over rows (marginal, not per row).

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not advice. No warranty. MIT licence.
Web version: https://duncan-haywood.github.io/monorepo-projects/conformal-prediction-intervals/`;

const FLAGS = { "--target": "target", "--features": "features", "--coverage": "coverage", "--method": "method", "--seed": "seed", "--test-fraction": "testFraction", "--cal-fraction": "calibrationFraction", "--repeats": "repeats", "--new": "newFile" };

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (FLAGS[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[FLAGS[a]] = argv[++i];
    } else if (a.startsWith("--") && a.includes("=") && FLAGS[a.slice(0, a.indexOf("="))]) o[FLAGS[a.slice(0, a.indexOf("="))]] = a.slice(a.indexOf("=") + 1);
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}; see --help`);
    else if (o.file === null) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

const num = (v) => (!Number.isFinite(v) ? String(v) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3));

export function formatText(r) {
  if (r.error) return `Error: ${r.error}`;
  const out = [r.summary, ""];
  out.push("method                                     coverage  covered   mean width  quantile  k/n_cal" + (r.methods[0]?.repeated ? "   avg cov (splits)" : ""));
  for (const m of r.methods) {
    const q = typeof m.quantile === "number" ? num(m.quantile) : m.quantile;
    out.push(
      `${m.name.padEnd(42)} ${(100 * m.empiricalCoverage).toFixed(1).padStart(7)}%  ${`${m.covered}/${m.testRows}`.padStart(7)}  ${num(m.meanWidth).padStart(11)}  ${q.padStart(8)}  ${`${m.quantileIndex}/${r.split.calibration}`.padStart(7)}` +
        (m.repeated ? `   ${(100 * m.repeated.meanCoverage).toFixed(1)}% (${m.repeated.splits})` : ""),
    );
  }
  const withNew = r.methods.filter((m) => m.newRows.length);
  if (withNew.length) {
    out.push("", "New rows (lower, prediction, upper):");
    withNew[0].newRows.forEach((_, i) => {
      out.push(`  row ${i + 1}: ` + withNew.map((m) => `${m.id} [${num(m.newRows[i].lo)}, ${num(m.newRows[i].pred)}, ${num(m.newRows[i].hi)}]`).join("  "));
    });
  }
  if (r.warnings.length) out.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return out.join("\n");
}

export function run(argv, stdinText) {
  let o;
  try { o = parseArgs(argv); } catch (e) { return { code: 2, out: `Error: ${e.message}\n\n${HELP}` }; }
  if (o.help) return { code: 0, out: HELP };
  let csv;
  try { csv = o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdinText; } catch (e) { return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` }; }
  if (!csv || !csv.trim()) return { code: 2, out: `Error: no CSV given (pass a file or pipe one in).\n\n${HELP}` };
  const input = { csv };
  for (const k of ["target", "method"]) if (o[k] !== undefined) input[k] = o[k];
  if (o.features !== undefined) input.features = o.features.split(",").map((s) => s.trim()).filter(Boolean);
  for (const k of ["coverage", "seed", "testFraction", "calibrationFraction", "repeats"]) if (o[k] !== undefined) input[k] = Number(o[k]);
  if (o.newFile) {
    try { input.newRows = readFileSync(o.newFile, "utf8"); } catch (e) { return { code: 2, out: `Error: cannot read ${o.newFile}: ${e.message}` }; }
  }
  const r = analyze(input);
  if (o.json) return { code: r.error ? 1 : 0, out: JSON.stringify(r, null, 2) };
  return { code: r.error ? 1 : 0, out: formatText(r) };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && !argv.some((a, i) => !a.startsWith("-") && !Object.keys(FLAGS).includes(argv[i - 1]) && a !== "-");
  const finish = (text) => { const { code, out } = run(argv, text); process.stdout.write(out + "\n"); process.exitCode = code; };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
