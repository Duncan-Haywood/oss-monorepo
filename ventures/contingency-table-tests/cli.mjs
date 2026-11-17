#!/usr/bin/env node
// Command line for contingency-table-tests. No dependencies.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze, report, PAPERS } from "./engine.mjs";

export const HELP = `contingency-table-tests: exact and asymptotic tests for 2x2, r x c, stratified and paired tables

Usage:
  node cli.mjs table.csv [options]        (or pipe the CSV on stdin, or "-")
  node cli.mjs --table "2,15;10,3"        (rows separated by ;, counts by ,)

The CSV is either a grid (header of column labels, then "label,count,count,...")
or one row per observation or per cell, with an optional count column.

Options:
  --row NAME --col NAME      the category columns (default: the first two)
  --stratum NAME             a stratum column: Cochran-Mantel-Haenszel and friends
  --count NAME               the count column (default: one named count/freq/n, or a last numeric column)
  --paired                   the 2x2 is paired (McNemar), e.g. before/after on the same people
  --alternative two-sided|less|greater   (default two-sided; less = group 1's odds lower)
  --unpooled                 Barnard's test with the unpooled variance
  --no-correct               no continuity correction in the CMH test
  --alpha 0.05  --confidence 0.95
  --json                     the full result as JSON

Methods: Fisher 1935 (doi:10.2307/2342435); Freeman & Halton 1951; Mehta & Patel 1983
(network algorithm); Barnard 1945; Boschloo 1970; Lancaster 1961 (mid-p); Pearson 1900;
Yates 1934; Haberman 1973 (adjusted residuals); Mantel & Haenszel 1959; Robins, Breslow &
Greenland 1986; Tarone 1985; McNemar 1947; Newcombe 1998; Katz et al. 1978; Woolf 1955.
${PAPERS.length} papers in total; "node platform/agents/tools.mjs describe contingency-table-tests" prints them.

No warranty. Statistical estimates from the counts you supply: not legal, tax, financial or
medical advice, and not a substitute for a statistician on a study that matters.`;

export function parseArgs(argv) {
  const o = { file: null };
  const need = (i, name) => {
    if (i >= argv.length) throw new Error(`${name} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--paired") o.mode = "paired";
    else if (a === "--unpooled") o.pooled = false;
    else if (a === "--no-correct") o.correct = false;
    else if (["--row", "--col", "--stratum", "--count", "--alternative", "--table"].includes(a)) o[a.slice(2)] = need(++i, a);
    else if (a === "--alpha" || a === "--confidence") {
      const v = Number(need(++i, a));
      if (!(v > 0 && v < 1)) throw new Error(`${a} must be between 0 and 1`);
      o[a.slice(2)] = v;
    } else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.file = a;
  }
  return o;
}

export function run(argv, stdin) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: `${e.message}\n\n${HELP}` };
  }
  if (o.help) return { code: 0, out: HELP };
  const input = {};
  for (const k of ["row", "col", "stratum", "count", "alternative", "alpha", "confidence", "pooled", "correct", "mode"]) if (o[k] !== undefined) input[k] = o[k];
  try {
    if (o.table) {
      input.table = o.table.split(";").map((r) => r.split(",").map((v) => Number(v.trim())));
    } else {
      const text = o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin;
      if (!text || !text.trim()) return { code: 2, out: `No table given.\n\n${HELP}` };
      input.csv = text;
    }
    if (input.mode === "paired" && input.table) { input.paired = input.table; delete input.table; }
    const r = analyze(input);
    return { code: 0, out: o.json ? JSON.stringify(r, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? String(v) : v), 1) : report(r) };
  } catch (e) {
    return { code: 1, out: `Error: ${e.message}` };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const wantsStdin = !process.stdin.isTTY && !argv.some((a) => a === "--table" || a === "--help" || a === "-h") && (!argv.some((a) => !a.startsWith("--")) || argv.includes("-"));
  const stdin = wantsStdin ? readFileSync(0, "utf8") : "";
  const r = run(argv, stdin);
  process.stdout.write(r.out + "\n");
  process.exitCode = r.code;
}
