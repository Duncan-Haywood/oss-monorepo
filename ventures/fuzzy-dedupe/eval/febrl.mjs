#!/usr/bin/env node
// Pairwise precision, recall and F1 on the Febrl deduplication sets, whose rec_id
// ("rec-12-org", "rec-12-dup-0") gives the true groups. Febrl 1 ships in data/;
// Febrl 2 and 3 are read from a directory given as the first argument, e.g. the
// recordlinkage 0.16 wheel unpacked:
//   pip download --no-deps recordlinkage==0.16 && unzip recordlinkage-0.16-py3-none-any.whl
//   node eval/febrl.mjs recordlinkage/datasets/febrl
// The baseline is what an exact-match dedupe does: rows are the same person when
// first name, last name and postcode match exactly after trimming and lower-casing.
import { readFileSync, existsSync } from "node:fs";
import { analyze, parseCsv } from "../engine.mjs";

export function truthPairs(rows) {
  const by = new Map();
  rows.forEach((r, i) => { const e = r[0].match(/rec-(\d+)-/)[1]; if (!by.has(e)) by.set(e, []); by.get(e).push(i); });
  return pairsOf([...by.values()]);
}
function pairsOf(groups) {
  const s = new Set();
  for (const g of groups) for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) s.add(Math.min(g[a], g[b]) + "," + Math.max(g[a], g[b]));
  return s;
}
export function score(truth, pred) {
  let tp = 0;
  for (const p of pred) if (truth.has(p)) tp++;
  const P = pred.size ? tp / pred.size : 1, R = tp / truth.size;
  return { truePairs: truth.size, predicted: pred.size, correct: tp, precision: P, recall: R, f1: P + R ? (2 * P * R) / (P + R) : 0 };
}
export function exactBaseline(header, rows) {
  const col = (n) => header.indexOf(n);
  const k = [col("given_name"), col("surname"), col("postcode")];
  const by = new Map();
  rows.forEach((r, i) => {
    const key = k.map((j) => r[j].trim().toLowerCase()).join("|");
    if (k.some((j) => !r[j].trim())) return;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(i);
  });
  return pairsOf([...by.values()]);
}
export function evaluate(file, opts = {}) {
  const { header, rows } = parseCsv(readFileSync(file, "utf8"));
  const truth = truthPairs(rows);
  const t0 = Date.now();
  const r = analyze({ header, rows, ...opts });
  const ms = Date.now() - t0;
  return { rows: rows.length, ms, candidatePairs: r.candidatePairs, reviewCount: r.reviewCount, tool: score(truth, pairsOf(r.groups.map((g) => g.members))), baseline: score(truth, exactBaseline(header, rows)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  const files = [["Febrl 1", new URL("../data/febrl1.csv", import.meta.url).pathname]];
  if (dir) for (const n of [2, 3]) if (existsSync(`${dir}/dataset${n}.csv`)) files.push([`Febrl ${n}`, `${dir}/dataset${n}.csv`]);
  const f = (x) => x.toFixed(3);
  console.log("set      rows  true pairs  tool P / R / F1        exact-match P / R / F1   borderline  ms");
  for (const [name, file] of files) {
    for (const th of [0.9, 0.5]) {
      const e = evaluate(file, { matchThreshold: th });
      console.log(`${name} @${th}`.padEnd(13), String(e.rows).padStart(5), String(e.tool.truePairs).padStart(8), `   ${f(e.tool.precision)} / ${f(e.tool.recall)} / ${f(e.tool.f1)}`, `   ${f(e.baseline.precision)} / ${f(e.baseline.recall)} / ${f(e.baseline.f1)}`, String(e.reviewCount).padStart(8), String(e.ms).padStart(6));
    }
  }
}

// Harder: drop date of birth and the ID number, leaving what a contact list holds (name and address).
export const NAME_ADDRESS_ONLY = ["ignore", "given", "surname", "housenumber", "street", "text", "city", "postcode", "state", "ignore", "ignore"];
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  const files = [["Febrl 1", new URL("../data/febrl1.csv", import.meta.url).pathname]];
  if (dir) for (const n of [2, 3]) if (existsSync(`${dir}/dataset${n}.csv`)) files.push([`Febrl ${n}`, `${dir}/dataset${n}.csv`]);
  const f = (x) => x.toFixed(3);
  console.log("\nname and address only (no birth date, no ID number); guard = different-first-name pairs held for review:");
  for (const [name, file] of files) for (const guard of [true, false]) {
    const e = evaluate(file, { matchThreshold: 0.9, types: NAME_ADDRESS_ONLY, differentNameGuard: guard });
    console.log(`${name} guard ${guard ? "on " : "off"}`.padEnd(17), String(e.rows).padStart(5), String(e.tool.truePairs).padStart(8), `   ${f(e.tool.precision)} / ${f(e.tool.recall)} / ${f(e.tool.f1)}`, String(e.reviewCount).padStart(8), String(e.ms).padStart(6));
  }
}
