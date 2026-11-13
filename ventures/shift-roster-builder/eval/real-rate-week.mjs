// A whole posted week of disruptions at the rates a real roster showed, reissued day by day (2026-11-13).
//
// The reissue studies (eval/reissue-posted.mjs, eval/reissue-scale.mjs) rebuild after one call-out at a time, against the
// first posted roster. A real week has several, and each reissue becomes the roster the next one changes. The Deputy
// timesheet export read in eval/real-schedule-exports.mjs gives two rates for one firm over five weeks:
//   leave rows 41 of 491 (8.4%); of them sick leave 5 of 491 (1.0%), the only kind that is clearly short notice
//   work with no rostered shift 49 of 450 (10.9%): extra shifts added after the roster was made
// So each seeded week draws, for every person-day worked from Tuesday on, a call-out with probability CALL (default: both
// 0.010 and 0.084, the sick-only floor and the all-leave ceiling), and for every posted shift copy from Tuesday on an extra
// copy of that shift with probability EXTRA (0 and 0.109). Every event for a day is announced at 5pm the evening before
// and handled by one reissue then: the callers get `off:` that day, the extra copies join the shift list, every shift that
// has started is pinned to its holder (pinStarted, as the product does), and the week is rebuilt
//   rebuild     freely (the old default), or
//   keep        with the current roster as `keep`, keepShift 1 (the product's default for a posted week).
// Each reissue is priced by scheduleChanges against the roster it replaces (336 h window: everything left in the week is
// short notice; 1 hour of the person's wage per change; that day's callers exempt). Totals per week: changes to others,
// people told of a change, premiums, the final week's open hours and payroll, and the changes between the first posted
// roster and the last (net churn, callers exempt).
// Arithmetic on invented teams, rates from one real file, and an invented premium rule; not a statement of any ordinance.
//   node eval/real-rate-week.mjs [seeds=20]          SETS=cafe,spare,salon,retail,clinic,templatecafe  CALL=0.01,0.084  EXTRA=0,0.109
import { parseStaff, parseShifts, buildRoster, rosterCsv, scheduleChanges, keepFromCsv, pinStarted, addTimeOff, sampleStaff, sampleShifts, TEMPLATES, DAYS } from "../calc.mjs";

const BASE = { minRestHours: 10 };
const PREM = { noticeHours: 336, premiumHours: 1 };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; }; }

// The disruptions of one week, drawn once and shared by every policy: for each day d (1..6) the people who would call out
// that day if they were working it (one draw per person-day, so a policy that moved someone off a day has no call-out
// from them there) and the extra shift lines (one draw per first-posted shift copy).
export function drawWeek(slots, staff, { call, extra, seed }) {
  const r = rng(seed);
  const days = [];
  for (let d = 1; d <= 6; d++) {
    const out = staff.filter(() => r() < call).map((p) => p.name), extras = [];
    for (const s of slots) if (s.day === d && r() < extra) extras.push(`${DAYS[d]}, ${clock(s.startMin)}, ${clock(s.endMin % 1440)}, 1${s.role ? `, extra, ${s.role}` : ", extra"}`);
    if (out.length || extras.length) days.push({ day: d, out, extras });
  }
  return days;
}
const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

// Play one drawn week under one policy. Returns per-week totals.
export function playWeek(staffText, shiftsText, events, { keepShift = 0, base = BASE } = {}) {
  const staff0 = parseStaff(staffText).staff;
  const wages = Object.fromEntries(staff0.map((s) => [s.name, s.wage]));
  let st = staffText, sh = shiftsText;
  const first = buildRoster(staff0, parseShifts(sh).slots, base);
  const firstCsv = rosterCsv(first);
  let cur = first, curCsv = firstCsv;
  const t = { reissues: 0, changes: 0, told: 0, owed: 0, proven: 0, ms: 0, callers: 0, extras: 0 };
  const allCallers = new Set();
  for (const e of events) {
    const changedAt = (e.day - 1) * 1440 + 17 * 60;
    const working = new Set(cur.assignments.filter((a) => a.slot.day === e.day && a.person).map((a) => a.person));
    const ev = { ...e, callers: e.out.filter((n) => working.has(n)) };
    if (!ev.callers.length && !ev.extras.length) continue;
    for (const c of ev.callers) { const a = addTimeOff(st, c, DAYS[ev.day]); if (a.error) throw new Error(a.error); st = a.text; allCallers.add(c); }
    if (ev.extras.length) sh = sh.trimEnd() + "\n" + ev.extras.join("\n");
    const ps = parseStaff(st), pf = parseShifts(sh);
    if (ps.errors.length || pf.errors.length) throw new Error(ps.errors[0] || pf.errors[0]);
    const { slots } = pinStarted(pf.slots, curCsv, changedAt);
    const opts = { ...base, ...(keepShift ? { keep: keepFromCsv(curCsv), keepShift } : {}) };
    const t0 = Date.now();
    const r = buildRoster(ps.staff, slots, opts);
    t.ms += Date.now() - t0;
    const csv = rosterCsv(r);
    const c = scheduleChanges(curCsv, csv, { ...PREM, changedAt, wages, exempt: ev.callers });
    const others = c.changes.filter((x) => !x.exempt);
    t.reissues++; t.changes += others.length; t.told += new Set(others.map((x) => x.person)).size; t.owed += c.owed;
    t.callers += ev.callers.length; t.extras += ev.extras.length;
    if (["optimal", "improved"].includes(r.optimality?.status)) t.proven++;
    cur = r; curCsv = csv;
  }
  const net = scheduleChanges(firstCsv, curCsv, { exempt: [...allCallers] }).changes.filter((x) => !x.exempt).length;
  return { ...t, owed: Math.round(t.owed * 100) / 100, open: cur.unfilledHours, pay: cur.cost, net, firstPay: first.cost, firstOpen: first.unfilledHours };
}

