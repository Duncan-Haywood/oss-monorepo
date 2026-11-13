// Does the tied roster with the least call-out exposure lose fewer hours to a real week of call-outs? (2026-11-13)
//
// eval/real-rate-week.mjs left open whether a reissue could keep slack for later call-outs. Two findings here:
//  1. Several rosters tie at the best score. For each template, the seeds 1-6 are built and the distinct rosters at the
//     best score kept (same score, same payroll); calloutExposure gives each one's exposure: the open hours added, summed over
//     every person-day worked Tuesday to Sunday, by that one call-out handled the product's way (5pm notice, started shifts
//     pinned, rebuilt with the roster kept).
//  2. Each tied roster is then posted and played through the same seeded weeks as real-rate-week (call-outs per person-day
//     worked at CALL, extra copies at EXTRA, kept reissues), and the hours the week's events add to the open hours
//     (final open minus posted open) are totalled. If exposure is a good guide, the least-exposed roster should add the
//     fewest. The same draws are used for every roster; a call-out applies only if that person works that day in the
//     roster being changed.
// Also the hindsight floor per week for the seed-1 roster's callers: the least open hours of a roster built from scratch
// knowing every caller and every extra copy at the start; the kept policy's final roster is one such roster, so with a proven
// build no once-a-day policy facing those callers ends below it.
// Arithmetic on invented teams with rates from one real file (eval/real-rate-week.mjs header).
//   node eval/steady-for-callouts.mjs [seeds=40]     SETS=cafe,spare,salon,retail,clinic  CALL=0.01,0.084  EXTRA=0,0.109
import { parseStaff, parseShifts, buildRoster, rosterCsv, scheduleChanges, keepFromCsv, pinStarted, addTimeOff, steadyRoster, DAYS } from "../calc.mjs";
import { drawWeek, sets } from "./real-rate-week.mjs";

const BASE = { minRestHours: 10 };
const PREM = { noticeHours: 336, premiumHours: 1 };
const proven = (r) => ["optimal", "improved"].includes(r.optimality?.status);

// One drawn week from a given posted roster, kept reissues. Mirrors real-rate-week's playWeek with keepShift 1.
export function playFrom(staffText, shiftsText, posted, events, base = BASE) {
  const wages = Object.fromEntries(parseStaff(staffText).staff.map((s) => [s.name, s.wage]));
  let st = staffText, sh = shiftsText, cur = posted, curCsv = rosterCsv(posted);
  const t = { reissues: 0, changes: 0, owed: 0, proven: 0, callersByDay: new Map() };
  for (const e of events) {
    const changedAt = (e.day - 1) * 1440 + 17 * 60;
    const working = new Set(cur.assignments.filter((a) => a.slot.day === e.day && a.person).map((a) => a.person));
    const callers = e.out.filter((n) => working.has(n));
    if (!callers.length && !e.extras.length) continue;
    for (const c of callers) st = addTimeOff(st, c, DAYS[e.day]).text;
    if (callers.length) t.callersByDay.set(e.day, callers);
    if (e.extras.length) sh = sh.trimEnd() + "\n" + e.extras.join("\n");
    const { slots } = pinStarted(parseShifts(sh).slots, curCsv, changedAt);
    const r = buildRoster(parseStaff(st).staff, slots, { ...base, keep: keepFromCsv(curCsv), keepShift: 1 });
    const csv = rosterCsv(r);
    const c = scheduleChanges(curCsv, csv, { ...PREM, changedAt, wages, exempt: callers });
    t.reissues++; t.changes += c.changes.filter((x) => !x.exempt).length; t.owed += c.owed; if (proven(r)) t.proven++;
    cur = r; curCsv = csv;
  }
  return { ...t, added: cur.unfilledHours - posted.unfilledHours, open: cur.unfilledHours };
}

export function hindsight(staffText, shiftsText, events, callersByDay, base = BASE) {
  let st = staffText, sh = shiftsText;
  for (const [d, names] of callersByDay) for (const n of names) st = addTimeOff(st, n, DAYS[d]).text;
  for (const e of events) if (e.extras.length) sh = sh.trimEnd() + "\n" + e.extras.join("\n");
  const r = buildRoster(parseStaff(st).staff, parseShifts(sh).slots, base);
  return { open: r.unfilledHours, proven: proven(r) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] || 40);
  const all = sets();
  const pick = (process.env.SETS || Object.keys(all).join(",")).split(",");
  const calls = (process.env.CALL || "0.01,0.084").split(",").map(Number);
  const extrasR = (process.env.EXTRA || "0,0.109").split(",").map(Number);
  for (const name of pick) {
    const [stf, shf] = all[name];
    const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
    const t0 = Date.now();
    const st = steadyRoster(staff, slots, BASE);
    const rosters = st.steady.tied.map((c) => ({ seed: c.seed, exposure: c.exposure, r: buildRoster(staff, slots, { ...BASE, seed: c.seed }) }));
    console.log(`TIES ${name}: ${rosters.length} distinct rosters at score ${st.score.toFixed(2)}, payroll $${st.cost.toFixed(2)}, posted open ${st.unfilledHours} h; exposure by seed ${rosters.map((x) => `${x.seed}:${x.exposure}`).join(" ")} over ${st.steady.personDays} person-days (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    if (rosters.length < 2) continue;
    for (const call of calls) for (const extra of extrasR) {
      const tag = `call ${call} extra ${extra}`;
      const tot = rosters.map(() => ({ added: 0, changes: 0, owed: 0, reissues: 0, proven: 0 }));
      let floorAdded = 0, floorProven = 0, weeks = 0;
      for (let s = 0; s < seeds; s++) {
        const events = drawWeek(slots, staff, { call, extra, seed: 20261113 + s * 7919 + Math.round(call * 1e4) * 31 + Math.round(extra * 1e4) * 17 });
        if (!events.length) continue;
        weeks++;
        rosters.forEach((x, k) => {
          const p = playFrom(stf, shf, x.r, events);
          for (const f of Object.keys(tot[k])) tot[k][f] += p[f];
          if (k === 0) { const h = hindsight(stf, shf, events, p.callersByDay); floorAdded += h.open - x.r.unfilledHours; floorProven += h.proven ? 1 : 0; }
        });
      }
      for (const [k, x] of rosters.entries()) console.log(`PLAY ${tag} ${name} seed ${x.seed} exposure ${x.exposure}: ${weeks} disrupted weeks, open hours added ${tot[k].added}, changes to others ${tot[k].changes}, premiums $${tot[k].owed.toFixed(2)}, proven ${tot[k].proven}/${tot[k].reissues}`);
      console.log(`FLOOR ${tag} ${name}: hindsight adds ${floorAdded} h over the seed-1 callers' weeks (proven ${floorProven}/${weeks})`);
    }
  }
}
