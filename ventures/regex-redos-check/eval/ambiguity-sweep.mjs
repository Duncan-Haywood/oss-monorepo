// Sweep: random regexes, exact oracle vs engine.mjs's static verdict.
// node eval/ambiguity-sweep.mjs [count] [seed] [maxSize]
// ENGINE=path/to/engine.mjs measures another copy (for example main's, from git show); SHOW=fn,fp lists cases.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rng, randomRegex, toSource, buildAutomaton, findEDA, confirmExponential } from "./ambiguity.mjs";

const { analyzePattern } = await import(process.env.ENGINE ? pathToFileURL(path.resolve(process.env.ENGINE)).href : "../engine.mjs");
const count = Number(process.argv[2] || 2000);
const seed = Number(process.argv[3] || 1);
const maxSize = Number(process.argv[4] || 8);
const rand = rng(seed);
const seen = new Set();
const cells = { tp: [], fn: [], fp: [], tn: 0, unconfirmed: [] };
let tries = 0;
while (seen.size < count && tries < count * 50) {
  tries += 1;
  const ast = randomRegex(rand, 2 + Math.floor(rand() * (maxSize - 1)));
  const src = toSource(ast);
  if (seen.has(src)) continue;
  seen.add(src);
  const full = `^(?:${src})$`;
  const eda = findEDA(buildAutomaton(ast));
  const flagged = analyzePattern(full).findings.some((f) => f.severity === "error");
  if (eda) {
    const c = confirmExponential(full, eda);
    if (!c.confirmed) { cells.unconfirmed.push({ src, eda, c, flagged }); continue; }
    (flagged ? cells.tp : cells.fn).push({ src, pump: eda.pump, prefix: eda.prefix });
  } else if (flagged) cells.fp.push({ src });
  else cells.tn += 1;
}
const n = (x) => (Array.isArray(x) ? x.length : x);
console.log(JSON.stringify({ count: seen.size, seed, maxSize, tp: n(cells.tp), fn: n(cells.fn), fp: n(cells.fp), tn: cells.tn, unconfirmed: n(cells.unconfirmed) }));
if (process.env.SHOW) for (const k of process.env.SHOW.split(",")) for (const x of cells[k].slice(0, Number(process.env.LIMIT || 25))) console.log(k, JSON.stringify(x));
