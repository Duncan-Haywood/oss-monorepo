#!/usr/bin/env node
// Capture-recapture from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs histories.csv [--group year] [--json]
//   node cli.mjs --n1 60 --n2 55 --m 22
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, report, PAPERS } from "./engine.mjs";

export const HELP = `capture-recapture: how many are there, counting the ones you never saw?
Closed-population size from capture histories or two-sample counts.

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")
  node cli.mjs --n1 60 --n2 55 --m 22      (two samples: caught, caught later, marked among them)
  node cli.mjs --frequencies 43,16,8,6,0,2,1 --k 18   (caught once, twice, ... over k occasions)

Input: CSV, tab or semicolon-separated, one row per animal (or defect, or
case) with one 0/1 column per occasion (trap night, reviewer, list), or a
history column such as 0101. Rows with a group column are estimated
separately, one closed period each.
  id,night1,night2,night3
  A17,1,0,1
  A18,0,1,0

Options:
  --group NAME        column splitting rows into separate estimates (a year, a site)
  --history NAME      column holding histories such as 0101
  --occasions A,B,C   the occasion columns (default: every 0/1 column)
  --freq NAME         column giving how many animals share the row's history
  --confidence C      interval level (default 0.95)
  --json              the full JSON result
  --help              this text

Methods: M0, Mt, Mb by maximum likelihood with profile-likelihood intervals
and AIC (Otis et al. 1978; Darroch 1958); Chao's (1987) heterogeneity
estimator; Burnham & Overton (1978) jackknife; Chapman (1951) for two samples.

Citations:
${PAPERS.map((p) => `  ${p.cite}${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

A statistical estimate that is only as good as its assumptions (a closed
population, marks not lost, animals independent). Not legal, regulatory,
wildlife-management or other professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/capture-recapture/`;

const WITH_VALUE = { "--group": "group", "--history": "history", "--occasions": "occasions", "--freq": "freq", "--confidence": "confidence", "--n1": "n1", "--n2": "n2", "--m": "m", "--frequencies": "frequencies", "--k": "k" };
const NUMERIC = new Set(["confidence", "n1", "n2", "m", "k"]);

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a in WITH_VALUE) {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      const key = WITH_VALUE[a];
      if (NUMERIC.has(key)) {
        const v = Number(val);
        if (!Number.isFinite(v)) throw new Error(`${a} needs a number, got "${val}"`);
        o.opts[key] = v;
      } else if (key === "frequencies") {
        const f = val.split(",").map((x) => Number(x.trim()));
        if (!f.every(Number.isFinite)) throw new Error(`--frequencies needs numbers such as 43,16,8, got "${val}"`);
        o.opts.frequencies = f;
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
    return { code: 2, out: "", err: `capture-recapture: ${e.message}` };
  }
  if (args.help) return { code: 0, out: HELP, err: "" };
  try {
    const counts = ["n1", "n2", "m"].some((k) => k in args.opts) || args.opts.frequencies;
    const input = counts ? args.opts : { ...args.opts, text: !args.file || args.file === "-" ? stdin() : readFileSync(args.file, "utf8") };
    const r = analyze(input);
    return { code: 0, out: args.json ? JSON.stringify(r, null, 2) : report(r), err: "" };
  } catch (e) {
    return { code: e.code === "ENOENT" ? 2 : 1, out: "", err: `capture-recapture: ${e.message}` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = run(process.argv.slice(2));
  if (r.out) process.stdout.write(r.out + "\n");
  if (r.err) process.stderr.write(r.err + "\n");
  process.exitCode = r.code;
}
