#!/usr/bin/env node
// Species diversity from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs counts.csv [--group site] [--json]
//   node cli.mjs --counts 52,30,21,12,9,7,5,4,3,3,2,2,2,1,1,1,1,1
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, report, PAPERS } from "./engine.mjs";

export const HELP = `species-diversity: how many species are there, counting the ones not found yet,
and is one site really more diverse than another?

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")
  node cli.mjs --counts 52,30,21,12,9,1,1  (individuals per species, one assemblage)

Input: CSV, tab or semicolon-separated abundance data, in any of three layouts:
  long   species,count[,site]     one row per species (and site)
  raw    species[,site]           one row per individual seen
  wide   species,siteA,siteB,...  one count column per site
Rows naming the same species in the same assemblage are added together.

Options:
  --species NAME      the species column (default: species/taxon/name..., else the first text column)
  --count NAME        the count column (default: count/abundance/individuals...)
  --group NAME        column splitting rows into assemblages (site, treatment, year)
  --confidence C      interval level (default 0.95)
  --bootstrap B       bootstrap replicates for intervals (default 100; 0 turns them off)
  --seed S            bootstrap seed (default 1)
  --knots K           points per curve (default 40)
  --endpoint M        largest sample size on the curves (default: twice each sample)
  --json              the full JSON result
  --help              this text

Methods: Hill numbers of order 0, 1, 2 (Hill 1973); Chao1 with Chao's (1987)
log-normal interval; ACE (Chao & Lee 1992); the Chao-Wang-Jost (2013) entropy
estimator; rarefaction and extrapolation by sample size (Chao et al. 2014) and
by sample coverage (Chao & Jost 2012); comparisons at a common coverage and a
common size as in iNEXT (Hsieh, Ma & Chao 2016).

Citations:
${PAPERS.map((p) => `  ${p.cite}${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

A statistical estimate that assumes individuals were sampled at random and
independently. Not legal, regulatory, environmental-assessment or other
professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/species-diversity/`;

const WITH_VALUE = { "--species": "species", "--count": "count", "--group": "group", "--confidence": "confidence", "--bootstrap": "bootstrap", "--seed": "seed", "--knots": "knots", "--endpoint": "endpoint", "--counts": "counts" };
const NUMERIC = new Set(["confidence", "bootstrap", "seed", "knots", "endpoint"]);

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
      } else if (key === "counts") {
        const f = val.split(",").map((x) => Number(x.trim()));
        if (!f.every((x) => Number.isInteger(x) && x >= 0)) throw new Error(`--counts needs whole numbers such as 12,5,3,1, got "${val}"`);
        o.opts.counts = f;
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
    return { code: 2, out: "", err: `species-diversity: ${e.message}` };
  }
  if (args.help) return { code: 0, out: HELP, err: "" };
  try {
    const input = args.opts.counts ? args.opts : { ...args.opts, text: !args.file || args.file === "-" ? stdin() : readFileSync(args.file, "utf8") };
    const r = analyze(input);
    return { code: 0, out: args.json ? JSON.stringify(r, null, 2) : report(r), err: "" };
  } catch (e) {
    return { code: e.code === "ENOENT" ? 2 : 1, out: "", err: `species-diversity: ${e.message}` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = run(process.argv.slice(2));
  if (r.out) process.stdout.write(r.out + "\n");
  if (r.err) process.stderr.write(r.err + "\n");
  process.exitCode = r.code;
}