export function sets() {
  const out = { cafe: [sampleStaff(), sampleShifts()], spare: [sampleStaff() + "\nHal, 15, 24, 0, any", sampleShifts()] };
  for (const [k, v] of Object.entries(TEMPLATES)) out[k === "cafe" ? "templatecafe" : k] = [v.staff(), v.shifts()];
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] || 20);
  const all = sets();
  const pick = (process.env.SETS || Object.keys(all).join(",")).split(",");
  const calls = (process.env.CALL || "0.01,0.084").split(",").map(Number);
  const extrasR = (process.env.EXTRA || "0,0.109").split(",").map(Number);
  const policies = { rebuild: 0, keep: 1 };
  const fmt = (t) => `reissues ${t.reissues} (callers ${t.callers}, extra copies ${t.extras}), changes to others ${t.changes}, people told ${t.told}, premiums $${t.owed.toFixed(2)}, net changes ${t.net}, final open ${t.open} h, pay $${t.pay.toFixed(2)}, proven ${t.proven}/${t.reissues}, ${(t.ms / 1000).toFixed(1)} s`;
  const grand = {};
  for (const call of calls) for (const extra of extrasR) {
    const tag = `call ${call} extra ${extra}`;
    for (const name of pick) {
      const [stf, shf] = all[name];
      const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
      const posted = buildRoster(staff, slots, BASE);
      const tot = {}, cmp = { fewer: 0, same: 0, more: 0, openUp: 0, openDown: 0, weeks: 0, quiet: 0 };
      for (let s = 0; s < seeds; s++) {
        const events = drawWeek(slots, staff, { call, extra, seed: 20261113 + s * 7919 + Math.round(call * 1e4) * 31 + Math.round(extra * 1e4) * 17 });
        if (!events.length) { cmp.quiet++; continue; }
        const res = {};
        for (const [p, k] of Object.entries(policies)) {
          res[p] = playWeek(stf, shf, events, { keepShift: k });
          const a = (tot[p] ||= {});
          for (const [f, v] of Object.entries(res[p])) a[f] = (a[f] || 0) + v;
          const g = ((grand[tag] ||= {})[p] ||= {});
          for (const [f, v] of Object.entries(res[p])) g[f] = (g[f] || 0) + v;
        }
        cmp.weeks++;
        if (res.keep.changes < res.rebuild.changes) cmp.fewer++; else if (res.keep.changes > res.rebuild.changes) cmp.more++; else cmp.same++;
        if (res.keep.open > res.rebuild.open + 1e-9) cmp.openUp++; else if (res.keep.open < res.rebuild.open - 1e-9) cmp.openDown++;
        console.log(`${tag} ${name} seed ${s}: ${events.map((e) => `${DAYS[e.day]}[${e.out.join("+")}${e.extras.length ? ` +${e.extras.length}` : ""}]`).join(" ")} | rebuild ${res.rebuild.changes} ch $${res.rebuild.owed} open ${res.rebuild.open} | keep ${res.keep.changes} ch $${res.keep.owed} open ${res.keep.open}`);
      }
      for (const [p, t] of Object.entries(tot)) console.log(`TOTAL ${tag} ${name} ${p.padEnd(7)} ${fmt(t)}`);
      console.log(`CMP ${tag} ${name}: ${cmp.weeks} disrupted weeks (${cmp.quiet} of ${seeds} quiet); keep fewer changes ${cmp.fewer}, same ${cmp.same}, more ${cmp.more}; keep open hours up ${cmp.openUp}, down ${cmp.openDown}`);
    }
  }
  for (const [tag, g] of Object.entries(grand)) for (const [p, t] of Object.entries(g)) console.log(`ALL ${tag} ${p.padEnd(7)} ${fmt(t)}`);
}
