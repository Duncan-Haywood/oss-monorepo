// The crew sweep is a greedy heuristic. This compares it with an exact brute-force solver on
// 400 seeded one-day instances (4 to 6 jobs, one property each, 20 min travel, 9-17 shift).
// The page says it never answers too few cleaners and answers one too many in about a fifth
// of cases (quality audit 2026-11-15, portfolio/quality/audits/2026-11-15-str-turnover-scheduler.json).
import test from "node:test";
import assert from "node:assert/strict";
import * as c from "./calc.mjs";
// Independent exact solver for one-day instances: does a crew of k clear every deadline inside the shift?
const D = 20000 * 1440, S = 9 * 60, E = 17 * 60, T = 20;
function perms(a) { if (a.length <= 1) return [a]; const o = []; a.forEach((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).forEach((p) => o.push([x, ...p]))); return o; }
function seqOk(js) { if (!js.length) return true; for (const p of perms(js)) { let t = D + S, at = null, ok = true; for (const j of p) { const st = Math.max(t + (at !== null && at !== j.property ? T : 0), j.earliest); const en = st + j.dur; if (en > j.deadline || en > D + E) { ok = false; break; } t = en; at = j.property; } if (ok) return true; } return false; }
function exactMin(jobs, kmax) { for (let k = 1; k <= kmax; k++) { const n = jobs.length; const tot = k ** n; for (let m = 0; m < tot; m++) { const g = Array.from({ length: k }, () => []); let x = m; for (const j of jobs) { g[x % k].push(j); x = Math.floor(x / k); } if (g.every(seqOk)) return k; } } return null; }
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
let n = 0, worse = 0, better = 0; const ex = [];
for (let it = 0; it < 400; it++) {
  const jobs = []; const nj = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < nj; i++) { const r = [600, 660][Math.floor(rnd() * 2)], d = [840, 900, 960][Math.floor(rnd() * 3)], p = [60, 90, 120, 150, 180][Math.floor(rnd() * 5)]; jobs.push({ id: i + 1, property: "P" + i, earliest: D + r, deadline: D + d, dur: p, windowMin: d - r, guestOut: 20000, fee: 0, sameDay: true }); }
  if (jobs.some((j) => j.windowMin < j.dur)) continue;
  const g = c.crewSweep(jobs, { maxCrew: 6, travelMin: T, shiftStart: 9, shiftEnd: 17 }).minCrew;
  const e = exactMin(jobs, 6); n++;
  if (g !== e) { if (g > e) worse++; else better++; if (ex.length < 2) ex.push({ greedy: g, exact: e, jobs: jobs.map((j) => [j.property, (j.earliest - D) / 60, (j.deadline - D) / 60, j.dur / 60]) }); }
}


test("greedy crew size is never below the exact minimum, and is above it in about a fifth of cases", () => {
  assert.equal(n, 400);
  assert.equal(better, 0);
  assert.equal(worse, 83);
});
