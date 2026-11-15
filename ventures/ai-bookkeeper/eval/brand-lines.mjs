// Which bank lines the chain-name layer (brands.mjs, OpenStreetMap's name-suggestion-index) speaks
// on, read from empty books, on the 63 real US exports of eval/us-bank-exports.mjs. These files
// carry no category, so each changed line is printed for a person to read and mark right or
// wrong (README "Chain names from OpenStreetMap" gives the reading).
//
//   node eval/us-bank-exports.mjs --cache DIR      (fetches the files once)
//   node eval/brand-lines.mjs --cache DIR
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readStatement } from "../bank.mjs";
import { suggest } from "../categorize.mjs";
import { SOURCES } from "./us-bank-exports.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const cache = arg("--cache", "/tmp/us-bank-exports");
let files = 0, lines = 0, out = 0;
const changed = new Map();
for (const src of SOURCES) {
  const f = join(cache, src.path.replace(/\//g, "_"));
  if (!existsSync(f)) continue;
  files++;
  const r = readStatement(readFileSync(f, "utf8").replace(/^﻿/, ""), {});
  for (const x of r.rows) {
    lines++;
    if (x.cents >= 0) continue;
    out++;
    const txn = { desc: x.desc, cents: x.cents };
    const on = suggest(txn, { rules: [], codes: null });
    const off = suggest(txn, { rules: [], codes: null, skip: new Set(["brand"]) });
    if (on.account === off.account) continue;
    const k = `${off.account ?? "-"} -> ${on.account} | ${on.reason.split('"')[1]} | ${x.desc.replace(/\s+/g, " ").slice(0, 60)}`;
    changed.set(k, (changed.get(k) ?? 0) + 1);
  }
}
const n = [...changed.values()].reduce((a, b) => a + b, 0);
console.log(`${files} files, ${lines} lines, ${out} money out; ${n} lines changed by the chain-name layer (${changed.size} distinct)`);
for (const [k, c] of [...changed].sort((a, b) => (a[0] < b[0] ? -1 : 1))) console.log(`  x${c} ${k}`);
