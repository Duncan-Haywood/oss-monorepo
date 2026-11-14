// Does a clashing pair really open hours when both call-outs happen? (2026-11-14)
//
// coverPairRisk flags pairs of person-days, each safe on its own, whose shifts cannot all be covered at once by the cheap
// search. The reference here is the product's own handling, played in order: the earlier call-out at 5pm the day before
// (a kept reissue, started shifts pinned), then the later one the same way on the reissued roster (both in one reissue
// when they fall on the same day): eval/steady-for-callouts.mjs's playFrom. A pair "really opens" when the played week
// ends with more open hours than were posted. For each team, the default roster and the roster --cover-price posts, every
// pair of safe person-days Tuesday to Sunday is played; reported: pairs, flagged, really open, flagged-and-open, missed,
// hours the flagged pairs carry and the hours the played pairs really open.
// Invented teams; arithmetic on the product's model (5pm notice, kept rebuild), not a forecast.
//   node eval/cover-pair-exposure.mjs      SETS=cafe,spare,salon,retail,clinic  PRICE=25  MAX=200 (pairs per roster)
//   ALL=1 also plays every pair of worked person-days (risky ones too); PAIR=1,5,25 adds rosters built with coverPairPrice
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverPairRisk, DAYS } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";
import { playFrom } from "./steady-for-callouts.mjs";

const BASE = { minRestHours: 10 };

export function pairExposure(stf, shf, r, { max = Infinity, opts = BASE, pairOpts = {} } = {}) {
  const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
  const ctx = buildContext(staff, slots, opts);
  const one = coverRisk(ctx, r.owner);
  const two = coverPairRisk(ctx, r.owner, { single: one, keep: true, ...pairOpts });
  const out = { pairs: 0, flagged: 0, open: 0, hit: 0, miss: 0, flaggedHours: two.hours, openHours: 0, single: one.hours, capped: two.capped, rows: [] };
  for (const c of two.checked.slice(0, max)) {
    const a = staff[c.a.person].name, b = staff[c.b.person].name;
    const events = c.a.day === c.b.day ? [{ day: c.a.day, out: [a, b], extras: [] }]
      : [c.a, c.b].sort((x, y) => x.day - y.day).map((x) => ({ day: x.day, out: [staff[x.person].name], extras: [] }));
    const p = playFrom(stf, shf, r, events, opts);
    const flagged = !c.how, opened = p.added > 0;
    out.pairs++; if (flagged) out.flagged++; if (opened) { out.open++; out.openHours += p.added; }
    if (flagged && opened) out.hit++; if (!flagged && opened) out.miss++;
    out.rows.push(`${a} ${DAYS[c.a.day]} + ${b} ${DAYS[c.b.day]}: ${flagged ? (c.how === null ? "flagged (capped)" : "flagged") : c.how}, played adds ${p.added} h`);
  }
  return out;
}

// Every pair of worked person-days Tuesday to Sunday, risky ones included, played the same way: the whole two-call-out
// exposure of a roster (summed open hours added), the yardstick the priced rosters are compared on below.
export function allPairExposure(stf, shf, r, opts = BASE) {
  const staff = parseStaff(stf).staff;
  const days = [];
  const seen = new Set();
  for (const a of r.assignments) {
    if (!a.person || a.slot.day < 1) continue;
    const k = a.person + "|" + a.slot.day;
    if (!seen.has(k)) { seen.add(k); days.push({ name: a.person, day: a.slot.day }); }
  }
  let pairs = 0, open = 0, hours = 0;
  for (let i = 0; i < days.length; i++) for (let j = i + 1; j < days.length; j++) {
    const A = days[i], B = days[j];
    const events = A.day === B.day ? [{ day: A.day, out: [A.name, B.name], extras: [] }]
      : [A, B].sort((x, y) => x.day - y.day).map((x) => ({ day: x.day, out: [x.name], extras: [] }));
    const p = playFrom(stf, shf, r, events, opts);
    pairs++; if (p.added > 0) { open++; hours += p.added; }
  }
  return { personDays: days.length, pairs, open, hours, staff: staff.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = sets();
  const pick = (process.env.SETS || Object.keys(all).join(",")).split(",").filter(Boolean);
  const price = Number(process.env.PRICE ?? 25), max = Number(process.env.MAX ?? 200);
  const pairOpts = process.env.CHAIN ? { chain: Number(process.env.CHAIN) } : {};
  const tot = { pairs: 0, flagged: 0, open: 0, hit: 0, miss: 0 };
  for (const name of pick) {
    const [stf, shf] = all[name];
    const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
    const variants = [["default", BASE], [`priced ${price}`, { ...BASE, coverPrice: price }]];
    for (const pp of (process.env.PAIR || "").split(",").filter(Boolean).map(Number)) variants.push([`priced ${price} pair ${pp}`, { ...BASE, coverPrice: price, coverPairPrice: pp }]);
    for (const [label, opts] of variants) {
      const r = buildRoster(staff, slots, opts);
      const t0 = Date.now();
      const x = pairExposure(stf, shf, r, { max, pairOpts });
      if (process.env.ALL) { const t1 = Date.now(); const w = allPairExposure(stf, shf, r); console.log(`${name} ${label}: ALL ${w.pairs} pairs of ${w.personDays} person-days, ${w.open} pairs open hours, ${w.hours} h added in all, ${((Date.now() - t1) / 1000).toFixed(0)} s`); }
      console.log(`${name} ${label}: single risk ${x.single} h; ${x.pairs} pairs of safe days played, ${x.flagged} flagged (${x.capped} capped), ${x.open} really open (${x.openHours} h), flagged and open ${x.hit}, missed ${x.miss}, flagged hours ${x.flaggedHours}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      if (process.env.ROWS) for (const row of x.rows) console.log(`  ${row}`);
      for (const k of Object.keys(tot)) tot[k] += x[k];
    }
  }
  console.log(`ALL: ${tot.pairs} pairs, ${tot.flagged} flagged, ${tot.open} really open, precision ${tot.flagged ? (tot.hit / tot.flagged * 100).toFixed(1) : "-"}%, recall ${tot.open ? (tot.hit / tot.open * 100).toFixed(1) : "-"}%, missed ${tot.miss}`);
}
