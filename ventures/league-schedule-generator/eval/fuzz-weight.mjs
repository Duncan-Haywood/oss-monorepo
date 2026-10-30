// Random multi-division leagues through suggestFairnessWeight (one search is a full grid of seasons, so leagues are small).
// Checks: no throw, the weight is on the grid, rows cover the grid with finite non-negative numbers, weight 0 is the
// baseline, a non-zero pick is never over the travel slack unless overSlack says so, an overSlack pick halves the
// imbalance, extraTravel matches the picked row, and the same spec gives the same answer twice.
// Usage: node eval/fuzz-weight.mjs [count] [seed]
import { readDivisionsSpec, suggestFairnessWeight } from "../divisions.mjs";
import { mulberry32 } from "../calc.mjs";

const count = Number(process.argv[2] || 15);
const rnd = mulberry32(Number(process.argv[3] || 5));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const GRID = [0, 0.5, 1, 1.5, 2, 3, 5, 10];
const stats = { searched: 0, rejected: 0, zero: 0, fair: 0, overSlack: 0 };
const bad = [];
const fail = (kind, extra) => bad.push({ kind, ...extra });

for (let i = 0; i < count; i++) {
  const venues = ["Park", "School", "Rink"].slice(0, int(2, 3));
  const mf = {
    divisions: Array.from({ length: int(1, 2) }, (_, d) => `D${d + 1}: ${Array.from({ length: int(3, 6) }, (_, k) => `T${k + 1}`).join(", ")}`).join("\n"),
    courts: Array.from({ length: int(2, 4) }, (_, c) => `C${c + 1} @ ${venues[c % venues.length]}`).join(", "),
    times: ["18:00", "19:00"].slice(0, int(1, 2)).join(", "), start: "2026-03-02", weekdays: pick(["Tue", "Tue, Thu"]),
    travel: rnd() < 0.6 ? venues.flatMap((a, x) => venues.slice(x + 1).map((b) => `${a} - ${b}: ${int(5, 60)}`)).join("\n") : "",
    venueFairness: true, seed: int(1, 999),
  };
  const r = readDivisionsSpec(mf);
  if (r.errors.length) { stats.rejected++; continue; }
  let a;
  try { a = suggestFairnessWeight(r.spec, { seeds: 2 }); } catch (e) { if (/court slots/.test(String(e))) { stats.rejected++; continue; } fail("throw", { mf, error: String(e) }); continue; }
  stats.searched++;
  if (!GRID.includes(a.weight)) fail("off-grid", { mf, weight: a.weight });
  if (a.rows.length !== GRID.length || a.rows.some((x) => !Number.isFinite(x.imbalance) || !Number.isFinite(x.travel) || x.imbalance < 0 || x.travel < 0)) fail("bad-rows", { mf, rows: a.rows });
  const zero = a.rows.find((x) => x.weight === 0), chosen = a.rows.find((x) => x.weight === a.weight);
  if (!zero || !chosen) { fail("missing-row", { mf }); continue; }
  if (a.weight === 0) stats.zero++; else if (a.overSlack) stats.overSlack++; else stats.fair++;
  if (a.weight > 0 && !a.overSlack && chosen.travel > zero.travel * (1 + a.slack) + 1e-9) fail("over-slack-unflagged", { mf, a });
  if (a.overSlack && chosen.imbalance > zero.imbalance / 2 + 1e-9) fail("half-not-met", { mf, a });
  if (zero.travel && Math.abs(a.extraTravel - (chosen.travel / zero.travel - 1)) > 0.001) fail("extra-travel", { mf, a });
  const b = suggestFairnessWeight(r.spec, { seeds: 2 });
  if (JSON.stringify(a) !== JSON.stringify(b)) fail("not-deterministic", { mf });
}
console.log(JSON.stringify(stats));
console.log(`invalid ${bad.length}`);
for (const b of bad.slice(0, 3)) console.log(JSON.stringify(b, null, 1).slice(0, 1800));
process.exit(bad.length ? 1 : 0);
