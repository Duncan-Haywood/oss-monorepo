// Fresh builds, column generation first (2026-11-13). "Posted reissues, column generation first" measured fresh builds both
// ways on the five teams of eval/real-rate-week.mjs x seeds 1-6 (same score on all 30, 8.6 s to 2.7 s, a different roster on 6)
// and left them on the old order. This widens that check before the default moves: the five teams x seeds 1-12, plus seeded
// weeks of 8-20 people from the cg-scale-bench generator (eval/end-to-end.mjs's rule) at or under 60 shift copies, the
// sizes where the order was still the old one (above 60 copies it was already column generation first).
// Each week is built with deferCover false (old order) and true (column generation first); reports score, open hours, proof
// status, whether the roster differs, and time. Where the five teams' rosters differ, both are also run through calloutExposure
// (every person-day Tue-Sun calling out at 5pm the day before, kept rebuild): the open hours one call-out could add, summed.
// Ties at the best score are not equally robust (README "Which of the tied best rosters holds up to a call-out?").
//   node eval/fresh-order.mjs              (readings: eval/fresh-order.out.txt)
//   SEEDS=3 SIZES=8x24 node eval/fresh-order.mjs
import { parseStaff, parseShifts, buildRoster, rosterCsv, calloutExposure } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";

const PROVEN = ["optimal", "improved"];
const EPS = 1e-6;
const seeds = Number(process.env.SEEDS || 12);
const sizes = (process.env.SIZES || "8x24,10x28,12x32,14x36,16x40,18x44").split(",").map((s) => s.split("x").map(Number));
const cases = Number(process.env.CASES || 4);

function week(P, S, c) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  let seed = 20261022 + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  let st, sh;
  for (let k = 0; k <= c; k++) {
    st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
    sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  }
  return [parseStaff(st).staff, parseShifts(sh).slots];
}

function both(staff, slots, opts) {
  let t = Date.now();
  const a = buildRoster(staff, slots, { ...opts, deferCover: false });
  const ms0 = Date.now() - t; t = Date.now();
  const b = buildRoster(staff, slots, { ...opts, deferCover: true });
  const ms1 = Date.now() - t;
  return { a, b, ms0, ms1 };
}

const groups = [];
const all = sets();
for (const name of Object.keys(all)) {
  const [x, y] = all[name];
  const staff = parseStaff(x).staff, slots = parseShifts(y).slots;
  groups.push({ name, runs: Array.from({ length: seeds }, (_, i) => ({ label: `seed ${i + 1}`, team: true, staff, slots, opts: { minRestHours: 10, seed: i + 1 } })) });
}
for (const [P, S] of sizes) {
  const runs = [];
  for (let c = 0; c < cases; c++) { const [staff, slots] = week(P, S, c); if (slots.length <= 60) runs.push({ label: `week ${c} (${slots.length} copies)`, staff, slots, opts: {} }); }
  groups.push({ name: `${P}x${S}`, runs });
}

const g = { n: 0, differ: 0, scoreUp: 0, scoreDown: 0, openUp: 0, openDown: 0, pr0: 0, pr1: 0, ms0: 0, ms1: 0, slower: 0, exp0: 0, exp1: 0, expN: 0, expUp: 0, expDown: 0 };
for (const grp of groups) {
  const t = { n: 0, differ: 0, ms0: 0, ms1: 0, pr0: 0, pr1: 0, worse: 0, better: 0 };
  for (const r of grp.runs) {
    const { a, b, ms0, ms1 } = both(r.staff, r.slots, r.opts);
    t.n++; g.n++; t.ms0 += ms0; t.ms1 += ms1; g.ms0 += ms0; g.ms1 += ms1;
    if (PROVEN.includes(a.optimality?.status)) { t.pr0++; g.pr0++; }
    if (PROVEN.includes(b.optimality?.status)) { t.pr1++; g.pr1++; }
    if (b.score > a.score + EPS) { g.scoreUp++; t.worse++; } else if (b.score < a.score - EPS) { g.scoreDown++; t.better++; }
    if (b.unfilledHours > a.unfilledHours + EPS) g.openUp++; else if (b.unfilledHours < a.unfilledHours - EPS) g.openDown++;
    if (ms1 > ms0 + 50) g.slower++;
    const diff = rosterCsv(a) !== rosterCsv(b);
    if (diff) { t.differ++; g.differ++; }
    if (diff && r.team) {
      const e0 = calloutExposure(r.staff, r.slots, a, r.opts).exposure, e1 = calloutExposure(r.staff, r.slots, b, r.opts).exposure;
      g.exp0 += e0; g.exp1 += e1; g.expN++; if (e1 > e0) g.expUp++; else if (e1 < e0) g.expDown++;
      console.log(`  ${grp.name} ${r.label}: call-out exposure ${e0} h (old order) vs ${e1} h (column generation first)`);
    }
    if (diff || Math.abs(b.score - a.score) > EPS || ms1 > ms0 + 50) console.log(`  ${grp.name} ${r.label}: score ${a.score.toFixed(2)} -> ${b.score.toFixed(2)}, open ${a.unfilledHours} -> ${b.unfilledHours} h, ${a.optimality?.status} / ${b.optimality?.status}, ${diff ? "other roster" : "same roster"}, ${ms0} -> ${ms1} ms`);
  }
  console.log(`${grp.name}: ${t.n} builds, proven ${t.pr0} / ${t.pr1}, score worse ${t.worse}, better ${t.better}, other roster ${t.differ}, ${(t.ms0 / 1000).toFixed(1)} s -> ${(t.ms1 / 1000).toFixed(1)} s`);
}
console.log(`\nall: ${g.n} fresh builds; proven ${g.pr0} old order / ${g.pr1} column generation first; score worse ${g.scoreUp}, better ${g.scoreDown}; open hours up ${g.openUp}, down ${g.openDown}; other roster ${g.differ}; slower by >50 ms ${g.slower}; ${(g.ms0 / 1000).toFixed(1)} s -> ${(g.ms1 / 1000).toFixed(1)} s`);
console.log(`call-out exposure on the ${g.expN} team weeks whose roster differs: ${g.exp0} h old order, ${g.exp1} h column generation first (higher on ${g.expUp}, lower on ${g.expDown})`);
