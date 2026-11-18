// Which pair check predicts the pairs that really open? (2026-11-15, README "An order-free pair check")
//
// eval/cover-pair-exposure.mjs plays every pair of safe person-days on the five templates (default and --cover-price 25
// rosters): the earlier call-out at 5pm the day before as a kept reissue, then the later one on the reissued roster. A pair
// "really opens" when the played week ends with more open hours than were posted. This plays each pair once and scores four
// checks against that: the old search and the order-free one, each at the screen's 500 checks and at its confirm budget (200,000; 2,000,000).
// Invented teams; arithmetic on the product's model (5pm notice, kept rebuild), not a forecast.
//   node eval/pair-order-free-exposure.mjs     SETS=cafe,spare,salon,retail,clinic  PRICE=25  MAX=200
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverPairRisk } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";
import { playFrom } from "./steady-for-callouts.mjs";

const BASE = { minRestHours: 10 };
const CHECKS = [["old 500", { budget: 500 }], ["old 200k", { budget: 200000 }], ["order-free 500", { budget: 500, orderFree: true }], ["order-free 2M", { budget: 2000000, orderFree: true }]];
const all = sets();
const pick = (process.env.SETS || Object.keys(all).join(",")).split(",").filter(Boolean);
const price = Number(process.env.PRICE ?? 25), max = Number(process.env.MAX ?? 200);
const tot = Object.fromEntries(CHECKS.map(([k]) => [k, { flagged: 0, hit: 0, miss: 0, capped: 0, flaggedHours: 0 }]));
let pairs = 0, open = 0, openHours = 0;
for (const name of pick) {
  const [stf, shf] = all[name];
  const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
  for (const [label, opts] of [["default", BASE], [`priced ${price}`, { ...BASE, coverPrice: price }]]) {
    const r = buildRoster(staff, slots, opts);
    const ctx = buildContext(staff, slots, BASE);
    const single = coverRisk(ctx, r.owner);
    const runs = CHECKS.map(([, o]) => coverPairRisk(ctx, r.owner, { single, keep: true, ...o }));
    const n = Math.min(max, runs[0].checked.length);
    const row = { pairs: n, open: 0 };
    const per = CHECKS.map(() => ({ flagged: 0, hit: 0, miss: 0, capped: 0 }));
    for (let k = 0; k < n; k++) {
      const c = runs[0].checked[k];
      const events = c.a.day === c.b.day ? [{ day: c.a.day, out: [staff[c.a.person].name, staff[c.b.person].name], extras: [] }]
        : [c.a, c.b].sort((x, y) => x.day - y.day).map((x) => ({ day: x.day, out: [staff[x.person].name], extras: [] }));
      const p = playFrom(stf, shf, r, events, BASE);
      const opened = p.added > 0;
      if (opened) { row.open++; open++; openHours += p.added; }
      runs.forEach((run, m) => {
        const d = run.checked[k];
        if (d.a.person !== c.a.person || d.b.day !== c.b.day) throw new Error("walks out of step");
        const flagged = !d.how;
        if (d.how === null) per[m].capped++;
        if (flagged) { per[m].flagged++; tot[CHECKS[m][0]].flaggedHours += Math.min(d.a.hours, d.b.hours); }
        if (flagged && opened) per[m].hit++;
        if (!flagged && opened) per[m].miss++;
      });
    }
    pairs += n;
    console.log(`${name} ${label}: ${n} pairs played, ${row.open} really open; ` + CHECKS.map(([k], m) => `${k} flags ${per[m].flagged} (${per[m].capped} given up), ${per[m].hit} of them open, missed ${per[m].miss}`).join("; "));
    CHECKS.forEach(([k], m) => { for (const f of ["flagged", "hit", "miss", "capped"]) tot[k][f] += per[m][f]; });
  }
}
console.log(`ALL: ${pairs} pairs, ${open} really open (${openHours} h added)`);
for (const [k] of CHECKS) {
  const t = tot[k];
  console.log(`  ${k}: ${t.flagged} flagged (${t.capped} given up), precision ${t.flagged ? (t.hit / t.flagged * 100).toFixed(1) : "-"}%, recall ${open ? (t.hit / open * 100).toFixed(1) : "-"}%, missed ${t.miss}, flagged hours ${t.flaggedHours}`);
}
