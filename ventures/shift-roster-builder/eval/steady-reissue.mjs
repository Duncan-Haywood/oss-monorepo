// The call-out tie-break at every reissue, not only at the first post (2026-11-13).
//
// eval/steady-for-callouts.mjs posted the least-exposed of the tied best rosters and then reissued each day's call-outs
// with the posted roster kept (keepShift 1, seed 1). Each of those reissues is itself a search, and its best rosters can
// tie too (same score: same open hours, same payroll, same kept shifts). Here each reissue also builds seeds 1-6 and keeps
// the tie that the remaining days' call-outs hurt least: steadyRoster with the current roster as `keep` and fromDay the
// day after the one being reissued. Same seeded weeks and rates as real-rate-week (call-outs 1.0% or 8.4% per person-day
// worked, extra copies 0 or 10.9%), three policies on the same draws:
//   kept     seed-1 roster posted, seed-1 kept reissues (the product's default)
//   post     least-exposed roster posted, seed-1 kept reissues (--steady before this change)
//   every    least-exposed roster posted, least-exposed kept reissue each time
// Totals per cell: open hours the week's events add (final open minus posted), changes to others, premiums, and time.
// Arithmetic on invented teams with rates from one real file (eval/real-rate-week.mjs header).
//   node eval/steady-reissue.mjs [seeds=40]     SETS=cafe,retail,clinic  CALL=0.01,0.084  EXTRA=0,0.109
import { parseStaff, parseShifts, buildRoster, rosterCsv, scheduleChanges, keepFromCsv, pinStarted, addTimeOff, steadyRoster, DAYS } from "../calc.mjs";
import { drawWeek, sets } from "./real-rate-week.mjs";

const BASE = { minRestHours: 10 };
const PREM = { noticeHours: 336, premiumHours: 1 };
const proven = (r) => ["optimal", "improved"].includes(r.optimality?.status);

export function playPolicy(staffText, shiftsText, posted, events, { steadyReissue = false, base = BASE } = {}) {
  const wages = Object.fromEntries(parseStaff(staffText).staff.map((s) => [s.name, s.wage]));
  let st = staffText, sh = shiftsText, cur = posted, curCsv = rosterCsv(posted);
  const t = { reissues: 0, changes: 0, owed: 0, proven: 0, ties: 0, switched: 0, ms: 0 };
  for (const e of events) {
    const changedAt = (e.day - 1) * 1440 + 17 * 60;
    const working = new Set(cur.assignments.filter((a) => a.slot.day === e.day && a.person).map((a) => a.person));
    const callers = e.out.filter((n) => working.has(n));
    if (!callers.length && !e.extras.length) continue;
    for (const c of callers) st = addTimeOff(st, c, DAYS[e.day]).text;
    if (e.extras.length) sh = sh.trimEnd() + "\n" + e.extras.join("\n");
    const { slots } = pinStarted(parseShifts(sh).slots, curCsv, changedAt);
    const staff = parseStaff(st).staff, opts = { ...base, keep: keepFromCsv(curCsv), keepShift: 1 };
    const t0 = Date.now();
    let r;
    if (steadyReissue && e.day < 6) {
      r = steadyRoster(staff, slots, opts, { fromDay: e.day + 1 });
      if (r.steady?.tied?.length > 1) t.ties++;
      if (r.steady && r.steady.chosenSeed !== 1) t.switched++;
    } else r = buildRoster(staff, slots, opts);
    t.ms += Date.now() - t0;
    if (r.error) throw new Error(r.error);
    const csv = rosterCsv(r);
    const c = scheduleChanges(curCsv, csv, { ...PREM, changedAt, wages, exempt: callers });
    t.reissues++; t.changes += c.changes.filter((x) => !x.exempt).length; t.owed += c.owed; if (proven(r)) t.proven++;
    cur = r; curCsv = csv;
  }
  return { ...t, added: cur.unfilledHours - posted.unfilledHours, open: cur.unfilledHours, pay: cur.cost };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] || 40);
  const all = sets();
  const pick = (process.env.SETS || "cafe,retail,clinic").split(",");
  const calls = (process.env.CALL || "0.01,0.084").split(",").map(Number);
  const extrasR = (process.env.EXTRA || "0,0.109").split(",").map(Number);
  for (const name of pick) {
    const [stf, shf] = all[name];
    const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
    const kept = buildRoster(staff, slots, BASE), steady = steadyRoster(staff, slots, BASE);
    console.log(`POSTED ${name}: seed-1 open ${kept.unfilledHours} h; steady picks seed ${steady.steady.chosenSeed} (exposure ${steady.steady.exposure}), open ${steady.unfilledHours} h`);
    for (const call of calls) for (const extra of extrasR) {
      const tag = `call ${call} extra ${extra}`;
      const pol = { kept: [kept, false], post: [steady, false], every: [steady, true] };
      const tot = Object.fromEntries(Object.keys(pol).map((k) => [k, {}]));
      const cmp = { better: 0, same: 0, worse: 0 };
      let weeks = 0;
      for (let s = 0; s < seeds; s++) {
        const events = drawWeek(slots, staff, { call, extra, seed: 20261113 + s * 7919 + Math.round(call * 1e4) * 31 + Math.round(extra * 1e4) * 17 });
        if (!events.length) continue;
        weeks++;
        const res = {};
        for (const [k, [p, sr]] of Object.entries(pol)) {
          res[k] = playPolicy(stf, shf, p, events, { steadyReissue: sr });
          for (const [f, v] of Object.entries(res[k])) tot[k][f] = (tot[k][f] || 0) + v;
        }
        if (res.every.added < res.post.added - 1e-9) cmp.better++; else if (res.every.added > res.post.added + 1e-9) cmp.worse++; else cmp.same++;
        console.log(`${tag} ${name} seed ${s}: added kept ${res.kept.added} post ${res.post.added} every ${res.every.added} | changes ${res.kept.changes}/${res.post.changes}/${res.every.changes} | every: tied reissues ${res.every.ties}, switched ${res.every.switched}`);
      }
      for (const [k, t] of Object.entries(tot)) console.log(`TOTAL ${tag} ${name} ${k.padEnd(5)} ${weeks} weeks: added ${t.added ?? 0} h, changes to others ${t.changes ?? 0}, premiums $${(t.owed ?? 0).toFixed(2)}, pay $${(t.pay ?? 0).toFixed(2)}, reissues ${t.reissues ?? 0} (proven ${t.proven ?? 0}), tied reissues ${t.ties ?? 0}, switched ${t.switched ?? 0}, ${((t.ms ?? 0) / 1000).toFixed(1)} s`);
      console.log(`CMP ${tag} ${name}: every vs post, fewer added hours on ${cmp.better} weeks, same ${cmp.same}, more ${cmp.worse}`);
    }
  }
}
