#!/usr/bin/env node
// Meta-analysis from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data/bcg-vaccine-trials.csv --moderator ablat
//   node cli.mjs studies.csv --measure OR --method DL --json
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS, LAYOUTS, LAYOUT_NAMES, fmt, pEq } from "./engine.mjs";

export const HELP = `meta-analysis: pool study results with a random-effects model, heterogeneity, a prediction
interval, Egger's test, leave-one-out and a meta-regression

Usage:
  node cli.mjs [studies.csv | -] [options]       (reads stdin when no file or "-")

Input: a CSV with one row per study, in one of these layouts (column names are matched loosely;
--columns names them outright):
${Object.entries(LAYOUTS).map(([k, r]) => `  ${k.padEnd(12)} ${LAYOUT_NAMES[k]}: ${r.join(", ")}`).join("\n")}
For example tpos,tneg,cpos,cneg or events_t,n_t,events_c,n_c or mean1,sd1,n1,mean2,sd2,n2 or
yi,sei or or,lower,upper. A study, author or name column labels the rows.

Options:
  --layout auto          one of: auto, ${Object.keys(LAYOUTS).join(", ")}
  --columns ROLE=COL,..  e.g. ai=vacc_tb,bi=vacc_ok,ci=ctrl_tb,di=ctrl_ok
  --measure auto         counts: RR | OR | RD (auto: RR); means: SMD | MD (auto: SMD)
  --ratio auto           generic layouts: are the effects ratios (pooled on the log scale)? auto | yes | no
  --study NAME           label column
  --method REML          REML | DL | PM | FE
  --confidence 0.95      interval level
  --moderator NAME       numeric column for a meta-regression (e.g. latitude, dose, year)
  --correction 0.5       added to each cell of a 2x2 table with a zero (OR, RR)
  --no-loo               skip leave-one-out
  --json                 print the full JSON result
  --help                 this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. ${p.url}`).join("\n")}

Statistical estimates from the study results you supply, not medical, legal, tax, financial or
professional advice. A pooled number is only as good as the studies and how they were chosen.
No warranty. FSL-1.1-MIT licence. Web version: https://marisstella.app/meta-analysis/`;

const FLAGS = { "--layout": "layout", "--columns": "columns", "--measure": "measure", "--ratio": "ratio", "--study": "study", "--method": "method", "--confidence": "confidence", "--moderator": "moderator", "--correction": "correction" };
const NUMERIC = ["confidence", "correction"];

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null, leaveOneOut: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--no-loo") o.leaveOneOut = false;
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
    if (!Number.isFinite(o[k])) throw new Error(`--${k} must be a number`);
  }
  if (typeof o.columns === "string") {
    const map = {};
    for (const pair of o.columns.split(",")) {
      const [role, col] = pair.split("=").map((s) => s.trim());
      if (!role || !col) throw new Error(`--columns wants ROLE=COLUMN pairs, got "${pair}"`);
      map[role] = col;
    }
    o.columns = map;
  }
  return o;
}

export function formatText(r) {
  const cl = `${Math.round(r.input.confidence * 100)}%`;
  const ratio = r.input.ratio;
  const b = (x) => fmt(ratio ? Math.exp(x) : x);
  const out = [...r.summary, ""];
  out.push(`Studies (${r.input.measureName}${ratio ? ", shown on the ratio scale" : ""}; layout: ${r.input.layout}, columns ${Object.entries(r.input.columns).map(([k, v]) => `${k}=${v}`).join(" ")})`);
  const w = Math.max(5, ...r.studies.map((s) => s.label.length));
  out.push(`  ${"study".padEnd(w)}  effect    ${cl} CI                 weight`);
  for (const s of r.studies) out.push(`  ${s.label.padEnd(w)}  ${b(s.yi).padEnd(8)}  ${`${b(s.lower)} to ${b(s.upper)}`.padEnd(22)}  ${(100 * s.weight).toFixed(1)}%${s.corrected ? "  (zero cell, corrected)" : ""}`);
  out.push(`  ${"Pooled".padEnd(w)}  ${b(r.pooled.estimate).padEnd(8)}  ${b(r.pooled.lower)} to ${b(r.pooled.upper)}`);
  out.push("");
  out.push("Every estimator:");
  out.push("  method  tau-squared  I-squared  pooled     Wald CI                 Hartung-Knapp CI");
  for (const m of r.byMethod) out.push(`  ${m.method.padEnd(6)}  ${fmt(m.tau2, 4).padEnd(11)}  ${`${(100 * m.I2).toFixed(1)}%`.padEnd(9)}  ${b(m.estimate).padEnd(9)}  ${`${b(m.lower)} to ${b(m.upper)}`.padEnd(22)}  ${m.hk ? `${b(m.hk.lower)} to ${b(m.hk.upper)}` : "-"}`);
  if (r.leaveOneOut) {
    out.push("", "Leave one out:");
    for (const l of r.leaveOneOut) out.push(`  without ${l.omitted.padEnd(w)}  ${b(l.estimate).padEnd(8)} (${b(l.lower)} to ${b(l.upper)}), tau-squared ${fmt(l.tau2, 4)}, I-squared ${(100 * l.I2).toFixed(1)}%`);
  }
  if (r.regression) {
    const g = r.regression;
    out.push("", `Meta-regression on "${g.moderator}" (${g.method}, ${g.k} studies, log scale for ratios):`);
    out.push(`  intercept ${fmt(g.intercept.estimate, 4)} (se ${fmt(g.intercept.se, 4)})`);
    out.push(`  slope     ${fmt(g.slope.estimate, 4)} (se ${fmt(g.slope.se, 4)}), ${pEq(g.slope.p)}; Hartung-Knapp ${pEq(g.slope.hk.p)}`);
    out.push(`  residual tau-squared ${fmt(g.tau2, 4)} (from ${fmt(g.tau2Without, 4)})${g.R2 !== null ? `, R-squared ${(100 * g.R2).toFixed(1)}%` : ""}`);
  }
  if (r.warnings.length) out.push("", ...r.warnings.map((x) => `Note: ${x}`));
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
