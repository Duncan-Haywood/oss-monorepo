// The early open-hours floor (README "The open-hours row from the first pass"): every call-out rebuild of the café sample and
// of the sample with a spare part-timer (the weeks of eval/callout-cover-study.mjs), plus the four templates, built twice with
// the default options, once with `earlyFloor: false` (the code before this change) and once with it on. Prints, per week, the
// score, open hours, status and milliseconds of each, and whether the early floor fired.
//   node eval/early-floor.mjs            (all weeks)
//   node eval/early-floor.mjs bench P S cases   (cg-scale-bench weeks, exact on, OPTS='{"timeBudgetMs":20000}' for the budget)
import { parseStaff, parseShifts, buildRoster, sampleShifts, DAYS, TEMPLATES } from "../calc.mjs";
import { SAMPLE, WITH_SPARE } from "./callout-cover-study.mjs";

const extra = process.env.OPTS ? JSON.parse(process.env.OPTS) : {};
const both = (label, staff, slots, opts = {}) => {
  const run = (earlyFloor) => { const t = Date.now(); const r = buildRoster(staff, slots, { ...opts, ...extra, earlyFloor }); return { r, ms: Date.now() - t }; };
  const a = run(false), b = run(true);
  const s = (x) => x.r.optimality?.bestScore ?? NaN;
  const same = a.r.owner.join() === b.r.owner.join();
  const f = b.r.optimality?.earlyFloor;
  console.log(`${label}: off ${a.r.unfilledHours} h ${s(a).toFixed(2)} ${a.r.optimality?.status} ${a.ms} ms | on ${b.r.unfilledHours} h ${s(b).toFixed(2)} ${b.r.optimality?.status} ${b.ms} ms | early ${f ? `${f.floor} h (LP ${f.rootLP.toFixed(2)}, ${f.ms} ms)` : "-"} | ${same ? "same roster" : Math.abs(s(a) - s(b)) < 1e-6 ? "tie, other roster" : "DIFFERENT SCORE"}`);
  return { a, b, same, fired: !!f };
};

if (process.argv[2] === "bench") {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const P = Number(process.argv[3] || 40), S = Number(process.argv[4] || 112), cases = Number(process.argv[5] || 2);
  let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  for (let c = 0; c < cases; c++) {
    const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
    const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
    const slots = parseShifts(sh).slots;
    both(`${P}x${S} week ${c} (${slots.length} copies)`, parseStaff(st).staff, slots, { exact: true, timeBudgetMs: 0 });
  }
} else {
  const slots = parseShifts(sampleShifts()).slots;
  const tot = { weeks: 0, fired: 0, same: 0, offMs: 0, onMs: 0, offProven: 0, onProven: 0 };
  const add = (x) => { tot.weeks++; tot.fired += x.fired; tot.same += x.same; tot.offMs += x.a.ms; tot.onMs += x.b.ms; for (const [k, y] of [["offProven", x.a], ["onProven", x.b]]) if (["optimal", "improved"].includes(y.r.optimality?.status)) tot[k]++; };
  for (const [name, text] of [["sample", SAMPLE()], ["spare", WITH_SPARE()]]) {
    const staff = parseStaff(text).staff;
    const posted = buildRoster(staff, slots, {});
    add(both(`${name} posted`, staff, slots));
    for (let p = 0; p < staff.length; p++) for (let d = 0; d < 7; d++) {
      if (!posted.owner.some((x, i) => x === p && slots[i].day === d)) continue;
      const off = text.split("\n").map((l) => (l.startsWith(staff[p].name + ",") ? `${l}, off: ${DAYS[d]}` : l)).join("\n").replace("min hours, availability", "min hours, availability, off");
      add(both(`${name} ${staff[p].name} off ${DAYS[d]}`, parseStaff(off).staff, slots));
    }
  }
  for (const [k, t] of Object.entries(TEMPLATES)) add(both(`template ${k}`, parseStaff(t.staff()).staff, parseShifts(t.shifts()).slots));
  console.log(JSON.stringify(tot));
}
