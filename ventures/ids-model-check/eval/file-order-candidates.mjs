// Times applies() for every specification with no entity facet in a set of
// IDS files, by the walk over every entity (main) and by the candidate pool in
// file order, on one model, and checks both give the same entities in the same
// order. eval/file-order-candidates-2026-11-18.md.
//   node eval/file-order-candidates.mjs model.ifc samples/*.ids.xml eval/corpus/real/*.ids
import { readFileSync } from "node:fs";
import { applies } from "../ids.mjs";
import { readModel, parseModel, parseIds } from "../node.mjs";

const [model, ...files] = process.argv.slice(2);
const m = parseModel((await readModel(model)).text);
const ctx = { typeMap: null };
const specs = [];
for (const f of files) {
  let doc;
  try { doc = parseIds(readFileSync(f, "utf8")); } catch { continue; }
  for (const s of doc.specs) if (!s.applicability.some((x) => x.kind === "entity" && x.candidates(m, ctx))) specs.push(s);
}
const time = (walk) => {
  const t0 = performance.now();
  const out = specs.map((s) => applies(s, m, ctx, walk).map((e) => e.id));
  return { ms: performance.now() - t0, out };
};
time(false); // builds the indexes both sides share (psetHolders, file order)
const rows = [];
for (let i = 0; i < 3; i++) rows.push([time(true), time(false)]);
// Per specification: pooled ones (the pool holds at most half the model) apart
// from those that still walk.
const per = specs.map((s) => {
  const t = (walk) => { const t0 = performance.now(); for (let i = 0; i < 3; i++) applies(s, m, ctx, walk); return (performance.now() - t0) / 3; };
  const n = applies(s, m, ctx).length;
  return { walk: t(true), pool: t(false), n, pooled: n <= m.entities.size / 2 };
});
const sum = (xs, k) => Math.round(xs.reduce((a, x) => a + x[k], 0));
const pooled = per.filter((x) => x.pooled), rest = per.filter((x) => !x.pooled);
const same = rows.every(([w, p]) => JSON.stringify(w.out) === JSON.stringify(p.out));
const med = (xs) => xs.sort((a, b) => a - b)[1];
console.log(JSON.stringify({
  model: model.split("/").pop(), entities: m.entities.size, specs: specs.length,
  applicable: rows[0][0].out.reduce((n, l) => n + l.length, 0),
  pooled: { specs: pooled.length, applicable: sum(pooled, "n"), walkMs: sum(pooled, "walk"), poolMs: sum(pooled, "pool") },
  rest: { specs: rest.length, applicable: sum(rest, "n"), walkMs: sum(rest, "walk"), poolMs: sum(rest, "pool") },
  walkMs: Math.round(med(rows.map((r) => r[0].ms))), poolMs: Math.round(med(rows.map((r) => r[1].ms))), same,
}));
