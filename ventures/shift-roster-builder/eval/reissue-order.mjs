// Posted reissues and fresh builds, column generation first (2026-11-13). "Call-out rebuilds, column generation first" moved
// the call-out check's rebuilds to deferCover: true (whole-score column generation before the coverage plateau walk), where
// only open hours are read. A posted reissue is different: the manager posts the roster it returns, so a different roster at
// the same score is a different week on the wall. This compares, roster by roster, what a manager would see either way.
//
// Reissues: the five teams of eval/real-rate-week.mjs (sample café, café with a spare part-timer, salon, retail, clinic) x
// seeds 1-6; each seed's default build is the posted week; every person working a day Tue-Sun calls out for it, the change
// made at 5pm the evening before, started shifts pinned (pinStarted), the posted roster kept with keepShift 1 (the CLI's
// --changes default). Each reissue is priced by scheduleChanges against the posted roster (336 h window, 1 hour of pay per
// change, the caller exempt), as eval/reissue-posted.mjs does.
// Fresh builds: the same five teams x seeds 1-6 built both ways.
//   node eval/reissue-order.mjs            (readings: eval/reissue-order.out.txt)
//   TEAMS=cafe,spare SEEDS=3 node eval/reissue-order.mjs
import { parseStaff, parseShifts, buildRoster, rosterCsv, pinStarted, keepFromCsv, scheduleChanges } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";

const O = { minRestHours: 10 };
const all = sets();
const teams = (process.env.TEAMS || Object.keys(all).join(",")).split(",");
const seeds = Number(process.env.SEEDS || 6);
const PROVEN = ["optimal", "improved"];
const EPS = 1e-6;

function run(staff, slots, opts) {
  const t = Date.now();
  const r = buildRoster(staff, slots, opts);
  return { r, ms: Date.now() - t };
}

