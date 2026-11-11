#!/usr/bin/env node
// Survival analysis from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv --time weeks --event relapsed --group treatment --covariates logWBC [--json]
import { readFileSync } from "node:fs";
import { analyze, PAPERS, formatP } from "./engine.mjs";

export const HELP = `survival-analysis: Kaplan-Meier curves, log-rank test and Cox regression for a CSV

Usage:
  node cli.mjs [data.csv | -] [options]        (reads stdin when no file or "-")

Options:
  --time NAME            duration column (default: a column named time, duration, days, ...)
  --event NAME           event column: 1/0, true/false, yes/no, event/censored, or 1/2 as in R
  --event-value V        the value in --event that means "had the event" (everything else is censored)
  --group NAME           compare groups: one curve each, a log-rank test, and group terms in Cox
  --reference V          reference group for hazard ratios (default: first group seen)
  --covariates A,B       extra Cox terms; text columns are dummy-coded against their first value
  --test logrank         logrank | wilcoxon (Gehan-Breslow) | tarone-ware
  --ties efron           efron | breslow, for tied event times in the Cox model
  --confidence 0.95      level for the bands and intervals
  --tau T                horizon for the restricted mean survival time (default: shortest group follow-up)
  --curve                also print each Kaplan-Meier table
  --json                 print the full JSON result
  --help                 this text

What you get: each group's median time to event with its confidence interval,
restricted mean survival time, the test of equal curves, and (with a group or
covariates) a Cox model's hazard ratios, likelihood-ratio, Wald and score tests,
a proportional-hazards check per term, and Harrell's concordance.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not medical, legal or financial advice. No warranty. MIT licence.
Web version: https://marisstella.app/survival-analysis/`;

const FLAGS = { "--time": "time", "--event": "event", "--event-value": "eventValue", "--group": "group", "--reference": "reference", "--covariates": "covariates", "--test": "test", "--ties": "ties", "--confidence": "confidence", "--tau": "tau" };

export function parseArgs(argv) {
  const o = { json: false, help: false, curve: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--curve") o.curve = true;
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

const num = (v) => (v === Infinity ? "NR" : !Number.isFinite(v) ? String(v) : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(3));

export function formatText(r, { curve = false } = {}) {
  if (r.error) return `Error: ${r.error}`;
  const cl = `${Math.round(r.confidence * 100)}%`;
  const out = [r.summary, ""];
  out.push(`group                      n  events  median  ${cl} CI            RMST(<=${num(r.tau)})`);
  for (const g of r.groups) out.push(`${String(g.name).slice(0, 22).padEnd(22)} ${String(g.n).padStart(5)}  ${String(g.events).padStart(6)}  ${num(g.median).padStart(6)}  ${`${num(g.medianLo)} to ${num(g.medianHi)}`.padEnd(18)}  ${num(g.rmst)}`);
  if (r.logrank) out.push("", `${r.logrank.name}: chi-square ${r.logrank.chiSquare.toFixed(3)} on ${r.logrank.df} df, p = ${formatP(r.logrank.p)}` + `  (observed/expected: ${r.groups.map((g, i) => `${g.name} ${r.logrank.observed[i]}/${r.logrank.expected[i].toFixed(2)}`).join(", ")})`);
  if (r.cox) {
    const c = r.cox;
    out.push("", `Cox proportional hazards (${c.ties} ties), ${c.n} rows, ${c.events} events, ${c.iterations} Newton steps`);
    out.push(`term                                   coef      se   hazard ratio (${cl} CI)        p      PH p`);
    for (const t of c.terms) out.push(`${t.name.slice(0, 36).padEnd(36)} ${t.coef.toFixed(4).padStart(7)} ${t.se.toFixed(4).padStart(7)}   ${num(t.hr).padStart(6)} (${num(t.hrLo)} to ${num(t.hrHi)})`.padEnd(88) + `${formatP(t.p).padStart(8)}  ${t.ph ? formatP(t.ph.p) : "n/a"}`);
    out.push(`likelihood ratio ${c.lr.chiSquare.toFixed(3)} (p ${formatP(c.lr.p)}), Wald ${c.wald.chiSquare.toFixed(3)} (p ${formatP(c.wald.p)}), score ${c.score.chiSquare.toFixed(3)} (p ${formatP(c.score.p)}) on ${c.lr.df} df; concordance ${c.concordance.toFixed(3)}`);
  }
  if (curve) {
    for (const g of r.groups) {
      out.push("", `Kaplan-Meier: ${g.name}`, `    time  at risk  events  censored  survival   std err   ${cl} band`);
      for (const k of g.km) out.push(`${num(k.time).padStart(8)}  ${String(k.atRisk).padStart(7)}  ${String(k.events).padStart(6)}  ${String(k.censored).padStart(8)}  ${k.survival.toFixed(4).padStart(8)}  ${k.se.toFixed(4).padStart(8)}   ${k.lo.toFixed(4)} to ${k.hi.toFixed(4)}`);
    }
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
  for (const k of ["time", "event", "eventValue", "group", "reference", "covariates", "test", "ties"]) if (o[k] !== undefined) input[k] = o[k];
  for (const k of ["confidence", "tau"]) if (o[k] !== undefined) input[k] = Number(o[k]);
  const r = analyze(input);
  if (o.json) return { code: r.error ? 1 : 0, out: JSON.stringify(r, (k, v) => (v === Infinity ? "Infinity" : v), 2) };
  return { code: r.error ? 1 : 0, out: formatText(r, { curve: o.curve }) };
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
