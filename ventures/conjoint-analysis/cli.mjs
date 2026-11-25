#!/usr/bin/env node
// Choice-based conjoint from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs answers.csv --levels levels.txt --price "Price" [--json]
//   node cli.mjs design levels.txt --versions 10 --tasks 12 --concepts 3 [--no-none]
//   node cli.mjs merge design.csv answers-wide.csv
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, report, PAPERS, parseAttributes, generateDesign, designCsv, mergeResponses, respondentsFor } from "./engine.mjs";

export const HELP = `conjoint-analysis: choice-based conjoint (CBC) design and multinomial logit analysis

Usage:
  node cli.mjs [file | -] [options]                 analyse answers (stdin when no file or "-")
  node cli.mjs design LEVELS.txt [design options]   write a survey design as CSV
  node cli.mjs merge DESIGN.csv ANSWERS.csv          join wide answers to the design (long CSV out)

Answers (long format), one row per concept shown:
  respondent,task,concept,Price,Size,Colour,chosen
  r1,1,1,10,M,Red,0
  r1,1,2,12,L,Blue,1
  r1,1,3,None,None,None,0        <- the "none of these" option (cells empty or None)

Levels file, one attribute per line; "#" marks a numeric attribute (one slope):
  Price#: 8, 10, 12
  Size: S, M, L                  (the first level is the reference)

Analysis options:
  --levels FILE        level order and numeric attributes (recommended)
  --numeric A,B        treat these attributes as numeric (alternative to "#")
  --price NAME         numeric attribute to express willingness to pay in
  --respondent, --task, --chosen, --concept NAME     pick columns by name
  --bootstrap N        respondent resamples for importance/WTP/share intervals (default 200; 0 = off)
  --product JSON       a product for the share simulator, repeatable:
                       --product '{"name":"Ours","Price":10,"Size":"M","Colour":"Red"}'
  --no-none-share      leave the none option out of simulated shares
  --confidence C       interval level (default 0.95)
  --seed S             bootstrap seed
  --json               the full JSON result

Design options:
  --versions V (10)  --tasks T (12)  --concepts C (3)  --no-none  --seed S (1)  --target-se E (0.05)

Citations:
${PAPERS.map((p) => `  ${p.cite}${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Aggregate logit treats all respondents as one segment; the README says what
that means for heterogeneous markets. A statistical estimate from stated
choices: not financial, legal or other professional advice, and not a
forecast of sales. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/conjoint-analysis/`;

const WITH_VALUE = {
  "--levels": "levels", "--numeric": "numeric", "--price": "price", "--respondent": "respondent", "--task": "task", "--chosen": "chosen", "--concept": "concept",
  "--bootstrap": "bootstrap", "--product": "product", "--confidence": "confidence", "--seed": "seed",
  "--versions": "versions", "--tasks": "tasks", "--concepts": "concepts", "--target-se": "targetSe",
};
const NUMBERS = new Set(["bootstrap", "confidence", "seed", "versions", "tasks", "concepts", "targetSe"]);

export function parseArgs(argv) {
  const o = { json: false, help: false, files: [], mode: "analyze", opts: { products: [] }, none: true };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--no-none") o.none = false;
    else if (a === "--no-none-share") o.opts.includeNone = false;
    else if (a in WITH_VALUE) {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      const key = WITH_VALUE[a];
      if (NUMBERS.has(key)) {
        const v = Number(val);
        if (!Number.isFinite(v)) throw new Error(`${a} needs a number, got "${val}"`);
        o.opts[key] = v;
      } else if (key === "product") {
        try { o.opts.products.push(JSON.parse(val)); } catch { throw new Error(`--product needs JSON, got ${val}`); }
      } else if (key === "numeric") o.opts.numeric = val.split(",").map((s) => s.trim()).filter(Boolean);
      else o.opts[key] = val;
    } else if (a.startsWith("-") && a !== "-") throw new Error(`unknown option ${a} (see --help)`);
    else if (o.files.length === 0 && o.mode === "analyze" && (a === "design" || a === "merge")) o.mode = a;
    else o.files.push(a);
  }
  return o;
}

export function run(argv, stdin = () => readFileSync(0, "utf8")) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: "", err: `conjoint-analysis: ${e.message}` };
  }
  if (args.help) return { code: 0, out: HELP, err: "" };
  try {
    const read = (f) => (!f || f === "-" ? stdin() : readFileSync(f, "utf8"));
    if (args.mode === "design") {
      if (args.files.length !== 1) throw new Error("design needs one levels file");
      const d = generateDesign({ attributes: parseAttributes(read(args.files[0])), versions: args.opts.versions ?? 10, tasks: args.opts.tasks ?? 12, concepts: args.opts.concepts ?? 3, none: args.none, seed: args.opts.seed ?? 1 });
      if (args.json) return { code: 0, out: JSON.stringify(d, null, 2), err: "" };
      const n = respondentsFor(d, args.opts.targetSe ?? 0.05);
      return { code: 0, out: designCsv(d), err: `D-error ${d.dError.toFixed(4)}; about ${n ?? "?"} respondents for every coefficient's SE to reach ${args.opts.targetSe ?? 0.05} (at zero utilities)` };
    }
    if (args.mode === "merge") {
      if (args.files.length !== 2) throw new Error("merge needs a design CSV and an answers CSV");
      const m = mergeResponses(read(args.files[0]), read(args.files[1]));
      return { code: 0, out: m.csv, err: m.missing ? `${m.missing} unanswered task(s) left out` : "" };
    }
    if (args.files.length > 1) throw new Error(`one input file only (got ${args.files.join(", ")})`);
    const opts = { ...args.opts };
    if (opts.levels) opts.levels = readFileSync(opts.levels, "utf8");
    const r = analyze({ ...opts, text: read(args.files[0]) });
    return { code: 0, out: args.json ? JSON.stringify(r, null, 2) : report(r), err: "" };
  } catch (e) {
    return { code: e.code === "ENOENT" ? 2 : 1, out: "", err: `conjoint-analysis: ${e.message}` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = run(process.argv.slice(2));
  if (r.out) process.stdout.write(r.out + "\n");
  if (r.err) process.stderr.write(r.err + "\n");
  process.exitCode = r.code;
}