const grand = { cases: 0, differ: 0, scoreUp: 0, scoreDown: 0, openUp: 0, openDown: 0, chUp: 0, chDown: 0, ch0: 0, ch1: 0, owed0: 0, owed1: 0, pay0: 0, pay1: 0, pr0: 0, pr1: 0, ms0: 0, ms1: 0 };
const fresh = { builds: 0, differ: 0, scoreUp: 0, scoreDown: 0, openUp: 0, ms0: 0, ms1: 0, pr0: 0, pr1: 0 };
const rows = [];
for (const name of teams) {
  const [a, b] = all[name];
  const staff = parseStaff(a).staff, slots = parseShifts(b).slots;
  const wages = Object.fromEntries(staff.map((s) => [s.name, s.wage]));
  const t = { cases: 0, differ: 0, ch0: 0, ch1: 0, owed0: 0, owed1: 0, pay0: 0, pay1: 0, ms0: 0, ms1: 0, worse: 0, better: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    // Fresh builds both ways.
    const f0 = run(staff, slots, { ...O, seed }), f1 = run(staff, slots, { ...O, seed, deferCover: true });
    fresh.builds++; fresh.ms0 += f0.ms; fresh.ms1 += f1.ms;
    if (PROVEN.includes(f0.r.optimality?.status)) fresh.pr0++;
    if (PROVEN.includes(f1.r.optimality?.status)) fresh.pr1++;
    if (rosterCsv(f0.r) !== rosterCsv(f1.r)) fresh.differ++;
    if (f1.r.score > f0.r.score + EPS) fresh.scoreUp++; else if (f1.r.score < f0.r.score - EPS) fresh.scoreDown++;
    if (f1.r.unfilledHours > f0.r.unfilledHours + EPS) fresh.openUp++;
    if (Math.abs(f1.r.score - f0.r.score) > EPS) console.log(`FRESH ${name} seed ${seed}: score ${f0.r.score.toFixed(2)} -> ${f1.r.score.toFixed(2)} (${f0.r.optimality?.status} / ${f1.r.optimality?.status})`);

    // Reissues of the default build (the posted week).
    const posted = f0.r, csv = rosterCsv(posted), keep = keepFromCsv(csv);
    for (let d = 1; d < 7; d++) {
      const changedAt = d * 1440 - 420;
      const pinned = pinStarted(slots, csv, changedAt).slots;
      const working = [...new Set(posted.assignments.filter((x) => x.person && x.slot.day === d).map((x) => x.person))].sort();
      for (const nm of working) {
        const st = staff.map((q) => (q.name === nm ? { ...q, days: q.days.map((w, k) => (k === d ? [] : w)) } : q));
        const x0 = run(st, pinned, { ...O, keep, keepShift: 1, deferCover: false });
        const x1 = run(st, pinned, { ...O, keep, keepShift: 1, deferCover: true });
        const opt = { changedAt, noticeHours: 336, premiumHours: 1, wages, exempt: [nm] };
        const price = (r) => { const c = scheduleChanges(csv, rosterCsv(r), opt); return { changes: c.changes.filter((x) => x.person !== nm).length, owed: c.owed }; };
        const p0 = price(x0.r), p1 = price(x1.r);
        t.cases++; grand.cases++;
        t.ch0 += p0.changes; t.ch1 += p1.changes; t.owed0 += p0.owed; t.owed1 += p1.owed; t.pay0 += x0.r.cost; t.pay1 += x1.r.cost; t.ms0 += x0.ms; t.ms1 += x1.ms;
        grand.ch0 += p0.changes; grand.ch1 += p1.changes; grand.owed0 += p0.owed; grand.owed1 += p1.owed; grand.pay0 += x0.r.cost; grand.pay1 += x1.r.cost; grand.ms0 += x0.ms; grand.ms1 += x1.ms;
        if (PROVEN.includes(x0.r.optimality?.status)) grand.pr0++;
        if (PROVEN.includes(x1.r.optimality?.status)) grand.pr1++;
        if (x1.r.unfilledHours > x0.r.unfilledHours + EPS) grand.openUp++; else if (x1.r.unfilledHours < x0.r.unfilledHours - EPS) grand.openDown++;
        if (x1.r.score > x0.r.score + EPS) { grand.scoreUp++; t.worse++; } else if (x1.r.score < x0.r.score - EPS) { grand.scoreDown++; t.better++; }
        if (p1.changes > p0.changes) grand.chUp++; else if (p1.changes < p0.changes) grand.chDown++;
        if (rosterCsv(x0.r) !== rosterCsv(x1.r)) {
          t.differ++; grand.differ++;
          const line = `${name} seed ${seed} ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]} ${nm} off: score ${x0.r.score.toFixed(2)} -> ${x1.r.score.toFixed(2)}, open ${x0.r.unfilledHours} -> ${x1.r.unfilledHours} h, changes ${p0.changes} -> ${p1.changes}, premium $${p0.owed} -> $${p1.owed}, pay $${x0.r.cost} -> $${x1.r.cost}, ${x0.r.optimality?.status} / ${x1.r.optimality?.status}`;
          rows.push(line); console.log("  differ " + line);
        }
      }
    }
  }
  console.log(`${name}: ${t.cases} reissues, ${t.differ} other roster (score worse ${t.worse}, better ${t.better}); changes to others ${t.ch0} -> ${t.ch1}; premiums $${t.owed0.toFixed(2)} -> $${t.owed1.toFixed(2)}; pay $${t.pay0.toFixed(2)} -> $${t.pay1.toFixed(2)}; ${(t.ms0 / 1000).toFixed(1)} s -> ${(t.ms1 / 1000).toFixed(1)} s`);
}
const g = grand;
console.log(`\nREISSUES ${g.cases}: other roster ${g.differ}; score worse ${g.scoreUp}, better ${g.scoreDown}; open hours up ${g.openUp}, down ${g.openDown}; changes more ${g.chUp}, fewer ${g.chDown}; changes to others ${g.ch0} -> ${g.ch1}; premiums $${g.owed0.toFixed(2)} -> $${g.owed1.toFixed(2)}; pay $${g.pay0.toFixed(2)} -> $${g.pay1.toFixed(2)}; proven ${g.pr0} -> ${g.pr1}; ${(g.ms0 / 1000).toFixed(1)} s -> ${(g.ms1 / 1000).toFixed(1)} s`);
const f = fresh;
console.log(`FRESH BUILDS ${f.builds}: other roster ${f.differ}; score worse ${f.scoreUp}, better ${f.scoreDown}; open hours up ${f.openUp}; proven ${f.pr0} -> ${f.pr1}; ${(f.ms0 / 1000).toFixed(1)} s -> ${(f.ms1 / 1000).toFixed(1)} s`);
