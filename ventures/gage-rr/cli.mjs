#!/usr/bin/env node
// Gage R&R from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs study.csv [--nested] [--lsl A --usl B] [--k 5.15] [--json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, report, PAPERS } from "./engine.mjs";

export const HELP = `gage-rr: is this gauge good enough? Gage R&R by the ANOVA method, crossed or nested

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: CSV, tab or semicolon-separated, one row per reading, with a part,
an operator (appraiser, gauge, setup) and a measurement column. Other
columns, such as trial, are ignored.
  part,operator,trial,measurement
  1,Ana,1,10.02
  1,Ana,2,10.04

Options:
  --part NAME, --operator NAME, --measurement NAME   pick the columns
  --nested            each operator measured different parts (destructive testing)
  --lsl A --usl B     specification limits: adds %tolerance (P/T ratio)
  --process-sd S      historical process standard deviation: adds %process
  --k K               study-variation multiplier (default 6; 5.15 is the older 99% convention)
  --interaction MODE  crossed only: auto (pool when p > --pool-alpha), keep, or pool (default auto)
  --pool-alpha A      threshold for auto pooling (default 0.05)
  --confidence C      for the variance-component intervals (default 0.95)
  --json              the full JSON result
  --help              this text

Citations:
${PAPERS.map((p) => `  ${p.cite}${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

A statistical estimate from the readings you give. Not engineering
certification, quality-system or other professional advice; a customer, an
IATF 16949 auditor or your own procedure may set different criteria.
No warranty. FSL-1.1-MIT licence. Web version: https://marisstella.app/gage-rr/`;

const WITH_VALUE = { "--part": "part", "--operator": "operator", "--measurement": "measurement", "--lsl": "lsl", "--usl": "usl", "--process-sd": "processSd", "--k": "k", "--interaction": "interaction", "--pool-alpha": "poolAlpha", "--confidence": "confidence" };
const NUMERIC = new Set(["lsl", "usl", "processSd", "k", "poolAlpha", "confidence"]);

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--nested") o.opts.design = "nested";
    else if (a in WITH_VALUE) {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      const key = WITH_VALUE[a];
      if (NUMERIC.has(key)) {
        const v = Number(val);
        if (!Number.isFinite(v)) throw new Error(`${a} needs a number, got "${val}"`);
        o.opts[key] = v;
      } else if (key === "interaction") {
        if (!["auto", "keep", "pool"].includes(val)) throw new Error(`--interaction is auto, keep or pool, got "${val}"`);
        o.opts.interaction = val;
      } else o.opts[key] = val;
    } else if (a.startsWith("-") && a !== "-") throw new Error(`unknown option ${a} (see --help)`);
    else if (o.file) throw new Error(`one input file only (got ${o.file} and ${a})`);
    else o.file = a;
  }
  return o;
}

export function run(argv, stdin = () => readFileSync(0, "utf8")) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: "", err: `gage-rr: ${e.message}` };
  }
  if (args.help) return { code: 0, out: HELP, err: "" };
  try {
    const text = !args.file || args.file === "-" ? stdin() : readFileSync(args.file, "utf8");
    const r = analyze({ ...args.opts, text });
    return { code: 0, out: args.json ? JSON.stringify(r, null, 2) : report(r), err: "" };
  } catch (e) {
    return { code: e.code === "ENOENT" ? 2 : 1, out: "", err: `gage-rr: ${e.message}` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = run(process.argv.slice(2));
  if (r.out) process.stdout.write(r.out + "\n");
  if (r.err) process.stderr.write(r.err + "\n");
  process.exitCode = r.code;
}
