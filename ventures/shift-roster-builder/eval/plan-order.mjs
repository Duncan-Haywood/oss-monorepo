// Multi-week plans, column generation first or not (2026-11-13). planWeeks carries each week's last shifts (rest gaps,
// day streaks) into the next week's staff, so which of several tied best rosters week k posts changes what week k+1 can do.
// Fresh builds now run column generation first (README "Fresh builds, column generation first"), which picks other ties than
// the old order (plateau walk first). On the sample café with Ana off Tue 1 Dec and Ben off Fri 4 Dec (the guide page's plan)
// that left week 3 with 20 open hours against 17. This measures whether that is the rule or one draw.
// Plans: the five teams of eval/real-rate-week.mjs x 12 dated time-off patterns (one or two people off a working day in week 2
// or 3, drawn from a fixed seed), 4 weeks from Mon 16 Nov 2026, built with deferCover false and true; plus the keepValue 0.1
// plan ("keep people on their usual shifts") on the same patterns.
//   node eval/plan-order.mjs              (readings: eval/plan-order.out.txt)
import { planWeeks } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";

const all = sets();
const PATTERNS = Number(process.env.PATTERNS || 12);
const start = "2026-11-16";
const date = (k, d) => { const t = new Date(Date.UTC(2026, 10, 16 + 7 * k + d)); return t.toISOString().slice(0, 10); };
let seed = 20261113;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };

const g = { plans: 0, worse: 0, better: 0, open0: 0, open1: 0, pay0: 0, pay1: 0, ms0: 0, ms1: 0, kWorse: 0, kBetter: 0, kOpen0: 0, kOpen1: 0 };
for (const name of Object.keys(all)) {
  const [staffText, shiftsText] = all[name];
  const lines = staffText.split("\n");
  const people = lines.slice(1).map((l) => l.split(",")[0].trim()).filter(Boolean);
  const t = { plans: 0, worse: 0, better: 0, open0: 0, open1: 0, ms0: 0, ms1: 0 };
  for (let p = name === "cafe" ? -1 : 0; p < PATTERNS; p++) {
    const offs = [];
    // p = -1: the guide page's plan (keep-a-consistent-schedule-when-someone-is-off.html), Ana off Tue 1 Dec, Ben off Fri 4 Dec.
    if (p < 0) offs.push(["Ana", "2026-12-01"], ["Ben", "2026-12-04"]);
    else { const n = 1 + rnd(2); for (let j = 0; j < n; j++) offs.push([people[rnd(people.length)], date(1 + rnd(2), rnd(7))]); }
    let text = staffText;
    for (const [who, d] of offs) text = text.replace(new RegExp(`^(${who},[^\\n]*)$`, "m"), `$1, off: ${d}`);
    const o = { weeks: 4, weekStart: start, minRestHours: 10 };
    const run = (opts) => { const t0 = Date.now(); const r = planWeeks(text, shiftsText, opts); return { r, ms: Date.now() - t0 }; };
    const a = run({ ...o, deferCover: false }), b = run({ ...o, deferCover: true });
    const ka = run({ ...o, keepValue: 0.1, deferCover: false }), kb = run({ ...o, keepValue: 0.1, deferCover: true });
    t.plans++; g.plans++;
    t.open0 += a.r.totalOpenHours; t.open1 += b.r.totalOpenHours; t.ms0 += a.ms; t.ms1 += b.ms;
    g.open0 += a.r.totalOpenHours; g.open1 += b.r.totalOpenHours; g.pay0 += a.r.totalCost; g.pay1 += b.r.totalCost; g.ms0 += a.ms + ka.ms; g.ms1 += b.ms + kb.ms;
    g.kOpen0 += ka.r.totalOpenHours; g.kOpen1 += kb.r.totalOpenHours;
    if (b.r.totalOpenHours > a.r.totalOpenHours) { t.worse++; g.worse++; } else if (b.r.totalOpenHours < a.r.totalOpenHours) { t.better++; g.better++; }
    if (kb.r.totalOpenHours > ka.r.totalOpenHours) g.kWorse++; else if (kb.r.totalOpenHours < ka.r.totalOpenHours) g.kBetter++;
    const wk = (r) => r.weeks.map((w) => w.roster.unfilledHours).join("/");
    console.log(`  ${name} ${offs.map(([w, d]) => `${w} off ${d}`).join(", ")}: open ${wk(a.r)} -> ${wk(b.r)} h (keep 0.1: ${wk(ka.r)} -> ${wk(kb.r)}), pay $${a.r.totalCost} -> $${b.r.totalCost}, ${a.ms} -> ${b.ms} ms`);
  }
  console.log(`${name}: ${t.plans} plans, plan open hours ${t.open0} -> ${t.open1} (more on ${t.worse}, fewer on ${t.better}), ${(t.ms0 / 1000).toFixed(1)} s -> ${(t.ms1 / 1000).toFixed(1)} s`);
}
console.log(`\nall: ${g.plans} four-week plans; open hours ${g.open0} old order -> ${g.open1} column generation first (more on ${g.worse}, fewer on ${g.better}); pay $${g.pay0} -> $${g.pay1}`);
console.log(`keep usual shifts 0.1: open hours ${g.kOpen0} -> ${g.kOpen1} (more on ${g.kWorse}, fewer on ${g.kBetter}); time for all four plan kinds ${(g.ms0 / 1000).toFixed(1)} s -> ${(g.ms1 / 1000).toFixed(1)} s`);
