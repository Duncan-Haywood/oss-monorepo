// Develop each base in a whist-search-style JSON-lines file and run whist.mjs's checkWhist on it.
// Usage: node eval/whist-multiplier-check.mjs eval/whist-multiplier.txt
import { readFileSync } from "node:fs";
import { checkWhist } from "../whist.mjs";
function develop(n, mods, tables) {
  const v = mods.reduce((a, b) => a * b, 1);
  const co = (x) => mods.map((m) => { const c = x % m; x = Math.floor(x / m); return c; });
  const enc = (c) => c.reduceRight((acc, ci, i) => acc * mods[i] + ci, 0);
  const add = (a, b) => { const ca = co(a), cb = co(b); return enc(ca.map((x, i) => (x + cb[i]) % mods[i])); };
  const inf = n % 4 === 0 ? n - 1 : null;
  const rounds = [];
  for (let g = 0; g < v; g++) rounds.push({ tables: tables.map((t) => t.map((p) => (p === -1 ? inf : add(p, g)))) });
  return rounds;
}
for (const l of readFileSync(process.argv[2], "utf8").split("\n").filter((x) => x.startsWith("{"))) {
  const r = JSON.parse(l);
  if (!r.tables) { console.log(r.n, "no base"); continue; }
  console.log(r.n, r.method, checkWhist(r.n, develop(r.n, r.mods, r.tables)) ? "whist: every pair partners once, opposes twice" : "FAILS");
}
